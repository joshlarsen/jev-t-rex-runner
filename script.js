import { Runner } from './resources/dino_game/offline.js';
import { AiController } from './ai/controller.js';

window.addEventListener('load', () => {
  const trexGameContainer = document.querySelector('.trex-game');
  const runner = new Runner(trexGameContainer);
  const elements = {
    controlMode: document.getElementById('control-mode'),
    speedMode: document.getElementById('speed-mode'),
    displayMode: document.getElementById('display-mode'),
    autoRestart: document.getElementById('auto-restart'),
    startButton: document.getElementById('start-button'),
    gameHint: document.getElementById('game-hint'),
    statusPill: document.getElementById('status-pill'),
    apiStatus: document.getElementById('api-status'),
    modelName: document.getElementById('model-name'),
    currentScore: document.getElementById('current-score'),
    bestScore: document.getElementById('best-score'),
    latestAction: document.getElementById('latest-action'),
    latestLatency: document.getElementById('latest-latency'),
    confidenceBar: document.getElementById('confidence-bar'),
    confidenceLabel: document.getElementById('confidence-label'),
    probabilities: document.getElementById('probabilities'),
    jevState: document.getElementById('jev-state'),
    attempts: document.getElementById('attempts'),
    crashes: document.getElementById('crashes'),
    acted: document.getElementById('acted'),
    skipped: document.getElementById('skipped'),
    errors: document.getElementById('errors'),
    averageLatency: document.getElementById('average-latency'),
    inputTokens: document.getElementById('input-tokens'),
    overlayAction: document.getElementById('overlay-action'),
    overlayMeta: document.getElementById('overlay-meta'),
  };

  let health = { configured: false, model: 'jev-latest', checked: false };

  const render = telemetry => {
    const snapshot = runner.getAiSnapshot();
    const decision = telemetry.decision;
    const stats = telemetry.stats;
    const isAi = telemetry.enabled;

    elements.statusPill.textContent = telemetry.status.message;
    elements.statusPill.dataset.type = telemetry.status.type;
    elements.currentScore.textContent = stats.currentScore;
    elements.bestScore.textContent = stats.bestScore;
    elements.attempts.textContent = stats.attempts;
    elements.crashes.textContent = stats.crashes;
    elements.acted.textContent = stats.acted;
    elements.skipped.textContent = stats.skipped;
    elements.errors.textContent = stats.errors;
    elements.averageLatency.textContent = stats.latencyCount
      ? `${stats.averageLatency} ms`
      : '—';

    elements.startButton.disabled = snapshot.playing || !runner.tRex;
    elements.startButton.textContent = snapshot.crashed
      ? 'Restart run'
      : 'Start run';
    elements.speedMode.disabled = snapshot.playing;
    elements.autoRestart.disabled = !isAi;
    elements.gameHint.textContent = isAi
      ? 'AI mode: Jev has exclusive control of the dinosaur.'
      : 'Manual mode: press Space or ↑ to jump and ↓ to duck.';

    if (decision) {
      const action = decision.action.replaceAll('_', ' ');
      const confidence = Math.round(decision.confidence * 100);
      elements.latestAction.textContent = action;
      elements.latestLatency.textContent = `${decision.latencyMs} ms`;
      elements.confidenceBar.style.width = `${confidence}%`;
      elements.confidenceLabel.textContent = `Confidence ${confidence}%`;
      elements.modelName.textContent = decision.model || health.model;
      elements.inputTokens.textContent =
        decision.usage?.input_tokens ?? decision.usage?.inputTokens ?? '—';
      elements.overlayAction.textContent = action;
      elements.overlayMeta.textContent = `${confidence}% · ${decision.latencyMs} ms`;
      elements.probabilities.replaceChildren(
        ...Object.entries(decision.probabilities || {}).map(([name, value]) => {
          const row = document.createElement('div');
          const label = document.createElement('span');
          const probability = document.createElement('strong');
          label.textContent = name.replaceAll('_', ' ');
          probability.textContent = `${Math.round(value * 100)}%`;
          row.append(label, probability);
          return row;
        })
      );
    }

    if (telemetry.state) {
      elements.jevState.textContent = JSON.stringify(telemetry.state, null, 2);
    }
  };

  const controller = new AiController(runner, { onUpdate: render });
  controller.start();

  elements.controlMode.addEventListener('change', event => {
    const isAi = event.target.value === 'ai';
    controller.setEnabled(isAi);
    if (!isAi) {
      elements.autoRestart.checked = false;
      controller.setAutoRestart(false);
    }
  });

  elements.speedMode.addEventListener('change', event => {
    runner.setSpeedMode(event.target.value);
  });

  elements.displayMode.addEventListener('change', event => {
    document.body.dataset.view = event.target.value;
  });

  elements.autoRestart.addEventListener('change', event => {
    controller.setAutoRestart(event.target.checked);
  });

  elements.startButton.addEventListener('click', () => {
    if (elements.controlMode.value === 'ai' && !health.configured) {
      elements.statusPill.dataset.type = 'error';
      elements.statusPill.textContent = 'Add TYPESAFE_API_KEY';
      return;
    }
    runner.setSpeedMode(elements.speedMode.value);
    runner.startRun();
  });

  //   On keypress 'F' enable Arcade mode
  document.addEventListener('keydown', event => {
    if (event.key === 'f') {
      runner.setArcadeMode();
    }
  });

  fetch('/api/health')
    .then(response => response.json())
    .then(result => {
      health = { ...result, checked: true };
      elements.apiStatus.textContent = result.configured
        ? 'Connected'
        : 'API key missing';
      elements.apiStatus.dataset.configured = String(result.configured);
      elements.modelName.textContent = result.model;
    })
    .catch(() => {
      health.checked = true;
      elements.apiStatus.textContent = 'Server unavailable';
      elements.apiStatus.dataset.configured = 'false';
    });
});
