import { ElementId, ELEMENTS, FLAG_QUANTUM_TUNNEL } from '../chemistry/elements';
import { WorldGrid } from '../simulation/world';
import { Projectile } from './tools';
import { SoundEngine } from '../audio/soundEngine';
import { GamepadState } from '../input/gamepadManager';

export class Player {
  public x: number;
  public y: number;
  public vx: number = 0;
  public vy: number = 0;
  public readonly width: number = 10;
  public readonly height: number = 18;

  public hp: number = 100;
  public maxHp: number = 100;
  public jetpackFuel: number = 100;
  public maxJetpack: number = 100;
  public oxygen: number = 100;
  public maxOxygen: number = 100;
  public submerged: boolean = false;
  public radiationDose: number = 0; // 0..100
  public bodyTemp: number = 37; // Celsius

  public facing: 1 | -1 = 1;
  public grounded: boolean = false;
  public carryingBibbi: boolean = false;
  public quantumPhaseTimer: number = 0; // >0 means player can walk through any solid wall!
  public fireCooldown: number = 0;
  public selectedTool: number = 1; // 1..9
  public gravityScale: number = 1.0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  public createSnapshot() {
    return {
      x: this.x, y: this.y, vx: this.vx, vy: this.vy,
      hp: this.hp, maxHp: this.maxHp,
      jetpackFuel: this.jetpackFuel, maxJetpack: this.maxJetpack,
      oxygen: this.oxygen, maxOxygen: this.maxOxygen,
      submerged: this.submerged, radiationDose: this.radiationDose, bodyTemp: this.bodyTemp,
      facing: this.facing, grounded: this.grounded,
      carryingBibbi: this.carryingBibbi,
      quantumPhaseTimer: this.quantumPhaseTimer, fireCooldown: this.fireCooldown,
      selectedTool: this.selectedTool, gravityScale: this.gravityScale,
    };
  }

  public restoreSnapshot(snapshot: ReturnType<Player['createSnapshot']>): void {
    Object.assign(this, snapshot);
  }

  public reset(x: number, y: number, gravityScale: number): void {
    const fresh = new Player(x, y);
    fresh.gravityScale = gravityScale;
    fresh.selectedTool = this.selectedTool;
    this.restoreSnapshot(fresh.createSnapshot());
  }

  public activateQuantumDash(sound: SoundEngine): void {
    if (this.hp <= 0) return;
    if (this.quantumPhaseTimer <= 10) {
      this.quantumPhaseTimer = 150; // 2.5 seconds of pure Quantum Tunneling!
      sound.playQuantumBeam(660);
    }
  }

  public update(
    keys: Set<string>,
    world: WorldGrid,
    sound: SoundEngine,
    gp?: GamepadState
  ): void {
    if (this.hp <= 0) return;
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.quantumPhaseTimer > 0) this.quantumPhaseTimer--;

    const kbLeft = keys.has('KeyA') || keys.has('ArrowLeft');
    const kbRight = keys.has('KeyD') || keys.has('ArrowRight');
    const kbUp = keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space');
    const kbDown = keys.has('KeyS') || keys.has('ArrowDown');

    const gpX = gp && gp.connected ? gp.moveX : 0;
    const gpY = gp && gp.connected ? gp.moveY : 0;

    // Carrying Bibbi on your back adds mass: slightly lower sprint speed, heavier jetpack load, faster fuel burn
    const accel = this.carryingBibbi ? 0.45 : 0.54;
    const maxSpeed = this.carryingBibbi ? 2.68 : 3.2;

    if (kbLeft || gpX < -0.1) {
      const intensity = kbLeft ? 1 : Math.min(1, Math.abs(gpX));
      this.vx = Math.max(-maxSpeed * intensity, this.vx - accel * intensity);
      this.facing = -1;
    } else if (kbRight || gpX > 0.1) {
      const intensity = kbRight ? 1 : Math.min(1, Math.abs(gpX));
      this.vx = Math.min(maxSpeed * intensity, this.vx + accel * intensity);
      this.facing = 1;
    } else {
      this.vx *= 0.72;
      if (Math.abs(this.vx) < 0.08) this.vx = 0;
    }

    // Vertical movement: Up on Left Thumbstick (or A button / W / Space) directly fires Jetpack!
    const stickJetpackIntensity = gpY < -0.2 ? Math.min(1, Math.abs(gpY)) : 0;
    const moveUp = kbUp || (gp && gp.connected && (gp.jumpHeld || stickJetpackIntensity > 0));
    const moveDown = kbDown || (gp && gp.connected && (gp.diveHeld || gpY > 0.35));

    if (moveUp) {
      const thrustScale = stickJetpackIntensity > 0 ? Math.max(0.55, stickJetpackIntensity) : 1.0;
      const liftoffVy = this.carryingBibbi ? -2.85 : -3.4;
      const maxClimbVy = this.carryingBibbi ? -2.35 : -3.3;
      const jetThrust = this.carryingBibbi ? 0.35 : 0.48;
      const fuelBurn = this.carryingBibbi ? 0.68 : 0.48;

      if (this.grounded) {
        // Immediate liftoff into jetpack flight when pushing Up on Left Thumbstick or pressing Jump!
        this.vy = liftoffVy * thrustScale;
        this.grounded = false;
        sound.playJetpackThrust();
      } else if (this.jetpackFuel > 0) {
        this.vy = Math.max(maxClimbVy * thrustScale, this.vy - jetThrust * thrustScale);
        this.jetpackFuel = Math.max(0, this.jetpackFuel - fuelBurn * thrustScale);
        sound.playJetpackThrust();
        // Spawn tiny exhaust spark occasionally
        if (Math.random() < 0.45) {
          const ex = Math.floor(this.x);
          const ey = Math.floor(this.y + this.height / 2 + 1);
          if (world.inBounds(ex, ey) && world.getElement(ex, ey) === ElementId.EMPTY) {
            world.setElement(ex, ey, ElementId.STEAM, 140, 12);
          }
        }
      }
    } else {
      this.jetpackFuel = Math.min(
        this.maxJetpack,
        this.jetpackFuel + (this.grounded ? 1.8 : this.carryingBibbi ? 0.42 : 0.65)
      );
      if (this.grounded && Math.abs(this.vx) > 0.7) {
        sound.playFootstep(false);
      }
    }

    if (moveDown) {
      this.vy = Math.min(4.6, this.vy + 0.42);
      // Clear loose powder directly below feet when pressing Down so you can dig/drop smoothly
      const fx = Math.floor(this.x);
      const fy = Math.floor(this.y + this.height / 2 + 1);
      for (let dx = -1; dx <= 1; dx++) {
        if (world.inBounds(fx + dx, fy) && ELEMENTS[world.getElement(fx + dx, fy)].state === 'powder') {
          world.setElement(fx + dx, fy, ElementId.EMPTY);
        }
      }
    }

    // Gravity (scaled by environment and increased by Bibbi's mass when piggybacking!)
    const massMultiplier = this.carryingBibbi ? 1.28 : 1.0;
    this.vy = Math.min(
      4.6 * this.gravityScale * massMultiplier,
      this.vy + 0.21 * this.gravityScale * massMultiplier
    );

    const ignoreSolids = this.quantumPhaseTimer > 0;

    // Horizontal collision & Terraria-style 1-6 pixel auto-step + wading through loose powder/frost
    const nextX = this.x + this.vx;
    if (!this.checkCollision(nextX, this.y, world, ignoreSolids)) {
      this.x = nextX;
    } else {
      // Try stepping up 1 to 6 pixels (equivalent to 3 old fat-pixels)
      let stepped = false;
      for (let stepY = 1; stepY <= 6; stepY++) {
        if (!this.checkCollision(nextX, this.y - stepY, world, ignoreSolids)) {
          this.x = nextX;
          this.y -= stepY;
          stepped = true;
          break;
        }
      }
      if (!stepped) {
        // Check if blocked only by loose granular powder (sand, rust, salt) or 1-2 stray frost specks
        if (this.canWadeThroughLooseMatter(nextX, this.y, world)) {
          this.displaceLooseMatter(nextX, this.y, Math.sign(this.vx) || this.facing, world);
          this.vx *= 0.82;
          this.x = this.x + this.vx;
        } else {
          this.vx = 0;
        }
      }
    }

    // Vertical collision
    const nextY = this.y + this.vy;
    if (!this.checkCollision(this.x, nextY, world, ignoreSolids)) {
      this.y = nextY;
      this.grounded = false;
    } else if (this.vy < 0 && this.canWadeThroughLooseMatter(this.x, nextY, world)) {
      // Push through loose powder or stray 1-2px mid-air ice crystals when jetpacking upward
      this.displaceLooseMatter(this.x, nextY, this.facing, world);
      this.vy *= 0.85;
      this.y = this.y + this.vy;
      this.grounded = false;
    } else {
      if (this.vy > 0) {
        this.grounded = true;
      }
      this.vy = 0;
    }

    // Clamp to world boundaries
    this.x = Math.max(16, Math.min(world.width - 16, this.x));
    this.y = Math.max(16, Math.min(world.height - 16, this.y));

    // If player ends up inside solid rock after Quantum Tunneling wears off, gently displace upward or activate brief tunnel
    if (!ignoreSolids && this.checkCollision(this.x, this.y, world, false)) {
      if (this.canWadeThroughLooseMatter(this.x, this.y, world)) {
        this.displaceLooseMatter(this.x, this.y, this.facing, world);
      } else {
        const cx = Math.floor(this.x);
        const cy = Math.floor(this.y);
        if (world.inBounds(cx, cy)) {
          world.flags[world.idx(cx, cy)] |= FLAG_QUANTUM_TUNNEL;
        }
        this.y -= 1.0;
      }
    }

    // Environmental hazard & alchemy interactions with player's Hazmat Suit
    this.sampleEnvironment(world, sound);
  }

  private checkCollision(
    cx: number,
    cy: number,
    world: WorldGrid,
    ignoreSolids: boolean
  ): boolean {
    if (ignoreSolids) return false;
    const halfW = Math.floor(this.width / 2);
    const halfH = Math.floor(this.height / 2);

    for (let py = Math.floor(cy - halfH); py <= Math.floor(cy + halfH); py++) {
      for (let px = Math.floor(cx - halfW); px <= Math.floor(cx + halfW); px++) {
        if (world.isSolidForEntity(px, py, false)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true if the player's hitbox at (cx, cy) has NO structural solids (except at most 2
   * isolated mid-air ICE specks), meaning the obstacle is just loose granular powder/frost.
   */
  private canWadeThroughLooseMatter(cx: number, cy: number, world: WorldGrid): boolean {
    const halfW = Math.floor(this.width / 2);
    const halfH = Math.floor(this.height / 2);
    let iceSpecks = 0;

    for (let py = Math.floor(cy - halfH); py <= Math.floor(cy + halfH); py++) {
      for (let px = Math.floor(cx - halfW); px <= Math.floor(cx + halfW); px++) {
        if (!world.inBounds(px, py)) return false;
        const i = world.idx(px, py);
        if ((world.flags[i] & FLAG_QUANTUM_TUNNEL) !== 0) continue;
        const el = world.grid[i] as ElementId;
        const state = ELEMENTS[el].state;
        if (state === 'solid') {
          if (el === ElementId.ICE) {
            iceSpecks++;
            if (iceSpecks > 2) return false;
          } else {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Pushes loose powder grains aside/upward as the player wades through a pile, and crunches
   * any isolated 1-2px mid-air ICE specks.
   */
  private displaceLooseMatter(cx: number, cy: number, dir: number, world: WorldGrid): void {
    const halfW = Math.floor(this.width / 2);
    const halfH = Math.floor(this.height / 2);
    const pushDir = dir >= 0 ? 1 : -1;

    for (let py = Math.floor(cy - halfH); py <= Math.floor(cy + halfH); py++) {
      for (let px = Math.floor(cx - halfW); px <= Math.floor(cx + halfW); px++) {
        if (!world.inBounds(px, py)) continue;
        const el = world.getElement(px, py);
        const state = ELEMENTS[el].state;
        if (el === ElementId.ICE) {
          world.setElement(px, py, ElementId.WATER, 2);
        } else if (state === 'powder') {
          const i = world.idx(px, py);
          // Try kicking the grain forward & slightly up in the direction of movement
          let moved = false;
          for (let step = 1; step <= 4; step++) {
            const tx = px + pushDir * (halfW + step);
            const ty = py - (step & 1);
            if (world.inBounds(tx, ty)) {
              const targetEl = world.getElement(tx, ty);
              const targetState = ELEMENTS[targetEl].state;
              if (targetEl === ElementId.EMPTY || targetState === 'gas' || targetState === 'liquid') {
                world.swap(i, world.idx(tx, ty));
                moved = true;
                break;
              }
            }
          }
          if (!moved) {
            world.setElement(px, py, ElementId.EMPTY);
          }
        }
      }
    }
  }

  private sampleEnvironment(world: WorldGrid, sound: SoundEngine): void {
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y);
    let maxTemp = 22;
    let minTemp = 22;
    let radSum = 0;
    let maxAcidConc = 0;
    let inBioGel = false;
    let inFusion = false;

    for (let dy = -8; dy <= 8; dy += 2) {
      for (let dx = -4; dx <= 4; dx += 2) {
        const px = cx + dx;
        const py = cy + dy;
        if (!world.inBounds(px, py)) continue;
        const i = world.idx(px, py);
        const el = world.grid[i] as ElementId;
        const rawT = world.temp[i];
        const t =
          el === ElementId.EMPTY || el === ElementId.SMOKE
            ? 22 + (rawT - 22) * 0.15
            : rawT;
        if (t > maxTemp) maxTemp = t;
        if (t < minTemp) minTemp = t;
        radSum += world.radiation[i];

        if (el === ElementId.ACID) {
          const conc = world.getConcentration(i);
          if (conc > maxAcidConc) maxAcidConc = conc;
        }
        if (el === ElementId.BIO_GEL) inBioGel = true;
        if (el === ElementId.FUSION_PLASMA) inFusion = true;
      }
    }

    // Check if helmet area (around cy - 4) is submerged in liquid or suffocating gas, or in Space Station / Vacuum!
    let helmetWetOrGasCount = 0;
    let helmetSamples = 0;
    for (let dy = -6; dy <= -2; dy += 2) {
      for (let dx = -2; dx <= 2; dx += 2) {
        const px = cx + dx;
        const py = cy + dy;
        if (!world.inBounds(px, py)) continue;
        helmetSamples++;
        const el = world.getElement(px, py);
        const st = ELEMENTS[el].state;
        if (st === 'liquid' || st === 'gas') {
          helmetWetOrGasCount++;
        }
      }
    }
    this.submerged = helmetSamples > 0 && helmetWetOrGasCount >= Math.ceil(helmetSamples * 0.5);

    // Check if on Orbital Space Station (0.45G) or standing in hard space vacuum (bgGrid === 14)
    const centerIdx = world.inBounds(cx, cy) ? world.idx(cx, cy) : 0;
    const inSpaceVacuum = world.inBounds(cx, cy) && world.bgGrid[centerIdx] === 14;
    const onSpaceStation = this.gravityScale < 0.8;

    // Level Oxygen (O2) Reserve Depletion:
    // - Enough O2 (~140 seconds) for a full run through the Space Station
    // - Depletes faster when submerged underwater or out in hard vacuum
    // - Does NOT auto-regenerate in normal air (finite level supply), except in oxygenated Bio-Gel vats!
    if (inBioGel) {
      this.oxygen = Math.min(this.maxOxygen, this.oxygen + 0.14);
    } else if (this.submerged || inSpaceVacuum) {
      this.oxygen = Math.max(0, this.oxygen - 0.018);
      if (this.submerged) {
        // Gentle fluid drag on player movement when submerged
        this.vx *= 0.92;
        this.vy *= 0.94;
      }
    } else if (onSpaceStation) {
      this.oxygen = Math.max(0, this.oxygen - 0.011);
    }

    // Suffocation damage if Level O2 Tank hits 0 while submerged or in space!
    if (this.oxygen <= 0 && (this.submerged || onSpaceStation || inSpaceVacuum)) {
      this.hp = Math.max(0, this.hp - 0.22);
      sound.playGeigerClick();
    }

    this.bodyTemp += ((maxTemp > 60 ? maxTemp : minTemp < 0 ? minTemp : 37) - this.bodyTemp) * 0.05;

    if (inFusion) {
      this.hp = Math.max(0, this.hp - 1.8);
    } else if (maxAcidConc > 0) {
      this.hp = Math.max(0, this.hp - 0.22 * (maxAcidConc / 100));
      sound.playSizzle();
    } else if (maxTemp > 450) {
      this.hp = Math.max(0, this.hp - 0.18);
    }

    if (radSum > 2.0) {
      this.radiationDose = Math.min(100, this.radiationDose + radSum * 0.012);
      sound.playGeigerClick();
      if (this.radiationDose > 60) {
        this.hp = Math.max(0, this.hp - 0.12);
      }
    } else {
      this.radiationDose = Math.max(0, this.radiationDose - 0.15);
    }

    if (inBioGel) {
      this.hp = Math.min(this.maxHp, this.hp + 0.6);
      this.radiationDose = Math.max(0, this.radiationDose - 0.8);
    } else if (maxAcidConc === 0 && maxTemp <= 150 && radSum <= 1.0 && this.hp > 0 && (this.oxygen > 0 || (!this.submerged && !onSpaceStation))) {
      // Slow suit self-repair nano-gel
      this.hp = Math.min(this.maxHp, this.hp + 0.03);
    }
  }

  public fireTool(
    targetX: number,
    targetY: number,
    secondary: boolean,
    projectiles: Projectile[],
    _world: WorldGrid,
    sound: SoundEngine
  ): void {
    if (this.hp <= 0 || this.fireCooldown > 0) return;

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    this.facing = nx >= 0 ? 1 : -1;

    const spawnX = this.x + nx * 8;
    const spawnY = this.y + ny * 8;

    switch (this.selectedTool) {
      case 1: // Graviton Pressure Cannon
        this.fireCooldown = secondary ? 14 : 7;
        sound.playKineticShot(secondary);
        projectiles.push({
          x: spawnX,
          y: spawnY,
          vx: nx * (secondary ? 7.0 : 8.8),
          vy: ny * (secondary ? 7.0 : 8.8),
          type: secondary ? 'implosion' : 'kinetic',
          color: secondary ? '#ffffff' : '#ffd166',
          radius: secondary ? 16 : 13,
          ttl: 85,
          fromPlayer: true
        });
        break;

      case 2: // Flamethrower (Heat) / Cryo-Jet (Cold)
        this.fireCooldown = secondary ? 2 : 1;
        sound.playThermalStream(secondary);
        if (secondary) {
          for (let k = 0; k < 2; k++) {
            const spread = (Math.random() - 0.5) * 0.24;
            projectiles.push({
              x: spawnX,
              y: spawnY,
              vx: (nx + spread) * 6.8,
              vy: (ny + spread) * 6.8,
              type: 'cryo',
              color: '#72efdd',
              radius: 7,
              ttl: 44,
              fromPlayer: true
            });
          }
        } else {
          // Continuous Flamethrower jet: propellant exits nozzle and ignites at a safe standoff distance ahead!
          for (let k = 0; k < 3; k++) {
            const angleOffset = (Math.random() - 0.5) * 0.24;
            const cosA = Math.cos(angleOffset);
            const sinA = Math.sin(angleOffset);
            const dirX = nx * cosA - ny * sinA;
            const dirY = nx * sinA + ny * cosA;
            const forwardBoost = Math.max(0, this.vx * dirX + this.vy * dirY);
            const speed = 5.2 + Math.random() * 2.0 + forwardBoost;
            projectiles.push({
              x: this.x + dirX * (11 + k * 2.0),
              y: this.y + dirY * (11 + k * 2.0),
              vx: dirX * speed,
              vy: dirY * speed,
              type: 'heat',
              color: k === 0 ? '#ffbe0b' : k === 1 ? '#fb5607' : '#ff595e',
              radius: 4,
              ttl: 24 + ((Math.random() * 10) | 0),
              fromPlayer: true
            });
          }
        }
        break;

      case 3: // Chroniton Time Manipulator
        this.fireCooldown = 4;
        sound.playChronitonField(!secondary);
        projectiles.push({
          x: spawnX,
          y: spawnY,
          vx: nx * 8.2,
          vy: ny * 8.2,
          type: secondary ? 'time_stasis' : 'time_accel',
          color: secondary ? '#4361ee' : '#4cc9f0',
          radius: 16,
          ttl: 70,
          fromPlayer: true
        });
        break;

      case 4: // Solvents: Water (H2O) / Heavy Water (D2O)
        this.fireCooldown = 2;
        sound.playLiquidSpray(false);
        projectiles.push({
          x: spawnX,
          y: spawnY,
          vx: nx * 6.4 + (Math.random() - 0.5) * 0.5,
          vy: ny * 6.4 - 0.35,
          type: 'chemical',
          element: secondary ? ElementId.HEAVY_WATER : ElementId.WATER,
          color: secondary ? '#48bfe3' : '#3a86ff',
          radius: 5,
          ttl: 85,
          fromPlayer: true
        });
        break;

      case 5: // Acid (H2SO4) / Alkali (NaOH)
        this.fireCooldown = 2;
        sound.playLiquidSpray(true);
        projectiles.push({
          x: spawnX,
          y: spawnY,
          vx: nx * 6.2 + (Math.random() - 0.5) * 0.5,
          vy: ny * 6.2 - 0.35,
          type: 'chemical',
          element: secondary ? ElementId.ALKALI : ElementId.ACID,
          color: secondary ? '#c77dff' : '#80ed99',
          radius: 5,
          ttl: 85,
          fromPlayer: true
        });
        break;

      case 6: // Reactive Alchemy: Metallic Sodium (Na) / Thermite
        this.fireCooldown = 5;
        sound.playAlkaliLaunch(secondary);
        projectiles.push({
          x: spawnX,
          y: spawnY,
          vx: nx * 5.8,
          vy: ny * 5.8 - 0.5,
          type: 'chemical',
          element: secondary ? ElementId.THERMITE : ElementId.SODIUM,
          color: secondary ? '#ff7b00' : '#e5e5e5',
          radius: 6,
          ttl: 90,
          fromPlayer: true
        });
        break;

      case 7: // Nuclear: Fast Neutrons / Lead Shielding
        this.fireCooldown = secondary ? 3 : 4;
        if (secondary) {
          sound.playAlkaliLaunch(false);
          projectiles.push({
            x: spawnX,
            y: spawnY,
            vx: nx * 5.8,
            vy: ny * 5.8,
            type: 'chemical',
            element: ElementId.LEAD,
            color: '#6c757d',
            radius: 5,
            ttl: 75,
            fromPlayer: true
          });
        } else {
          sound.playGeigerClick();
          projectiles.push({
            x: spawnX,
            y: spawnY,
            vx: nx * 9.2,
            vy: ny * 9.2,
            type: 'neutron',
            color: '#70e000',
            radius: 9,
            ttl: 85,
            fromPlayer: true
          });
        }
        break;

      case 8: // Weak Force Transmuter (W/Z Boson)
        this.fireCooldown = 5;
        sound.playSubatomicBeam('weak');
        projectiles.push({
          x: spawnX,
          y: spawnY,
          vx: nx * 8.5,
          vy: ny * 8.5,
          type: 'weak_force',
          color: '#f72585',
          radius: 13,
          ttl: 75,
          fromPlayer: true
        });
        if (secondary) {
          // Follow up with Water catalyst to detonate transmuted Sodium!
          projectiles.push({
            x: spawnX,
            y: spawnY,
            vx: nx * 6.8,
            vy: ny * 6.8,
            type: 'chemical',
            element: ElementId.WATER,
            color: '#3a86ff',
            radius: 6,
            ttl: 80,
            fromPlayer: true
          });
        }
        break;

      case 9: // Strong Force Gluon Unbinder / Quantum Tunneling Wave-Function
        this.fireCooldown = 6;
        sound.playSubatomicBeam(secondary ? 'tunnel' : 'strong');
        if (secondary) {
          // Also grant player temporary quantum phase-walk if firing near self
          if (dist < 56) {
            this.activateQuantumDash(sound);
          }
          projectiles.push({
            x: spawnX,
            y: spawnY,
            vx: nx * 7.8,
            vy: ny * 7.8,
            type: 'quantum_tunnel',
            color: '#9d4edd',
            radius: 16,
            ttl: 75,
            fromPlayer: true
          });
        } else {
          projectiles.push({
            x: spawnX,
            y: spawnY,
            vx: nx * 8.2,
            vy: ny * 8.2,
            type: 'strong_unbind',
            color: '#ff4d6d',
            radius: 13,
            ttl: 75,
            fromPlayer: true
          });
        }
        break;
    }
  }
}
