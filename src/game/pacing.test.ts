import { describe, expect, it } from 'vitest';
import { CAMPAIGNS, PASSIVE_GOLD_FALLBACK_PER_SEC } from './data';
import { Engine } from './engine';
import {
  BASE_TO_CENTER_TRAVEL_DISTANCE,
  FULL_BATTLEFIELD_TRAVEL_DISTANCE,
  MOVEMENT_TIERS,
  travelTimeFor,
} from './pacing';

describe('movement pacing', () => {
  it('keeps every tier inside its target base-to-center travel window', () => {
    for (const tier of Object.values(MOVEMENT_TIERS)) {
      const travelTime = travelTimeFor(BASE_TO_CENTER_TRAVEL_DISTANCE, tier.speed);
      expect(travelTime).toBeGreaterThanOrEqual(tier.centerTimeRange[0]);
      expect(travelTime).toBeLessThanOrEqual(tier.centerTimeRange[1]);
      expect(travelTimeFor(FULL_BATTLEFIELD_TRAVEL_DISTANCE, tier.speed)).toBeCloseTo(travelTime * 2, 8);
    }
  });

  it('gives every unit the raw speed belonging to its named tier', () => {
    const units = CAMPAIGNS.flatMap(campaign => [
      campaign.bossUnit,
      ...campaign.eras.flatMap(era => era.units),
    ]);

    for (const unit of units) {
      expect(unit.moveSpeed, unit.name).toBe(MOVEMENT_TIERS[unit.movementTier].speed);
    }
  });
});

describe('combat-driven economy', () => {
  const simulateElapsedTime = (): Engine => {
    expect(PASSIVE_GOLD_FALLBACK_PER_SEC).toBe(0);
    const simulation = new Engine();
    const campaign = CAMPAIGNS[0];
    simulation.startBattle(campaign, campaign.levels[0], false);
    for (let tick = 0; tick < 600; tick++) simulation.update(0.1);
    return simulation;
  };

  it('does not grant XP from elapsed time alone', () => {
    expect(simulateElapsedTime().player.xp).toBe(0);
  });

  it('does not grant Gold from elapsed time when the fallback is disabled', () => {
    expect(simulateElapsedTime().player.gold).toBe(200);
  });

  it('awards stronger, more expensive units more Gold and XP', () => {
    const basic = CAMPAIGNS[0].eras[0].units[0];
    const stronger = CAMPAIGNS[0].eras[4].units[2];

    expect(stronger.cost).toBeGreaterThan(basic.cost);
    expect(stronger.hp + stronger.damage).toBeGreaterThan(basic.hp + basic.damage);
    expect(stronger.reward).toBeGreaterThan(basic.reward);
    expect(stronger.xpReward).toBeGreaterThan(basic.xpReward);
  });
});
