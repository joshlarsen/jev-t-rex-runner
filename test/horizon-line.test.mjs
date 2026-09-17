import assert from 'node:assert/strict';
import test from 'node:test';

global.window = {
  devicePixelRatio: 1,
  navigator: { userAgent: '' },
  Runner: { imageSprite: {} },
};
global.document = { querySelector: () => ({ dir: 'ltr' }) };

const { HorizonLine } = await import('../resources/dino_game/horizon_line.js');

function createLine(viewportWidth) {
  const drawCalls = [];
  const context = {
    drawImage(...args) {
      drawCalls.push(args);
    },
  };
  const canvas = { getContext: () => context };
  const config = {
    SOURCE_X: 2,
    SOURCE_Y: 52,
    WIDTH: 600,
    HEIGHT: 12,
    YPOS: 127,
  };

  return { line: new HorizonLine(canvas, config, viewportWidth), drawCalls };
}

function assertContinuousCoverage(line, viewportWidth) {
  const positions = [...line.xPos].sort((a, b) => a - b);
  assert.ok(positions[0] <= 0);
  assert.ok(positions.at(-1) + line.dimensions.WIDTH >= viewportWidth);

  for (let i = 1; i < positions.length; i++) {
    assert.equal(positions[i] - positions[i - 1], line.dimensions.WIDTH);
  }
}

test('tiles the ground across a wide viewport while it scrolls', () => {
  const { line } = createLine(1122);

  assert.equal(line.xPos.length, 3);
  assertContinuousCoverage(line, 1122);

  line.update(500, 10, 1122);
  assertContinuousCoverage(line, 1122);

  line.update(500, 10, 1122);
  assertContinuousCoverage(line, 1122);
});

test('adds ground tiles when the viewport grows', () => {
  const { line } = createLine(600);

  assert.equal(line.xPos.length, 2);
  line.update(0, 0, 1800);

  assert.equal(line.xPos.length, 4);
  assertContinuousCoverage(line, 1800);
});
