import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateActionProximityThreshold,
  OBSTACLE_CENTERING_RATIO,
  SHORT_JUMP_LEAD_RATIO,
} from '../ai/timing.js';

function threshold(overrides = {}) {
  return calculateActionProximityThreshold({
    baseThreshold: 140,
    baseSpeed: 6,
    currentSpeed: 6,
    dinosaurX: 50,
    obstacleWidth: 17,
    action: 'jump',
    jumpProfile: 'full',
    ...overrides,
  });
}

test('uses the calibrated AI trigger at base speed', () => {
  assert.equal(threshold(), 140);
});

test('starts earlier as speed increases and centers wider obstacles under the arc', () => {
  assert.equal(threshold({ currentSpeed: 12 }), 230);
  assert.equal(
    threshold({ obstacleWidth: 51 }),
    140 - 34 * OBSTACLE_CENTERING_RATIO
  );
  assert.equal(
    threshold({ currentSpeed: 12, obstacleWidth: 51 }),
    230 - 34 * OBSTACLE_CENTERING_RATIO
  );
});

test('uses a later launch window for short jumps and no width lead for ducking', () => {
  assert.equal(
    threshold({ jumpProfile: 'short' }),
    50 + 90 * SHORT_JUMP_LEAD_RATIO
  );
  assert.equal(threshold({ action: 'duck', obstacleWidth: 51 }), 140);
});
