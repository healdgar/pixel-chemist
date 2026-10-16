import { ElementId, ELEMENTS } from '../chemistry/elements';
import { WorldGrid } from '../simulation/world';
import { SoundEngine } from '../audio/soundEngine';
import type { Player } from './player';
import type { EnemyUnit } from '../ai/jevDirector';
import type { BibbiState } from '../world/levelGenerator';

export interface ToolDef {
  id: number;
  key: string;
  name: string;
  shortName: string;
  primaryLabel: string;
  secondaryLabel: string;
  color: string;
  description: string;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type:
    | 'kinetic'
    | 'implosion'
    | 'heat'
    | 'cryo'
    | 'time_accel'
    | 'time_stasis'
    | 'chemical'
    | 'neutron'
    | 'weak_force'
    | 'strong_unbind'
    | 'quantum_tunnel'
    | 'enemy_bolt';
  element?: ElementId;
  color: string;
  radius: number;
  ttl: number;
  fromPlayer: boolean;
}

export const TOOLS: ToolDef[] = [
  {
    id: 1,
    key: '1',
    name: 'Graviton Pressure Cannon',
    shortName: 'PRESSURE',
    primaryLabel: 'LMB: Kinetic Shockwave (165 GPa)',
    secondaryLabel: 'RMB: Hyper-Implosion (5000+ GPa → FUSION!)',
    color: '#ffd166',
    description:
      'Applies mechanical force and extreme pressure. Shatters Cryo-Brittle Steel, compresses Carbon into Diamond (>800 GPa), and ignites Thermonuclear Fusion above 5,000 GPa!'
  },
  {
    id: 2,
    key: '2',
    name: 'Plasma Flamethrower / Cryo-Jet',
    shortName: 'THERMAL',
    primaryLabel: 'LMB: Flamethrower Stream (+2800°C)',
    secondaryLabel: 'RMB: Liquid Nitrogen Cryo-Jet (-196°C)',
    color: '#ff6b6b',
    description:
      'Projects a continuous stream of roaring flame or cryogenic LN₂. Ignite Thermite, melt Stone into Magma, boil liquids, or flash-freeze Steel bulkheads so they shatter under pressure!'
  },
  {
    id: 3,
    key: '3',
    name: 'Chroniton Time Manipulator',
    shortName: 'TIME Δt',
    primaryLabel: 'LMB: Accelerate Time (+3000% Entropy)',
    secondaryLabel: 'RMB: Temporal Stasis Freeze (Δt = 0)',
    color: '#4cc9f0',
    description:
      'Warps local time! Fast-forward oxidation to rust wet Steel doors into powder in seconds, dissolve Chroniton Crystals, or freeze hazards in Stasis.'
  },
  {
    id: 4,
    key: '4',
    name: 'Aqueous Solvents (H₂O / D₂O)',
    shortName: 'SOLVENT',
    primaryLabel: 'LMB: Pressurized Water (H₂O)',
    secondaryLabel: 'RMB: Heavy Water (D₂O Fusion Fuel)',
    color: '#3a86ff',
    description:
      'Universal solvent. Cools lava, wets steel for rapid rusting, explodes violently on contact with Sodium (Na), or supplies Deuterium for fusion.'
  },
  {
    id: 5,
    key: '5',
    name: 'Acid (H₂SO₄) & Alkali (NaOH)',
    shortName: 'ACID/BASE',
    primaryLabel: 'LMB: Sulfuric Acid Spray (H₂SO₄)',
    secondaryLabel: 'RMB: Caustic Alkali Neutralizer (NaOH)',
    color: '#80ed99',
    description:
      'Dissolves Concrete, Stone, and Metals with Sulfuric Acid, or neutralizes acid vats into safe Salt Water using Alkali base!'
  },
  {
    id: 6,
    key: '6',
    name: 'Reactive Alchemy (Na / Thermite)',
    shortName: 'REACTIVE',
    primaryLabel: 'LMB: Metallic Sodium (Explodes in H₂O!)',
    secondaryLabel: 'RMB: Thermite Powder (2850°C Melter)',
    color: '#ff9f1c',
    description:
      'Deploy alkali Metallic Sodium that detonates on contact with water, or pack Thermite powder and ignite it with Heat to melt straight through Steel!'
  },
  {
    id: 7,
    key: '7',
    name: 'Nuclear Physics (n⁰ / U-235 / Pb)',
    shortName: 'NUCLEAR',
    primaryLabel: 'LMB: Fast Neutron Fission Beam (n⁰)',
    secondaryLabel: 'RMB: Lead Shielding (Pb) + U-235',
    color: '#70e000',
    description:
      'Fire fast Neutrons to trigger nuclear fission in Uranium-235, or spray Lead (Pb) shielding to absorb lethal radiation.'
  },
  {
    id: 8,
    key: '8',
    name: 'Weak Force Boson Transmuter',
    shortName: 'WEAK W±',
    primaryLabel: 'LMB: β-Decay Element Transmuter',
    secondaryLabel: 'RMB: Transmute + H₂O Detonation',
    color: '#f72585',
    description:
      'Manipulates the Weak Nuclear Force (W±/Z⁰ bosons) to transmute elements! Turns indestructible Tungsten walls into reactive Sodium, or Uranium into safe Lead!'
  },
  {
    id: 9,
    key: '9',
    name: 'Strong Force & Quantum Tunnel',
    shortName: 'QUANTUM',
    primaryLabel: 'LMB: Strong Force Gluon Unbinder',
    secondaryLabel: 'RMB: Quantum Tunneling Field |Ψ⟩',
    color: '#9d4edd',
    description:
      'Unbind the Strong Nuclear Force to dissolve any barrier into Quark-Gluon Plasma, or project a Quantum Superposition field to walk straight through solid walls!'
  }
];

export function updateProjectiles(
  projectiles: Projectile[],
  world: WorldGrid,
  sound: SoundEngine,
  player?: Player,
  enemyUnits?: EnemyUnit[],
  bibbi?: BibbiState
): void {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.ttl--;
    if (p.ttl <= 0) {
      projectiles.splice(i, 1);
      continue;
    }

    // Sub-step movement for accurate pixel & entity collision
    const steps = 4;
    const dx = p.vx / steps;
    const dy = p.vy / steps;
    let hit = false;

    for (let s = 0; s < steps; s++) {
      p.x += dx;
      p.y += dy;
      const gx = Math.floor(p.x);
      const gy = Math.floor(p.y);

      if (!world.inBounds(gx, gy)) {
        hit = true;
        break;
      }

      // 1. Check direct impact on J.E.V. Enemy Units (Guards, Drones, Heavy Robots)
      if (p.fromPlayer && enemyUnits) {
        for (const u of enemyUnits) {
          if (!u.active) continue;
          if (
            Math.abs(p.x - u.x) <= u.width * 0.65 &&
            Math.abs(p.y - u.y) <= u.height * 0.65
          ) {
            handleDirectEnemyHit(p, u, gx, gy, world, sound);
            this_handleProjectileImpact(p, gx, gy, world, sound, bibbi);
            hit = true;
            break;
          }
        }
        if (hit) break;
      }

      // 1b. Check direct impact on Bibbi when she is uncarried (delicate: player's own weapons can harm her!)
      if (bibbi && !bibbi.carried && !bibbi.rescued && bibbi.hp > 0) {
        if (Math.abs(p.x - bibbi.x) <= 6.5 && Math.abs(p.y - bibbi.y) <= 8.5) {
          const isSafeBeam =
            p.type === 'time_accel' ||
            p.type === 'time_stasis' ||
            p.type === 'quantum_tunnel' ||
            (p.type === 'chemical' &&
              (p.element === ElementId.WATER ||
                p.element === ElementId.HEAVY_WATER ||
                p.element === ElementId.ALKALI ||
                p.element === ElementId.BIO_GEL));
          if (!isSafeBeam) {
            const dmg =
              p.type === 'implosion' || p.type === 'strong_unbind'
                ? 45
                : p.type === 'kinetic' || p.type === 'weak_force' || p.type === 'neutron'
                ? 26
                : p.type === 'heat'
                ? 6
                : 16;
            bibbi.hp = Math.max(0, bibbi.hp - dmg);
            bibbi.inDanger = true;
            bibbi.hurtReason = p.fromPlayer
              ? 'Struck directly by your own weapon!'
              : 'Hit by J.E.V. crossfire!';
            sound.playCombatHit(true, false);
            this_handleProjectileImpact(p, gx, gy, world, sound, bibbi);
            hit = true;
            break;
          }
        }
      }

      // 2. Check direct impact on Player (Quantum Tunneling phases safely through enemy fire!)
      if (!p.fromPlayer && player && player.quantumPhaseTimer <= 0) {
        if (
          Math.abs(p.x - player.x) <= player.width * 0.6 &&
          Math.abs(p.y - player.y) <= player.height * 0.6
        ) {
          if (p.type === 'cryo') {
            player.hp = Math.max(0, player.hp - 4.5);
            player.vx *= 0.3;
          } else if (p.type === 'kinetic') {
            player.hp = Math.max(0, player.hp - 8.5);
            player.vx += Math.sign(p.vx) * 2.4;
            player.vy -= 1.5;
          } else {
            player.hp = Math.max(0, player.hp - 5.5);
          }
          // If Bibbi is riding on the player's back, enemy hits also hurt delicate Bibbi!
          if (bibbi && bibbi.carried && !bibbi.rescued && bibbi.hp > 0) {
            bibbi.hp = Math.max(0, bibbi.hp - 9.5);
            bibbi.inDanger = true;
            bibbi.hurtReason = 'Hit by enemy fire while riding on your back!';
          }
          sound.playCombatHit(true, false);
          this_handleProjectileImpact(p, gx, gy, world, sound, bibbi);
          hit = true;
          break;
        }
      }

      const el = world.getElement(gx, gy);
      const state = ELEMENTS[el].state;

      // Flamethrower in-flight stream: ignites after a safe nozzle standoff distance so running while firing never burns the operator!
      if (p.type === 'heat' && s === 0) {
        const distFromPlayer = p.fromPlayer && player ? Math.hypot(gx - player.x, gy - player.y) : 999;
        if (distFromPlayer > 22) {
          for (let ty = -2; ty <= 2; ty++) {
            for (let tx = -2; tx <= 2; tx++) {
              const cx = gx + tx;
              const cy = gy + ty;
              if (!world.inBounds(cx, cy)) continue;
              const cIdx = world.idx(cx, cy);
              const cEl = world.grid[cIdx] as ElementId;
              if (
                cEl !== ElementId.EMPTY &&
                cEl !== ElementId.SMOKE &&
                cEl !== ElementId.FIRE
              ) {
                world.temp[cIdx] = Math.min(3500, world.temp[cIdx] + 85);
              }
              if (
                distFromPlayer > 48 &&
                ty <= -1 &&
                tx * tx + ty * ty <= 2 &&
                cEl === ElementId.EMPTY &&
                Math.random() < 0.35
              ) {
                world.setElement(cx, cy, ElementId.FIRE, 780, 3 + ((Math.random() * 3) | 0));
              }
            }
          }
        }
      } else if (p.type === 'cryo' && s === 0) {
        const distFromPlayer = p.fromPlayer && player ? Math.hypot(gx - player.x, gy - player.y) : 999;
        if (distFromPlayer > 18) {
          const cIdx = world.idx(gx, gy);
          world.temp[cIdx] = Math.max(-260, world.temp[cIdx] - 55);
          if (el === ElementId.EMPTY && Math.random() < 0.25) {
            world.setElement(gx, gy, ElementId.NITROGEN_GAS, -180, 22);
          }
        }
      }

      // Quantum tunneling projectiles pass through air/gas/liquids and apply superposition to solids/powders
      if (p.type === 'quantum_tunnel') {
        if (state === 'solid' || state === 'powder') {
          world.applyQuantumTunneling(gx, gy, p.radius, sound);
          hit = true;
          break;
        }
        if (state === 'liquid') {
          p.vx *= 0.992;
          p.vy *= 0.992;
        }
        continue;
      }

      // Projectiles travel through liquids with hydrodynamic drag instead of stopping at the barrel!
      if (state === 'liquid') {
        p.vx *= 0.992;
        p.vy *= 0.992;

        // Thermal beams gently heat or chill liquid along their trajectory
        if (p.type === 'heat' || p.type === 'cryo') {
          const idx = world.idx(gx, gy);
          world.temp[idx] += p.type === 'heat' ? 35 : -35;
        }

        const speed = Math.hypot(p.vx, p.vy);
        // Sodium pellets detonate after traveling a short distance into water (avoids point-blank self-detonation)
        const sodiumWaterReaction =
          p.type === 'chemical' &&
          p.element === ElementId.SODIUM &&
          (el === ElementId.WATER || el === ElementId.HEAVY_WATER || el === ElementId.SALT_WATER) &&
          p.ttl < 78;

        if (speed < 0.75 || p.ttl <= 2 || sodiumWaterReaction) {
          this_handleProjectileImpact(p, gx, gy, world, sound, bibbi, player);
          hit = true;
          break;
        }
        continue;
      }

      // Solids and powders stop projectiles and trigger full alchemical impact
      if (state === 'solid' || state === 'powder') {
        this_handleProjectileImpact(p, gx, gy, world, sound, bibbi, player);
        hit = true;
        break;
      }
    }

    // Apply gravity to chemical blobs, and buoyant deceleration to flamethrower streams
    if (p.type === 'chemical') {
      p.vy += 0.12;
    } else if (p.type === 'heat') {
      p.vx *= 0.962;
      p.vy = p.vy * 0.962 - 0.045;
    }

    if (hit) {
      projectiles.splice(i, 1);
    }
  }
}

function handleDirectEnemyHit(
  p: Projectile,
  u: EnemyUnit,
  gx: number,
  gy: number,
  world: WorldGrid,
  sound: SoundEngine
): void {
  const isCritShatter =
    (p.type === 'kinetic' || p.type === 'implosion') && u.cryoBrittleTimer > 0;
  sound.playCombatHit(false, isCritShatter);

  switch (p.type) {
    case 'kinetic':
    case 'implosion': {
      const mult = u.cryoBrittleTimer > 0 ? 3.2 : 1.0;
      const baseDmg = p.type === 'implosion' ? 48 : 26;
      u.hp -= baseDmg * mult;
      u.vx += Math.sign(p.vx) * (u.type === 'robot' ? 1.4 : 2.8);
      u.vy -= 1.4;
      break;
    }
    case 'cryo':
      u.cryoBrittleTimer = 190;
      u.hp -= 6;
      break;
    case 'heat':
      u.hp -= 4.5;
      break;
    case 'time_accel':
      if (u.wetTimer > 0 || u.type === 'robot') {
        u.rustedLevel = Math.min(100, u.rustedLevel + 35);
        u.hp -= u.type === 'robot' ? 38 : 22;
        world.addReactionPopup(gx, gy - 10, '4Fe + 3O₂ + Δt → RAPID RUST!', '#b55233');
      } else {
        u.hp -= 14;
      }
      break;
    case 'time_stasis':
      u.stasisTimer = 150;
      world.addReactionPopup(gx, gy - 10, '⏱️ TEMPORAL STASIS LOCK!', '#4361ee');
      break;
    case 'chemical':
      if (p.element === ElementId.WATER || p.element === ElementId.HEAVY_WATER) {
        u.wetTimer = 240;
      } else if (p.element === ElementId.ACID) {
        u.hp -= 18;
      }
      break;
    case 'neutron':
      u.hp -= u.type === 'guard' ? 32 : 18;
      break;
    case 'weak_force':
      u.hp -= 34;
      world.addReactionPopup(gx, gy - 10, '⚛️ W± ARMOR TRANSMUTED → Na!', '#f72585');
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          if (world.inBounds(gx + dx, gy + dy) && world.getElement(gx + dx, gy + dy) === ElementId.EMPTY) {
            world.setElement(gx + dx, gy + dy, ElementId.SODIUM);
          }
        }
      }
      break;
    case 'strong_unbind':
      u.hp -= 55;
      world.addReactionPopup(gx, gy - 10, '⚛️ GLUON ARMOR UNBOUND!', '#ff4d6d');
      break;
  }
}

function this_handleProjectileImpact(
  p: Projectile,
  gx: number,
  gy: number,
  world: WorldGrid,
  sound: SoundEngine,
  bibbi?: BibbiState,
  player?: Player
): void {
  // Check if an explosive/thermal blast impacts dangerously close to delicate Bibbi!
  if (bibbi && !bibbi.rescued && bibbi.hp > 0) {
    const distToBibbi = Math.hypot(gx - bibbi.x, gy - bibbi.y);
    if (distToBibbi < 9.5) {
      if (p.type === 'implosion') {
        bibbi.hp = Math.max(0, bibbi.hp - 42);
        bibbi.inDanger = true;
        bibbi.hurtReason = 'Crushed by your Hyper-Implosion blast!';
      } else if (p.type === 'kinetic') {
        bibbi.hp = Math.max(0, bibbi.hp - 18);
        bibbi.inDanger = true;
        bibbi.hurtReason = 'Blasted by your Pressure Cannon shockwave!';
      } else if (p.type === 'heat') {
        bibbi.hp = Math.max(0, bibbi.hp - 4.5);
        bibbi.inDanger = true;
        bibbi.hurtReason = 'Scorched by your Flamethrower!';
      } else if (p.type === 'cryo') {
        bibbi.hp = Math.max(0, bibbi.hp - 10);
        bibbi.inDanger = true;
        bibbi.hurtReason = 'Frozen by your Cryo-Jet!';
      } else if (p.type === 'strong_unbind') {
        bibbi.hp = Math.max(0, bibbi.hp - 28);
        bibbi.inDanger = true;
        bibbi.hurtReason = 'Exposed to your Gluon Unbinder!';
      }
    }
  }

  switch (p.type) {
    case 'kinetic':
      world.applyPressureImpulse(gx, gy, p.radius, 185, sound);
      break;
    case 'implosion':
      // Massive pressure spike! Repeated hits or hitting D2O/H2O/H2 reaches >= 5000 GPa -> FUSION!
      world.applyPressureImpulse(gx, gy, p.radius, 1950, sound);
      break;
    case 'heat': {
      const distSqToPlayer =
        p.fromPlayer && player
          ? (gx - player.x) * (gx - player.x) + (gy - (player.y - 6)) * (gy - (player.y - 6))
          : 9999;
      world.applyThermalBrush(
        gx,
        gy,
        p.radius,
        185,
        distSqToPlayer > 22 * 22 ? ElementId.FIRE : undefined,
      );
      break;
    }
    case 'cryo':
      world.applyThermalBrush(gx, gy, p.radius, -260, ElementId.LIQUID_NITROGEN);
      break;
    case 'time_accel':
      world.applyTimeField(gx, gy, p.radius, true, sound);
      break;
    case 'time_stasis':
      world.applyTimeField(gx, gy, p.radius, false, sound);
      break;
    case 'chemical':
      if (p.element !== undefined) {
        const r = p.radius;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy <= r * r) {
              const tx = gx + dx;
              const ty = gy + dy;
              if (world.inBounds(tx, ty)) {
                const cur = world.getElement(tx, ty);
                const curState = ELEMENTS[cur].state;
                if (cur === ElementId.EMPTY || curState === 'gas' || (curState === 'liquid' && cur !== p.element)) {
                  world.setElement(tx, ty, p.element);
                }
              }
            }
          }
        }
      }
      break;
    case 'neutron':
      for (let k = 0; k < 6; k++) {
        const tx = gx + Math.floor((Math.random() - 0.5) * 7);
        const ty = gy + Math.floor((Math.random() - 0.5) * 7);
        if (world.inBounds(tx, ty)) {
          if (world.getElement(tx, ty) === ElementId.URANIUM) {
            // Immediate fission trigger
            world.setElement(tx, ty, ElementId.NEUTRON, 900);
          } else if (world.getElement(tx, ty) === ElementId.EMPTY) {
            world.setElement(tx, ty, ElementId.NEUTRON, 600);
          }
        }
      }
      break;
    case 'weak_force':
      world.applyWeakForceTransmutation(gx, gy, p.radius, sound);
      break;
    case 'strong_unbind':
      world.applyStrongForceGluon(gx, gy, p.radius, true, sound);
      break;
    case 'enemy_bolt':
      world.applyPressureImpulse(gx, gy, 6, 75, sound);
      world.applyThermalBrush(gx, gy, 6, 180, ElementId.FIRE);
      break;
  }
}
