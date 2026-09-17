import { buildDecisionState, isSupportedObstacle } from './game-state.js';

export const CONFIDENCE_THRESHOLD = 0.5;
export const AUTO_RESTART_DELAY = 1200;

export class AiController {
  constructor(
    runner,
    {
      fetchImpl = globalThis.fetch.bind(globalThis),
      onUpdate = () => {},
      now = () => performance.now(),
    } = {}
  ) {
    this.runner = runner;
    this.fetchImpl = fetchImpl;
    this.onUpdate = onUpdate;
    this.now = now;
    this.enabled = false;
    this.autoRestart = false;
    this.frameId = 0;
    this.restartTimer = 0;
    this.runNumber = 0;
    this.obstacleNumber = 0;
    this.currentRunId = 'run-0';
    this.wasPlaying = false;
    this.wasCrashed = false;
    this.seenObstacles = new WeakSet();
    this.plans = new Map();
    this.latestState = null;
    this.latestDecision = null;
    this.latestStatus = { type: 'idle', message: 'Manual control' };
    this.stats = {
      attempts: 0,
      crashes: 0,
      decisions: 0,
      acted: 0,
      skipped: 0,
      errors: 0,
      late: 0,
      currentScore: 0,
      bestScore: 0,
      latencyTotal: 0,
      latencyCount: 0,
    };

    this.tick = this.tick.bind(this);
  }

  start() {
    if (!this.frameId) {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  destroy() {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.cancelPlans();
    clearTimeout(this.restartTimer);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.runner.setHumanInputEnabled(!this.enabled);
    if (!this.enabled) {
      this.cancelPlans();
      this.runner.setDuck(false);
      clearTimeout(this.restartTimer);
      this.latestStatus = { type: 'idle', message: 'Manual control' };
    } else {
      this.latestStatus = { type: 'ready', message: 'AI control ready' };
    }
    this.emit();
  }

  setAutoRestart(enabled) {
    this.autoRestart = Boolean(enabled);
    if (!this.autoRestart) {
      clearTimeout(this.restartTimer);
    } else if (this.enabled && this.runner.crashed) {
      this.scheduleRestart();
    }
    this.emit();
  }

  cancelPlans() {
    for (const plan of this.plans.values()) {
      plan.abortController.abort();
    }
    this.plans.clear();
    this.seenObstacles = new WeakSet();
  }

  beginRun() {
    clearTimeout(this.restartTimer);
    this.cancelPlans();
    this.runNumber += 1;
    this.currentRunId = `run-${this.runNumber}`;
    this.stats.attempts += 1;
    this.latestStatus = {
      type: this.enabled ? 'running' : 'idle',
      message: this.enabled ? 'Watching for obstacles' : 'Manual control',
    };
  }

  handleCrash() {
    this.stats.crashes += 1;
    this.cancelPlans();
    this.runner.setDuck(false);
    this.latestStatus = { type: 'crashed', message: 'Run ended' };
    if (this.enabled && this.autoRestart) {
      this.scheduleRestart();
    }
  }

  scheduleRestart() {
    clearTimeout(this.restartTimer);
    this.latestStatus = {
      type: 'waiting',
      message: 'Auto-restarting…',
    };
    this.restartTimer = setTimeout(() => {
      if (this.enabled && this.autoRestart && this.runner.crashed) {
        this.runner.restart();
      }
    }, AUTO_RESTART_DELAY);
  }

  tick() {
    this.frameId = requestAnimationFrame(this.tick);
    const snapshot = this.runner.getAiSnapshot();
    this.stats.currentScore = snapshot.score;
    this.stats.bestScore = Math.max(this.stats.bestScore, snapshot.score);

    if (snapshot.playing && !this.wasPlaying) {
      this.beginRun();
    }
    if (snapshot.crashed && !this.wasCrashed) {
      this.handleCrash();
    }

    this.wasPlaying = snapshot.playing;
    this.wasCrashed = snapshot.crashed;

    if (this.enabled && snapshot.playing && !snapshot.crashed) {
      this.observeObstacles(snapshot);
      this.executePlans(snapshot);
    }

    this.emit();
  }

  observeObstacles(snapshot) {
    for (const obstacle of this.runner.horizon?.obstacles || []) {
      if (this.seenObstacles.has(obstacle) || !isSupportedObstacle(obstacle)) {
        continue;
      }
      this.seenObstacles.add(obstacle);
      this.requestDecision(obstacle, snapshot);
    }
  }

  requestDecision(obstacle, snapshot) {
    this.obstacleNumber += 1;
    const obstacleId = `obstacle-${this.obstacleNumber}`;
    const state = buildDecisionState(obstacle, snapshot);
    const abortController = new AbortController();
    const plan = {
      runId: this.currentRunId,
      obstacleId,
      obstacle,
      state,
      status: 'pending',
      abortController,
      requestedAt: this.now(),
    };
    this.plans.set(obstacleId, plan);
    this.latestState = state;
    this.latestStatus = {
      type: 'thinking',
      message: `Jev is judging ${state.obstacle.kind.replaceAll('_', ' ')}`,
    };

    this.fetchImpl('/api/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: plan.runId,
        obstacleId: plan.obstacleId,
        state,
      }),
      signal: abortController.signal,
    })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) {
          const error = new Error(body.error?.message || 'Decision failed.');
          error.code = body.error?.code || 'decision_error';
          throw error;
        }
        return body;
      })
      .then(decision => this.receiveDecision(plan, decision))
      .catch(error => this.receiveError(plan, error));
  }

  receiveDecision(plan, decision) {
    const activePlan = this.plans.get(plan.obstacleId);
    if (
      activePlan !== plan ||
      plan.status !== 'pending' ||
      decision.runId !== this.currentRunId ||
      decision.obstacleId !== plan.obstacleId
    ) {
      return;
    }

    const latencyMs = Math.round(this.now() - plan.requestedAt);
    const shortJumpIsSafe =
      plan.state?.obstacle?.kind === 'small_cactus' &&
      plan.state?.obstacle?.group === 'single';
    const effectiveJumpProfile =
      decision.action === 'jump' &&
      decision.jumpProfile === 'short' &&
      decision.jumpProfileConfidence >= CONFIDENCE_THRESHOLD &&
      shortJumpIsSafe
        ? 'short'
        : 'full';
    plan.decision = { ...decision, effectiveJumpProfile, latencyMs };
    this.latestDecision = plan.decision;
    this.stats.decisions += 1;
    this.stats.latencyTotal += latencyMs;
    this.stats.latencyCount += 1;

    if (decision.confidence < CONFIDENCE_THRESHOLD) {
      plan.status = 'low_confidence';
      this.stats.skipped += 1;
      this.latestStatus = {
        type: 'skipped',
        message: `Skipped ${decision.action}: low confidence`,
      };
      return;
    }

    plan.status = 'ready';
    this.latestStatus = {
      type: 'decided',
      message: `Jev chose ${
        decision.action === 'jump'
          ? `${effectiveJumpProfile} jump`
          : decision.action.replaceAll('_', ' ')
      }`,
    };
  }

  receiveError(plan, error) {
    if (error.name === 'AbortError' || plan.status !== 'pending') {
      return;
    }
    if (this.plans.get(plan.obstacleId) !== plan) {
      return;
    }
    plan.status = 'error';
    this.stats.errors += 1;
    this.stats.skipped += 1;
    this.latestStatus = {
      type: 'error',
      message: error.message,
      code: error.code,
    };
  }

  executePlans(snapshot) {
    const dinosaurX = snapshot.dinosaur?.xPos || 0;

    for (const [obstacleId, plan] of this.plans) {
      const obstaclePassed =
        plan.obstacle.xPos + plan.obstacle.width < dinosaurX;
      if (obstaclePassed || plan.obstacle.remove) {
        if (plan.status === 'ducking') {
          this.runner.setDuck(false);
        }
        this.plans.delete(obstacleId);
        continue;
      }

      const action = plan.decision?.action || 'jump';
      const jumpProfile = plan.decision?.effectiveJumpProfile || 'full';
      const threshold = this.runner.getActionProximityThreshold(
        plan.obstacle,
        action,
        jumpProfile
      );

      if (plan.obstacle.xPos > threshold) {
        continue;
      }

      if (plan.status === 'pending') {
        plan.status = 'late';
        plan.abortController.abort();
        this.stats.late += 1;
        this.stats.skipped += 1;
        this.latestStatus = {
          type: 'skipped',
          message: 'Decision arrived too late; no fallback used',
        };
        continue;
      }

      if (plan.status !== 'ready') {
        continue;
      }

      let applied = true;
      if (action === 'jump') {
        applied = this.runner.jump(jumpProfile);
        if (!applied) {
          this.latestStatus = {
            type: 'waiting',
            message: `Waiting to execute ${jumpProfile} jump`,
          };
          continue;
        }
        plan.status = 'executed';
      } else if (action === 'duck') {
        if (snapshot.dinosaurMotion === 'jumping') {
          this.runner.setDuck(true);
          this.latestStatus = {
            type: 'waiting',
            message: 'Landing before ducking',
          };
          continue;
        }
        applied = this.runner.setDuck(true);
        if (!applied) {
          continue;
        }
        plan.status = 'ducking';
      } else {
        plan.status = 'executed';
      }

      this.stats.acted += 1;
      this.latestStatus = {
        type: 'acted',
        message: applied
          ? `Executed ${
              action === 'jump'
                ? `${jumpProfile} jump`
                : action.replaceAll('_', ' ')
            }`
          : `${action.replaceAll('_', ' ')} was already satisfied`,
      };
    }
  }

  getTelemetry() {
    return {
      enabled: this.enabled,
      autoRestart: this.autoRestart,
      status: this.latestStatus,
      state: this.latestState,
      decision: this.latestDecision,
      stats: {
        ...this.stats,
        averageLatency:
          this.stats.latencyCount > 0
            ? Math.round(this.stats.latencyTotal / this.stats.latencyCount)
            : 0,
      },
    };
  }

  emit() {
    this.onUpdate(this.getTelemetry());
  }
}
