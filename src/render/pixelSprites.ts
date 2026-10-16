// Precompiled 16-bit pixel art sprites & RLE span renderer for Pixel Chemist: Saving Bibbi
// Designed directly from the pixel-art reference sheets for crisp 1x world-pixel rendering.

export interface PixelSpan {
  x: number;
  y: number;
  w: number;
  ch: string;
}

export interface CompiledSprite {
  width: number;
  height: number;
  spans: PixelSpan[];
}

export function compileSprite(rows: string[]): CompiledSprite {
  const height = rows.length;
  const width = rows[0]?.length || 0;
  const spans: PixelSpan[] = [];

  for (let y = 0; y < height; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < row.length && row[x + w] === ch) {
        w++;
      }
      spans.push({ x, y, w, ch });
      x += w;
    }
  }

  return { width, height, spans };
}

export function drawCompiledSprite(
  ctx: CanvasRenderingContext2D,
  sprite: CompiledSprite,
  cx: number,
  cy: number,
  ux: number,
  uy: number,
  palette: Record<string, string>,
  flipX: boolean = false
): void {
  const halfW = sprite.width / 2;
  const halfH = sprite.height / 2;
  const spans = sprite.spans;

  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    const color = palette[s.ch];
    if (!color) continue;
    ctx.fillStyle = color;
    const drawX = flipX
      ? cx + (halfW - (s.x + s.w)) * ux
      : cx + (s.x - halfW) * ux;
    const drawY = cy + (s.y - halfH) * uy;
    ctx.fillRect(drawX, drawY, s.w * ux + 0.35, uy + 0.35);
  }
}

// ============================================================================
// 1. DR. VANCE (PLAYER) — 16x20 (Torso, Helmet, Visor, Backpack Tank)
// ============================================================================
export const SPRITE_PLAYER_BODY = compileSprite([
  '.....OOOOOO.....',
  '....OWWWWWWo....',
  '...OWWWWWWWwo...',
  '..OvvOOOOOOwwo..',
  '.OvvOOCCCCVOwwo.',
  '.OvBOOCCCCCcOwo.',
  '.OBbbOCCCCCCOOo.',
  '.OBbboOOOOOOoo..',
  '.OBbbOYyyyyYO...',
  '.OBbbOYYPGYYYo..',
  '.OvvvOYyyyyYYo..',
  '.Oh..ODDDDDDDo..',
  '..hh.ODDDDUDDo..',
  '...hhOYYyyyYYo..',
  '.....OYYyOYYyo..',
  '.....OYYo.OYyo..',
]);

// Omni-Tool Alchemy Blaster (12x6, drawn rotated on aiming arm)
export const SPRITE_OMNI_TOOL = compileSprite([
  '..OOOOOO....',
  '.OSSSSSSOOO.',
  'OggTTTTTTTTO',
  'OSSSSSSSSSSO',
  '.OOggOO..OO.',
  '..OO........',
]);

// ============================================================================
// 2. BIBBI (14x19 Standing & 12x14 Piggyback)
// ============================================================================
export const SPRITE_BIBBI = compileSprite([
  '..OO......OO..',
  '.OAAO.OO.OAAO.',
  'OAAaATTTTaAAAO',
  'OAaaAAAAAAaaAO',
  'OAaOOSSSSOOaAO',
  '.OOOESSSSEOOO.',
  '...OSSSSSSo...',
  '...OSSRSSSo...',
  '...OOOWWOOO...',
  '..OMMMWWMMMO..',
  '.OMMMmWWmMMMO.',
  '.OMMmMWWMmMMO.',
  '.OSSOmmmmOSSO.',
  '..OO.OmmO.OO..',
  '.....O..O.....',
  '....OCC.CCO...',
  '....OCC.CCO...',
  '....OWW.WWO...',
  '....OOO.OOO...',
]);

export const SPRITE_BIBBI_PIGGYBACK = compileSprite([
  '.OO......OO.',
  'OAAO.OO.OAAO',
  'OAAaTTTTaAAO',
  'OAaOOSSOOaAO',
  '.OOESSSSEOO.',
  '..OSSSSSSo..',
  '..OMMMMMMO..',
  '.OMMMMMMMMO.',
  '.OMMmMMMMMMO',
  '..OOOMMMMOO.',
  '....OCC.CCO.',
  '....OWW.WWO.',
  '....OOO.OOO.',
]);

// ============================================================================
// 3. J.E.V. HAZMAT GUARD (16x20)
// ============================================================================
export const SPRITE_GUARD_BODY = compileSprite([
  '.....OOOOOO.....',
  '....OHHRRHHo....',
  '...OHHHRRHHHo...',
  '..OggOOOOOOOHo..',
  '.OggOOVVVVVOOo..',
  '.OYYOOVVVVVOOo..',
  '.OggOOMMMMMOO...',
  '.OggoOMOmOMOo...',
  '.Ogg.ORRRRRRO...',
  '..O..ORDDDDROo..',
  '.....ORDDDDROo..',
  '.....ORRRRRROo..',
  '.....ODDDDDDO...',
  '.....ORRrORRr...',
  '.....ORRo.ORro..',
]);

export const SPRITE_GUARD_RIFLE = compileSprite([
  '....OOOO....',
  '.OOOGGGGOOOO',
  'OGGGGGGGLLLO',
  '.OOOGGOOOOO.',
  '....OO......',
]);

// ============================================================================
// 4. J.E.V. HUNTER-SEEKER DRONE (20x14)
// ============================================================================
export const SPRITE_DRONE = compileSprite([
  'CCCCCCCC....CCCCCCCC',
  '..OOOO........OOOO..',
  '..OggO..OOOO..OggO..',
  '..OOOOOOSSSSOOOOOO..',
  '...OSSSSSSSSSSSSO...',
  '..OSSSSOOOOOOSSSSO..',
  '..OSSSOMMMMMMOSSSO..',
  '..OSSSOMMWWMMOSSSO..',
  '..OSSSOMMMMMMOSSSO..',
  '...OSSSSSSSSSSSSO...',
  '..OggOOOOOOOOOOggO..',
  '.OggO..OYYYYO..OggO.',
  '.OOO...OYYyyO...OOO.',
  '.......OOOOOO.......',
]);

// ============================================================================
// 5. HEAVY AEGIS COMBAT MECH / WALKER (24x22 Upper Chassis + Pauldrons + Cannon)
// ============================================================================
export const SPRITE_MECH_BODY = compileSprite([
  '..OOOOOO..OOOO..OOOOOO..',
  '.OPPPPPPOOHHHHOOPPPPPPO.',
  'OPPPppppOOHHHHOOppppPPPO',
  'OPPpppppOORRRROOpppppPPO',
  'OPPpppppOORWRROOpppppPPO',
  'OPPpppppOOHHHHOOpppppPPO',
  'OPPppppOOOOOOOOOOppppPPO',
  '.OOOOOOHHHHHHHHHHOOOOOO.',
  '..OggOOHHhhhhhhHHOOOggO.',
  '..OggOOHHhhhhhhHHOOOggO.',
  '..OggOOHHhhOOhhHHOOOggO.',
  '...OOOOHHHHHHHHHHOOOOO..',
  '......OOOOccccOOOO......',
  '.....OggggOOOOggggO.....',
  '.....OggggO..OggggO.....',
]);

export const SPRITE_MECH_CANNON = compileSprite([
  '..OOOOOOO...',
  '.OYYYYYYYO..',
  'OCCyyyyyyyO.',
  'OCCyyyyyyyO.',
  '.OYYYYYYYO..',
  '..OOOOOOO...',
]);

// ============================================================================
// 6. FACILITY PROPS: TERMINAL, TURRET, LASER EMITTER, SPRAYER, ALARM BEACON
// ============================================================================
export const SPRITE_TERMINAL = compileSprite([
  '..OOOOOOOOOO..',
  '.OSSSSSSSSSSO.',
  '.OSCCCCCCCCSO.',
  '.OSCCCCCCCCSO.',
  '.OSCCCCCCCCSO.',
  '.OSCCCCCCCCSO.',
  '.OSCCCCCCCCSO.',
  '.OSSSSSSSSSSO.',
  '..OOOOOOOOOO..',
  '...OggggggO...',
  '..OOOOOOOOOO..',
  '.OggRGYgggggO.',
  'OggggKKKKKKKKO',
  'OSSSSSSSSSSSSO',
  '.OOOOOOOOOOOO.',
  '...OggggggO...',
  '...OggggggO...',
  '..OOOOOOOOOO..',
  '.OSSSSSSSSSSO.',
  '.OOOOOOOOOOOO.',
]);

export const SPRITE_TURRET = compileSprite([
  '....OOOOOO......',
  '...OSSSSSSOO....',
  '...OSSSSLLLO....',
  '.OOOOOOOOOOO....',
  'OSSSSSSSSSSOOOOO',
  'OSSsSSSSSSsGGGGM',
  'OSSsSSSSSSsOOOOO',
  'OSSSSSSSSSSOOOOO',
  '.OOOSSSSSSsGGGGM',
  '...OSSSSSSOOOOOO',
  '..OOggggggOO....',
  '.OSSSSSSSSSSO...',
  '.OSSsSSSSsSSO...',
  'OSSSSSSSSSSSSO..',
  'OSSsSSSSSSsSSO..',
  'OOOOOOOOOOOOOO..',
]);

export const SPRITE_LASER_EMITTER = compileSprite([
  '.OOOOOOOO.',
  'OSSSSSSSSO',
  'OSSggggSSO',
  'OSSOLLLOsO',
  'OSSOLWLOsO',
  'OSSOLLLOsO',
  'OSSggggSSO',
  'OSSSSSSSSO',
  '.OOOOOOOO.',
]);

export const SPRITE_CEILING_SPRAYER = compileSprite([
  'OOOOOOOOOOOOOO',
  '.OSSSSSSSSSSO.',
  '..OOggggggOO..',
  '....OOOOOO....',
  '...OYYYYYYO...',
  '...OYWWWWYO...',
  '...OYYYYYYO...',
  '....OOOOOO....',
  '..OOggggggOO..',
  '.OggO.OO.OggO.',
  '.OCCO.OCC.OCCO',
]);

export const SPRITE_ALARM_BEACON = compileSprite([
  '...OOOOOO...',
  '..ORRRRRRO..',
  '.ORRYYYYRRO.',
  '.ORYWWWWYRO.',
  '.ORRYYYYRRO.',
  '..ORRRRRRO..',
  '..OOOOOOOO..',
  '.OSSSSSSSSO.',
  'OOOOOOOOOOOO',
  'OYYOOYYOOYYO',
  'OOYYOOYYOOYO',
  'OOOOOOOOOOOO',
  '..Ogg..ggO..',
  '..OO....OO..',
]);

// ============================================================================
// 7. EXTRACTION VEHICLES: VTOL DROPSHIP, SUBMERSIBLE, DRILL-POD (32x16)
// ============================================================================
export const SPRITE_VTOL = compileSprite([
  '..................OO.......OO...',
  '.................OSSO.....OSSO..',
  '.....OOOOOOO....OSSSSOOOOOSSSSO.',
  '....OSSSSSSSO..OSSSSSSSSSSSSSSO.',
  '...OCCCCCCCCSOOSSSSSSSSSSSSSSSO.',
  '..OCCWCCCCCCCSSSSOONNNNNNNOSSSO.',
  '.OCCCCWCCCCCCSSSSONNNNNNNNOOOOO.',
  'OCCCCCCCCCCCSSSSSONNNNNNNNO.....',
  'OSSSSSSSSSSSSSSSSONNNNNNNNO.....',
  '.OSSSSSSSSSSSSSSSSOOOOOOOO......',
  '..OOOOOOOOSSSSSSSSSO............',
  '.....OggO.OggggggggO............',
  '....OggO.....OggO...............',
  '..OOOOOO...OOOOOO...............',
]);

export const SPRITE_SUBMERSIBLE = compileSprite([
  '..........OOOOOOOO..............',
  '.........OYYYYYYYYO.............',
  '........OOggggggggOO............',
  '.....OOOOYYYYYYYYYYOOOO.........',
  '...OOYYYYYYYYLYYYYYYYYYOO.......',
  '..OYYCCCCYYYLLYYYYYYYYYYYO..OO..',
  '.OYYCWCCCYYLYLYYCCCYYYYYYYO.OPP.',
  '.OYYCCCCCCYLLLYYCCCYYYYYYYYOOPPO',
  '.OYYCCCCCCYLYLYYCCCYYYYYYYO.OPP.',
  '..OYYCCCCYYYLLYYYYYYYYYYYO..OO..',
  '...OOYYYYYYYYLYYYYYYYYYOO.......',
  '.....OOOOOYYYYYYYYOOOOO.........',
  '.......OyyyyyyyyyyyyO...........',
  '.......OOOOOOOOOOOOOO...........',
]);

export const SPRITE_DRILLPOD = compileSprite([
  '..............OOOOOOOOOO........',
  '............OOYYYYYYYYYYOOOO....',
  '...........OYYCCCCCCYYYYSSSSO...',
  '.........OOYYYCWCCCCYYYYSSSSSO..',
  '.......OODDDDYYYYYYYYYYYOOOOOO..',
  '.....OODDDDDDDYYYYYYYYYYYYYYYYO.',
  '...OODDssDDssDYYYYYYYYYYYYYYYYO.',
  '.OODssDDssDDssDYYYYYYYYYYYYYYYO.',
  '...OODDssDDssDYYYYYYYYYYYYYYYYO.',
  '.....OODDDDDDDYYYYYYYYYYYYYYYYO.',
  '.......OODDDDYYYYOOOOOOOOOOOOOO.',
  '........OggO....OTTTTTTTTTTTTTTO',
  '......OOggO.....OTOOOTOOOTOOOTTO',
  '....OOOOOOO......OOOOOOOOOOOOOO.',
]);
