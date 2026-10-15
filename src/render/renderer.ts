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
    const ex = sx * 2;
    const ey = sy * 2;
    for (const term of level.terminals) {
      const vx = term.x - camX;
      const vy = term.y - camY;
      if (vx < -20 || vx > this.viewW + 20 || vy < -20 || vy > this.viewH + 20) continue;

      const px = vx * sx;
      const py = vy * sy;

      // Terminal stand & glowing CRT monitor
      ctx.fillStyle = '#2b2d42';
      ctx.fillRect(px - 2 * ex, py - 3 * ey, 4 * ex, 6 * ey);
      ctx.fillStyle = tick % 30 < 20 ? '#00f5d4' : '#4cc9f0';
      ctx.fillRect(px - 1.5 * ex, py - 2.5 * ey, 3 * ex, 2.2 * ey);

      const dist = Math.hypot(player.x - term.x, player.y - term.y);
      if (dist < 32) {
        ctx.save();
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(10, 15, 28, 0.85)';
        ctx.fillRect(px - 22, py - 22, 44, 15);
        ctx.fillStyle = '#00f5d4';
        ctx.fillText('[E]', px, py - 11);
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
    const ex = sx * 2;
    const ey = sy * 2;
    for (const t of level.turrets) {
      if (!t.active) continue;
      const vx = t.x - camX;
      const vy = t.y - camY;
      if (vx < -20 || vx > this.viewW + 20 || vy < -20 || vy > this.viewH + 20) continue;

      const px = vx * sx;
      const py = vy * sy;

      ctx.fillStyle = '#495057';
      ctx.fillRect(px - 2.5 * ex, py - 2.5 * ey, 5 * ex, 5 * ey);

      ctx.fillStyle =
        t.type === 'kinetic' ? '#ffd166' : t.type === 'thermal' ? '#ff595e' : '#70e000';
      const pulse = Math.sin(tick * 0.15) * 0.4 + 1.2;
      ctx.fillRect(px - pulse * ex, py - pulse * ey, pulse * 2 * ex, pulse * 2 * ey);

      // HP bar if damaged
      if (t.hp < t.maxHp) {
        ctx.fillStyle = '#222';
        ctx.fillRect(px - 3 * ex, py - 4.2 * ey, 6 * ex, 1 * ey);
        ctx.fillStyle = '#ff595e';
        ctx.fillRect(px - 3 * ex, py - 4.2 * ey, 6 * ex * (t.hp / t.maxHp), 1 * ey);
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
    const ex = sx * 2;
    const ey = sy * 2;

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

        // Emitter housing
        ctx.fillStyle = '#343a40';
        ctx.fillRect(px - 1.5 * ex, py - 1.5 * ey, 3 * ex, 3 * ey);
        ctx.fillStyle = '#ff4d6d';
        ctx.fillRect(px - 0.8 * ex, py - 0.8 * ey, 1.6 * ex, 1.6 * ey);

        // Laser beam
        ctx.save();
        ctx.strokeStyle = d.triggered
          ? '#ffffff'
          : (tick & 3) === 0
          ? 'rgba(255, 77, 109, 0.95)'
          : 'rgba(247, 37, 133, 0.72)';
        ctx.lineWidth = d.triggered ? 3.5 : 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(endPx, endPy);
        ctx.stroke();

        // Endpoint laser hotspot
        ctx.fillStyle = '#ffccd5';
        ctx.beginPath();
        ctx.arc(endPx, endPy, 1.2 * ex, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (d.type === 'ceiling_sprayer') {
        ctx.fillStyle = '#343a40';
        ctx.fillRect(px - 2.2 * ex, py - 1.2 * ey, 4.4 * ex, 2.4 * ey);
        ctx.fillStyle = d.triggered ? '#80ed99' : '#4cc9f0';
        ctx.fillRect(px - 1.2 * ex, py + 0.8 * ey, 2.4 * ex, 1.2 * ey);
      } else if (d.type === 'alarm_beacon') {
        ctx.fillStyle = '#2b2d42';
        ctx.fillRect(px - 2 * ex, py - 2 * ey, 4 * ex, 4 * ey);
        const pulse = Math.sin(tick * 0.25) > 0;
        ctx.fillStyle = d.triggered ? (pulse ? '#ff0055' : '#ffd166') : '#f72585';
        ctx.beginPath();
        ctx.arc(px, py, 1.4 * ex, 0, Math.PI * 2);
        ctx.fill();

        if (d.triggered) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255, 0, 85, 0.55)';
          ctx.lineWidth = 1.5;
          const r = ((tick % 30) / 30) * 18 * ex;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
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
      if (vx < -35 || vx > this.viewW + 35 || vy < -35 || vy > this.viewH + 35) continue;

      const px = vx * sx;
      const py = vy * sy;
      const f = u.facing;

      ctx.save();

      // Status Auras: Cryo-Brittle Frost or Chroniton Stasis!
      if (u.stasisTimer > 0) {
        ctx.strokeStyle = '#4cc9f0';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          px - (u.width * 0.32) * ex,
          py - (u.height * 0.32) * ey,
          u.width * 0.64 * ex,
          u.height * 0.64 * ey
        );
      } else if (u.cryoBrittleTimer > 0) {
        ctx.strokeStyle = '#72efdd';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          px - (u.width * 0.3) * ex,
          py - (u.height * 0.3) * ey,
          u.width * 0.6 * ex,
          u.height * 0.6 * ey
        );
      }

      if (u.type === 'guard') {
        // HAZMAT ALCHEMY GUARD SPRITE
        const loadoutColor =
          u.weaponLoadout === 'cryo'
            ? '#72efdd'
            : u.weaponLoadout === 'acid'
            ? '#80ed99'
            : '#ff595e';

        // Backpack Chemical Tank
        ctx.fillStyle = loadoutColor;
        ctx.fillRect(px - f * 2.5 * ex, py - 2.0 * ey, 1.3 * ex, 3.8 * ey);

        // Crimson/Obsidian Tactical Hazmat Suit
        ctx.fillStyle = u.rustedLevel > 25 ? '#9e472a' : '#d90429';
        ctx.fillRect(px - 2.0 * ex, py - 1.5 * ey, 4.0 * ex, 4.2 * ey);

        // Helmet & Glowing Amber/Red Tactical Visor
        ctx.fillStyle = '#2b2d42';
        ctx.fillRect(px - 2.0 * ex, py - 4.4 * ey, 4.0 * ex, 2.9 * ey);
        ctx.fillStyle = loadoutColor;
        ctx.fillRect(
          f > 0 ? px - 0.3 * ex : px - 1.8 * ex,
          py - 3.6 * ey,
          2.1 * ex,
          1.4 * ey
        );

        // Animated Guard Legs
        const swing = Math.abs(u.vx) > 0.1 ? Math.sin(tick * 0.32) * 1.1 : 0;
        ctx.fillStyle = '#1b1f2a';
        ctx.fillRect(px - 1.5 * ex, py + (2.7 + swing * 0.35) * ey, 1.2 * ex, 1.9 * ey);
        ctx.fillRect(px + 0.3 * ex, py + (2.7 - swing * 0.35) * ey, 1.2 * ex, 1.9 * ey);

        // Counter-Alchemy Rifle
        ctx.fillStyle = '#adb5bd';
        ctx.fillRect(px + (f > 0 ? 0.5 : -3.8) * ex, py - 0.6 * ey, 3.3 * ex, 1.1 * ey);
        ctx.fillStyle = loadoutColor;
        ctx.fillRect(px + (f > 0 ? 3.2 : -4.2) * ex, py - 0.8 * ey, 1.0 * ex, 1.5 * ey);
      } else if (u.type === 'drone') {
        // AUTONOMOUS HUNTER-SEEKER DRONE SPRITE
        const rotorSpin = (tick & 1) === 0 ? 3.4 : 2.0;
        ctx.fillStyle = '#4cc9f0';
        ctx.fillRect(px - 3.6 * ex, py - 2.6 * ey, rotorSpin * ex, 0.7 * ey);
        ctx.fillRect(px + (3.6 - rotorSpin) * ex, py - 2.6 * ey, rotorSpin * ex, 0.7 * ey);

        // armored chassis orb
        ctx.fillStyle = '#2b2d42';
        ctx.fillRect(px - 2.8 * ex, py - 1.8 * ey, 5.6 * ex, 3.6 * ey);

        // Glowing J.E.V. Sensor Eye
        ctx.fillStyle = u.weaponLoadout === 'sodium_bomb' ? '#ff9f1c' : '#f72585';
        ctx.fillRect(px - 1.2 * ex, py - 0.8 * ey, 2.4 * ex, 1.6 * ey);

        // Bottom Sodium/Thermite payload bay
        ctx.fillStyle = '#ff9f1c';
        ctx.fillRect(px - 1.4 * ex, py + 1.8 * ey, 2.8 * ex, 1.0 * ey);
      } else if (u.type === 'robot') {
        // HEAVY AEGIS COMBAT MECH / WALKER SPRITE
        const rustTint = u.rustedLevel > 20;
        // Heavy Armored Torso
        ctx.fillStyle = rustTint ? '#8c3f27' : '#495057';
        ctx.fillRect(px - 3.8 * ex, py - 5.2 * ey, 7.6 * ex, 6.8 * ey);

        // Shoulder Pauldrons & Graviton Cannons
        ctx.fillStyle = rustTint ? '#a44a2d' : '#6c757d';
        ctx.fillRect(px - 4.6 * ex, py - 5.6 * ey, 2.2 * ex, 3.2 * ey);
        ctx.fillRect(px + 2.4 * ex, py - 5.6 * ey, 2.2 * ex, 3.2 * ey);

        // Glowing Cyclops J.E.V. Optic
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(
          px + (f > 0 ? -0.5 : -2.5) * ex,
          py - 3.8 * ey,
          3.0 * ex,
          1.6 * ey
        );

        // Articulated Hydraulic Walker Legs
        const stomp = Math.abs(u.vx) > 0.1 ? Math.sin(tick * 0.22) * 1.4 : 0;
        ctx.fillStyle = rustTint ? '#6e321f' : '#343a40';
        ctx.fillRect(px - 3.0 * ex, py + (1.6 + stomp * 0.4) * ey, 2.2 * ex, 4.2 * ey);
        ctx.fillRect(px + 0.8 * ex, py + (1.6 - stomp * 0.4) * ey, 2.2 * ex, 4.2 * ey);

        // Heavy Arm Cannon
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(px + (f > 0 ? 2.5 : -6.5) * ex, py - 1.8 * ey, 4.0 * ex, 2.0 * ey);
      }

      // Minimal HP Bar above unit ONLY when damaged (no floating text clutter!)
      if (u.hp < u.maxHp) {
        const barW = (u.type === 'robot' ? 7 : 5) * ex;
        const barY = py - (u.height * 0.34 + 2.0) * ey;
        ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
        ctx.fillRect(px - barW / 2, barY, barW, 0.9 * ey);
        ctx.fillStyle =
          u.cryoBrittleTimer > 0
            ? '#72efdd'
            : u.rustedLevel > 25
            ? '#ff9f1c'
            : '#ff4d6d';
        ctx.fillRect(px - barW / 2, barY, barW * Math.max(0, u.hp / u.maxHp), 0.9 * ey);
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
    if (vx < -60 || vx > this.viewW + 60 || vy < -60 || vy > this.viewH + 60) return;

    const ex = sx * 2;
    const ey = sy * 2;
    const hover = Math.sin(tick * 0.09) * 1.4;
    const px = vx * sx;
    const py = (vy + hover) * sy;
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

    // Landing struts
    ctx.fillStyle = '#495057';
    ctx.fillRect(px - 7 * ex, py + 4.5 * ey, 14 * ex, 1.2 * ey);
    ctx.fillRect(px - 5 * ex, py + 2.5 * ey, 1.4 * ex, 2.5 * ey);
    ctx.fillRect(px + 3.6 * ex, py + 2.5 * ey, 1.4 * ex, 2.5 * ey);

    // Vehicle Hull & Cockpit by type
    if (ev.type === 'submersible') {
      // Deep-sea bathysphere hull
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(px - 7.5 * ex, py - 3.5 * ey, 15 * ex, 6.5 * ey);
      ctx.fillStyle = '#00f5d4';
      ctx.fillRect(px - 3 * ex, py - 2.2 * ey, 6 * ex, 3.8 * ey);
    } else if (ev.type === 'drillpod') {
      // Subterranean extraction pod
      ctx.fillStyle = '#ff9f1c';
      ctx.fillRect(px - 7 * ex, py - 3.5 * ey, 14 * ex, 6.5 * ey);
      ctx.fillStyle = '#adb5bd';
      ctx.fillRect(px - 9.5 * ex, py - 2 * ey, 2.5 * ex, 3.5 * ey);
      ctx.fillStyle = '#06d6a0';
      ctx.fillRect(px - 2.5 * ex, py - 2 * ey, 5.5 * ex, 3.2 * ey);
    } else {
      // VTOL Dropship / Chopper / Shuttle / Sky-Skiff
      ctx.fillStyle = '#343a40';
      ctx.fillRect(px - 8.5 * ex, py - 3.2 * ey, 17 * ex, 6.0 * ey);
      ctx.fillStyle = ready ? '#06d6a0' : '#4cc9f0';
      ctx.fillRect(px - 4.5 * ex, py - 2.2 * ey, 9 * ex, 3.4 * ey);

      // Spinning VTOL Rotors / Thruster Pods
      const rotorW = (tick & 1) === 0 ? 11 : 6;
      ctx.fillStyle = '#adb5bd';
      ctx.fillRect(px - rotorW * ex, py - 4.8 * ey, rotorW * 2 * ex, 0.9 * ey);
      ctx.fillRect(px - 0.8 * ex, py - 4.5 * ey, 1.6 * ex, 1.5 * ey);

      // Thruster afterburner glow when Bibbi is on board/ready
      if (ready || (tick & 3) < 2) {
        ctx.fillStyle = ready ? '#06d6a0' : '#4cc9f0';
        ctx.fillRect(px - 6 * ex, py + 2.8 * ey, 2.2 * ex, 1.8 * ey);
        ctx.fillRect(px + 3.8 * ex, py + 2.8 * ey, 2.2 * ex, 1.8 * ey);
      }
    }

    // Label above vehicle
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = ready ? '#06d6a0' : '#4cc9f0';
    ctx.fillText(ready ? `🚁 EXTRACT HERE!` : `🚁 ${ev.name.toUpperCase()}`, px, py - 14);
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

    // Bibbi sprite (magenta/teal lab jacket, pigtails, expressive eyes)
    ctx.fillStyle = '#ff9f1c';
    ctx.fillRect(px - 2.5 * ex, py - 3.5 * ey, 5 * ex, 2 * ey);
    ctx.fillStyle = '#ffe5d9';
    ctx.fillRect(px - 1.5 * ex, py - 2.5 * ey, 3 * ex, 2.5 * ey);
    ctx.fillStyle = '#1d3557';
    ctx.fillRect(px - 1 * ex, py - 1.8 * ey, 0.7 * ex, 0.8 * ey);
    ctx.fillRect(px + 0.4 * ex, py - 1.8 * ey, 0.7 * ex, 0.8 * ey);
    ctx.fillStyle = '#f72585';
    ctx.fillRect(px - 2 * ex, py, 4 * ex, 3.2 * ey);
    ctx.fillStyle = '#4cc9f0';
    ctx.fillRect(px - 1.6 * ex, py + 3.2 * ey, 1.2 * ex, 1.4 * ey);
    ctx.fillRect(px + 0.4 * ex, py + 3.2 * ey, 1.2 * ex, 1.4 * ey);

    // Delicate HP bar if Bibbi has taken damage
    if (b.hp < b.maxHp && b.hp > 0) {
      const barW = 6 * ex;
      ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
      ctx.fillRect(px - barW / 2, py - 5.2 * ey, barW, 1.0 * ey);
      ctx.fillStyle = b.hp < 35 ? '#ff0055' : '#ff99c8';
      ctx.fillRect(px - barW / 2, py - 5.2 * ey, barW * Math.max(0, b.hp / b.maxHp), 1.0 * ey);
    }

    // Subtle compact tag above Bibbi
    ctx.save();
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = b.rescued ? '#ffd166' : '#ff99c8';
    ctx.fillText(b.rescued ? '♥ EXTRACTED!' : '♥ BIBBI', px, py - 18);
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

    ctx.save();
    // Quantum Phase Superposition Aura if active!
    if (player.quantumPhaseTimer > 0) {
      ctx.globalAlpha = 0.65 + Math.sin(tick * 0.4) * 0.25;
      ctx.strokeStyle = '#c77dff';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(px - 3.5 * ex, py - 5.5 * ey, 7 * ex, 11 * ey);
    }

    const f = player.facing;

    // Alchemist Backpack Tank
    ctx.fillStyle = '#4cc9f0';
    ctx.fillRect(px - f * 2.6 * ex, py - 2 * ey, 1.4 * ex, 4 * ey);

    // If Bibbi is riding piggyback on Dr. Vance's back!
    const b = level.bibbi;
    if (b.carried && !b.rescued) {
      const bx = px - f * 3.1 * ex;
      const by = py - 2.3 * ey + Math.sin(tick * 0.25) * 0.4 * ey;
      // Bibbi's orange pigtails & head peeking over shoulder
      ctx.fillStyle = '#ff9f1c';
      ctx.fillRect(bx - 1.8 * ex, by - 3.0 * ey, 3.6 * ex, 1.5 * ey);
      ctx.fillStyle = '#ffe5d9';
      ctx.fillRect(bx - 1.2 * ex, by - 2.0 * ey, 2.4 * ex, 2.0 * ey);
      // Bibbi's magenta jacket & arms hugging Dr. Vance's neck
      ctx.fillStyle = '#f72585';
      ctx.fillRect(bx - 1.5 * ex, by, 3.0 * ex, 2.8 * ey);
      ctx.fillRect(bx, by - 0.6 * ey, f * 2.4 * ex, 1.0 * ey);

      // Delicate Bibbi HP Bar above her head when hurt or carried
      if (b.hp < b.maxHp) {
        const barW = 6.5 * ex;
        ctx.fillStyle = 'rgba(10, 14, 24, 0.9)';
        ctx.fillRect(px - barW / 2, py - 7.0 * ey, barW, 1.1 * ey);
        ctx.fillStyle = b.hp < 35 ? '#ff0055' : '#ff99c8';
        ctx.fillRect(px - barW / 2, py - 7.0 * ey, barW * Math.max(0, b.hp / b.maxHp), 1.1 * ey);
      }
    }

    // Hazmat Suit Body
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(px - 2 * ex, py - 1.5 * ey, 4 * ex, 4.2 * ey);

    // Suit Helmet & Glowing Cyan Visor
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(px - 2 * ex, py - 4.5 * ey, 4 * ex, 3 * ey);
    ctx.fillStyle = '#00f5d4';
    ctx.fillRect(
      f > 0 ? px - 0.5 * ex : px - 1.8 * ex,
      py - 3.8 * ey,
      2.3 * ex,
      1.6 * ey
    );

    // Animated Legs
    const legSwing = Math.abs(player.vx) > 0.15 ? Math.sin(tick * 0.35) * 1.2 : 0;
    ctx.fillStyle = '#343a40';
    ctx.fillRect(px - 1.6 * ex, py + (2.7 + legSwing * 0.4) * ey, 1.3 * ex, 2 * ey);
    ctx.fillRect(px + 0.3 * ex, py + (2.7 - legSwing * 0.4) * ey, 1.3 * ex, 2 * ey);

    // Omni-Tool Arm aiming toward mouse cursor
    const angle = Math.atan2(mouseWorld.wy - player.y, mouseWorld.wx - player.x);
    ctx.translate(px, py - 0.5 * ey);
    ctx.rotate(angle);
    const toolColor = TOOLS[player.selectedTool - 1]?.color || '#00f5d4';
    ctx.fillStyle = '#adb5bd';
    ctx.fillRect(0, -0.7 * ey, 3.6 * ex, 1.4 * ey);
    ctx.fillStyle = toolColor;
    ctx.fillRect(2.8 * ex, -1.0 * ey, 1.4 * ex, 2.0 * ey);
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
      ctx.fillStyle = p.color;
      ctx.fillRect(px - 1.2 * ex, py - 1.2 * ey, 2.4 * ex, 2.4 * ey);
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

      let badge = `${def.symbol} (${def.name}) | ${temp}°C`;
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
