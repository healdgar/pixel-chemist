import {
  ElementId,
  ELEMENTS,
  FLAG_CRYO_BRITTLE,
  FLAG_GLUON_LOCKED,
  FLAG_QUANTUM_TUNNEL,
  FLAG_TIME_ACCEL,
  FLAG_TIME_STASIS,
} from '../chemistry/elements';
import { WorldGrid } from '../simulation/world';
import { Player } from '../entities/player';
import { Projectile, TOOLS } from '../entities/tools';
import { LevelData } from '../world/levelGenerator';
import {
  drawCompiledSprite,
  SPRITE_ALARM_BEACON,
  SPRITE_BIBBI,
  SPRITE_BIBBI_PIGGYBACK,
  SPRITE_CEILING_SPRAYER,
  SPRITE_DRILLPOD,
  SPRITE_DRONE,
  SPRITE_GUARD_BODY,
  SPRITE_GUARD_RIFLE,
  SPRITE_LASER_EMITTER,
  SPRITE_MECH_BODY,
  SPRITE_MECH_CANNON,
  SPRITE_OMNI_TOOL,
  SPRITE_PLAYER_BODY,
  SPRITE_SUBMERSIBLE,
  SPRITE_TERMINAL,
  SPRITE_TURRET,
  SPRITE_VTOL,
} from './pixelSprites';

// Precomputed 256-entry sine lookup table (-1..1) for zero-trig inner-loop rendering at 4x pixel density
const SIN_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  SIN_LUT[i] = Math.sin((i / 256) * Math.PI * 2);
}

export class WorldRenderer {
  public readonly viewW: number = 448; // 2x linear = 4x pixel density (each pixel is 1/4 the visual area!)
  public readonly viewH: number = 272;

  private offscreenCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private imgData: ImageData;
  private buf32: Uint32Array;

  private minimapCanvas: HTMLCanvasElement;
  private minimapCtx: CanvasRenderingContext2D;
  private minimapImg: ImageData;
  private minimapBuf32: Uint32Array;

  public camX: number = 360;
  public camY: number = 40;

  constructor() {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = this.viewW;
    this.offscreenCanvas.height = this.viewH;
    const ctx = this.offscreenCanvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.offCtx = ctx;
    this.imgData = this.offCtx.createImageData(this.viewW, this.viewH);
    this.buf32 = new Uint32Array(this.imgData.data.buffer);

    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.width = 140;
    this.minimapCanvas.height = 90;
    const mctx = this.minimapCanvas.getContext('2d');
    if (!mctx) throw new Error('Minimap context unavailable');
    this.minimapCtx = mctx;
    this.minimapImg = this.minimapCtx.createImageData(140, 90);
    this.minimapBuf32 = new Uint32Array(this.minimapImg.data.buffer);
  }

  public updateCamera(player: Player, world: WorldGrid): void {
    const targetX = player.x - this.viewW / 2;
    const targetY = player.y - this.viewH / 2;
    this.camX += (targetX - this.camX) * 0.14;
    this.camY += (targetY - this.camY) * 0.14;

    this.camX = Math.max(0, Math.min(world.width - this.viewW, this.camX));
    this.camY = Math.max(0, Math.min(world.height - this.viewH, this.camY));
  }

  public screenToWorld(
    screenX: number,
    screenY: number,
    canvas: HTMLCanvasElement
  ): { wx: number; wy: number } {
    const rect = canvas.getBoundingClientRect();
    const normX = (screenX - rect.left) / rect.width;
    const normY = (screenY - rect.top) / rect.height;
    return {
      wx: this.camX + normX * this.viewW,
      wy: this.camY + normY * this.viewH,
    };
  }

  public render(
    mainCanvas: HTMLCanvasElement,
    mainCtx: CanvasRenderingContext2D,
    world: WorldGrid,
    player: Player,
    projectiles: Projectile[],
    level: LevelData,
    mouseWorld: { wx: number; wy: number },
    tick: number,
    thermalVision: boolean
  ): void {
    const baseCamX = Math.floor(this.camX);
    const baseCamY = Math.floor(this.camY);
    const grid = world.grid;
    const tempArr = world.temp;
    const pressArr = world.pressure;
    const flagsArr = world.flags;
    const lifeArr = world.life;
    const bgArr = world.bgGrid;
    const noiseArr = world.colorNoise;
    const buf32 = this.buf32;
    const wWidth = world.width;
    const wHeight = world.height;
    const viewW = this.viewW;
    const viewH = this.viewH;

    // 1. Fill offscreen pixel buffer (optimized zero-trig hot loop)
    for (let vy = 0; vy < viewH; vy++) {
      const wy = baseCamY + vy;
      const by = wy >> 1;
      const rowWorld = wy * wWidth;
      const rowView = vy * viewW;

      if (wy < 0 || wy >= wHeight) {
        buf32.fill(0xff100a08, rowView, rowView + viewW);
        continue;
      }

      for (let vx = 0; vx < viewW; vx++) {
        const wx = baseCamX + vx;
        if (wx < 0 || wx >= wWidth) {
          buf32[rowView + vx] = 0xff100a08;
          continue;
        }

        const i = rowWorld + wx;
        const el = grid[i] as ElementId;
        const press = pressArr[i];

        if (el === ElementId.EMPTY) {
          // Render textured background wall tile (Terraria-style depth!)
          const bg = bgArr[i];
          const bx = wx >> 1;
          let r = 12;
          let g = 16;
          let b = 26;

          if (bg === 0) {
            const n = noiseArr[i] >> 2;
            r = 16 + n;
            g = 18 + n;
            b = 26 + n;
          } else if (bg === 1) {
            const isGrid = bx % 12 === 0 || by % 12 === 0;
            r = isGrid ? 18 : 24;
            g = isGrid ? 25 : 33;
            b = isGrid ? 38 : 48;
          } else if (bg === 2) {
            const isStripe = (bx + by) % 10 < 5 && by % 24 < 3;
            r = isStripe ? 58 : 22;
            g = isStripe ? 48 : 28;
            b = isStripe ? 18 : 38;
          } else if (bg === 3) {
            const girder = bx % 16 < 2 || by % 16 < 2;
            r = girder ? 38 : 24;
            g = girder ? 32 : 22;
            b = girder ? 34 : 28;
          } else if (bg === 4) {
            const pipe = by % 14 === 0 || bx % 20 === 0;
            r = pipe ? 20 : 15;
            g = pipe ? 48 : 30;
            b = pipe ? 68 : 46;
          } else if (bg === 5) {
            const hex = (bx + by) % 14 === 0;
            r = hex ? 22 : 18;
            g = hex ? 45 : 28;
            b = hex ? 25 : 22;
          } else if (bg === 6) {
            const pulse = (bx ^ by) % 13 === 0;
            r = pulse ? 42 : 22;
            g = pulse ? 24 : 16;
            b = pulse ? 64 : 38;
          } else if (bg === 10) {
            // Outdoor Alpine Sky with clouds & distant mountain ridge silhouette
            const skyGrad = by < 190 ? by * 0.00526 : 1;
            r = (24 + skyGrad * 55) | 0;
            g = (54 + skyGrad * 95) | 0;
            b = (110 + skyGrad * 115) | 0;
            const cloudX = (bx + (tick >> 3)) % 90;
            if (
              by > 18 &&
              by < 52 &&
              cloudX < 28 &&
              (by - 22) * (by - 48) + (cloudX - 14) * (cloudX - 14) < 160
            ) {
              r = r + 55 > 255 ? 255 : r + 55;
              g = g + 58 > 255 ? 255 : g + 58;
              b = b + 62 > 255 ? 255 : b + 62;
            }
            const distPeak =
              135 + SIN_LUT[(bx * 2) & 255] * 22 + SIN_LUT[(bx * 4 + 64) & 255] * 9;
            if (by > distPeak) {
              r = 34;
              g = 46;
              b = 72;
            }
          } else if (bg === 11) {
            // Night City Skyline outside the Office Skyscraper
            const skyGrad = by < 320 ? by * 0.003125 : 1;
            r = (14 + skyGrad * 24) | 0;
            g = (18 + skyGrad * 28) | 0;
            b = (42 + skyGrad * 52) | 0;
            const bldgH = 140 + (((bx >> 4) * 37) % 110);
            if (by > bldgH) {
              const win = bx % 4 === 1 && by % 6 === 2 && (bx * 13 + by * 7) % 5 !== 0;
              r = win ? 235 : 18;
              g = win ? 200 : 22;
              b = win ? 95 : 34;
            }
          } else if (bg === 12) {
            // Corporate Office Building Interior paneling + ceiling light strips
            const isCeilingLight = by % 48 === 38 && bx % 18 < 10;
            const isPillar = bx % 32 === 0;
            r = isCeilingLight ? 185 : isPillar ? 34 : 44;
            g = isCeilingLight ? 215 : isPillar ? 42 : 52;
            b = isCeilingLight ? 235 : isPillar ? 56 : 66;
          } else if (bg === 13) {
            // Medieval Castle Cobblestone / Ashlar Masonry
            const row = (by / 6) | 0;
            const offset = (row & 1) * 6;
            const mortar = by % 6 === 0 || (bx + offset) % 12 === 0;
            const n = noiseArr[i] >> 2;
            r = (mortar ? 26 : 48) + n;
            g = (mortar ? 22 : 40) + n;
            b = (mortar ? 20 : 36) + n;
          } else if (bg === 14) {
            // Deep Space Vacuum Starfield & Nebula
            const starHash = (wx * 73856093) ^ (wy * 19349663);
            if ((starHash & 511) === 1) {
              const twinkle = ((tick >> 3) + wx + wy) & 3;
              r = twinkle === 0 ? 255 : 180;
              g = twinkle === 1 ? 255 : 200;
              b = 255;
            } else {
              const neb = SIN_LUT[(bx + by) & 255] * 10;
              r = Math.max(4, (10 + neb) | 0);
              g = 8;
              b = Math.max(12, (24 + neb * 1.5) | 0);
            }
          } else if (bg === 15) {
            // Volcanic Abyssal Caldera
            const glow = by > 110 ? (by - 110) * 0.22 : 0;
            const n = noiseArr[i] >> 2;
            r = Math.min(90, (22 + glow + n) | 0);
            g = Math.max(10, (16 + glow * 0.25 + n) | 0);
            b = Math.max(12, 22 + n);
          }

          if (press > 15) {
            const pGlow = Math.min(110, (press * 0.45) | 0);
            r = Math.min(255, r + pGlow);
            g = Math.min(255, g + pGlow);
            b = Math.min(255, b + ((pGlow * 1.2) | 0));
          }

          buf32[rowView + vx] = (255 << 24) | (b << 16) | (g << 8) | r;
          continue;
        }

        const temp = tempArr[i];
        const flags = flagsArr[i];

        if (thermalVision) {
          const tNorm = Math.max(0, Math.min(1, (temp + 200) / 1800));
          const r = Math.min(255, (tNorm * 255 + press * 0.2) | 0);
          const g = Math.min(255, (SIN_LUT[(tNorm * 128) & 255] * 220) | 0);
          const b = Math.min(255, ((1 - tNorm) * 255) | 0);
          buf32[rowView + vx] = (255 << 24) | (b << 16) | (g << 8) | r;
          continue;
        }

        const def = ELEMENTS[el];
        const noise = noiseArr[i];
        const delta = ((noise * def.colorVariance) / 28) | 0;
        let r = def.baseColor[0] + delta;
        let g = def.baseColor[1] + delta;
        let b = def.baseColor[2] + delta;

        // Aqueous admixture color blending for ACID / ALKALI / SALT_WATER (blends smoothly toward Water [42, 138, 235])
        if (el === ElementId.ACID || el === ElementId.ALKALI || el === ElementId.SALT_WATER) {
          const rawLife = lifeArr[i];
          const conc = rawLife > 0 ? (rawLife > 100 ? 100 : rawLife) : 100;
          if (conc < 99) {
            const w = (100 - conc) * 0.0092;
            r = (r * (1 - w) + (42 + delta) * w) | 0;
            g = (g * (1 - w) + (138 + delta) * w) | 0;
            b = (b * (1 - w) + (235 + delta) * w) | 0;
          }
        }

        // Liquid shimmer animation (using SIN_LUT)
        if (def.state === 'liquid') {
          const wave = (SIN_LUT[((tick << 2) + (wx << 3) + (wy << 2)) & 255] * 10) | 0;
          r += wave;
          g += wave;
          b += wave;
        } else if (def.state === 'energy') {
          const flick = ((tick * 17 + wx * 31 + wy * 13) & 31) - 15;
          r += flick;
          g += flick >> 1;
        }

        // Blackbody Incandescence for hot solids/liquids (> 350°C)
        if (temp > 350 && def.state !== 'energy') {
          const heatFactor = Math.min(1, (temp - 350) / 1800);
          r = Math.min(255, (r + heatFactor * 160) | 0);
          g = Math.min(255, (g + heatFactor * heatFactor * 110) | 0);
          b = Math.max(0, (b * (1 - heatFactor * 0.5)) | 0);
        }

        if (flags !== 0) {
          // Cryo-Brittle Frost Highlight
          if ((flags & FLAG_CRYO_BRITTLE) !== 0) {
            const sparkle = (wx + wy + (tick >> 3)) % 5 === 0 ? 45 : 15;
            r = Math.min(255, (r >> 1) + 55 + sparkle);
            g = Math.min(255, (g >> 1) + 125 + sparkle);
            b = Math.min(255, (b >> 1) + 145 + sparkle);
          }

          // Quantum Tunneling Superposition Wave Shimmer!
          if ((flags & FLAG_QUANTUM_TUNNEL) !== 0) {
            const qWave = SIN_LUT[((tick << 3) + (wx << 4) - (wy << 4)) & 255];
            if (qWave > 0.1) {
              r = Math.min(255, (r >> 1) + 115);
              g = Math.min(255, (g >> 1) + 45);
              b = Math.min(255, (b >> 1) + 140);
            }
          }

          // Gluon-Locked Magenta Lattice Border
          if ((flags & FLAG_GLUON_LOCKED) !== 0 && (wx + wy) % 4 === 0) {
            r = Math.min(255, r + 55);
            b = Math.min(255, b + 65);
          }

          // Time Acceleration / Stasis Tint
          if ((flags & FLAG_TIME_ACCEL) !== 0 && (tick + wx + wy) % 3 === 0) {
            g = Math.min(255, g + 70);
            b = Math.min(255, b + 90);
          } else if ((flags & FLAG_TIME_STASIS) !== 0) {
            r = (r * 0.65) | 0;
            g = (g * 0.8) | 0;
            b = Math.min(255, b + 65);
          }
        }

        if (r < 0) r = 0;
        else if (r > 255) r = 255;
        if (g < 0) g = 0;
        else if (g > 255) g = 255;
        if (b < 0) b = 0;
        else if (b > 255) b = 255;

        buf32[rowView + vx] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }

    this.offCtx.putImageData(this.imgData, 0, 0);

    // 2. Blit pixel world buffer onto main canvas with crisp nearest-neighbor scaling
    mainCtx.imageSmoothingEnabled = false;
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    mainCtx.drawImage(this.offscreenCanvas, 0, 0, mainCanvas.width, mainCanvas.height);

    const scaleX = mainCanvas.width / this.viewW;
    const scaleY = mainCanvas.height / this.viewH;

    // 3. Render Terminals in world space
    this.renderTerminals(mainCtx, level, player, baseCamX, baseCamY, scaleX, scaleY, tick);

    // 4. Render Security Turrets & J.E.V. Facility Defenses in world space
    this.renderTurrets(mainCtx, level, baseCamX, baseCamY, scaleX, scaleY, tick);
    this.renderFacilityDefenses(mainCtx, level, baseCamX, baseCamY, scaleX, scaleY, tick);

    // 4b. Render J.E.V. Mobile Units (Hazmat Guards, Hunter-Seeker Drones, Heavy Combat Mechs)
    this.renderEnemyUnits(mainCtx, level, player, mouseWorld, baseCamX, baseCamY, scaleX, scaleY, tick);

    // 5. Render Waiting Escape Vehicle & Bibbi
    this.renderEscapeVehicle(mainCtx, level, baseCamX, baseCamY, scaleX, scaleY, tick);
    this.renderBibbi(mainCtx, level, baseCamX, baseCamY, scaleX, scaleY, tick);

    // 6. Render Dr. Vance (Player) in crisp pixel art (plus Bibbi piggybacking if carried!)
    this.renderPlayer(mainCtx, player, level, mouseWorld, baseCamX, baseCamY, scaleX, scaleY, tick);

    // 7. Render Active Projectiles & Beams
    this.renderProjectiles(mainCtx, projectiles, baseCamX, baseCamY, scaleX, scaleY);

    // 8. Keep world reaction queue trimmed without cluttering the screen with floating text boxes
    if (world.reactionEvents.length > 0) {
      world.reactionEvents.length = 0;
    }

    // 9. Render Clean Reticle
    this.renderCursorReticle(
      mainCtx,
      world,
      player,
      mouseWorld,
      baseCamX,
      baseCamY,
      scaleX,
      scaleY,
      thermalVision
    );

    // 10. Render Subtle Edge Indicator toward Bibbi or Escape Vehicle
    this.renderBibbiCompass(mainCtx, mainCanvas, player, level);
  }

  private renderTerminals(
    ctx: CanvasRenderingContext2D,
    level: LevelData,
    player: Player,
    camX: number,
    camY: number,
    sx: number,
    sy: number,
    tick: number
  ): void {
    const ux = sx * 0.72;
    const uy = sy * 0.72;
    const screenColor = tick % 40 < 28 ? '#00f5d4' : '#4cc9f0';
    const termPalette: Record<string, string> = {
      O: '#141824',
      S: '#495057',
      g: '#2b2d42',
      C: '#0096c7',
      R: '#ff595e',
      G: '#80ed99',
      Y: '#ffd166',
      K: '#adb5bd',
    };

    for (const term of level.terminals) {
      const vx = term.x - camX;
      const vy = term.y - camY;
      if (vx < -24 || vx > this.viewW + 24 || vy < -24 || vy > this.viewH + 24) continue;

      const px = vx * sx;
      const py = vy * sy;

      drawCompiledSprite(ctx, SPRITE_TERMINAL, px, py - 1 * sy, ux, uy, termPalette, false);

      // Animated CRT data scanlines inside screen
      ctx.fillStyle = screenColor;
      const scanY = (tick >> 2) % 4;
      ctx.fillRect(px - 3.2 * ux, py - (7.2 - scanY) * uy, 5.8 * ux, 0.85 * uy);
      ctx.fillStyle = '#a8f9ff';
      ctx.fillRect(px - 3.2 * ux, py - 7.5 * uy, 3.4 * ux, 0.75 * uy);

      const dist = Math.hypot(player.x - term.x, player.y - term.y);
      if (dist < 32) {
        ctx.save();
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(10, 15, 28, 0.88)';
        ctx.fillRect(px - 22, py - 24, 44, 15);
        ctx.strokeStyle = '#00f5d4';
        ctx.lineWidth = 1;
        ctx.strokeRect(px - 22, py - 24, 44, 15);
        ctx.fillStyle = '#00f5d4';
        ctx.fillText('[E]', px, py - 13);
        ctx.restore();
      }
    }
  }

  private renderTurrets(
    ctx: CanvasRenderingContext2D,
    level: LevelData,
    camX: number,
    camY: number,
    sx: number,
    sy: number,
    tick: number
  ): void {
    const ux = sx * 0.78;
    const uy = sy * 0.78;
    const ex = sx * 2;
    const ey = sy * 2;

    for (const t of level.turrets) {
      if (!t.active) continue;
      const vx = t.x - camX;
      const vy = t.y - camY;
      if (vx < -24 || vx > this.viewW + 24 || vy < -24 || vy > this.viewH + 24) continue;

      const px = vx * sx;
      const py = vy * sy;
      const coreColor =
        t.type === 'kinetic' ? '#ffd166' : t.type === 'thermal' ? '#ff595e' : '#70e000';

      const turretPalette: Record<string, string> = {
        O: '#11151c',
        S: '#495057',
        s: '#6c757d',
        g: '#2b2d42',
        G: '#343a40',
        M: (tick & 7) < 4 ? coreColor : '#adb5bd',
        L: coreColor,
      };

      drawCompiledSprite(ctx, SPRITE_TURRET, px, py, ux, uy, turretPalette, false);

      // Subtle laser rangefinder glint on top pod
      if ((tick & 15) < 10) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 0.5 * ux, py - 5.8 * uy, 1.1 * ux, 1.1 * uy);
      }

      // HP bar if damaged
      if (t.hp < t.maxHp) {
        ctx.fillStyle = '#141824';
        ctx.fillRect(px - 3 * ex, py - 4.6 * ey, 6 * ex, 1 * ey);
        ctx.fillStyle = '#ff595e';
        ctx.fillRect(px - 3 * ex, py - 4.6 * ey, 6 * ex * (t.hp / t.maxHp), 1 * ey);
      }
    }
  }

  private renderFacilityDefenses(
    ctx: CanvasRenderingContext2D,
    level: LevelData,
    camX: number,
    camY: number,
    sx: number,
    sy: number,
    tick: number
  ): void {
    if (!level.defenses) return;
    const ux = sx * 0.78;
    const uy = sy * 0.78;
    const ex = sx * 2;

    for (const d of level.defenses) {
      if (!d.active) continue;
      const vx = d.x - camX;
      const vy = d.y - camY;
      if (vx < -120 || vx > this.viewW + 120 || vy < -120 || vy > this.viewH + 120) continue;

      const px = vx * sx;
      const py = vy * sy;

      if (d.type === 'laser_grid') {
        const endPx = (d.currentEndX - camX) * sx;
        const endPy = (d.currentEndY - camY) * sy;

        // Beveled 16-bit Wall Laser Emitter Housing
        drawCompiledSprite(
          ctx,
          SPRITE_LASER_EMITTER,
          px,
          py,
          ux,
          uy,
          {
            O: '#11151c',
            S: '#6c757d',
            s: '#343a40',
            g: '#2b2d42',
            L: d.triggered ? '#ff0055' : '#e63946',
            W: '#ffccd5',
          },
          false
        );

        // Dual-layer Laser Beam (Outer crimson glow + hot white-pink core)
        ctx.save();
        ctx.strokeStyle = d.triggered
          ? 'rgba(255, 0, 85, 0.85)'
          : (tick & 3) === 0
          ? 'rgba(255, 77, 109, 0.75)'
          : 'rgba(247, 37, 133, 0.55)';
        ctx.lineWidth = d.triggered ? 4.5 : 3.0;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(endPx, endPy);
        ctx.stroke();

        ctx.strokeStyle = d.triggered ? '#ffffff' : '#ffccd5';
        ctx.lineWidth = d.triggered ? 1.8 : 1.1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(endPx, endPy);
        ctx.stroke();

        // Endpoint laser hotspot
        ctx.fillStyle = '#ff0055';
        ctx.beginPath();
        ctx.arc(endPx, endPy, 1.5 * ex, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(endPx, endPy, 0.7 * ex, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (d.type === 'ceiling_sprayer') {
        drawCompiledSprite(
          ctx,
          SPRITE_CEILING_SPRAYER,
          px,
          py + 1.5 * uy,
          ux,
          uy,
          {
            O: '#11151c',
            S: '#6c757d',
            g: '#343a40',
            Y: d.triggered ? '#80ed99' : '#ffd166',
            W: '#f8f9fa',
            C: d.triggered ? '#80ed99' : '#4cc9f0',
          },
          false
        );
      } else if (d.type === 'alarm_beacon') {
        const pulse = Math.sin(tick * 0.25) > 0;
        drawCompiledSprite(
          ctx,
          SPRITE_ALARM_BEACON,
          px,
          py,
          ux,
          uy,
          {
            O: '#11151c',
            R: d.triggered ? (pulse ? '#ff0055' : '#ff595e') : '#d90429',
            Y: '#ffd166',
            W: d.triggered && pulse ? '#ffffff' : '#ffbe0b',
            S: '#adb5bd',
            g: '#495057',
          },
          false
        );

        if (d.triggered) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 0, 85, 0.55)';
          ctx.lineWidth = 1.5;
          const r = ((tick % 30) / 30) * 18 * ex;
          ctx.beginPath();
          ctx.arc(px, py - 2 * uy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  private renderEnemyUnits(
    ctx: CanvasRenderingContext2D,
    level: LevelData,
    _player: Player,
    _mouseWorld: { wx: number; wy: number },
    camX: number,
    camY: number,
    sx: number,
    sy: number,
    tick: number
  ): void {
    if (!level.enemyUnits) return;
    const ex = sx * 2;
    const ey = sy * 2;

    for (const u of level.enemyUnits) {
      if (!u.active) continue;
      const vx = u.x - camX;
      const vy = u.y - camY;
      if (vx < -40 || vx > this.viewW + 40 || vy < -40 || vy > this.viewH + 40) continue;

      const px = vx * sx;
      const py = vy * sy;
      const f = u.facing;
      const flip = f < 0;

      ctx.save();

      // Status Auras: Cryo-Brittle Frost or Chroniton Stasis!
      if (u.stasisTimer > 0) {
        ctx.strokeStyle = '#4cc9f0';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          px - u.width * 0.32 * ex,
          py - u.height * 0.32 * ey,
          u.width * 0.64 * ex,
          u.height * 0.64 * ey
        );
      } else if (u.cryoBrittleTimer > 0) {
        ctx.strokeStyle = '#72efdd';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          px - u.width * 0.3 * ex,
          py - u.height * 0.3 * ey,
          u.width * 0.6 * ex,
          u.height * 0.6 * ey
        );
      }

      if (u.type === 'guard') {
        const ux = sx * 0.78;
        const uy = sy * 0.78;
        const loadoutColor =
          u.weaponLoadout === 'cryo'
            ? '#72efdd'
            : u.weaponLoadout === 'acid'
            ? '#80ed99'
            : '#ff595e';
        const rusted = u.rustedLevel > 25;

        // Animated Guard Boots & Knee Pads
        const swing = Math.abs(u.vx) > 0.1 ? Math.sin(tick * 0.32) * 1.6 : 0;
        ctx.fillStyle = '#11151c';
        ctx.fillRect(px - 3.6 * ux, py + (5.8 + swing * 0.4) * uy, 3.0 * ux, 4.2 * uy);
        ctx.fillRect(px + 0.8 * ux, py + (5.8 - swing * 0.4) * uy, 3.0 * ux, 4.2 * uy);
        ctx.fillStyle = '#2b2d42';
        ctx.fillRect(px - 3.0 * ux, py + (6.2 + swing * 0.4) * uy, 1.8 * ux, 3.2 * uy);
        ctx.fillRect(px + 1.4 * ux, py + (6.2 - swing * 0.4) * uy, 1.8 * ux, 3.2 * uy);

        drawCompiledSprite(
          ctx,
          SPRITE_GUARD_BODY,
          px,
          py - 0.8 * uy,
          ux,
          uy,
          {
            O: '#11151c',
            H: '#2b2d42',
            R: rusted ? '#b55335' : '#d90429',
            r: rusted ? '#7f3924' : '#9b001a',
            o: '#1b1f2a',
            g: '#6c757d',
            Y: '#ffd166',
            V: loadoutColor,
            M: '#495057',
            D: '#212529',
          },
          flip
        );

        // Counter-Alchemy Assault Rifle
        drawCompiledSprite(
          ctx,
          SPRITE_GUARD_RIFLE,
          px + f * 3.8 * ux,
          py + 0.8 * uy,
          ux * 0.85,
          uy * 0.85,
          {
            O: '#11151c',
            G: '#adb5bd',
            L: loadoutColor,
          },
          flip
        );
      } else if (u.type === 'drone') {
        const ux = sx * 0.76;
        const uy = sy * 0.76;
        const eyeColor = u.weaponLoadout === 'sodium_bomb' ? '#ff9f1c' : '#f72585';
        const rotorPhase = (tick & 1) === 0 ? '#00f5d4' : '#4cc9f0';

        drawCompiledSprite(
          ctx,
          SPRITE_DRONE,
          px,
          py,
          ux,
          uy,
          {
            O: '#11151c',
            C: rotorPhase,
            g: '#495057',
            S: '#2b2d42',
            M: eyeColor,
            W: '#ffffff',
            Y: '#ff9f1c',
            y: '#e07a5f',
          },
          flip
        );

        // Shimmering plasma rotor rings
        ctx.fillStyle = '#a8f9ff';
        const rPulse = (tick & 1) === 0 ? 7.5 : 5.0;
        ctx.fillRect(px - rPulse * ux, py - 6.8 * uy, 2.2 * ux, 0.9 * uy);
        ctx.fillRect(px + (rPulse - 2.2) * ux, py - 6.8 * uy, 2.2 * ux, 0.9 * uy);
      } else if (u.type === 'robot') {
        // HEAVY AEGIS COMBAT MECH / WALKER SPRITE (24x22 Upper + Articulated Hydraulic Legs)
        const ux = sx * 0.82;
        const uy = sy * 0.82;
        const rustTint = u.rustedLevel > 20;

        // Articulated Reverse-Joint Walker Legs with Copper Hydraulic Pistons
        const stomp = Math.abs(u.vx) > 0.1 ? Math.sin(tick * 0.22) * 2.2 : 0;
        const legL = py + (3.2 + stomp * 0.45) * uy;
        const legR = py + (3.2 - stomp * 0.45) * uy;

        // Left & Right Leg Outlines + Armor Greaves + Pistons + Claws
        for (let side = -1; side <= 1; side += 2) {
          const lx = px + side * 4.4 * ux;
          const ly = side < 0 ? legL : legR;
          ctx.fillStyle = '#11151c';
          ctx.fillRect(lx - 2.6 * ux, ly, 5.2 * ux, 8.2 * uy);
          ctx.fillRect(lx - 3.6 * ux, ly + 6.4 * uy, 7.2 * ux, 2.2 * uy);
          ctx.fillStyle = rustTint ? '#7f3924' : '#495057';
          ctx.fillRect(lx - 1.8 * ux, ly + 0.6 * uy, 3.6 * ux, 6.8 * uy);
          // Hydraulic copper piston rod
          ctx.fillStyle = '#f4a261';
          ctx.fillRect(lx - 0.5 * ux, ly + 1.2 * uy, 1.1 * ux, 3.2 * uy);
          // Armored footpad
          ctx.fillStyle = rustTint ? '#9e472a' : '#6c757d';
          ctx.fillRect(lx - 2.8 * ux, ly + 6.8 * uy, 5.6 * ux, 1.2 * uy);
        }

        // Upper Torso, Beveled Pauldrons & Cyclops Visor
        drawCompiledSprite(
          ctx,
          SPRITE_MECH_BODY,
          px,
          py - 3.5 * uy,
          ux,
          uy,
          {
            O: '#11151c',
            P: rustTint ? '#b55335' : '#8d99ae',
            p: rustTint ? '#8c3f27' : '#6c757d',
            H: rustTint ? '#7f3924' : '#495057',
            h: rustTint ? '#5e2a1b' : '#343a40',
            g: '#2b2d42',
            R: '#ff0055',
            W: '#ffccd5',
            c: '#ff9f1c',
          },
          flip
        );

        // Heavy Yellow-Gold Graviton Arm Cannon
        drawCompiledSprite(
          ctx,
          SPRITE_MECH_CANNON,
          px + f * 8.5 * ux,
          py - 1.8 * uy,
          ux * 0.95,
          uy * 0.95,
          {
            O: '#11151c',
            Y: '#ffd166',
            y: '#f4a261',
            C: '#00f5d4',
          },
          !flip
        );
      }

      // Minimal HP Bar above unit ONLY when damaged
      if (u.hp < u.maxHp) {
        const barW = (u.type === 'robot' ? 7 : 5) * ex;
        const barY = py - (u.height * 0.34 + 2.2) * ey;
        ctx.fillStyle = 'rgba(10, 14, 24, 0.88)';
        ctx.fillRect(px - barW / 2, barY, barW, 0.95 * ey);
        ctx.fillStyle =
          u.cryoBrittleTimer > 0
            ? '#72efdd'
            : u.rustedLevel > 25
            ? '#ff9f1c'
            : '#ff4d6d';
        ctx.fillRect(px - barW / 2, barY, barW * Math.max(0, u.hp / u.maxHp), 0.95 * ey);
      }

      ctx.restore();
    }
  }

  private renderEscapeVehicle(
    ctx: CanvasRenderingContext2D,
    level: LevelData,
    camX: number,
    camY: number,
    sx: number,
    sy: number,
    tick: number
  ): void {
    const ev = level.escapeVehicle;
    if (!ev) return;
    const vx = ev.x - camX;
    const vy = ev.y - camY;
    if (vx < -65 || vx > this.viewW + 65 || vy < -65 || vy > this.viewH + 65) return;

    const ex = sx * 2;
    const hover = Math.sin(tick * 0.09) * 1.4;
    const px = vx * sx;
    const py = (vy + hover) * sy;
    const ux = sx * 1.05;
    const uy = sy * 1.05;
    const ready = level.bibbi.carried;

    ctx.save();

    // Extraction Beacon Aura
    const grad = ctx.createRadialGradient(px, py, 3, px, py, 16 * ex);
    grad.addColorStop(0, ready ? 'rgba(6, 214, 160, 0.5)' : 'rgba(76, 201, 240, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, 16 * ex, 0, Math.PI * 2);
    ctx.fill();

    if (ev.type === 'submersible') {
      // Deep-Sea Yellow Bathysphere Submersible
      drawCompiledSprite(
        ctx,
        SPRITE_SUBMERSIBLE,
        px,
        py,
        ux,
        uy,
        {
          O: '#141824',
          Y: '#ffd166',
          y: '#f4a261',
          g: '#6c757d',
          L: '#adb5bd',
          C: ready ? '#06d6a0' : '#00f5d4',
          W: '#ffffff',
          P: (tick & 3) < 2 ? '#e09f3e' : '#ffd166',
        },
        false
      );
    } else if (ev.type === 'drillpod') {
      // Subterranean Armored Terranaught Drill-Pod
      const fluteSwap = (tick & 3) < 2;
      drawCompiledSprite(
        ctx,
        SPRITE_DRILLPOD,
        px,
        py,
        ux,
        uy,
        {
          O: '#141824',
          Y: '#e76f51',
          S: '#6c757d',
          C: ready ? '#06d6a0' : '#80ed99',
          W: '#ffffff',
          D: fluteSwap ? '#adb5bd' : '#dee2e6',
          s: fluteSwap ? '#495057' : '#adb5bd',
          g: '#adb5bd',
          T: '#343a40',
        },
        false
      );
    } else {
      // VTOL Extraction Dropship / Chopper / Shuttle
      drawCompiledSprite(
        ctx,
        SPRITE_VTOL,
        px,
        py,
        ux,
        uy,
        {
          O: '#11151c',
          S: '#3d5252',
          N: '#526b6b',
          g: '#6c757d',
          C: ready ? '#06d6a0' : '#4cc9f0',
          W: '#a8f9ff',
        },
        false
      );

      // Spinning VTOL Turbofan Rotor Blades & Thruster Afterburner Glow
      const rotorW = (tick & 1) === 0 ? 11 : 6.5;
      ctx.fillStyle = '#00f5d4';
      ctx.fillRect(px - rotorW * ux, py - 8.2 * uy, rotorW * 2 * ux, 1.1 * uy);
      if (ready || (tick & 3) < 2) {
        ctx.fillStyle = ready ? '#06d6a0' : '#4cc9f0';
        ctx.fillRect(px + 2.5 * ux, py + 3.2 * uy, 4.5 * ux, 2.2 * uy);
      }
    }

    // Label above vehicle
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = ready ? '#06d6a0' : '#4cc9f0';
    ctx.fillText(ready ? `🚁 EXTRACT HERE!` : `🚁 ${ev.name.toUpperCase()}`, px, py - 15);
    ctx.restore();
  }

  private renderBibbi(
    ctx: CanvasRenderingContext2D,
    level: LevelData,
    camX: number,
    camY: number,
    sx: number,
    sy: number,
    tick: number
  ): void {
    const b = level.bibbi;
    // When carried on Dr. Vance's back (and not yet extracted), renderPlayer draws her piggybacking
    if (b.carried && !b.rescued) return;

    const vx = b.x - camX;
    const vy = b.y - camY;
    if (vx < -40 || vx > this.viewW + 40 || vy < -40 || vy > this.viewH + 40) return;

    const ex = sx * 2;
    const ey = sy * 2;
    const ux = sx * 0.76;
    const uy = sy * 0.76;
    const bounce = b.rescued ? Math.abs(Math.sin(tick * 0.18)) * 5.0 : Math.sin(tick * 0.08) * 1.2;
    const px = vx * sx;
    const py = (vy - bounce) * sy;

    // Aura glow around Bibbi
    const grad = ctx.createRadialGradient(px, py, 2, px, py, 9 * ex);
    grad.addColorStop(0, b.rescued ? 'rgba(255, 209, 102, 0.55)' : 'rgba(114, 239, 221, 0.4)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, 9 * ex, 0, Math.PI * 2);
    ctx.fill();

    // 16-bit Pixel Art Bibbi (orange twin pigtails, cyan hair ties, magenta lab coat, cyan boots)
    drawCompiledSprite(
      ctx,
      SPRITE_BIBBI,
      px,
      py - 0.5 * uy,
      ux,
      uy,
      {
        O: '#141824',
        A: '#ff9f1c',
        a: '#e07a5f',
        T: '#4cc9f0',
        S: '#e8b49a',
        o: '#c68b71',
        E: '#1d3557',
        R: '#ff99c8',
        W: '#f8f9fa',
        M: '#f72585',
        m: '#b5179e',
        C: '#00b4d8',
      },
      false
    );

    // White eye catchlight sparkles
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px - 2.8 * ux, py - 4.4 * uy, 0.8 * ux, 0.8 * uy);
    ctx.fillRect(px + 2.2 * ux, py - 4.4 * uy, 0.8 * ux, 0.8 * uy);

    // Delicate HP bar if Bibbi has taken damage
    if (b.hp < b.maxHp && b.hp > 0) {
      const barW = 6 * ex;
      ctx.fillStyle = 'rgba(10, 14, 24, 0.88)';
      ctx.fillRect(px - barW / 2, py - 5.6 * ey, barW, 1.0 * ey);
      ctx.fillStyle = b.hp < 35 ? '#ff0055' : '#ff99c8';
      ctx.fillRect(px - barW / 2, py - 5.6 * ey, barW * Math.max(0, b.hp / b.maxHp), 1.0 * ey);
    }

    // Subtle compact tag above Bibbi
    ctx.save();
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = b.rescued ? '#ffd166' : '#ff99c8';
    ctx.fillText(b.rescued ? '♥ EXTRACTED!' : '♥ BIBBI', px, py - 19);
    ctx.restore();
  }

  private renderPlayer(
    ctx: CanvasRenderingContext2D,
    player: Player,
    level: LevelData,
    mouseWorld: { wx: number; wy: number },
    camX: number,
    camY: number,
    sx: number,
    sy: number,
    tick: number
  ): void {
    const vx = player.x - camX;
    const vy = player.y - camY;
    const px = vx * sx;
    const py = vy * sy;
    const ex = sx * 2;
    const ey = sy * 2;
    const ux = sx * 0.78;
    const uy = sy * 0.78;

    ctx.save();
    // Quantum Phase Superposition Aura if active!
    if (player.quantumPhaseTimer > 0) {
      ctx.globalAlpha = 0.68 + Math.sin(tick * 0.4) * 0.25;
      ctx.strokeStyle = '#c77dff';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px - 3.5 * ex, py - 5.5 * ey, 7 * ex, 11 * ey);
    }

    const f = player.facing;
    const flip = f < 0;

    // Jetpack thruster plume when flying upward
    if (!player.grounded && player.vy < -0.15) {
      const jetX = px - f * 4.2 * ux;
      const jetY = py + 3.2 * uy;
      const flameH = (3.5 + ((tick & 3) * 1.1)) * uy;
      ctx.fillStyle = '#ffbe0b';
      ctx.fillRect(jetX - 1.2 * ux, jetY, 2.4 * ux, flameH);
      ctx.fillStyle = '#00f5d4';
      ctx.fillRect(jetX - 0.6 * ux, jetY, 1.2 * ux, flameH * 0.65);
    }

    // Animated Hazmat Boots & Knee Pads
    const legSwing = Math.abs(player.vx) > 0.15 ? Math.sin(tick * 0.35) * 1.8 : 0;
    ctx.fillStyle = '#141824';
    ctx.fillRect(px - 3.4 * ux, py + (5.8 + legSwing * 0.4) * uy, 3.0 * ux, 4.2 * uy);
    ctx.fillRect(px + 0.8 * ux, py + (5.8 - legSwing * 0.4) * uy, 3.0 * ux, 4.2 * uy);
    ctx.fillStyle = '#343a40';
    ctx.fillRect(px - 2.8 * ux, py + (6.2 + legSwing * 0.4) * uy, 1.8 * ux, 3.2 * uy);
    ctx.fillRect(px + 1.4 * ux, py + (6.2 - legSwing * 0.4) * uy, 1.8 * ux, 3.2 * uy);

    // 16-bit Pixel Art Dr. Vance Body, Domed Helmet, Cyan Visor & Pressurized Tank
    drawCompiledSprite(
      ctx,
      SPRITE_PLAYER_BODY,
      px,
      py - 0.8 * uy,
      ux,
      uy,
      {
        O: '#141824',
        W: '#f8f9fa',
        w: '#ced4da',
        o: '#495057',
        C: '#00f5d4',
        V: '#a8f9ff',
        c: '#0096c7',
        v: '#adb5bd',
        B: '#48cae4',
        b: '#0077b6',
        h: '#0096c7',
        Y: '#ffd166',
        y: '#f4a261',
        P: '#80ed99',
        G: '#2b2d42',
        D: '#2b2d42',
        U: '#ffd166',
      },
      flip
    );

    // If Bibbi is riding piggyback on Dr. Vance's back (drawn over his backpack/shoulders!)
    const b = level.bibbi;
    if (b.carried && !b.rescued) {
      const bx = px - f * 4.8 * ux;
      const by = py - 2.6 * uy + Math.sin(tick * 0.25) * 0.6 * uy;
      drawCompiledSprite(
        ctx,
        SPRITE_BIBBI_PIGGYBACK,
        bx,
        by,
        ux * 0.86,
        uy * 0.86,
        {
          O: '#141824',
          A: '#ff9f1c',
          a: '#e07a5f',
          T: '#4cc9f0',
          S: '#e8b49a',
          o: '#c68b71',
          E: '#1d3557',
          M: '#f72585',
          m: '#b5179e',
          C: '#00b4d8',
          W: '#f8f9fa',
        },
        flip
      );

      // Delicate Bibbi HP Bar & Piggyback Tag above Dr. Vance
      const barW = 7.0 * ex;
      ctx.fillStyle = 'rgba(10, 14, 24, 0.9)';
      ctx.fillRect(px - barW / 2, py - 7.6 * ey, barW, 1.1 * ey);
      ctx.fillStyle = b.hp < 40 ? '#ff0055' : '#06d6a0';
      ctx.fillRect(px - barW / 2, py - 7.6 * ey, barW * Math.max(0, b.hp / b.maxHp), 1.1 * ey);

      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = b.hp < 40 ? '#ff4d6d' : '#ff99c8';
      ctx.fillText(`♥ BIBBI ${Math.ceil(b.hp)}%`, px, py - 8.1 * ey);
    }

    // Detailed 16-bit Omni-Tool Alchemy Blaster aiming toward mouse cursor
    const angle = Math.atan2(mouseWorld.wy - player.y, mouseWorld.wx - player.x);
    ctx.translate(px, py - 0.5 * ey);
    ctx.rotate(angle);
    const AimFlipY = Math.abs(angle) > Math.PI / 2;
    if (AimFlipY) ctx.scale(1, -1);
    const toolColor = TOOLS[player.selectedTool - 1]?.color || '#00f5d4';
    drawCompiledSprite(
      ctx,
      SPRITE_OMNI_TOOL,
      5.0 * ux,
      0,
      ux * 0.82,
      uy * 0.82,
      {
        O: '#141824',
        S: '#adb5bd',
        g: '#343a40',
        T: toolColor,
      },
      false
    );
    ctx.restore();
  }

  private renderProjectiles(
    ctx: CanvasRenderingContext2D,
    projectiles: Projectile[],
    camX: number,
    camY: number,
    sx: number,
    sy: number
  ): void {
    const ex = sx * 2;
    const ey = sy * 2;
    for (const p of projectiles) {
      const vx = p.x - camX;
      const vy = p.y - camY;
      if (vx < -10 || vx > this.viewW + 10 || vy < -10 || vy > this.viewH + 10) continue;

      const px = vx * sx;
      const py = vy * sy;
      if (p.type === 'heat') {
        // Multi-toned flamethrower fireball core + outer glow
        ctx.fillStyle = p.color;
        ctx.fillRect(px - 1.5 * ex, py - 1.5 * ey, 3.0 * ex, 3.0 * ey);
        ctx.fillStyle = '#fff3b0';
        ctx.fillRect(px - 0.65 * ex, py - 0.65 * ey, 1.3 * ex, 1.3 * ey);
      } else {
        ctx.fillStyle = '#141824';
        ctx.fillRect(px - 1.45 * ex, py - 1.45 * ey, 2.9 * ex, 2.9 * ey);
        ctx.fillStyle = p.color;
        ctx.fillRect(px - 1.1 * ex, py - 1.1 * ey, 2.2 * ex, 2.2 * ey);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px - 0.45 * ex, py - 0.45 * ey, 0.9 * ex, 0.9 * ey);
      }
    }
  }

  private renderCursorReticle(
    ctx: CanvasRenderingContext2D,
    world: WorldGrid,
    player: Player,
    mouseWorld: { wx: number; wy: number },
    camX: number,
    camY: number,
    sx: number,
    sy: number,
    _scannerActive: boolean
  ): void {
    const gx = Math.floor(mouseWorld.wx);
    const gy = Math.floor(mouseWorld.wy);
    const px = (mouseWorld.wx - camX) * sx;
    const py = (mouseWorld.wy - camY) * sy;

    const tool = TOOLS[player.selectedTool - 1];
    ctx.save();
    ctx.strokeStyle = tool.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(px, py, 9 * sx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw highlight around the exact hovered atomic pixel
    const cellX = (gx - camX) * sx;
    const cellY = (gy - camY) * sy;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(cellX, cellY, sx, sy);

    if (world.inBounds(gx, gy)) {
      const i = world.idx(gx, gy);
      const el = world.grid[i] as ElementId;
      const def = ELEMENTS[el];
      const temp = Math.round(world.temp[i]);
      const press = world.pressure[i];
      const flags = world.flags[i];

      const isSolution = el === ElementId.ACID || el === ElementId.ALKALI || el === ElementId.SALT_WATER;
      const conc = isSolution ? world.getConcentration(i) : 100;
      const solLabel = isSolution
        ? conc < 85
          ? `Dilute ${def.name} ${conc}%`
          : `${def.name} ${conc}%`
        : def.name;
      let badge = `${def.symbol} (${solLabel}) | ${temp}°C`;
      if (press >= 1) badge += ` | ${Math.round(press)} GPa`;
      if (flags & FLAG_CRYO_BRITTLE) badge += ' [CRYO-BRITTLE]';
      if (flags & FLAG_QUANTUM_TUNNEL) badge += ' [|Ψ⟩ TUNNEL]';
      if (flags & FLAG_GLUON_LOCKED) badge += ' [GLUON-LOCK]';

      ctx.font = 'bold 11px "JetBrains Mono", monospace';
      const w = ctx.measureText(badge).width + 12;
      const bx = Math.min(ctx.canvas.width - w - 8, Math.max(8, px + 14));
      const by = Math.max(24, py - 12);

      ctx.fillStyle = 'rgba(10, 14, 24, 0.88)';
      ctx.strokeStyle = tool.color;
      ctx.fillRect(bx, by - 14, w, 20);
      ctx.strokeRect(bx, by - 14, w, 20);
      ctx.fillStyle = '#f8f9fa';
      ctx.fillText(badge, bx + 6, by);
    }
    ctx.restore();
  }

  private renderBibbiCompass(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    player: Player,
    level: LevelData
  ): void {
    const b = level.bibbi;
    const targetX = b.carried ? level.escapeVehicle.x : b.x;
    const targetY = b.carried ? level.escapeVehicle.y : b.y;
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const dist = Math.round(Math.hypot(dx, dy));
    if (dist < 100) return;

    const angle = Math.atan2(dy, dx);
    const cx = canvas.width / 2 + Math.cos(angle) * (canvas.width / 2 - 34);
    const cy = canvas.height / 2 + Math.sin(angle) * (canvas.height / 2 - 34);

    ctx.save();
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const text = b.carried ? `🚁 EXIT ${Math.round(dist / 2)}m` : `♥ ${Math.round(dist / 2)}m`;
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = b.carried ? 'rgba(6, 42, 32, 0.85)' : 'rgba(28, 12, 42, 0.78)';
    ctx.fillRect(cx - w / 2, cy - 9, w, 15);
    ctx.fillStyle = b.carried ? '#06d6a0' : '#ff99c8';
    ctx.fillText(text, cx, cy + 2);
    ctx.restore();
  }

  public renderMinimap(
    targetCanvas: HTMLCanvasElement,
    world: WorldGrid,
    player: Player,
    level: LevelData
  ): void {
    const mw = 140;
    const mh = 90;
    const stepX = world.width / mw;
    const stepY = world.height / mh;

    for (let my = 0; my < mh; my++) {
      const wy = Math.floor(my * stepY);
      const rowW = wy * world.width;
      const rowM = my * mw;
      for (let mx = 0; mx < mw; mx++) {
        const wx = Math.floor(mx * stepX);
        const el = world.grid[rowW + wx] as ElementId;
        if (el === ElementId.EMPTY) {
          this.minimapBuf32[rowM + mx] = 0xff1c1410;
        } else {
          const c = ELEMENTS[el].baseColor;
          this.minimapBuf32[rowM + mx] = (255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0];
        }
      }
    }
    this.minimapCtx.putImageData(this.minimapImg, 0, 0);

    const tctx = targetCanvas.getContext('2d');
    if (!tctx) return;
    tctx.imageSmoothingEnabled = false;
    tctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    tctx.drawImage(this.minimapCanvas, 0, 0, targetCanvas.width, targetCanvas.height);

    const sx = targetCanvas.width / world.width;
    const sy = targetCanvas.height / world.height;

    // Camera viewport box on minimap
    tctx.strokeStyle = 'rgba(76, 201, 240, 0.7)';
    tctx.lineWidth = 1;
    tctx.strokeRect(
      this.camX * sx,
      this.camY * sy,
      this.viewW * sx,
      this.viewH * sy
    );

    // Terminals on minimap
    tctx.fillStyle = '#00f5d4';
    for (const term of level.terminals) {
      tctx.fillRect(term.x * sx - 1.5, term.y * sy - 1.5, 3, 3);
    }

    // J.E.V. Enemy Units on minimap (Red = Guard, Orange = Drone, Magenta Square = Heavy Mech)
    if (level.enemyUnits) {
      for (const u of level.enemyUnits) {
        if (!u.active) continue;
        tctx.fillStyle =
          u.type === 'robot' ? '#ff0055' : u.type === 'drone' ? '#ff9f1c' : '#ff595e';
        const sz = u.type === 'robot' ? 3.5 : 2.5;
        tctx.fillRect(u.x * sx - sz / 2, u.y * sy - sz / 2, sz, sz);
      }
    }

    // Escape Vehicle marker on minimap (bright emerald)
    if (level.escapeVehicle) {
      tctx.fillStyle = '#06d6a0';
      tctx.beginPath();
      tctx.arc(level.escapeVehicle.x * sx, level.escapeVehicle.y * sy, 4, 0, Math.PI * 2);
      tctx.fill();
    }

    // Bibbi pulsing beacon on minimap
    if (!level.bibbi.carried) {
      tctx.fillStyle = '#f72585';
      tctx.beginPath();
      tctx.arc(level.bibbi.x * sx, level.bibbi.y * sy, 4, 0, Math.PI * 2);
      tctx.fill();
    }

    // Player dot on minimap
    tctx.fillStyle = '#ffd166';
    tctx.beginPath();
    tctx.arc(player.x * sx, player.y * sy, 3.5, 0, Math.PI * 2);
    tctx.fill();
  }
}
