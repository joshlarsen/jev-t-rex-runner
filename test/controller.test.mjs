import assert from 'node:assert/strict';
import test from 'node:test';

import { AiController, CONFIDENCE_THRESHOLD } from '../ai/controller.js';

function createRunner() {
  return {
    crashed: false,
    horizon: { obstacles: [] },
    jumpCalls: 0,
    jumpProfiles: [],
    canJump: true,
    duckCalls: [],
    setHumanInputEnabled() {},
    setDuck(value) {
      this.duckCalls.push(value);
      return true;
    },
    jump(profile) {
      this.jumpCalls += 1;
      this.jumpProfiles.push(profile);
      return this.canJump;
    },
    getActionProximityThreshold() {
      return 190;
    },
  };
}

function makePlan(status = 'pending') {
  return {
    runId: 'run-1',
    obstacleId: 'obstacle-1',
    obstacle: { xPos: 180, width: 20, remove: false },
    state: {
      obstacle: { kind: 'small_cactus', group: 'single' },
    },
    status,
    requestedAt: 0,
    abortController: new AbortController(),
  };
}

test('accepts the configured confidence boundary and executes the choice', () => {
  const runner = createRunner();
  const controller = new AiController(runner, { now: () => 40 });
  const plan = makePlan();
  controller.currentRunId = 'run-1';
  controller.plans.set(plan.obstacleId, plan);

  controller.receiveDecision(plan, {
    runId: 'run-1',
    obstacleId: 'obstacle-1',
    action: 'jump',
    confidence: CONFIDENCE_THRESHOLD,
    probabilities: { jump: 0.7, duck: 0.2, keep_running: 0.1 },
    jumpProfile: 'short',
    jumpProfileConfidence: 0.8,
  });
  controller.executePlans({ dinosaur: { xPos: 50 } });

  assert.equal(plan.status, 'executed');
  assert.equal(runner.jumpCalls, 1);
  assert.deepEqual(runner.jumpProfiles, ['short']);
  assert.equal(controller.stats.acted, 1);
});

test('skips low-confidence and late decisions without a fallback action', () => {
  const runner = createRunner();
  const controller = new AiController(runner, { now: () => 40 });
  controller.currentRunId = 'run-1';

  const uncertain = makePlan();
  controller.plans.set(uncertain.obstacleId, uncertain);
  controller.receiveDecision(uncertain, {
    runId: 'run-1',
    obstacleId: 'obstacle-1',
    action: 'jump',
    confidence: 0.49,
    probabilities: {},
    jumpProfile: 'short',
    jumpProfileConfidence: 0.9,
  });
  controller.executePlans({ dinosaur: { xPos: 50 } });

  const late = makePlan();
  late.obstacleId = 'obstacle-2';
  controller.plans.set(late.obstacleId, late);
  controller.executePlans({ dinosaur: { xPos: 50 } });

  assert.equal(uncertain.status, 'low_confidence');
  assert.equal(late.status, 'late');
  assert.equal(runner.jumpCalls, 0);
  assert.equal(controller.stats.skipped, 2);
  assert.equal(controller.stats.late, 1);
});

test('falls back to a full jump when profile confidence is low', () => {
  const runner = createRunner();
  const controller = new AiController(runner);
  const plan = makePlan();
  controller.currentRunId = 'run-1';
  controller.plans.set(plan.obstacleId, plan);

  controller.receiveDecision(plan, {
    runId: 'run-1',
    obstacleId: plan.obstacleId,
    action: 'jump',
    confidence: 0.9,
    probabilities: {},
    jumpProfile: 'short',
    jumpProfileConfidence: 0.49,
  });
  controller.executePlans({ dinosaur: { xPos: 50 } });

  assert.deepEqual(runner.jumpProfiles, ['full']);
  assert.equal(plan.decision.effectiveJumpProfile, 'full');
});

test('uses a full jump for wide hazards even when Jev selects short', () => {
  const runner = createRunner();
  const controller = new AiController(runner);
  const plan = makePlan();
  plan.state.obstacle = { kind: 'large_cactus', group: 'single' };
  controller.currentRunId = 'run-1';
  controller.plans.set(plan.obstacleId, plan);

  controller.receiveDecision(plan, {
    runId: 'run-1',
    obstacleId: plan.obstacleId,
    action: 'jump',
    confidence: 0.9,
    probabilities: {},
    jumpProfile: 'short',
    jumpProfileConfidence: 0.9,
  });
  controller.executePlans({ dinosaur: { xPos: 50 } });

  assert.deepEqual(runner.jumpProfiles, ['full']);
});

test('waits to execute a jump until the dinosaur can jump', () => {
  const runner = createRunner();
  runner.canJump = false;
  const controller = new AiController(runner);
  const plan = makePlan('ready');
  plan.decision = {
    action: 'jump',
    effectiveJumpProfile: 'full',
  };
  controller.plans.set(plan.obstacleId, plan);

  controller.executePlans({
    dinosaur: { xPos: 50 },
    dinosaurMotion: 'jumping',
  });
  assert.equal(plan.status, 'ready');
  assert.equal(controller.stats.acted, 0);

  runner.canJump = true;
  controller.executePlans({
    dinosaur: { xPos: 50 },
    dinosaurMotion: 'running',
  });
  assert.equal(plan.status, 'executed');
  assert.equal(controller.stats.acted, 1);
});

test('speed-drops before starting a queued duck', () => {
  const runner = createRunner();
  const controller = new AiController(runner);
  const plan = makePlan('ready');
  plan.decision = { action: 'duck' };
  controller.plans.set(plan.obstacleId, plan);

  controller.executePlans({
    dinosaur: { xPos: 50 },
    dinosaurMotion: 'jumping',
  });
  assert.equal(plan.status, 'ready');
  assert.deepEqual(runner.duckCalls, [true]);

  controller.executePlans({
    dinosaur: { xPos: 50 },
    dinosaurMotion: 'running',
  });
  assert.equal(plan.status, 'ducking');
  assert.deepEqual(runner.duckCalls, [true, true]);
});

test('holds duck until the obstacle has passed', () => {
  const runner = createRunner();
  const controller = new AiController(runner);
  const plan = makePlan('ready');
  plan.decision = { action: 'duck' };
  controller.plans.set(plan.obstacleId, plan);

  controller.executePlans({ dinosaur: { xPos: 50 } });
  assert.deepEqual(runner.duckCalls, [true]);

  plan.obstacle.xPos = 20;
  plan.obstacle.width = 20;
  controller.executePlans({ dinosaur: { xPos: 50 } });
  assert.deepEqual(runner.duckCalls, [true, false]);
});

test('requests one judgment when the same obstacle is observed repeatedly', () => {
  const runner = createRunner();
  const obstacle = {
    typeConfig: { type: 'CACTUS_SMALL' },
    xPos: 600,
    yPos: 105,
    width: 17,
    size: 1,
  };
  runner.horizon.obstacles = [obstacle];
  let requestCount = 0;
  const controller = new AiController(runner, {
    fetchImpl() {
      requestCount += 1;
      return new Promise(() => {});
    },
  });
  controller.currentRunId = 'run-1';
  const snapshot = {
    speed: 6,
    speedMode: 'normal',
    dinosaurMotion: 'running',
  };

  controller.observeObstacles(snapshot);
  controller.observeObstacles(snapshot);

  assert.equal(requestCount, 1);
  assert.equal(controller.plans.size, 1);
});
