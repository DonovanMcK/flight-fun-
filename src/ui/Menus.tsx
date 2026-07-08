import { CampaignDef } from '../game/types';
import { CAMPAIGNS, COMMANDERS } from '../game/data';
import { engine, writeSave } from '../game/engine';
import { setSfxEnabled, sfxEnabled } from '../game/sfx';
import { useReducer } from 'react';

export function Home({ onCampaigns, onEndless, onHow }: { onCampaigns: () => void; onEndless: () => void; onHow: () => void }): JSX.Element {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  return (
    <div className="screen">
      <h1 className="logo">EON WARS</h1>
      <div className="tag">EVOLVE · BATTLE · CONQUER TIME</div>
      <button className="btn primary" onClick={onCampaigns}>⚔️ Campaigns<small>3 timelines · 8 battles each</small></button>
      <button className="btn" onClick={onEndless}>♾️ Endless Survival<small>{engine.save.endlessBest > 0 ? `Best: ${engine.save.endlessBest} waves` : 'Scaling waves — set a record'}</small></button>
      <button className="btn ghost" onClick={onHow}>❓ How to Play</button>
      <div className="row">
        <button className="btn ghost" onClick={() => { const on = !sfxEnabled(); setSfxEnabled(on); engine.save.sound = on; writeSave(engine.save); bump(); }}>
          {sfxEnabled() ? '🔊 Sound: On' : '🔇 Sound: Off'}
        </button>
        <button className="btn ghost" onClick={() => { if (confirm('Erase all progress?')) { engine.save = { unlocked: {}, endlessBest: 0, sound: true }; writeSave(engine.save); bump(); } }}>
          🗑 Reset
        </button>
      </div>
      <div className="foot">100% offline · no wifi needed · best in landscape 📱</div>
    </div>
  );
}

export function CampaignSelect({ onPick, onBack }: { onPick: (c: CampaignDef) => void; onBack: () => void }): JSX.Element {
  return (
    <div className="screen">
      <h2>Choose Your Era</h2>
      {CAMPAIGNS.map((c, i) => {
        const prevDone = i === 0 || (engine.save.unlocked[CAMPAIGNS[i - 1].id] ?? 0) >= 4;
        const won = engine.save.unlocked[c.id] ?? 0;
        return (
          <button key={c.id} className={`camp ${prevDone ? '' : 'locked'}`}
            onClick={() => { if (prevDone) onPick(c); }}>
            <span className="camp-ic">{c.icon}</span>
            <span className="camp-body">
              <span className="camp-name">{c.name}</span>
              <span className="camp-desc">{c.desc}</span>
              <span className="camp-desc">✓ {won}/8 battles won</span>
            </span>
            {!prevDone && <span className="lock">🔒 win 4 in {CAMPAIGNS[i - 1].name}</span>}
          </button>
        );
      })}
      <button className="btn ghost" onClick={onBack}>← Back</button>
    </div>
  );
}

export function LevelSelect({ campaign, onPick, onBack }: { campaign: CampaignDef; onPick: (idx: number) => void; onBack: () => void }): JSX.Element {
  const unlocked = engine.save.unlocked[campaign.id] ?? 0;
  return (
    <div className="screen">
      <h2>{campaign.icon} {campaign.name}</h2>
      <div className="tag">{campaign.desc}</div>
      <div className="lvl-grid">
        {campaign.levels.map(lv => {
          const open = lv.idx <= unlocked;
          const done = lv.idx < unlocked;
          const cmd = COMMANDERS[lv.commanderId];
          return (
            <button key={lv.idx} className={`lvl ${open ? '' : 'locked'}`} onClick={() => { if (open) onPick(lv.idx); }}>
              <span className="lvl-num">{lv.idx + 1}</span>
              <span className="lvl-name">{lv.name}</span>
              <span className="lvl-cmd">{open ? `vs ${cmd.name}` : '🔒'}</span>
              <span className="lvl-done">{done ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>
      <button className="btn ghost" onClick={onBack}>← Campaigns</button>
    </div>
  );
}

export function HowTo({ onBack }: { onBack: () => void }): JSX.Element {
  const tips = [
    '🎯 Destroy the enemy base (right) before yours (left) falls.',
    '💰 Gold trickles in and drops from kills — spend it on units & turrets.',
    '⭐ Supply caps your army; queued units emerge from your base.',
    '🧬 XP fills the bar — EVOLVE to unlock a stronger era.',
    '🛡 Turrets auto-fire from your tower. Buy again to upgrade old ones.',
    '☄️ Your Special wipes a push — save it for emergencies.',
    '🎖 Units that bank kills go VETERAN: bonus gold per kill. Protect them!',
    '🧠 Each battle has an enemy commander with its own personality.',
  ];
  return (
    <div className="screen">
      <h2>How to Play</h2>
      <div className="tips">{tips.map((t, i) => <div key={i} className="pill">{t}</div>)}</div>
      <button className="btn ghost" onClick={onBack}>← Back</button>
    </div>
  );
}

export function PauseMenu({ onResume, onRestart, onQuit }: { onResume: () => void; onRestart: () => void; onQuit: () => void }): JSX.Element {
  return (
    <div className="overlay">
      <h1 className="logo small">PAUSED</h1>
      <button className="btn primary" onClick={onResume}>▶ Resume</button>
      <button className="btn" onClick={onRestart}>↻ Restart Battle</button>
      <button className="btn ghost" onClick={onQuit}>🏳 Quit to Menu</button>
    </div>
  );
}

export function ResultOverlay({ onNext, onRetry, onMenu }: { onNext: (() => void) | null; onRetry: () => void; onMenu: () => void }): JSX.Element {
  const win = engine.result === 'win';
  const endless = engine.endless;
  return (
    <div className="overlay">
      <h1 className={`logo small ${win ? 'win' : 'lose'}`}>
        {endless && !win ? `SURVIVED ${engine.endlessWave} WAVE${engine.endlessWave === 1 ? '' : 'S'}` : win ? 'VICTORY!' : 'DEFEAT'}
      </h1>
      <div className="tag">
        {endless && !win
          ? `Best: ${engine.save.endlessBest} waves`
          : win
            ? (onNext ? `Next: ${engine.campaign.levels[engine.level.idx + 1]?.name ?? ''}` : `${engine.campaign.name} conquered!`)
            : `${COMMANDERS[engine.level.commanderId]?.name ?? 'The enemy'} held the line. Try again.`}
      </div>
      {win && onNext && <button className="btn primary" onClick={onNext}>Next Battle ▶</button>}
      <button className="btn" onClick={onRetry}>↻ {endless ? 'New Run' : 'Retry'}</button>
      <button className="btn ghost" onClick={onMenu}>🏠 Menu</button>
    </div>
  );
}
