import { useEffect, useRef } from 'react';
import { engine } from '../game/engine';
import { renderScene } from '../game/render';

/** Fullscreen canvas hosting the 60fps game loop (sim + render). */
export function GameCanvas(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    let last = performance.now();

    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = window.innerWidth * dpr;
      cv.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      for (let i = 0; i < engine.speed; i++) engine.update(dt);
      renderScene(ctx, window.innerWidth, window.innerHeight, now);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={ref} className="game-canvas" />;
}
