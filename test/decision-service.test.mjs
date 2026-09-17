import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDecisionService,
  normalizeServiceError,
  validateDecisionRequest,
} from '../server/decision-service.mjs';

const validRequest = {
  runId: 'run-1',
  obstacleId: 'obstacle-1',
  state: {
    speed: 6,
    speedMode: 'normal',
    dinosaurMotion: 'running',
    obstacle: {
      kind: 'pterodactyl',
      group: 'single',
      flightPath: 'blocks_running_only',
    },
  },
};

test('validates the decision request allowlists', () => {
  assert.deepEqual(validateDecisionRequest(validRequest), []);
  const invalid = structuredClone(validRequest);
  invalid.state.obstacle.kind = 'meteor';
  assert.match(
    validateDecisionRequest(invalid).join(' '),
    /kind must be one of/
  );
});

test('maps a TypeSafe Choice response onto the public response', async () => {
  let captured;
  const client = {
    async systemOne(request) {
      captured = request;
      return {
        model: 'jev-1.13.0',
        answers: {
          maneuver: {
            choice: 'duck',
            confidence: 0.91,
            probabilities: { jump: 0.04, duck: 0.94, keep_running: 0.02 },
          },
          jump_profile: {
            choice: 'short',
            confidence: 0.82,
            probabilities: { short: 0.9, full: 0.1 },
          },
        },
        usage: { input_tokens: 87, output_tokens: 0 },
      };
    },
  };
  const service = createDecisionService({ client, model: 'jev-latest' });
  const response = await service.decide(validRequest);

  assert.equal(captured.model, 'jev-latest');
  assert.equal(
    captured.state.target_obstacle.flight_path,
    'blocks_running_only'
  );
  assert.equal(captured.questions.maneuver.type, 'choice');
  assert.equal(captured.questions.jump_profile.type, 'choice');
  assert.equal(response.action, 'duck');
  assert.equal(response.jumpProfile, 'short');
  assert.equal(response.jumpProfileConfidence, 0.82);
  assert.equal(response.model, 'jev-1.13.0');
  assert.equal(response.runId, validRequest.runId);
});

test('rejects invalid game speed and jump profile responses', async () => {
  const invalidSpeed = structuredClone(validRequest);
  invalidSpeed.state.speed = Number.NaN;
  assert.match(validateDecisionRequest(invalidSpeed).join(' '), /state.speed/);

  const service = createDecisionService({
    client: {
      async systemOne() {
        return {
          answers: {
            maneuver: {
              choice: 'jump',
              confidence: 0.9,
              probabilities: {},
            },
            jump_profile: {
              choice: 'medium',
              confidence: 0.9,
              probabilities: {},
            },
          },
        };
      },
    },
  });

  await assert.rejects(service.decide(validRequest), {
    code: 'invalid_typesafe_response',
  });
});

test('normalizes missing configuration and rate limits', async () => {
  const service = createDecisionService({ apiKey: '' });
  await assert.rejects(service.decide(validRequest), {
    code: 'typesafe_unconfigured',
  });

  const rateLimit = normalizeServiceError({ status: 429 });
  assert.equal(rateLimit.status, 429);
  assert.equal(rateLimit.body.error.code, 'typesafe_rate_limited');
});
