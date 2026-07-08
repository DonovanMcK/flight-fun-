# ⚔️ EON WARS

An **offline, single-file** iOS/web strategy game in the style of *Age of War* — evolve your
civilization through the ages, spawn armies, build turrets, and crush the enemy base.
Built to be played on a plane with **no wifi**.

<img alt="EON WARS" src="icon.png" width="120" />

## ▶️ Play it

It's one self-contained `index.html` — no build step, no server, no internet.

- **On your phone (recommended):** get `index.html` onto the device (email it to yourself,
  AirDrop, or save to the Files app), open it in **Safari**, then tap **Share → Add to Home
  Screen**. It launches fullscreen like a real app and works 100% offline. Best in **landscape**.
- **On a computer:** just double-click `index.html` (or drag it into any browser).

> Everything is drawn with canvas + emoji, so there are zero external assets to download — it
> runs from `file://` with no network at all.

## 🎮 How to play

- **Goal:** destroy the enemy base (right) before yours (left) falls.
- 💰 **Gold** trickles in and drops from kills — spend it on units and turrets.
- ⭐ **Supply** limits how many units you can field at once; bigger units cost more slots.
- 🧬 Fill the **XP bar** and **Evolve** to unlock a stronger age with better units.
- 🛡 Buy **Turrets** on your tower for automatic ranged defense.
- ☄️ Charge and unleash your **Special** (meteor / airstrike / dragonfire …) to wipe a wave.
- ⚡ Tap **1×/2×/3×** to fast-forward, **⏸** to pause.
- 🏆 Win with lots of base HP left to earn **3 stars**.

## 🌍 Content & replayability

- **3 campaigns**, each a different timeline with 5 evolving ages and unique unit rosters:
  - 🗿 **Rise of Man** — Stone → Iron → Castle → Modern → Future
  - 🐉 **Mythic Realms** — Goblins → Kingdom → Elves → Arcane → Dragons
  - 🛸 **Cosmic Frontier** — Colony → Federation → Robotics → Star Fleet → Star Empire
- **8 escalating battles** per campaign with star ratings.
- **Roguelite loadout draft** — before each battle, pick 1 of 3 random modifiers
  (Golden Touch, Blitz Doctrine, Fortress, Zealots, War Economy, Swarm Tactics…) for fresh runs.
- **♾️ Endless Survival** — infinite scaling waves with a saved high score.
- Later campaigns **unlock** as you earn stars. All progress is saved locally.

## 🎨 Look & feel

Built to read like *Age of War*: a fixed, wide side-view battlefield with a single
grounded horizon. **The world modernizes as you evolve** — each age shifts the sky, hills,
and horizon scenery (rocks → trees → castles → smokestack skyline → glowing neon towers),
while each campaign keeps its own color identity. Combat has punchy feedback: dust puffs
kicked up by marching units, hit-sparks on every clash, muzzle flashes, and floating gold.
Team-colored ground rings (blue vs red) keep both armies instantly legible.

## 🛠 Tech

- Pure HTML/CSS/JavaScript in a single file. Canvas rendering, `requestAnimationFrame` loop,
  WebAudio blips for sound, `localStorage` for saves.
- Data-driven design: campaigns, ages, units, and modifiers are just config, so it's easy to
  add more content. A unit factory scales role archetypes (melee/fast/ranged/tank/siege) by age
  tier to keep balance consistent.
- `manifest.webmanifest` + `apple-touch-icon` for a native-feeling "Add to Home Screen".

Enjoy the flight ✈️
