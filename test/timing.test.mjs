import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateActionProximityThreshold,
  SHORT_JUMP_LEAD_RATIO,
} from '../ai/timing.js';

function threshold(overrides = {}) {
  return calculateActionProximityThreshold({
    baseThreshold: 190,
    baseSpeed: 6,
    currentSpeed: 6,
    dinosaurX: 50,
    obstacleWidth: 17,
    action: 'jump',
    jumpProfile: 'full',
    ...overrides,
  });
}

test('preserves the original trigger at base speed', () => {
  assert.equal(threshold(), 190);
});

test('starts earlier as speed increases and centers wider obstacles under the arc', () => {
  assert.equal(threshold({ currentSpeed: 12 }), 330);
  assert.equal(threshold({ obstacleWidth: 51 }), 156);
  assert.equal(threshold({ currentSpeed: 12, obstacleWidth: 51 }), 296);
});

test('uses a later launch window for short jumps and no width lead for ducking', () => {
  assert.equal(
    threshold({ jumpProfile: 'short' }),
    50 + 140 * SHORT_JUMP_LEAD_RATIO
  );
  assert.equal(threshold({ action: 'duck', obstacleWidth: 51 }), 190);
});
