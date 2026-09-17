export const REFERENCE_OBSTACLE_WIDTH = 17;
export const SHORT_JUMP_LEAD_RATIO = 0.82;
export const OBSTACLE_CENTERING_RATIO = 0.5;

/**
 * Convert the original pixel threshold into a constant-time approach window.
 * Wider ground hazards begin later so the longer obstacle stays centered under
 * the jump arc instead of meeting the dinosaur after it lands.
 */
export function calculateActionProximityThreshold({
  baseThreshold,
  baseSpeed,
  currentSpeed,
  dinosaurX,
  obstacleWidth = REFERENCE_OBSTACLE_WIDTH,
  action = 'jump',
  jumpProfile = 'full',
}) {
  const safeBaseSpeed = Math.max(Number(baseSpeed) || 0, 0.1);
  const safeCurrentSpeed = Math.max(Number(currentSpeed) || 0, 0.1);
  const safeDinosaurX = Number(dinosaurX) || 0;
  const baseLeadDistance = Math.max(
    0,
    (Number(baseThreshold) || 0) - safeDinosaurX
  );
  const profileRatio =
    action === 'jump' && jumpProfile === 'short' ? SHORT_JUMP_LEAD_RATIO : 1;
  const speedAdjustedLead =
    baseLeadDistance * (safeCurrentSpeed / safeBaseSpeed) * profileRatio;
  const obstacleWidthAdjustment =
    action === 'jump'
      ? Math.max(
          0,
          ((Number(obstacleWidth) || REFERENCE_OBSTACLE_WIDTH) -
            REFERENCE_OBSTACLE_WIDTH) *
            OBSTACLE_CENTERING_RATIO
        )
      : 0;

  return Math.max(
    safeDinosaurX,
    safeDinosaurX + speedAdjustedLead - obstacleWidthAdjustment
  );
}
