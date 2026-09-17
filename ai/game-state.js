const KIND_NAMES = {
  CACTUS_SMALL: 'small_cactus',
  CACTUS_LARGE: 'large_cactus',
  PTERODACTYL: 'pterodactyl',
};

const GROUP_NAMES = ['single', 'single', 'double', 'triple'];

export function describeFlightPath(obstacle) {
  if (obstacle.typeConfig.type !== 'PTERODACTYL') {
    return 'ground_hazard';
  }
  if (obstacle.yPos >= 95) {
    return 'blocks_running_and_ducking';
  }
  if (obstacle.yPos >= 70) {
    return 'blocks_running_only';
  }
  return 'clears_running_dinosaur';
}

export function buildDecisionState(obstacle, snapshot) {
  return {
    speedMode: snapshot.speedMode,
    dinosaurMotion: snapshot.dinosaurMotion,
    obstacle: {
      kind: KIND_NAMES[obstacle.typeConfig.type],
      group: GROUP_NAMES[Math.min(3, Math.max(1, obstacle.size))],
      flightPath: describeFlightPath(obstacle),
    },
  };
}

export function isSupportedObstacle(obstacle) {
  return Boolean(KIND_NAMES[obstacle?.typeConfig?.type]);
}
