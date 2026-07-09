import { useEffect, useReducer, useState } from 'react';
import { engine, LANE_L, LANE_R } from '../game/engine';
import { EVOLVE_XP, TURRET_SELL_REFUND } from '../game/data';
import { jumpCamera } from '../game/render';
import { UnitIcon } from './UnitIcon';
import { resumeAudio } from '../game/sfx';

/** Re-render the HUD ~10×/s so gold/xp/cooldowns stay fresh without wiring
 *  every engine mutation through React. */
function useGameTick(): void {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const id = window.setInterval(bump, 100);
    const unsub = engine.subscribe(bump);
    return () => { window.clearInterval(id); unsub(); };
  }, []);
}

export function HUD({ onPause, onQuit }: { onPause: () => void; onQuit: () => void }): JSX.Element {
  useGameTick();
  const [turretPanel, setTurretPanel] = useState(false);
  const P = engine.player;
  const era = engine.campaign.eras[P.era - 1];
  const nextXp = P.era < 5 ? EVOLVE_XP[P.era] : 0;
  const xpPct = P.era >= 5 ? 100 : Math.min(100, (P.xp / nextXp) * 100);
  const canEvolve = engine.canEvolve('player');
  const slotCost = engine.nextSlotCost('player');
  const freeSlot = P.base.turrets.length < P.base.slots;
  const special = era.special;
  const spReady = P.specialCd <= 0;
  const spPct = spReady ? 1 : 1 - P.specialCd / special.cdSec;

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="res">💰 {Math.floor(P.gold)}</div>
        <div className="res">⭐ {P.supply}<small>/{P.supplyCap}</small></div>
        <div className="era-block">
          <div className="era-name">{era.name}{engine.endless ? ` · WAVE ${engine.endlessWave + 1}` : ''}</div>
          <div className="xp-track"><div className="xp-fill" style={{ width: `${xpPct}%` }} /></div>
        </div>
        <div className="spacer" />
        <div className="cam-btns">
          <button className="icon-btn slim" title="My base" onClick={() => jumpCamera(LANE_L + 80)}>⇤</button>
          <button className="icon-btn slim" title="Front line" onClick={() => jumpCamera(engine.frontX())}>⚔</button>
          <button className="icon-btn slim" title="Enemy base" onClick={() => jumpCamera(LANE_R - 80)}>⇥</button>
        </div>
        <button className="icon-btn" onClick={() => { engine.speed = engine.speed === 1 ? 2 : engine.speed === 2 ? 3 : 1; }}>
          {engine.speed}×
        </button>
        <button className="icon-btn" onClick={onPause}>⏸</button>
      </div>

      {turretPanel && (
        <div className="turret-panel">
          <div className="tp-row">
            {era.turrets.map(td => {
              const ok = P.gold >= td.cost && freeSlot;
              return (
                <button key={td.kind} className={`tp-buy ${ok ? '' : 'dis'}`} onClick={() => engine.buyTurret('player', td)}>
                  <span className="tp-ic">{td.icon}</span>
                  <span className="tp-nm">{td.name}</span>
                  <span className="tp-stats">{td.damage} dmg · {Math.round(1000 / td.cooldownMs * 10) / 10}/s{td.aoe ? ' · AoE' : ''} · rng {td.range}</span>
                  <span className="cost">💰{td.cost}</span>
                </button>
              );
            })}
            <button
              className={`tp-buy slot ${slotCost != null && P.gold >= slotCost ? '' : 'dis'}`}
              onClick={() => engine.buySlot('player')}
            >
              <span className="tp-ic">➕</span>
              <span className="tp-nm">Slot {P.base.slots}/4</span>
              <span className="tp-stats">room for one more turret</span>
              <span className="cost">{slotCost == null ? 'MAX' : `💰${slotCost}`}</span>
            </button>
          </div>
          {P.base.turrets.length > 0 && (
            <div className="tp-row built">
              <span className="tp-label">SELL:</span>
              {P.base.turrets.map((tr, i) => (
                <button key={i} className="tp-chip" onClick={() => engine.sellTurret('player', i)}>
                  {tr.def.icon} {tr.def.name} · E{tr.era} <b>✕ +{Math.round(tr.def.cost * TURRET_SELL_REFUND)}</b>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="hud-bottom" onPointerDown={resumeAudio}>
        {era.units.map(def => {
          const ok = engine.canBuy('player', def);
          return (
            <button key={def.id} className={`card ${ok ? '' : 'dis'}`} onClick={() => engine.buyUnit('player', def)}>
              <UnitIcon def={def} />
              <span className="nm">{def.name}</span>
              <span className="cost">💰{def.cost} · ⭐{def.supply}</span>
            </button>
          );
        })}
        <button
          className={`card ${turretPanel ? 'sel' : ''}`}
          onClick={() => setTurretPanel(v => !v)}
        >
          <span className="big-ic">🛡️</span>
          <span className="nm">Turrets {P.base.turrets.length}/{P.base.slots}</span>
          <span className="cost">{turretPanel ? 'CLOSE ▾' : 'BUILD ▴'}</span>
        </button>
        <button className={`card evolve ${canEvolve ? 'pulse' : 'dis'}`} onClick={() => engine.evolve('player')}>
          <span className="big-ic">🧬</span>
          <span className="nm">Evolve</span>
          <span className="cost xp">{P.era >= 5 ? 'MAX' : `${Math.floor(P.xp)}/${nextXp} XP`}</span>
        </button>
        <button className={`card special ${spReady ? 'pulse' : 'dis'}`} onClick={() => engine.useSpecial('player')}>
          <span className="radial" style={{ ['--p' as string]: spPct }}>
            <span className="big-ic">{special.icon}</span>
          </span>
          <span className="nm">{special.name}</span>
          <span className="cost">{spReady ? 'READY' : `${Math.ceil(P.specialCd)}s`}</span>
        </button>
      </div>
      {/* queue pips */}
      {P.queue.length > 0 && (
        <div className="queue-pips">
          {P.queue.map((q, i) => <span key={i} className="pip">{q.def.name[0]}</span>)}
        </div>
      )}
      <button className="quit-x" onClick={onQuit}>✕</button>
    </div>
  );
}
