# ⚔️ EON WARS

An offline *Age of War*-style lane battler — **React + TypeScript + HTML5 Canvas**, no game
engine, no assets. Every unit is a **code-drawn procedural vector character animated on a
skeletal rig**: bones interpolate between target poses, attacks play out as
anticipation → strike → **impact** → recovery, and damage lands exactly on the impact frame.

<img alt="EON WARS" src="icon.png" width="110" />

## ▶️ Play it (offline, on a plane)

The production build is **one self-contained file**: [`dist/index.html`](dist/index.html)
(committed on purpose). Get it onto your phone (Files app / AirDrop / email), open in
**Safari**, then **Share → Add to Home Screen** — fullscreen, fully offline. Best in landscape.

`classic.html` is the previous emoji-art prototype, kept for posterity.

## 🎮 The game

Single-lane tug-of-war on a **scrolling battlefield** — the lane is far wider than the screen,
so you swipe/drag (or use the minimap strip and ⇤ ⚔ ⇥ jump buttons) to pan between your base,
the front line, and the enemy base. Both base HP bars stay pinned to the top corners. Units
auto-walk and fight on contact; destroy the enemy base before yours falls. Gold from kills + a
trickle buys units, base **turrets**, era **evolution**, and a charged **special** (boulder →
airstrike → dragonfire → orbital laser). A **supply cap that grows each era** (10 → 22) plus a
spawn queue forces spend timing over spam.

- **3 campaigns × 5 eras × 3 units = 45 hand-rigged units**
  - 🗿 Rise of Man — Stone → Iron → Castle → Modern → Future
  - 🐉 Mythic Realms — Goblins → Kingdom → Elves → Arcane → Dragons
  - 🛸 Cosmic Frontier — Colony → Federation → Robotics → Star Fleet → Star Empire
- **8 battles per campaign** with a fixed enemy **era window** per level (the AI mirrors your
  roster but is capped/floored per level and evolves mid-battle)
- **Enemy commander personalities** — Rusher, Turtle, Economist, Bombardier — same AI loop,
  different spending weights, plus a **Warlord boss** with a unique boss unit on Last Stand
- **Evolve doctrines** — every evolve forks: pick **1 of 2 campaign-flavored doctrines**
  (Shield Wall vs Arrow Storm, Dragonlords vs Endless Brood…) that reshape that era's units
  for the battle — 16 possible army builds per campaign per run; enemy commanders pick too
- **Unit tier upgrades** — pay gold mid-battle to train each unit type I → II → III
  (+30% HP / +25% dmg per tier); applies to living units and future spawns
- **Turret variety** — 3 turret types per era (Rapid / Splash / Sniper), 1→4 purchasable
  slots, sell for refund — straight from Age of War's playbook
- **Veterancy** — units that bank enough kills go veteran: **bonus gold per kill** (never stats),
  marked with a rank pip worth protecting
- **♾️ Endless mode** — era window scales with wave (`floor ≈ wave/3`, `cap ≈ wave/2`)
- Progress, endless best, and sound settings persist in localStorage

## ✨ Game feel

- The world **modernizes as you evolve** — sky, hills, horizon scenery and ground **cross-fade**
  between era palettes (rocks → trees → castles → smokestacks → neon spires), tinted per campaign
- **Evolve cinematic**: white-gold screen flash, rising WebAudio stinger, base tower scale-pop
- **Chunked HP bars** (units + bases) — damage knocks out discrete segments
- **Hit-stop** on heavy/lethal impacts only; **screen shake on specials only**
- Dust puffs, hit sparks, muzzle smoke, weapon-swing motion trails, floating gold

## 🛠 Dev

```bash
npm install
npm run dev      # vite dev server
npm run build    # typecheck + single-file production build → dist/index.html
```

Everything is data-driven: `src/game/data.ts` holds all 45 unit defs, commanders, and level
tables; `src/game/rig.ts` is the skeletal animation + 6 rig archetypes (biped, rider, wheeled,
vehicle, flyer, beast); `src/game/engine.ts` is the simulation; `src/game/render.ts` the scene.
UI/HUD is React over the canvas.
