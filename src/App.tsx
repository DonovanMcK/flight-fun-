import { useEffect, useReducer, useRef, useState } from 'react';
import { CampaignDef } from './game/types';
import { CAMPAIGNS } from './game/data';
import { engine } from './game/engine';
import { resetRenderState } from './game/render';
import { setSfxEnabled } from './game/sfx';
import { GameCanvas } from './ui/GameCanvas';
import { HUD } from './ui/HUD';
import { CampaignSelect, Home, HowTo, LevelSelect, PauseMenu, ResultOverlay } from './ui/Menus';

type Screen = 'home' | 'campaigns' | 'levels' | 'how' | 'battle';

export default function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('home');
  const [campaign, setCampaign] = useState<CampaignDef>(CAMPAIGNS[0]);
  const [paused, setPaused] = useState(false);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const endlessAdvance = useRef<number | null>(null);

  useEffect(() => { setSfxEnabled(engine.save.sound); }, []);
  useEffect(() => engine.subscribe(bump), []);

  // endless mode auto-advances to the next wave shortly after a win
  useEffect(() => {
    if (screen === 'battle' && engine.endless && engine.result === 'win' && endlessAdvance.current == null) {
      endlessAdvance.current = window.setTimeout(() => {
        endlessAdvance.current = null;
        engine.nextEndlessWave();
        resetRenderState();
      }, 900);
    }
    return () => {
      if (endlessAdvance.current != null && screen !== 'battle') {
        window.clearTimeout(endlessAdvance.current);
        endlessAdvance.current = null;
      }
    };
  });

  const startLevel = (c: CampaignDef, idx: number): void => {
    engine.startBattle(c, c.levels[idx], false);
    resetRenderState();
    setPaused(false);
    setScreen('battle');
  };
  const startEndless = (): void => {
    const unlockedCamps = CAMPAIGNS.filter((c, i) => i === 0 || (engine.save.unlocked[CAMPAIGNS[i - 1].id] ?? 0) >= 4);
    const c = unlockedCamps[(Math.random() * unlockedCamps.length) | 0];
    setCampaign(c);
    engine.startBattle(c, c.levels[0], true, 0);
    resetRenderState();
    setPaused(false);
    setScreen('battle');
  };
  const quit = (): void => { engine.quitToMenu(); setPaused(false); setScreen('home'); };

  const inBattle = screen === 'battle';
  const showResult = inBattle && engine.result && !(engine.endless && engine.result === 'win');
  const hasNext = !engine.endless && engine.result === 'win' && engine.level.idx < campaign.levels.length - 1;

  return (
    <div className="app">
      <GameCanvas />
      {inBattle && !engine.result && !paused && (
        <HUD onPause={() => { setPaused(true); engine.paused = true; }} onQuit={quit} />
      )}
      {inBattle && engine.pendingDoctrines && !paused && (
        <div className="overlay doctrine-overlay">
          <h2>Choose a Doctrine</h2>
          <div className="tag">Shapes every {engine.campaign.eras[engine.player.era].name} unit this battle</div>
          <div className="doc-cards">
            {engine.pendingDoctrines.map(d => (
              <button key={d.id} className="doc-card" onClick={() => engine.chooseDoctrine(d)}>
                <span className="doc-ic">{d.icon}</span>
                <span className="doc-name">{d.name}</span>
                {d.good.map((g, i) => <span key={i} className="doc-good">▲ {g}</span>)}
                {d.bad.map((b, i) => <span key={i} className="doc-bad">▼ {b}</span>)}
              </button>
            ))}
          </div>
        </div>
      )}
      {inBattle && paused && (
        <PauseMenu
          onResume={() => { setPaused(false); engine.paused = false; }}
          onRestart={() => { startLevel(campaign, engine.level.idx); }}
          onQuit={quit}
        />
      )}
      {showResult && (
        <ResultOverlay
          onNext={hasNext ? () => startLevel(campaign, engine.level.idx + 1) : null}
          onRetry={() => engine.endless ? startEndless() : startLevel(campaign, engine.level.idx)}
          onMenu={quit}
        />
      )}
      {screen === 'home' && <Home onCampaigns={() => setScreen('campaigns')} onEndless={startEndless} onHow={() => setScreen('how')} />}
      {screen === 'campaigns' && <CampaignSelect onPick={c => { setCampaign(c); setScreen('levels'); }} onBack={() => setScreen('home')} />}
      {screen === 'levels' && <LevelSelect campaign={campaign} onPick={idx => startLevel(campaign, idx)} onBack={() => setScreen('campaigns')} />}
      {screen === 'how' && <HowTo onBack={() => setScreen('home')} />}
    </div>
  );
}
