import assert from 'node:assert/strict';
import test from 'node:test';

global.window = {
  devicePixelRatio: 1,
  navigator: { userAgent: '' },
};
global.document = { querySelector: () => ({ dir: 'ltr' }) };

const { Trex } = await import('../resources/dino_game/trex.js');

function createJump(profile) {
  return Object.assign(Object.create(Trex.prototype), {
    status: Trex.status.JUMPING,
    config: {
      DROP_VELOCITY: -5,
      GRAVITY: 0.6,
      MAX_JUMP_HEIGHT: 30,
      SPEED_DROP_COEFFICIENT: 3,
    },
    groundYPos: 93,
    jumpProfile: profile,
    jumping: true,
    jumpVelocity: -10.6,
    minJumpHeight: 63,
    reachedMinHeight: false,
    speedDrop: false,
    yPos: 93,
  });
}

test('short jump begins descending at minimum safe height', () => {
  const shortJump = createJump('short');
  const fullJump = createJump('full');

  while (!shortJump.reachedMinHeight) {
    shortJump.updateJump(1000 / 60);
    fullJump.updateJump(1000 / 60);
  }

  assert.equal(shortJump.jumpVelocity, shortJump.config.DROP_VELOCITY);
  assert.ok(fullJump.jumpVelocity < fullJump.config.DROP_VELOCITY);
});
