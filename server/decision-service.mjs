import { choice, TypeSafeClient } from '@typesafe-ai/sdk';

export const ACTIONS = ['jump', 'duck', 'keep_running'];
export const SPEED_MODES = ['normal', 'slow'];
export const DINOSAUR_MOTIONS = ['running', 'jumping', 'ducking'];
export const OBSTACLE_KINDS = ['small_cactus', 'large_cactus', 'pterodactyl'];
export const OBSTACLE_GROUPS = ['single', 'double', 'triple'];
export const FLIGHT_PATHS = [
  'ground_hazard',
  'blocks_running_and_ducking',
  'blocks_running_only',
  'clears_running_dinosaur',
];

const MANEUVER_QUESTION = choice(
  [
    'Choose the single safest maneuver for the dinosaur to avoid',
    'the target obstacle and continue running.',
    'Choose only the maneuver type. Browser code will handle the exact timing.',
  ].join(' '),
  {
    jump: [
      'Jump over a ground hazard or an airborne obstacle whose path blocks',
      'both a running and ducking dinosaur.',
    ].join(' '),
    duck: [
      'Duck under an airborne obstacle whose path blocks a running dinosaur',
      'but leaves safe space for a ducking dinosaur.',
    ].join(' '),
    keep_running: [
      'Keep running without jumping or ducking when the obstacle safely clears',
      'the running dinosaur.',
    ].join(' '),
  }
);

function isEnum(value, values) {
  return typeof value === 'string' && values.includes(value);
}

export function validateDecisionRequest(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ['Request body must be a JSON object.'];
  }

  if (typeof body.runId !== 'string' || body.runId.length === 0) {
    errors.push('runId must be a non-empty string.');
  }
  if (typeof body.obstacleId !== 'string' || body.obstacleId.length === 0) {
    errors.push('obstacleId must be a non-empty string.');
  }

  const state = body.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    errors.push('state must be an object.');
    return errors;
  }

  if (!isEnum(state.speedMode, SPEED_MODES)) {
    errors.push(`state.speedMode must be one of: ${SPEED_MODES.join(', ')}.`);
  }
  if (!isEnum(state.dinosaurMotion, DINOSAUR_MOTIONS)) {
    errors.push(
      `state.dinosaurMotion must be one of: ${DINOSAUR_MOTIONS.join(', ')}.`
    );
  }

  const obstacle = state.obstacle;
  if (!obstacle || typeof obstacle !== 'object' || Array.isArray(obstacle)) {
    errors.push('state.obstacle must be an object.');
    return errors;
  }
  if (!isEnum(obstacle.kind, OBSTACLE_KINDS)) {
    errors.push(
      `state.obstacle.kind must be one of: ${OBSTACLE_KINDS.join(', ')}.`
    );
  }
  if (!isEnum(obstacle.group, OBSTACLE_GROUPS)) {
    errors.push(
      `state.obstacle.group must be one of: ${OBSTACLE_GROUPS.join(', ')}.`
    );
  }
  if (!isEnum(obstacle.flightPath, FLIGHT_PATHS)) {
    errors.push(
      `state.obstacle.flightPath must be one of: ${FLIGHT_PATHS.join(', ')}.`
    );
  }

  return errors;
}

function buildModelState(state) {
  return {
    objective: 'Avoid the target obstacle and keep the dinosaur alive.',
    speed_mode: state.speedMode,
    dinosaur_motion_when_observed: state.dinosaurMotion,
    target_obstacle: {
      kind: state.obstacle.kind,
      group_size: state.obstacle.group,
      flight_path: state.obstacle.flightPath,
    },
    timing_policy:
      'The browser controller will execute the chosen maneuver at the safe time.',
  };
}

export function createDecisionService({
  apiKey = process.env.TYPESAFE_API_KEY,
  model = 'jev-latest',
  client,
} = {}) {
  const typesafeClient =
    client ||
    (apiKey
      ? new TypeSafeClient({
          apiKey,
          timeout: 2000,
          retry: { maxRetries: 1, maxRetryAfterMs: 1000 },
        })
      : null);

  return {
    configured: Boolean(typesafeClient),
    model,

    async decide(body) {
      if (!typesafeClient) {
        const error = new Error('TypeSafe API key is not configured.');
        error.code = 'typesafe_unconfigured';
        error.status = 503;
        error.retryable = false;
        throw error;
      }

      const response = await typesafeClient.systemOne({
        model,
        state: buildModelState(body.state),
        questions: { maneuver: MANEUVER_QUESTION },
      });
      const answer = response.answers.maneuver;

      if (!ACTIONS.includes(answer.choice)) {
        const error = new Error('TypeSafe returned an unsupported action.');
        error.code = 'invalid_typesafe_response';
        error.status = 502;
        error.retryable = true;
        throw error;
      }

      return {
        runId: body.runId,
        obstacleId: body.obstacleId,
        action: answer.choice,
        probabilities: answer.probabilities,
        confidence: answer.confidence,
        model: response.model,
        usage: response.usage,
      };
    },
  };
}

export function normalizeServiceError(error) {
  if (error.code === 'typesafe_unconfigured') {
    return {
      status: 503,
      body: {
        error: {
          code: error.code,
          message: error.message,
          retryable: false,
        },
      },
    };
  }

  const upstreamStatus = Number(error.status);
  if (upstreamStatus === 429 || upstreamStatus === 529) {
    return {
      status: 429,
      body: {
        error: {
          code: 'typesafe_rate_limited',
          message: 'TypeSafe is rate limited or temporarily overloaded.',
          retryable: true,
        },
      },
    };
  }

  if (error.name === 'APITimeoutError') {
    return {
      status: 504,
      body: {
        error: {
          code: 'typesafe_timeout',
          message: 'TypeSafe did not answer before the server timeout.',
          retryable: true,
        },
      },
    };
  }

  return {
    status: 502,
    body: {
      error: {
        code: error.code || 'typesafe_error',
        message: 'TypeSafe could not produce a decision.',
        retryable: error.retryable !== false,
      },
    },
  };
}
