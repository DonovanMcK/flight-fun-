import { MovementTier } from './types';

/** Fixed world geometry. The camera shows only part of this lane at a time. */
export const LANE_W = 2100;
export const LANE_L = 52;
export const LANE_R = LANE_W - 52;
export const BATTLEFIELD_CENTER = LANE_W / 2;
export const UNIT_SPAWN_INSET = 14;

/** Units begin just inside their base, so these are the actual unobstructed
 *  distances used for pacing checks rather than the base-to-base distance. */
export const BASE_TO_CENTER_TRAVEL_DISTANCE = BATTLEFIELD_CENTER - (LANE_L + UNIT_SPAWN_INSET);
export const FULL_BATTLEFIELD_TRAVEL_DISTANCE = (LANE_R - UNIT_SPAWN_INSET) - (LANE_L + UNIT_SPAWN_INSET);

export interface MovementTierDef {
  /** Desired unobstructed spawn-to-center window, in seconds. */
  centerTimeRange: readonly [number, number];
  /** Raw movement is derived from the travel distance and target midpoint. */
  speed: number;
}

const movementTier = (minSec: number, maxSec: number): MovementTierDef => ({
  centerTimeRange: [minSec, maxSec],
  speed: Math.round(BASE_TO_CENTER_TRAVEL_DISTANCE / ((minSec + maxSec) / 2)),
});

/** Readable movement bands keep formations coherent while preserving unit
 *  weight. Raw speeds are derived from desired battlefield travel time. */
export const MOVEMENT_TIERS: Record<MovementTier, MovementTierDef> = {
  'Very Fast': movementTier(6, 7),
  Fast: movementTier(7, 8),
  Normal: movementTier(8, 10),
  Slow: movementTier(10, 12),
  'Very Slow': movementTier(12, 15),
  Massive: movementTier(15, 18),
};

export const travelTimeFor = (distance: number, speed: number): number => distance / speed;
