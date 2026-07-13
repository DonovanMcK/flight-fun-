import { describe, expect, it, vi } from 'vitest';
import { AI_MAX_TURRET_SLOTS, AI_OPENING_FORCE, CAMPAIGNS, EVOLVE_XP, endlessWindow, supplyCapFor } from './data';
import {
  aiRosterEraWeight,
  BASE_FRONTLINE_ASSAULT_SLOTS,
  BASE_SUPPORT_ASSAULT_SLOTS,
  baseAssaultReach,
  canEnemyAdvanceTier,
  Engine,
  rangedFormationReach,
  RANGED_FIRE_RANKS,
  stalemateDamageMultiplier,
} from './engine';

describe('data-driven era visuals', () => {
  it('defines a complete, ordered visual package for every campaign era', () => {
    const expectedStages = ['primitive', 'fortified', 'engineered', 'advanced', 'apex'];

    for (const campaign of CAMPAIGNS) {
      expect(campaign.eras.map(era => era.visual.stage)).toEqual(expectedStages);
      for (const era of campaign.eras) {
        const expectedMotif = campaign.id === 'man' ? 'human' : campaign.id === 'myth' ? 'mythic' : 'cosmic';
        expect(era.visual.motif).toBe(expectedMotif);
        expect(era.visual.transition.durationSec).toBeGreaterThanOrEqual(0.5);
        expect(era.visual.transition.durationSec).toBeLessThanOrEqual(1);
        expect(era.visual.propDensity).toBeGreaterThan(0);
      }
    }
  });
});

describe('two-rank ranged formation', () => {
  it('allows the front two ranged positions to fire and holds later ranks', () => {
    expect(RANGED_FIRE_RANKS).toBe(2);
    expect(rangedFormationReach(230, 0)).toBe(230);
    expect(rangedFormationReach(230, 1)).toBe(264);
    expect(rangedFormationReach(230, 2)).toBe(0);
  });
});

describe('late-game anti-stalemate pacing', () => {
  it('allows a staggered base assault without enabling unlimited stacking', () => {
    expect(BASE_FRONTLINE_ASSAULT_SLOTS).toBe(3);
    expect(baseAssaultReach(60, 0, BASE_FRONTLINE_ASSAULT_SLOTS)).toBe(60);
    expect(baseAssaultReach(60, 1, BASE_FRONTLINE_ASSAULT_SLOTS)).toBe(94);
    expect(baseAssaultReach(60, 2, BASE_FRONTLINE_ASSAULT_SLOTS)).toBe(128);
    expect(baseAssaultReach(60, 3, BASE_FRONTLINE_ASSAULT_SLOTS)).toBe(0);
    expect(BASE_SUPPORT_ASSAULT_SLOTS).toBe(2);
    expect(baseAssaultReach(230, 1, BASE_SUPPORT_ASSAULT_SLOTS)).toBe(264);
    expect(baseAssaultReach(230, 2, BASE_SUPPORT_ASSAULT_SLOTS)).toBe(0);
  });

  it('ramps troop deadlock pressure only after twelve stalled seconds', () => {
    expect(stalemateDamageMultiplier(0)).toBe(1);
    expect(stalemateDamageMultiplier(12)).toBe(1);
    expect(stalemateDamageMultiplier(16)).toBeCloseTo(1.125);
    expect(stalemateDamageMultiplier(20)).toBe(1.25);
    expect(stalemateDamageMultiplier(60)).toBe(1.25);
  });

  it('slows evolution and keeps the normal era-five supply cap at eighteen', () => {
    expect(EVOLVE_XP).toEqual([0, 500, 1400, 2800, 4800]);
    expect(supplyCapFor(5)).toBe(18);
  });

  it('limits AI defense and retires units older than the previous era', () => {
    expect(AI_MAX_TURRET_SLOTS).toBe(3);
    expect(aiRosterEraWeight(5, 5)).toBe(5);
    expect(aiRosterEraWeight(5, 4)).toBe(1);
    expect(aiRosterEraWeight(5, 3)).toBe(0);
  });

  it('reduces the Last Stand fortress and late sniper reach', () => {
    for (const campaign of CAMPAIGNS) {
      const lastStand = campaign.levels[campaign.levels.length - 1];
      const futureSniper = campaign.eras[4].turrets.find(turret => turret.kind === 'sniper');
      expect(lastStand.baseHpMul).toBeLessThanOrEqual(1.8);
      expect(futureSniper?.range).toBe(460);
    }
  });
});

describe('competitive AI opening', () => {
  it('fields at least three troops without passive income', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const simulation = new Engine();
    const campaign = CAMPAIGNS[0];
    simulation.startBattle(campaign, campaign.levels[0], false);

    for (let tick = 0; tick < 60; tick++) simulation.update(0.1);

    const committedUnits = simulation.units.filter(unit => unit.side === 'enemy' && unit.state !== 'die').length + simulation.enemy.queue.length;
    expect(committedUnits).toBeGreaterThanOrEqual(AI_OPENING_FORCE);
    random.mockRestore();
  });

  it('scales the opening war chest with campaign difficulty', () => {
    for (const campaign of CAMPAIGNS) {
      const budgets = campaign.levels.map(level => level.enemyStartingGold);
      expect(budgets[0]).toBeGreaterThanOrEqual(300);
      expect([...budgets].sort((a, b) => a - b)).toEqual(budgets);
    }
  });

  it('starts every campaign and Endless battle at Era 1', () => {
    for (const campaign of CAMPAIGNS) {
      expect(campaign.levels.every(level => level.startEra === 1)).toBe(true);
    }
    for (const wave of [0, 3, 8, 20]) expect(endlessWindow(wave).startEra).toBe(1);
  });

  it('allows the AI to match but never exceed the player unit tier', () => {
    expect(canEnemyAdvanceTier(0, 0)).toBe(false);
    expect(canEnemyAdvanceTier(1, 0)).toBe(true);
    expect(canEnemyAdvanceTier(1, 1)).toBe(false);
    expect(canEnemyAdvanceTier(2, 1)).toBe(true);
    expect(canEnemyAdvanceTier(2, 2)).toBe(false);
  });
});
