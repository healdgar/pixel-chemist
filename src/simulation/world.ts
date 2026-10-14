import {
  ElementId,
  ELEMENTS,
  FLAG_CRYO_BRITTLE,
  FLAG_GLUON_LOCKED,
  FLAG_QUANTUM_TUNNEL,
  FLAG_TIME_ACCEL,
  FLAG_TIME_STASIS,
  FLAG_UPDATED,
} from '../chemistry/elements';
import { SoundEngine } from '../audio/soundEngine';

export interface WorldSnapshot {
  grid: Uint8Array;
  temp: Float32Array;
  pressure: Float32Array;
  radiation: Float32Array;
  flags: Uint8Array;
  life: Uint16Array;
  playerX: number;
  playerY: number;
  playerHp: number;
}

export interface ReactionEvent {
  x: number;
  y: number;
  text: string;
  color: string;
  ttl: number;
}

export class WorldGrid {
  public readonly width: number;
  public readonly height: number;
  public readonly size: number;

  public grid: Uint8Array;
  public bgGrid: Uint8Array;
  public temp: Float32Array;
  public pressure: Float32Array;
  public radiation: Float32Array;
  public flags: Uint8Array;
  public life: Uint16Array;
  public colorNoise: Int8Array;

  private parity: number = 0;
  private rngState: number = 0x12345678;
  public fusionTriggered: boolean = false;
  public fusionCoords: { x: number; y: number } | null = null;
  public reactionEvents: ReactionEvent[] = [];
  private lastEventTick: number = 0;
  public tickCount: number = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.size = width * height;

    this.grid = new Uint8Array(this.size);
    this.bgGrid = new Uint8Array(this.size);
    this.temp = new Float32Array(this.size);
    this.pressure = new Float32Array(this.size);
    this.radiation = new Float32Array(this.size);
    this.flags = new Uint8Array(this.size);
    this.life = new Uint16Array(this.size);
    this.colorNoise = new Int8Array(this.size);

    for (let i = 0; i < this.size; i++) {
      this.temp[i] = 22;
      this.colorNoise[i] = Math.floor((Math.random() - 0.5) * 28);
    }
  }

  // Ultra-fast inline Xorshift32 PRNG (returns 0..1 float without Math.random() overhead)
  private fastRand(): number {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x;
    return (x >>> 0) * 2.3283064365386963e-10;
  }

  private fastCoin(): boolean {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x;
    return (x & 1) === 0;
  }

  public inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  public idx(x: number, y: number): number {
    return y * this.width + x;
  }

  public getElement(x: number, y: number): ElementId {
    if (!this.inBounds(x, y)) return ElementId.TUNGSTEN;
    return this.grid[y * this.width + x] as ElementId;
  }

  public setElement(
    x: number,
    y: number,
    el: ElementId,
    customTemp?: number,
    customLife?: number,
    preserveFlags: boolean = false
  ): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    const def = ELEMENTS[el];
    this.grid[i] = el;
    this.temp[i] = customTemp !== undefined ? customTemp : def.defaultTemp;
    if (!preserveFlags) {
      this.flags[i] = 0;
    }
    this.life[i] = customLife !== undefined ? customLife : this.getDefaultLife(el);
    this.radiation[i] = def.radioactivity;
  }

  private getDefaultLife(el: ElementId): number {
    switch (el) {
      case ElementId.FIRE:
        return 28 + ((this.rngState >>> 4) & 31);
      case ElementId.SMOKE:
        return 90 + ((this.rngState >>> 4) & 63);
      case ElementId.NITROGEN_GAS:
        return 110 + ((this.rngState >>> 4) & 63);
      case ElementId.STEAM:
        return 150 + ((this.rngState >>> 4) & 127);
      case ElementId.PLASMA:
        return 35 + ((this.rngState >>> 4) & 31);
      case ElementId.QUARK_PLASMA:
        return 45 + ((this.rngState >>> 4) & 31);
      case ElementId.FUSION_PLASMA:
        return 140 + ((this.rngState >>> 4) & 63);
      case ElementId.NEUTRON:
        return 75 + ((this.rngState >>> 4) & 63);
      case ElementId.QUANTUM_FOAM:
        return 85 + ((this.rngState >>> 4) & 63);
      case ElementId.BURNING_THERMITE:
        return 100 + ((this.rngState >>> 4) & 63);
      default:
        return 0;
    }
  }

  public swap(i1: number, i2: number): void {
    const g = this.grid[i1];
    this.grid[i1] = this.grid[i2];
    this.grid[i2] = g;

    const t = this.temp[i1];
    this.temp[i1] = this.temp[i2];
    this.temp[i2] = t;

    const p = this.pressure[i1];
    this.pressure[i1] = this.pressure[i2];
    this.pressure[i2] = p;

    const r = this.radiation[i1];
    this.radiation[i1] = this.radiation[i2];
    this.radiation[i2] = r;

    const f = this.flags[i1];
    this.flags[i1] = this.flags[i2] | FLAG_UPDATED;
    this.flags[i2] = f | FLAG_UPDATED;

    const l = this.life[i1];
    this.life[i1] = this.life[i2];
    this.life[i2] = l;

    const c = this.colorNoise[i1];
    this.colorNoise[i1] = this.colorNoise[i2];
    this.colorNoise[i2] = c;
  }

  public addReactionPopup(x: number, y: number, text: string, color: string): void {
    if (this.tickCount - this.lastEventTick < 10 && this.reactionEvents.length > 6) return;
    for (const ev of this.reactionEvents) {
      if (Math.hypot(ev.x - x, ev.y - y) < 55 && ev.text === text) {
        return;
      }
    }
    this.lastEventTick = this.tickCount;
    this.reactionEvents.push({ x, y, text, color, ttl: 75 });
  }

  public createSnapshot(playerX: number, playerY: number, playerHp: number): WorldSnapshot {
    return {
      grid: new Uint8Array(this.grid),
      temp: new Float32Array(this.temp),
      pressure: new Float32Array(this.pressure),
      radiation: new Float32Array(this.radiation),
      flags: new Uint8Array(this.flags),
      life: new Uint16Array(this.life),
      playerX,
      playerY,
      playerHp,
    };
  }

  public restoreSnapshot(snap: WorldSnapshot): void {
    this.grid.set(snap.grid);
    this.temp.set(snap.temp);
    this.pressure.set(snap.pressure);
    this.radiation.set(snap.radiation);
    this.flags.set(snap.flags);
    this.life.set(snap.life);
    this.fusionTriggered = false;
    this.fusionCoords = null;
  }

  public isSolidForEntity(x: number, y: number, ignoreQuantum: boolean = false): boolean {
    if (!this.inBounds(x, y)) return true;
    const i = y * this.width + x;
    if (!ignoreQuantum && (this.flags[i] & FLAG_QUANTUM_TUNNEL) !== 0) {
      return false;
    }
    const el = this.grid[i] as ElementId;
    const state = ELEMENTS[el].state;
    return state === 'solid' || state === 'powder';
  }

  // Apply radial kinetic pressure + optional impulse
  public applyPressureImpulse(
    cx: number,
    cy: number,
    radius: number,
    peakGPa: number,
    sound: SoundEngine
  ): void {
    const r2 = radius * radius;
    let shatteredCryo = false;

    for (let dy = -radius; dy <= radius; dy++) {
      const y = Math.floor(cy + dy);
      if (y <= 1 || y >= this.height - 2) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = Math.floor(cx + dx);
        if (x <= 1 || x >= this.width - 2) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;

        const falloff = 1 - Math.sqrt(d2) / (radius + 0.5);
        const i = y * this.width + x;
        if ((this.flags[i] & FLAG_GLUON_LOCKED) !== 0) continue;

        const addedGPa = peakGPa * falloff;
        this.pressure[i] += addedGPa;

        if (addedGPa > 120) {
          this.temp[i] += addedGPa * 0.22;
        }

        const el = this.grid[i] as ElementId;
        const def = ELEMENTS[el];

        // Check for THERMONUCLEAR FUSION (>= 5000 GPa)
        if (this.pressure[i] >= 5000 && el !== ElementId.EMPTY && el !== ElementId.FUSION_PLASMA) {
          this.igniteThermonuclearFusion(x, y, sound);
          return;
        }

        // Check for Carbon -> Diamond synthesis under high pressure
        if (el === ElementId.CARBON && this.pressure[i] >= 800) {
          this.setElement(x, y, ElementId.DIAMOND, this.temp[i]);
          this.addReactionPopup(x, y, 'C → Diamond (800 GPa!)', '#b9f5ff');
          continue;
        }

        // Check Cryo-Brittle shatter! Crumble into falling granular rubble + frost plume
        const isCryo = (this.flags[i] & FLAG_CRYO_BRITTLE) !== 0 || this.temp[i] <= -110 || el === ElementId.CRYO_GLASS;
        if (isCryo && def.state === 'solid' && this.pressure[i] >= 28 && el !== ElementId.GLUON_BARRIER) {
          if (el === ElementId.ICE) {
            this.setElement(x, y, this.fastRand() < 0.55 ? ElementId.NITROGEN_GAS : ElementId.WATER, -5);
          } else if (this.fastRand() < 0.35) {
            this.setElement(x, y, ElementId.NITROGEN_GAS, -120);
          } else {
            const rubble =
              el === ElementId.STEEL || el === ElementId.CRYO_GLASS
                ? ElementId.RUST
                : def.pressureInto && ELEMENTS[def.pressureInto].state === 'powder'
                  ? def.pressureInto
                  : ElementId.SAND;
            this.setElement(x, y, rubble, this.temp[i]);
          }
          shatteredCryo = true;
          continue;
        }

        // Normal pressure fracture threshold
        if (def.pressureThresholdGPa && this.pressure[i] >= def.pressureThresholdGPa && def.pressureInto !== undefined) {
          this.setElement(x, y, def.pressureInto, this.temp[i]);
          this.addReactionPopup(x, y, `Fracture! (${Math.round(this.pressure[i])} GPa)`, '#ffd166');
        }
      }
    }

    if (shatteredCryo) {
      sound.playCryoShatter();
      this.addReactionPopup(Math.floor(cx), Math.floor(cy), 'CRYO-SHATTER!', '#72efdd');
    }
  }

  public igniteThermonuclearFusion(cx: number, cy: number, sound: SoundEngine): void {
    this.fusionTriggered = true;
    this.fusionCoords = { x: cx, y: cy };
    sound.playFusionIgnition();
    this.addReactionPopup(cx, cy, '☢ THERMONUCLEAR FUSION IGNITED! (17.6 MeV)', '#ffffff');

    const radius = 48;
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = cy + dy;
      if (y <= 2 || y >= this.height - 3) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        if (x <= 2 || x >= this.width - 3) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;

        const dist = Math.sqrt(d2);
        if (dist < 18) {
          this.setElement(x, y, ElementId.FUSION_PLASMA, 35000);
          this.pressure[y * this.width + x] = 9000;
        } else if (dist < 34) {
          this.setElement(
            x,
            y,
            this.fastRand() < 0.35 ? ElementId.NEUTRON : ElementId.QUARK_PLASMA,
            12000
          );
          this.pressure[y * this.width + x] = 3500;
        } else if (this.fastRand() < 0.6) {
          this.setElement(x, y, ElementId.PLASMA, 5500);
          this.pressure[y * this.width + x] = 1200;
        }
      }
    }
  }

  // Step active region around camera at 60 FPS
  public step(camCenterX: number, camCenterY: number, sound: SoundEngine): void {
    this.tickCount++;
    this.parity = (this.parity + 1) & 1;

    for (let i = this.reactionEvents.length - 1; i >= 0; i--) {
      this.reactionEvents[i].ttl--;
      this.reactionEvents[i].y -= 0.3;
      if (this.reactionEvents[i].ttl <= 0) {
        this.reactionEvents.splice(i, 1);
      }
    }

    // Active simulation window covers the visible viewport + margin
    const minX = Math.max(2, Math.floor(camCenterX - 250));
    const maxX = Math.min(this.width - 3, Math.ceil(camCenterX + 250));
    const minY = Math.max(2, Math.floor(camCenterY - 165));
    const maxY = Math.min(this.height - 3, Math.ceil(camCenterY + 165));

    const grid = this.grid;
    const flags = this.flags;
    const temp = this.temp;
    const pressure = this.pressure;
    const W = this.width;

    // Clear FLAG_UPDATED bit in active window
    for (let y = minY; y <= maxY; y++) {
      const rowOffset = y * W;
      for (let x = minX; x <= maxX; x++) {
        flags[rowOffset + x] &= ~FLAG_UPDATED;
      }
    }

    // Scan bottom-to-top so falling powders/liquids settle cleanly
    for (let y = maxY; y >= minY; y--) {
      const leftToRight = ((y + this.parity) & 1) === 0;
      const rowOffset = y * W;

      for (let stepX = minX; stepX <= maxX; stepX++) {
        const x = leftToRight ? stepX : maxX - (stepX - minX);
        const i = rowOffset + x;

        const el = grid[i] as ElementId;
        const p = pressure[i];

        // FAST-PATH 1: Empty air at ambient temperature and zero pressure
        if (el === ElementId.EMPTY) {
          if (p > 0.1) {
            pressure[i] = p * 0.9;
            if (pressure[i] < 0.1) pressure[i] = 0;
          }
          const t = temp[i];
          if (t > 23 || t < 21) {
            temp[i] = t + (22 - t) * 0.03;
          }
          continue;
        }

        const f = flags[i];
        if ((f & FLAG_UPDATED) !== 0) continue;

        if ((f & FLAG_TIME_STASIS) !== 0) {
          if (this.fastRand() < 0.004) flags[i] &= ~FLAG_TIME_STASIS;
          continue;
        }

        if (p > 0.1) {
          pressure[i] = p * 0.91;
          if (pressure[i] < 0.1) pressure[i] = 0;
        }

        if ((f & FLAG_QUANTUM_TUNNEL) !== 0 && this.fastRand() < 0.003) {
          flags[i] &= ~FLAG_QUANTUM_TUNNEL;
        }

        const def = ELEMENTS[el];

        // FAST-PATH 2: Static solid wall at near-ambient temperature with no time acceleration
        if (
          def.state === 'solid' &&
          (f & FLAG_TIME_ACCEL) === 0 &&
          p < 1 &&
          temp[i] > 5 &&
          temp[i] < 45
        ) {
          // Only sample 1 neighbor to check if an adjacent acid/liquid/hot pixel wants to react
          const dIdx = (this.tickCount + x * 3 + y * 7) & 3;
          const nx = x + (dIdx === 2 ? -1 : dIdx === 3 ? 1 : 0);
          const ny = y + (dIdx === 0 ? -1 : dIdx === 1 ? 1 : 0);
          const ni = ny * W + nx;
          const nel = grid[ni] as ElementId;
          if ((nel === el || nel === ElementId.EMPTY) && temp[ni] > 5 && temp[ni] < 45 && pressure[ni] < 1) {
            continue;
          }
        }

        const timeLoops = (f & FLAG_TIME_ACCEL) !== 0 ? 10 : 1;
        for (let tl = 0; tl < timeLoops; tl++) {
          this.updatePixelChemistryAndThermal(x, y, i, el, sound);
          if ((grid[i] as ElementId) !== el) break;
        }
        if ((flags[i] & FLAG_TIME_ACCEL) !== 0 && this.fastRand() < 0.015) {
          flags[i] &= ~FLAG_TIME_ACCEL;
        }

        const curEl = grid[i] as ElementId;
        if (curEl === ElementId.EMPTY || ELEMENTS[curEl].state === 'solid') continue;
        if ((flags[i] & FLAG_GLUON_LOCKED) !== 0) continue;

        this.updatePixelMotion(x, y, i, curEl);
      }
    }
  }

  private updatePixelChemistryAndThermal(
    x: number,
    y: number,
    i: number,
    el: ElementId,
    sound: SoundEngine
  ): void {
    const def = ELEMENTS[el];

    if (this.life[i] > 0) {
      this.life[i]--;
      if (this.life[i] === 0) {
        if (el === ElementId.FIRE) {
          this.setElement(x, y, this.fastRand() < 0.35 ? ElementId.SMOKE : ElementId.EMPTY, 140);
          return;
        } else if (el === ElementId.BURNING_THERMITE) {
          this.setElement(x, y, ElementId.MOLTEN_STEEL, 1950);
          return;
        } else if (el === ElementId.FUSION_PLASMA) {
          this.setElement(x, y, ElementId.PLASMA, 4500);
          return;
        } else if (
          el === ElementId.SMOKE ||
          el === ElementId.NITROGEN_GAS ||
          el === ElementId.STEAM ||
          el === ElementId.PLASMA ||
          el === ElementId.QUARK_PLASMA ||
          el === ElementId.NEUTRON ||
          el === ElementId.QUANTUM_FOAM
        ) {
          if (el === ElementId.STEAM && this.temp[i] < 95) {
            this.setElement(x, y, ElementId.WATER, 60);
          } else if (el === ElementId.NITROGEN_GAS) {
            this.setElement(x, y, ElementId.EMPTY, Math.min(22, this.temp[i] + 60));
          } else {
            this.setElement(x, y, ElementId.EMPTY, 25);
          }
          return;
        }
      }
    }

    const dIdx = (this.tickCount + x * 3 + y * 7) & 3;
    const nx = x + (dIdx === 2 ? -1 : dIdx === 3 ? 1 : 0);
    const ny = y + (dIdx === 0 ? -1 : dIdx === 1 ? 1 : 0);

    if (nx > 1 && nx < this.width - 2 && ny > 1 && ny < this.height - 2) {
      const ni = ny * this.width + nx;
      const nel = this.grid[ni] as ElementId;
      const ndef = ELEMENTS[nel];

      // 1. Thermal Conduction
      const tDiff = this.temp[ni] - this.temp[i];
      if (tDiff > 0.2 || tDiff < -0.2) {
        const cond = (def.thermalConductivity + ndef.thermalConductivity) * 0.18;
        const dt = tDiff * cond;
        this.temp[i] += dt;
        this.temp[ni] -= dt;
      }

      // 2. Pressure Equalization
      if (this.pressure[i] > this.pressure[ni] + 1) {
        const dp = (this.pressure[i] - this.pressure[ni]) * 0.25;
        this.pressure[i] -= dp;
        this.pressure[ni] += dp;
      }

      // 3. Pairwise Chemical & Nuclear Reactions
      if (nel !== ElementId.EMPTY && nel !== el) {
        this.checkChemicalReaction(x, y, i, el, nx, ny, ni, nel, sound);
        if ((this.grid[i] as ElementId) !== el) return;
      }
    }

    // 4. Spontaneous Radioactive Emission (Uranium-235 & Corium)
    if (el === ElementId.URANIUM || el === ElementId.CORIUM) {
      this.radiation[i] = def.radioactivity;
      this.temp[i] += 0.35;
      if (this.fastRand() < (el === ElementId.CORIUM ? 0.02 : 0.006)) {
        const rx = x + (this.fastCoin() ? -1 : 1);
        const ry = y + (this.fastCoin() ? -1 : 1);
        if (this.inBounds(rx, ry) && this.grid[ry * this.width + rx] === ElementId.EMPTY) {
          this.setElement(rx, ry, ElementId.NEUTRON, 600);
          sound.playGeigerClick();
        }
      }
    }

    // 5. Burning Thermite spawns dripping Molten Steel & intense heat
    if (el === ElementId.BURNING_THERMITE) {
      this.temp[i] = Math.max(this.temp[i], 2850);
      if (this.fastRand() < 0.08 && this.inBounds(x, y + 1)) {
        const below = this.grid[(y + 1) * this.width + x] as ElementId;
        if (below === ElementId.EMPTY) {
          this.setElement(x, y + 1, ElementId.MOLTEN_STEEL, 2200);
        }
      }
    }

    // 6. Cryogenic Embrittlement Check
    if (this.temp[i] <= -110 && (el === ElementId.STEEL || el === ElementId.CONCRETE || el === ElementId.STONE)) {
      this.flags[i] |= FLAG_CRYO_BRITTLE;
    } else if (this.temp[i] > -20) {
      this.flags[i] &= ~FLAG_CRYO_BRITTLE;
    }

    // 7. Phase Transitions (Melting / Boiling / Freezing)
    const curTemp = this.temp[i];
    if (el === ElementId.NITROGEN_GAS && curTemp >= -35) {
      // Cold nitrogen vapor warms into ambient room air (78% N2) without a violent boil pressure spike
      this.setElement(x, y, ElementId.EMPTY, curTemp);
      return;
    }
    if (def.meltPoint !== undefined && curTemp >= def.meltPoint && def.meltInto !== undefined) {
      this.setElement(x, y, def.meltInto, curTemp);
      if (el === ElementId.THERMITE) {
        this.addReactionPopup(x, y, 'Fe₂O₃+2Al → 2850°C THERMITE!', '#ff9f1c');
        sound.playSizzle();
      }
      return;
    }
    if (def.boilPoint !== undefined && curTemp >= def.boilPoint && def.boilInto !== undefined) {
      this.setElement(x, y, def.boilInto, curTemp);
      this.pressure[i] += 18;
      return;
    }
    if (def.freezePoint !== undefined && curTemp <= def.freezePoint && def.freezeInto !== undefined) {
      this.setElement(x, y, def.freezeInto, curTemp);
      return;
    }

    // 8. Unanchored mid-air Ice crystals (e.g., frozen steam/mist droplets) fall under gravity instead of floating
    if (el === ElementId.ICE && y < this.height - 2) {
      const belowIdx = (y + 1) * this.width + x;
      const belowEl = this.grid[belowIdx] as ElementId;
      const belowState = ELEMENTS[belowEl].state;
      if (belowEl === ElementId.EMPTY || belowState === 'gas') {
        let solidNeighbors = 0;
        if (x > 1 && ELEMENTS[this.grid[i - 1] as ElementId].state === 'solid') solidNeighbors++;
        if (x < this.width - 2 && ELEMENTS[this.grid[i + 1] as ElementId].state === 'solid') solidNeighbors++;
        if (y > 1 && ELEMENTS[this.grid[i - this.width] as ElementId].state === 'solid') solidNeighbors++;
        if (solidNeighbors < 2) {
          this.swap(i, belowIdx);
        }
      }
    }
  }

  private checkChemicalReaction(
    x: number,
    y: number,
    i: number,
    el: ElementId,
    nx: number,
    ny: number,
    ni: number,
    nel: ElementId,
    sound: SoundEngine
  ): void {
    // A. METALLIC SODIUM + WATER / ACID -> VIOLENT EXOTHERMIC EXPLOSION!
    if (
      el === ElementId.SODIUM &&
      (nel === ElementId.WATER ||
        nel === ElementId.SALT_WATER ||
        nel === ElementId.HEAVY_WATER ||
        nel === ElementId.ACID)
    ) {
      this.setElement(x, y, ElementId.FIRE, 1350);
      this.setElement(nx, ny, this.fastCoin() ? ElementId.HYDROGEN : ElementId.ALKALI, 850);
      this.addReactionPopup(x, y, '2Na + 2H₂O → 2NaOH + H₂ + BOOM!', '#ffbe0b');
      sound.playExplosion(1.1);
      this.applyPressureImpulse(x, y, 18, 260, sound);
      return;
    }

    // B. SULFURIC ACID (H2SO4) + ALKALI (NaOH) -> NEUTRALIZATION (NaCl + H2O)!
    if (
      (el === ElementId.ACID && nel === ElementId.ALKALI) ||
      (el === ElementId.ALKALI && nel === ElementId.ACID)
    ) {
      this.setElement(x, y, ElementId.SALT_WATER, 65);
      this.setElement(nx, ny, this.fastRand() < 0.35 ? ElementId.STEAM : ElementId.SALT, 95);
      this.addReactionPopup(x, y, 'H₂SO₄ + 2NaOH → Salt Water (Neutralized!)', '#a8dadc');
      sound.playSizzle();
      return;
    }

    // C. SULFURIC ACID + CORRODIBLE MATTER -> DISSOLUTION + EXOTHERMIC HEAT
    if (el === ElementId.ACID) {
      const ndef = ELEMENTS[nel];
      if (ndef.corrodible && ndef.corrodible > 0 && (this.flags[ni] & FLAG_GLUON_LOCKED) === 0) {
        const timeBoost = (this.flags[i] & FLAG_TIME_ACCEL) !== 0 ? 8 : 1;
        if (this.fastRand() < ndef.corrodible * 0.09 * timeBoost) {
          this.setElement(nx, ny, this.fastRand() < 0.4 ? ElementId.TOXIC_GAS : ElementId.EMPTY, this.temp[i] + 55);
          if (this.fastRand() < 0.45) {
            this.setElement(x, y, ElementId.TOXIC_GAS, 95);
          }
          sound.playSizzle();
          this.addReactionPopup(x, y, `Acid Dissolving ${ndef.symbol}!`, '#80ed99');
          return;
        }
      }
    }

    // D. STEEL + WATER / SALT_WATER / OXYGEN -> RUST (Fe2O3), accelerated massively by Time Beam!
    if (
      el === ElementId.STEEL &&
      (nel === ElementId.WATER || nel === ElementId.SALT_WATER || nel === ElementId.STEAM)
    ) {
      const isTimeAccel =
        (this.flags[i] & FLAG_TIME_ACCEL) !== 0 || (this.flags[ni] & FLAG_TIME_ACCEL) !== 0;
      const rustChance = (nel === ElementId.SALT_WATER ? 0.015 : 0.002) * (isTimeAccel ? 35 : 1);
      if (this.fastRand() < rustChance) {
        this.setElement(x, y, ElementId.RUST, this.temp[i] + 10);
        this.addReactionPopup(x, y, '4Fe + 3O₂ → 2Fe₂O₃ (Rusted!)', '#e07a5f');
        return;
      }
    }

    // E. LIQUID NITROGEN + WATER/LAVA/STEEL -> RAPID CRYO FREEZE
    if (el === ElementId.LIQUID_NITROGEN) {
      this.temp[ni] -= 65;
      if (nel === ElementId.STEEL && this.temp[ni] < -110) {
        this.flags[ni] |= FLAG_CRYO_BRITTLE;
      }
    }

    // F. NEUTRON + URANIUM-235 -> NUCLEAR FISSION CHAIN REACTION!
    if (el === ElementId.NEUTRON) {
      if (nel === ElementId.LEAD || nel === ElementId.MERCURY) {
        this.setElement(x, y, ElementId.EMPTY, this.temp[ni] + 15);
        return;
      }
      if (nel === ElementId.URANIUM) {
        this.setElement(nx, ny, ElementId.CORIUM, 2400);
        this.setElement(x, y, ElementId.NEUTRON, 900, 75);
        for (let k = 0; k < 2; k++) {
          const sx = nx + (this.fastCoin() ? -1 : 1);
          const sy = ny + (this.fastCoin() ? -1 : 1);
          if (this.inBounds(sx, sy) && this.grid[sy * this.width + sx] === ElementId.EMPTY) {
            this.setElement(sx, sy, ElementId.NEUTRON, 900, 75);
          }
        }
        this.applyPressureImpulse(nx, ny, 12, 190, sound);
        sound.playGeigerClick();
        this.addReactionPopup(nx, ny, '²³⁵U + n⁰ → FISSION! (200 MeV)', '#70e000');
        return;
      }
    }

    // G. FLAMMABLE GAS/LIQUID (HYDROGEN / OIL / WOOD) + FIRE/PLASMA/LAVA
    if (
      ELEMENTS[el].flammable &&
      (nel === ElementId.FIRE ||
        nel === ElementId.PLASMA ||
        nel === ElementId.LAVA ||
        nel === ElementId.BURNING_THERMITE ||
        nel === ElementId.MOLTEN_STEEL ||
        this.temp[i] > 320)
    ) {
      const isHydrogen = el === ElementId.HYDROGEN || el === ElementId.DEUTERIUM;
      this.setElement(x, y, ElementId.FIRE, isHydrogen ? 1400 : 950);
      if (isHydrogen) {
        this.applyPressureImpulse(x, y, 12, 160, sound);
        sound.playExplosion(0.6);
      }
      return;
    }

    // H. QUARK-GLUON PLASMA or FUSION PLASMA dissolves adjacent barriers
    if (el === ElementId.QUARK_PLASMA || el === ElementId.FUSION_PLASMA) {
      if (nel !== ElementId.EMPTY && nel !== ElementId.FUSION_PLASMA && nel !== ElementId.QUARK_PLASMA) {
        if (this.fastRand() < 0.25) {
          this.setElement(nx, ny, ElementId.PLASMA, 4000);
        }
      }
    }

    // I. QUANTUM FOAM spreads Quantum Tunneling superposition to adjacent walls!
    if (el === ElementId.QUANTUM_FOAM && ELEMENTS[nel].state === 'solid') {
      this.flags[ni] |= FLAG_QUANTUM_TUNNEL;
    }
  }

  private updatePixelMotion(x: number, y: number, i: number, el: ElementId): void {
    const def = ELEMENTS[el];
    const state = def.state;

    if (state === 'solid' || state === 'empty') return;

    if (el === ElementId.NEUTRON) {
      const dx = ((this.rngState >>> 3) % 3) - 1;
      const dy = ((this.rngState >>> 7) % 3) - 1;
      const nx = x + dx;
      const ny = y + dy;
      if (this.inBounds(nx, ny)) {
        const ni = ny * this.width + nx;
        if (this.grid[ni] === ElementId.EMPTY) {
          this.swap(i, ni);
        }
      }
      return;
    }

    if (state === 'powder') {
      const by = y + 1;
      if (by >= this.height - 1) return;
      const bi = by * this.width + x;
      if (this.canDisplace(i, def.density, bi)) {
        this.swap(i, bi);
        return;
      }
      const dir = this.fastCoin() ? -1 : 1;
      const b1x = x + dir;
      const b2x = x - dir;
      if (b1x > 1 && b1x < this.width - 2 && this.canDisplace(i, def.density, by * this.width + b1x)) {
        this.swap(i, by * this.width + b1x);
        return;
      }
      if (b2x > 1 && b2x < this.width - 2 && this.canDisplace(i, def.density, by * this.width + b2x)) {
        this.swap(i, by * this.width + b2x);
        return;
      }
      return;
    }

    if (state === 'liquid') {
      const by = y + 1;
      if (by < this.height - 1) {
        const bi = by * this.width + x;
        if (this.canDisplace(i, def.density, bi)) {
          this.swap(i, bi);
          return;
        }
        const dir = this.fastCoin() ? -1 : 1;
        const b1x = x + dir;
        const b2x = x - dir;
        if (b1x > 1 && b1x < this.width - 2 && this.canDisplace(i, def.density, by * this.width + b1x)) {
          this.swap(i, by * this.width + b1x);
          return;
        }
        if (b2x > 1 && b2x < this.width - 2 && this.canDisplace(i, def.density, by * this.width + b2x)) {
          this.swap(i, by * this.width + b2x);
          return;
        }
      }
      const hDir = this.fastCoin() ? -1 : 1;
      for (let step = 1; step <= 4; step++) {
        const hx = x + hDir * step;
        if (hx <= 1 || hx >= this.width - 2) break;
        const hi = y * this.width + hx;
        if (this.canDisplace(i, def.density, hi)) {
          this.swap(i, hi);
          return;
        } else if (this.grid[hi] !== ElementId.EMPTY) {
          break;
        }
      }
      return;
    }

    if (state === 'gas' || state === 'energy') {
      const uy = y - 1;
      const dir = this.fastCoin() ? -1 : 1;
      if (uy > 1 && this.fastRand() < 0.75) {
        const tx = x + (this.fastCoin() ? dir : 0);
        if (tx > 1 && tx < this.width - 2) {
          const ui = uy * this.width + tx;
          const targetEl = this.grid[ui] as ElementId;
          if (targetEl === ElementId.EMPTY || (ELEMENTS[targetEl].state === 'gas' && ELEMENTS[targetEl].density > def.density)) {
            this.swap(i, ui);
            return;
          }
        }
      }
      const sx = x + dir;
      if (sx > 1 && sx < this.width - 2) {
        const si = y * this.width + sx;
        if (this.grid[si] === ElementId.EMPTY) {
          this.swap(i, si);
        }
      }
    }
  }

  private canDisplace(sourceIdx: number, sourceDensity: number, targetIdx: number): boolean {
    if ((this.flags[targetIdx] & (FLAG_GLUON_LOCKED | FLAG_TIME_STASIS)) !== 0) return false;
    const targetEl = this.grid[targetIdx] as ElementId;
    if (targetEl === ElementId.EMPTY) return true;
    const targetDef = ELEMENTS[targetEl];
    if (targetDef.state === 'solid' || targetDef.state === 'powder') return false;
    if (targetDef.state === 'liquid' || targetDef.state === 'gas') {
      return sourceDensity > targetDef.density * 1.05;
    }
    return false;
  }

  public applyThermalBrush(cx: number, cy: number, radius: number, deltaTemp: number, spawnEl?: ElementId): void {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = Math.floor(cy + dy);
      if (y <= 1 || y >= this.height - 2) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = Math.floor(cx + dx);
        if (x <= 1 || x >= this.width - 2) continue;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * this.width + x;
        this.temp[i] = Math.max(-270, Math.min(35000, this.temp[i] + deltaTemp));
        if (deltaTemp < -40 && (this.grid[i] === ElementId.STEEL || this.grid[i] === ElementId.CONCRETE)) {
          if (this.temp[i] <= -110) {
            this.flags[i] |= FLAG_CRYO_BRITTLE;
          }
        }
        if (spawnEl !== undefined && this.grid[i] === ElementId.EMPTY && this.fastRand() < 0.35) {
          this.setElement(x, y, spawnEl, this.temp[i]);
        }
      }
    }
  }

  public applyWeakForceTransmutation(cx: number, cy: number, radius: number, sound: SoundEngine): void {
    const r2 = radius * radius;
    let transmuted = false;
    let sampleSymbol = '';
    let targetSymbol = '';

    for (let dy = -radius; dy <= radius; dy++) {
      const y = Math.floor(cy + dy);
      if (y <= 1 || y >= this.height - 2) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = Math.floor(cx + dx);
        if (x <= 1 || x >= this.width - 2) continue;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * this.width + x;
        const el = this.grid[i] as ElementId;
        if (el === ElementId.EMPTY) continue;

        const def = ELEMENTS[el];
        if (def.weakDecayInto !== undefined && this.fastRand() < 0.45) {
          sampleSymbol = def.symbol;
          targetSymbol = ELEMENTS[def.weakDecayInto].symbol;
          this.setElement(x, y, def.weakDecayInto, this.temp[i]);
          transmuted = true;
        }
      }
    }
    if (transmuted) {
      sound.playQuantumBeam(440);
      this.addReactionPopup(
        Math.floor(cx),
        Math.floor(cy),
        `Weak Force β-Decay: ${sampleSymbol} → ${targetSymbol}!`,
        '#f72585'
      );
    }
  }

  public applyStrongForceGluon(
    cx: number,
    cy: number,
    radius: number,
    unbindMode: boolean,
    sound: SoundEngine
  ): void {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = Math.floor(cy + dy);
      if (y <= 1 || y >= this.height - 2) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = Math.floor(cx + dx);
        if (x <= 1 || x >= this.width - 2) continue;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * this.width + x;
        const el = this.grid[i] as ElementId;

        if (unbindMode) {
          if (el !== ElementId.EMPTY && this.fastRand() < 0.55) {
            this.flags[i] &= ~FLAG_GLUON_LOCKED;
            this.setElement(
              x,
              y,
              this.fastRand() < 0.45 ? ElementId.QUARK_PLASMA : ElementId.HYDROGEN,
              1800
            );
          }
        } else {
          if (el === ElementId.EMPTY) {
            this.setElement(x, y, ElementId.GLUON_BARRIER, 22);
            this.flags[i] |= FLAG_GLUON_LOCKED;
          } else {
            this.flags[i] |= FLAG_GLUON_LOCKED;
          }
        }
      }
    }
    sound.playQuantumBeam(unbindMode ? 310 : 680);
    this.addReactionPopup(
      Math.floor(cx),
      Math.floor(cy),
      unbindMode ? 'Strong Force Unbound → Quark Plasma!' : 'Strong Force Gluon-Locked!',
      '#e0aaff'
    );
  }

  public applyQuantumTunneling(cx: number, cy: number, radius: number, sound: SoundEngine): void {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = Math.floor(cy + dy);
      if (y <= 1 || y >= this.height - 2) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = Math.floor(cx + dx);
        if (x <= 1 || x >= this.width - 2) continue;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * this.width + x;
        if (this.grid[i] === ElementId.EMPTY) {
          if (this.fastRand() < 0.25) {
            this.setElement(x, y, ElementId.QUANTUM_FOAM, 22);
          }
        } else {
          this.flags[i] |= FLAG_QUANTUM_TUNNEL;
        }
      }
    }
    sound.playQuantumBeam(760);
    this.addReactionPopup(Math.floor(cx), Math.floor(cy), '|Ψ⟩ Quantum Tunneling Active!', '#9d4edd');
  }

  public applyTimeField(
    cx: number,
    cy: number,
    radius: number,
    accelerate: boolean,
    sound: SoundEngine
  ): void {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = Math.floor(cy + dy);
      if (y <= 1 || y >= this.height - 2) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = Math.floor(cx + dx);
        if (x <= 1 || x >= this.width - 2) continue;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * this.width + x;
        const el = this.grid[i] as ElementId;

        if (el === ElementId.CHRONITON_CRYSTAL && accelerate) {
          this.setElement(x, y, ElementId.QUANTUM_FOAM, 25);
          continue;
        }

        if (accelerate) {
          this.flags[i] &= ~FLAG_TIME_STASIS;
          this.flags[i] |= FLAG_TIME_ACCEL;
          if (el === ElementId.URANIUM && this.fastRand() < 0.18) {
            this.setElement(x, y, ElementId.LEAD, this.temp[i]);
          }
        } else {
          this.flags[i] &= ~FLAG_TIME_ACCEL;
          this.flags[i] |= FLAG_TIME_STASIS;
        }
      }
    }
    sound.playQuantumBeam(accelerate ? 880 : 240);
    this.addReactionPopup(
      Math.floor(cx),
      Math.floor(cy),
      accelerate ? '⏩ Chroniton Time +3000% (Entropy!)' : '⏸ Temporal Stasis Field!',
      '#4cc9f0'
    );
  }
}
