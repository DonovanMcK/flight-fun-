import { useEffect, useReducer } from 'react';
import { engine } from '../game/engine';
import { EVOLVE_XP } from '../game/data';
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
  const P = engine.player;
  const era = engine.campaign.eras[P.era - 1];
  const nextXp = P.era < 5 ? EVOLVE_XP[P.era] : 0;
  const xpPct = P.era >= 5 ? 100 : Math.min(100, (P.xp / nextXp) * 100);
  const canEvolve = engine.canEvolve('player');
  const turret = era.turret;
  const turretFull = P.base.turrets.length >= P.base.slots && !P.base.turrets.some(t => t.era < P.era);
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
        <button className="icon-btn" onClick={() => { engine.speed = engine.speed === 1 ? 2 : engine.speed === 2 ? 3 : 1; }}>
          {engine.speed}×
        </button>
        <button className="icon-btn" onClick={onPause}>⏸</button>
      </div>

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
          className={`card ${P.gold >= turret.cost && !turretFull ? '' : 'dis'}`}
          onClick={() => engine.buyTurret('player')}
        >
          <span className="big-ic">🛡️</span>
          <span className="nm">Turret {P.base.turrets.length}/{P.base.slots}</span>
          <span className="cost">💰{turret.cost}</span>
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
