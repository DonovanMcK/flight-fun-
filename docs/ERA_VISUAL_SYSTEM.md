# Era visual system

EON WARS renders its battlefield procedurally. There are no background or base image files to load: every Era owns a complete `EraVisualDef`, and those definitions are available in memory as soon as the campaign data loads.

## What an Era controls

Each `EraDef` has a `visual` package containing:

- sky, mountain, hill, and ground colors
- lighting tint and strength
- campaign motif (`human`, `mythic`, or `cosmic`)
- civilization stage (`primitive`, `fortified`, `engineered`, `advanced`, or `apex`)
- ambient effect and prop density
- accent color
- evolution transition kind and duration

The renderer reads this package for base architecture, skyline props, foreground ground markings, ambient particles, atmosphere, and color grading. It cross-fades the old and new world packages while the base uses the selected rebuild, morph, or energy transformation.

## Adding or changing an Era visual

1. Open `src/game/eraVisuals.ts`.
2. Add or edit the campaign's `EraVisualDef` entry.
3. Reuse the existing motif and stage vocabulary.
4. Register that package through the Era factory in `src/game/data.ts` (existing Eras do this automatically by campaign id and era number).
5. Run `npm run typecheck`, `npm test`, and `npm run build`.

Changing an existing Era or adding another visual package does not require renderer or gameplay-engine changes. A genuinely new gameplay Era beyond the current five still requires progression content because campaigns, evolution thresholds, and level caps intentionally remain five-era systems.

## Performance and readability

- Procedural definitions require no asynchronous asset loading or disposal.
- Props and units are culled outside the camera.
- Ambient particles use deterministic lightweight drawing rather than simulation entities.
- UI overlays are drawn after world color grading, keeping Gold, XP, health, and controls readable.
- Evolution changes visuals only; base position, collision, health ratio, combat, AI, economy, and movement remain simulation-owned.
