import { useEffect, useRef } from 'react';
import { engine } from '../game/engine';
import { renderScene, panCamera, minimapRect, minimapSeek } from '../game/render';

/** Fullscreen canvas hosting the 60fps game loop. Also owns camera input:
 *  drag/swipe to pan the battlefield, tap/scrub the minimap to seek,
 *  trackpad wheel + arrow keys on desktop. */
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

    // ---- camera input ----
    let dragging = false, scrubbing = false, lastX = 0;
    const inMinimap = (e: PointerEvent): boolean =>
      e.clientX >= minimapRect.x && e.clientX <= minimapRect.x + minimapRect.w &&
      e.clientY >= minimapRect.y && e.clientY <= minimapRect.y + minimapRect.h;
    const down = (e: PointerEvent): void => {
      if (engine.mode !== 'battle') return;
      if (inMinimap(e)) { scrubbing = true; minimapSeek(e.clientX); return; }
      dragging = true; lastX = e.clientX;
    };
    const move = (e: PointerEvent): void => {
      if (scrubbing) { minimapSeek(e.clientX); return; }
      if (!dragging) return;
      panCamera(lastX - e.clientX);
      lastX = e.clientX;
    };
    const up = (): void => { dragging = false; scrubbing = false; };
    const wheel = (e: WheelEvent): void => {
      if (engine.mode !== 'battle') return;
      panCamera((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 1.2);
      e.preventDefault();
    };
    const key = (e: KeyboardEvent): void => {
      if (engine.mode !== 'battle') return;
      if (e.key === 'ArrowLeft') panCamera(-60);
      else if (e.key === 'ArrowRight') panCamera(60);
    };
    cv.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    cv.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      for (let i = 0; i < engine.speed; i++) engine.update(dt);
      renderScene(ctx, window.innerWidth, window.innerHeight, now);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      cv.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      cv.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
    };
  }, []);

  return <canvas ref={ref} className="game-canvas" />;
}
