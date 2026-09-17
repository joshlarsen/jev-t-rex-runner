import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDecisionState,
  describeFlightPath,
  isSupportedObstacle,
} from '../ai/game-state.js';

function obstacle(type, yPos, size = 1) {
  return { typeConfig: { type }, yPos, size };
}

test('normalizes every original obstacle path into semantic state', () => {
  assert.equal(
    describeFlightPath(obstacle('CACTUS_SMALL', 105)),
    'ground_hazard'
  );
  assert.equal(
    describeFlightPath(obstacle('CACTUS_LARGE', 90)),
    'ground_hazard'
  );
  assert.equal(
    describeFlightPath(obstacle('PTERODACTYL', 100)),
    'blocks_running_and_ducking'
  );
  assert.equal(
    describeFlightPath(obstacle('PTERODACTYL', 75)),
    'blocks_running_only'
  );
  assert.equal(
    describeFlightPath(obstacle('PTERODACTYL', 50)),
    'clears_running_dinosaur'
  );
});

test('builds the compact TypeSafe request state', () => {
  const state = buildDecisionState(obstacle('CACTUS_LARGE', 90, 3), {
    speedMode: 'slow',
    dinosaurMotion: 'running',
  });

  assert.deepEqual(state, {
    speedMode: 'slow',
    dinosaurMotion: 'running',
    obstacle: {
      kind: 'large_cactus',
      group: 'triple',
      flightPath: 'ground_hazard',
    },
  });
  assert.equal(isSupportedObstacle(obstacle('COLLECTABLE', 104)), false);
});
