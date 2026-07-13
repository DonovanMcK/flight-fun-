import { EraVisualDef } from './types';

const V = (visual: EraVisualDef): EraVisualDef => visual;

/** Campaign-specific world packages. These are procedural visual assets: the
 *  renderer knows how to draw a motif/stage, while every color, atmosphere,
 *  density, accent, and transition choice lives here with the Era data. */
export const ERA_VISUALS: Record<string, readonly EraVisualDef[]> = {
  man: [
    V({ skyTop: '#789fd0', skyBottom: '#ead7b4', mountain: '#7e8174', hill: '#78854e', groundTop: '#66733e', groundBottom: '#414c29', lightTint: '#ffdca0', lightStrength: 0.08, accent: '#d9a35f', motif: 'human', stage: 'primitive', ambient: 'dust', propDensity: 0.65, transition: { kind: 'rebuild', durationSec: 0.9 } }),
    V({ skyTop: '#6f91c4', skyBottom: '#d9ccb0', mountain: '#647080', hill: '#61754a', groundTop: '#59683a', groundBottom: '#394629', lightTint: '#ffe0b0', lightStrength: 0.05, accent: '#c9b06b', motif: 'human', stage: 'fortified', ambient: 'leaves', propDensity: 0.8, transition: { kind: 'rebuild', durationSec: 0.85 } }),
    V({ skyTop: '#607cac', skyBottom: '#beb7a7', mountain: '#515d70', hill: '#536647', groundTop: '#505e38', groundBottom: '#323d24', lightTint: '#ffc879', lightStrength: 0.05, accent: '#d0b060', motif: 'human', stage: 'engineered', ambient: 'embers', propDensity: 0.9, transition: { kind: 'rebuild', durationSec: 0.8 } }),
    V({ skyTop: '#777982', skyBottom: '#c2b9a8', mountain: '#4b4d54', hill: '#485158', groundTop: '#484d4f', groundBottom: '#2d3235', lightTint: '#ffbd83', lightStrength: 0.06, accent: '#e6a04e', motif: 'human', stage: 'advanced', ambient: 'sparks', propDensity: 1, transition: { kind: 'morph', durationSec: 0.75 } }),
    V({ skyTop: '#11152d', skyBottom: '#3b3560', mountain: '#242942', hill: '#2c3650', groundTop: '#303849', groundBottom: '#1b202c', lightTint: '#61dcff', lightStrength: 0.12, accent: '#7ee0ff', motif: 'human', stage: 'apex', ambient: 'energy', propDensity: 1, transition: { kind: 'energy', durationSec: 0.7 } }),
  ],
  myth: [
    V({ skyTop: '#7768a0', skyBottom: '#d6b5a1', mountain: '#62566f', hill: '#4f7147', groundTop: '#496b40', groundBottom: '#2d472b', lightTint: '#efc783', lightStrength: 0.08, accent: '#9bc95d', motif: 'mythic', stage: 'primitive', ambient: 'leaves', propDensity: 0.8, transition: { kind: 'morph', durationSec: 0.9 } }),
    V({ skyTop: '#5f6f9a', skyBottom: '#c6b9a2', mountain: '#565c70', hill: '#49653f', groundTop: '#435f38', groundBottom: '#293d25', lightTint: '#ffe0a5', lightStrength: 0.07, accent: '#f0c040', motif: 'mythic', stage: 'fortified', ambient: 'leaves', propDensity: 0.9, transition: { kind: 'rebuild', durationSec: 0.85 } }),
    V({ skyTop: '#526f88', skyBottom: '#b8cab0', mountain: '#49646a', hill: '#3f6d4b', groundTop: '#3c6745', groundBottom: '#24412c', lightTint: '#a7ffd2', lightStrength: 0.08, accent: '#8de0b0', motif: 'mythic', stage: 'engineered', ambient: 'leaves', propDensity: 1, transition: { kind: 'morph', durationSec: 0.8 } }),
    V({ skyTop: '#4d367e', skyBottom: '#a77eb5', mountain: '#46365f', hill: '#443d62', groundTop: '#3e4351', groundBottom: '#272936', lightTint: '#c38cff', lightStrength: 0.12, accent: '#b07bff', motif: 'mythic', stage: 'advanced', ambient: 'sparks', propDensity: 1, transition: { kind: 'energy', durationSec: 0.75 } }),
    V({ skyTop: '#25152d', skyBottom: '#793d45', mountain: '#3c293a', hill: '#49333d', groundTop: '#403a3c', groundBottom: '#241e24', lightTint: '#ff875d', lightStrength: 0.14, accent: '#ff8040', motif: 'mythic', stage: 'apex', ambient: 'embers', propDensity: 1, transition: { kind: 'morph', durationSec: 0.75 } }),
  ],
  cosmos: [
    V({ skyTop: '#223b68', skyBottom: '#c58e70', mountain: '#5e6170', hill: '#67634d', groundTop: '#615c43', groundBottom: '#3b382b', lightTint: '#ffbd7b', lightStrength: 0.09, accent: '#e69b55', motif: 'cosmic', stage: 'primitive', ambient: 'dust', propDensity: 0.7, transition: { kind: 'rebuild', durationSec: 0.9 } }),
    V({ skyTop: '#1d3763', skyBottom: '#8292aa', mountain: '#454f62', hill: '#465460', groundTop: '#414c50', groundBottom: '#293136', lightTint: '#8edaff', lightStrength: 0.08, accent: '#66b8dc', motif: 'cosmic', stage: 'fortified', ambient: 'sparks', propDensity: 0.85, transition: { kind: 'rebuild', durationSec: 0.85 } }),
    V({ skyTop: '#182b51', skyBottom: '#657998', mountain: '#35445c', hill: '#364c5a', groundTop: '#35464c', groundBottom: '#202c34', lightTint: '#7ee0ff', lightStrength: 0.1, accent: '#7ee0ff', motif: 'cosmic', stage: 'engineered', ambient: 'sparks', propDensity: 0.95, transition: { kind: 'morph', durationSec: 0.8 } }),
    V({ skyTop: '#111d45', skyBottom: '#485b88', mountain: '#273456', hill: '#293e61', groundTop: '#2c3c50', groundBottom: '#182432', lightTint: '#7aaaff', lightStrength: 0.13, accent: '#5aa0ff', motif: 'cosmic', stage: 'advanced', ambient: 'energy', propDensity: 1, transition: { kind: 'energy', durationSec: 0.75 } }),
    V({ skyTop: '#090824', skyBottom: '#35265c', mountain: '#1d1b3f', hill: '#29234d', groundTop: '#2c2b47', groundBottom: '#171528', lightTint: '#dc79ff', lightStrength: 0.16, accent: '#ff6bd0', motif: 'cosmic', stage: 'apex', ambient: 'energy', propDensity: 1, transition: { kind: 'energy', durationSec: 0.7 } }),
  ],
};

export function eraVisual(campaignId: string, era: number): EraVisualDef {
  const visual = ERA_VISUALS[campaignId]?.[era - 1];
  if (!visual) throw new Error(`Missing visual definition for ${campaignId} era ${era}`);
  return visual;
}
