import { describe, expect, it, vi } from 'vitest';
import { AI_OPENING_FORCE, CAMPAIGNS, endlessWindow } from './data';
import { canEnemyAdvanceTier, Engine, rangedFormationReach, RANGED_FIRE_RANKS } from './engine';

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
