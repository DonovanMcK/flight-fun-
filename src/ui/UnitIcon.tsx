import { useEffect, useRef } from 'react';
import { UnitDef, UnitInstance } from '../game/types';
import { defaultPose, drawUnit } from '../game/rig';

/** Rig-rendered unit portrait for shop buttons — the unit's actual procedural
 *  art, never an emoji (spec §1). */
export function UnitIcon({ def, size = 44 }: { def: UnitDef; size?: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = size * dpr; cv.height = size * dpr;
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // flyers: shrink hover so the body sits centered in the tile
    const iconDef: UnitDef = def.rig.kind === 'flyer' ? { ...def, rig: { ...def.rig, hover: 10 } } : def;
    const dummy: UnitInstance = {
      uid: 0, def: iconDef, side: 'player',
      x: 0, hp: def.hp, maxHp: def.hp, tier: 0,
      stats: { dmg: def.damage, spd: def.moveSpeed, range: def.attackRange, cdMs: def.attackCooldownMs, aoe: 0 },
      state: 'wait',
      pose: defaultPose(), animT: 0.4, walkPhase: 0.6,
      atkCd: 0, attackT: 0, didImpact: false,
      targetUid: null, targetIsBase: false,
      hitFlash: 0, deadT: 0, prevWeaponAngle: 0, kills: 0, veteran: false,
    };
    const scale = (size / 58) / Math.max(0.9, def.rig.scale * 0.9);
    const groundY = def.rig.kind === 'flyer' ? size * 0.86 : size * 0.94;
    drawUnit(ctx, dummy, size / 2, groundY, scale);
  }, [def, size]);
  return <canvas ref={ref} style={{ width: size, height: size }} />;
}
