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
  public radiationDose: number = 0; // 0..100
  public bodyTemp: number = 37; // Celsius

  public facing: 1 | -1 = 1;
  public grounded: boolean = false;
  public quantumPhaseTimer: number = 0; // >0 means player can walk through any solid wall!
  public fireCooldown: number = 0;
  public selectedTool: number = 1; // 1..9
  public gravityScale: number = 1.0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  public activateQuantumDash(sound: SoundEngine): void {
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
    if (this.fireCooldown > 0) this.fireCooldown--;
    if (this.quantumPhaseTimer > 0) this.quantumPhaseTimer--;

    const kbLeft = keys.has('KeyA') || keys.has('ArrowLeft');
    const kbRight = keys.has('KeyD') || keys.has('ArrowRight');
    const kbUp = keys.has('KeyW') || keys.has('ArrowUp') || keys.has('Space');
    const kbDown = keys.has('KeyS') || keys.has('ArrowDown');

    const gpX = gp && gp.connected ? gp.moveX : 0;
    const gpY = gp && gp.connected ? gp.moveY : 0;

    const accel = 0.54;
    const maxSpeed = 3.2;

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
      if (this.grounded) {
        // Immediate liftoff into jetpack flight when pushing Up on Left Thumbstick or pressing Jump!
        this.vy = -3.4 * thrustScale;
        this.grounded = false;
      } else if (this.jetpackFuel > 0) {
        this.vy = Math.max(-3.3 * thrustScale, this.vy - 0.48 * thrustScale);
        this.jetpackFuel = Math.max(0, this.jetpackFuel - 0.48 * thrustScale);
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
      this.jetpackFuel = Math.min(this.maxJetpack, this.jetpackFuel + (this.grounded ? 1.8 : 0.65));
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

    // Gravity (scaled by environment, e.g. 0.45G on Space Station!)
    this.vy = Math.min(4.4 * this.gravityScale, this.vy + 0.21 * this.gravityScale);

    const ignoreSolids = this.quantumPhaseTimer > 0;

    // Horizontal collision & Terraria-style 1-6 pixel auto-step
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
        this.vx = 0;
      }
    }

    // Vertical collision
    const nextY = this.y + this.vy;
    if (!this.checkCollision(this.x, nextY, world, ignoreSolids)) {
      this.y = nextY;
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
      const cx = Math.floor(this.x);
      const cy = Math.floor(this.y);
      if (world.inBounds(cx, cy)) {
        world.flags[world.idx(cx, cy)] |= FLAG_QUANTUM_TUNNEL;
      }
      this.y -= 1.0;
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

  private sampleEnvironment(world: WorldGrid, sound: SoundEngine): void {
    const cx = Math.floor(this.x);
    const cy = Math.floor(this.y);
    let maxTemp = 22;
    let minTemp = 22;
    let radSum = 0;
    let inAcid = false;
    let inBioGel = false;
    let inFusion = false;

    for (let dy = -8; dy <= 8; dy += 2) {
      for (let dx = -4; dx <= 4; dx += 2) {
        const px = cx + dx;
        const py = cy + dy;
        if (!world.inBounds(px, py)) continue;
        const i = world.idx(px, py);
        const el = world.grid[i] as ElementId;
        const t = world.temp[i];
        if (t > maxTemp) maxTemp = t;
        if (t < minTemp) minTemp = t;
        radSum += world.radiation[i];

        if (el === ElementId.ACID) inAcid = true;
        if (el === ElementId.BIO_GEL) inBioGel = true;
        if (el === ElementId.FUSION_PLASMA) inFusion = true;
      }
    }

    this.bodyTemp += ((maxTemp > 60 ? maxTemp : minTemp < 0 ? minTemp : 37) - this.bodyTemp) * 0.05;

    if (inFusion) {
      this.hp = Math.max(0, this.hp - 1.8);
    } else if (inAcid) {
      this.hp = Math.max(0, this.hp - 0.22);
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
    } else if (!inAcid && maxTemp <= 150 && radSum <= 1.0 && this.hp > 0) {
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
    if (this.fireCooldown > 0) return;

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

      case 2: // Thermal Lance (Heat) / Cryo-Jet (Cold)
        this.fireCooldown = 2;
        for (let k = 0; k < 2; k++) {
          const spread = (Math.random() - 0.5) * 0.25;
          projectiles.push({
            x: spawnX,
            y: spawnY,
            vx: (nx + spread) * 7.4,
            vy: (ny + spread) * 7.4,
            type: secondary ? 'cryo' : 'heat',
            color: secondary ? '#72efdd' : '#ff595e',
            radius: 9,
            ttl: 55,
            fromPlayer: true
          });
        }
        break;

      case 3: // Chroniton Time Manipulator
        this.fireCooldown = 4;
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
