import {
  ElementId,
  ELEMENTS,
  FLAG_CRYO_BRITTLE,
  FLAG_TIME_ACCEL,
  FLAG_TIME_STASIS,
} from '../chemistry/elements';
import { WorldGrid } from '../simulation/world';
import { Player } from '../entities/player';
import { Projectile } from '../entities/tools';
import { SoundEngine } from '../audio/soundEngine';

// ============================================================================
// TRAINABLE J.E.V. ("SYSTEM-ONE") NEURAL DECISION ENGINE & AI DIRECTOR
// Trained directly on the game's 12 Alchemical, Physical & Tactical Levers!
// ============================================================================

export const JEV_LEVER_NAMES = [
  '0: Player Thermal/Fire Lever (Heat/Thermite)',
  '1: Player Cryo/Aqueous Lever (LN₂/H₂O/D₂O)',
  '2: Player Corrosive/Alkali Lever (H₂SO₄/NaOH/Na)',
  '3: Player Nuclear/Quantum Lever (n⁰/W±/Gluon/|Ψ⟩)',
  '4: Player Quantum Phase-Walk Active (|Ψ⟩)',
  '5: Local Temperature Anomaly (-200°C..1500°C)',
  '6: Local Pressure Shockwave (0..5000 GPa)',
  '7: Local Radiation & Neutron Flux (mSv)',
  '8: Bibbi Stasis Vault Proximity (0..1)',
  '9: Facility Line-of-Sight Lock Ratio',
  '10: Player Standing in Conductive/Wet Medium',
  '11: Facility Unit Casualty & Breach Rate',
] as const;

export const JEV_DIRECTIVES = [
  'SECTOR_PATROL',
  'CONVERGE_INTERCEPT',
  'COUNTER_ALCHEMY_CRYO',
  'COUNTER_ALCHEMY_ACID',
  'AERIAL_SODIUM_BOMB',
  'FACILITY_HAZARD_FLUSH',
] as const;

export type JevDirectiveType = (typeof JEV_DIRECTIVES)[number];

export const JEV_LOADOUTS = [
  'kinetic',
  'cryo',
  'acid',
  'plasma',
  'sodium_bomb',
] as const;

export type EnemyWeaponLoadout = (typeof JEV_LOADOUTS)[number];

export interface JevNoulResult {
  answer: boolean;
  probability: number; // 0..1 calibrated probability
}

export interface JevChoiceResult<T extends string> {
  selected: T;
  confidence: number; // 0..1
  distribution: Record<T, number>;
}

export type JevAlertState = 'STANDBY' | 'PATROL_ALERT' | 'TACTICAL_LOCK' | 'OMEGA_PROTOCOL';

export type EnemyUnitType = 'guard' | 'drone' | 'robot';

export interface EnemyUnit {
  id: string;
  type: EnemyUnitType;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  facing: 1 | -1;
  grounded: boolean;
  active: boolean;
  cooldown: number;
  patrolMinX: number;
  patrolMaxX: number;
  homeY: number;
  // Alchemical & physical status effects!
  wetTimer: number;
  rustedLevel: number; // 0..100 (Water + Time Accel rusts robots/mechs!)
  cryoBrittleTimer: number; // >0 means frozen brittle -> 3x shatter damage from kinetic pressure!
  stasisTimer: number; // >0 means frozen in Chroniton Stasis!
  aiState: 'patrol' | 'pursue' | 'attack' | 'evade_hazard' | 'stasis';
  aiThought: string;
  weaponLoadout: EnemyWeaponLoadout;
}

export type FacilityDefenseType = 'laser_grid' | 'ceiling_sprayer' | 'alarm_beacon';

export interface FacilityDefense {
  id: string;
  type: FacilityDefenseType;
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  maxLength: number;
  currentEndX: number;
  currentEndY: number;
  hp: number;
  maxHp: number;
  active: boolean;
  cooldown: number;
  triggered: boolean;
  sprayElement?: ElementId;
}

/**
 * JevNeuralBrain: A trainable 2-layer Neural Network + Online Policy Gradient (REINFORCE)
 * decision model trained specifically on the 12 levers of Pixel Chemist!
 *
 * Architecture:
 * - Input Layer: 12 normalized game levers `x[0..11]`
 * - Hidden Layer: 16 LeakyReLU neurons (`W1: 16x12`, `b1: 16`)
 * - Output Heads:
 *   1. `directiveHead` (6 logits -> softmax `choice` over `JEV_DIRECTIVES`)
 *   2. `loadoutHead` (5 logits -> softmax `choice` over `JEV_LOADOUTS`)
 *   3. `noulHead` (3 calibrated sigmoid `noul` probabilities:
 *      `[0] isVaultThreat`, `[1] shouldCounterAlchemy`, `[2] shouldDeployReinforcements`)
 */
export class JevNeuralBrain {
  public static readonly IN_DIM = 12;
  public static readonly HIDDEN_DIM = 16;
  public static readonly DIR_DIM = JEV_DIRECTIVES.length; // 6
  public static readonly LOAD_DIM = JEV_LOADOUTS.length; // 5
  public static readonly NOUL_DIM = 3;

  public w1: Float32Array;
  public b1: Float32Array;
  public wDir: Float32Array;
  public bDir: Float32Array;
  public wLoad: Float32Array;
  public bLoad: Float32Array;
  public wNoul: Float32Array;
  public bNoul: Float32Array;

  public trainedEpisodes: number = 0;
  public onlineUpdates: number = 0;
  public baselineReward: number = 0;
  public lastLoss: number = 0.0;
  public lastReward: number = 0.0;

  // Cached activations from last forward pass for online policy gradient updates
  public lastLevers: Float32Array = new Float32Array(JevNeuralBrain.IN_DIM);
  private lastHidden: Float32Array = new Float32Array(JevNeuralBrain.HIDDEN_DIM);
  public lastDirProbs: Float32Array = new Float32Array(JevNeuralBrain.DIR_DIM);
  public lastLoadProbs: Float32Array = new Float32Array(JevNeuralBrain.LOAD_DIM);
  public lastNoulProbs: Float32Array = new Float32Array(JevNeuralBrain.NOUL_DIM);
  public lastChosenDirIdx: number = 0;
  public lastChosenLoadIdx: number = 0;

  constructor() {
    const H = JevNeuralBrain.HIDDEN_DIM;
    const I = JevNeuralBrain.IN_DIM;
    this.w1 = new Float32Array(H * I);
    this.b1 = new Float32Array(H);
    this.wDir = new Float32Array(JevNeuralBrain.DIR_DIM * H);
    this.bDir = new Float32Array(JevNeuralBrain.DIR_DIM);
    this.wLoad = new Float32Array(JevNeuralBrain.LOAD_DIM * H);
    this.bLoad = new Float32Array(JevNeuralBrain.LOAD_DIM);
    this.wNoul = new Float32Array(JevNeuralBrain.NOUL_DIM * H);
    this.bNoul = new Float32Array(JevNeuralBrain.NOUL_DIM);

    this.initXavierWeights();
    // Pre-train 1,500 episodes on the game's domain rules & alchemical counter-strategies at startup!
    this.trainCurriculumEpisodes(1500);
  }

  public initXavierWeights(): void {
    let seed = 0x6a09e667;
    const nextGaussian = (): number => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const u1 = ((seed >>> 0) % 10000 + 1) / 10001;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const u2 = ((seed >>> 0) % 10000 + 1) / 10001;
      return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    };

    const scale1 = Math.sqrt(2.0 / JevNeuralBrain.IN_DIM);
    for (let i = 0; i < this.w1.length; i++) this.w1[i] = nextGaussian() * scale1;
    this.b1.fill(0.05);

    const scale2 = Math.sqrt(2.0 / JevNeuralBrain.HIDDEN_DIM);
    for (let i = 0; i < this.wDir.length; i++) this.wDir[i] = nextGaussian() * scale2;
    for (let i = 0; i < this.wLoad.length; i++) this.wLoad[i] = nextGaussian() * scale2;
    for (let i = 0; i < this.wNoul.length; i++) this.wNoul[i] = nextGaussian() * scale2;
    this.bDir.fill(0);
    this.bLoad.fill(0);
    this.bNoul.fill(0);
    this.trainedEpisodes = 0;
    this.onlineUpdates = 0;
  }

  private snapshotArrays(): Float32Array[] {
    return [
      this.w1, this.b1, this.wDir, this.bDir, this.wLoad, this.bLoad, this.wNoul, this.bNoul,
      this.lastLevers, this.lastHidden, this.lastDirProbs, this.lastLoadProbs, this.lastNoulProbs,
    ];
  }

  public createSnapshot() {
    return {
      arrays: this.snapshotArrays().map((array) => new Float32Array(array)),
      trainedEpisodes: this.trainedEpisodes, onlineUpdates: this.onlineUpdates,
      baselineReward: this.baselineReward, lastLoss: this.lastLoss, lastReward: this.lastReward,
      lastChosenDirIdx: this.lastChosenDirIdx, lastChosenLoadIdx: this.lastChosenLoadIdx,
    };
  }

  public restoreSnapshot(snapshot: ReturnType<JevNeuralBrain['createSnapshot']>): void {
    this.snapshotArrays().forEach((array, index) => array.set(snapshot.arrays[index]));
    const { arrays, ...state } = snapshot;
    Object.assign(this, state);
  }

  /**
   * Forward pass computing:
   * - `choice` distribution over Directives
   * - `choice` distribution over Counter-Alchemy Weapon Loadouts
   * - `noul` calibrated probabilities for Vault Threat, Counter-Alchemy, and Reinforcements
   * - `score` overall tactical urgency (0..1)
   */
  public evaluate(levers: Float32Array): {
    directive: JevChoiceResult<JevDirectiveType>;
    loadout: JevChoiceResult<EnemyWeaponLoadout>;
    vaultThreatNoul: JevNoulResult;
    counterAlchemyNoul: JevNoulResult;
    reinforceNoul: JevNoulResult;
    urgencyScore: number;
  } {
    const I = JevNeuralBrain.IN_DIM;
    const H = JevNeuralBrain.HIDDEN_DIM;
    this.lastLevers.set(levers);

    // 1. Hidden layer (LeakyReLU)
    for (let h = 0; h < H; h++) {
      let sum = this.b1[h];
      const row = h * I;
      for (let i = 0; i < I; i++) {
        sum += this.w1[row + i] * levers[i];
      }
      this.lastHidden[h] = sum > 0 ? sum : sum * 0.1;
    }

    // 2. Directive Softmax Head (`choice`)
    const dirLogits = new Float32Array(JevNeuralBrain.DIR_DIM);
    for (let d = 0; d < JevNeuralBrain.DIR_DIM; d++) {
      let sum = this.bDir[d];
      const row = d * H;
      for (let h = 0; h < H; h++) sum += this.wDir[row + h] * this.lastHidden[h];
      dirLogits[d] = sum;
    }
    this.computeSoftmax(dirLogits, this.lastDirProbs);

    // 3. Weapon Loadout Softmax Head (`choice`)
    const loadLogits = new Float32Array(JevNeuralBrain.LOAD_DIM);
    for (let l = 0; l < JevNeuralBrain.LOAD_DIM; l++) {
      let sum = this.bLoad[l];
      const row = l * H;
      for (let h = 0; h < H; h++) sum += this.wLoad[row + h] * this.lastHidden[h];
      loadLogits[l] = sum;
    }
    this.computeSoftmax(loadLogits, this.lastLoadProbs);

    // 4. Calibrated Sigmoid `noul` Heads
    for (let n = 0; n < JevNeuralBrain.NOUL_DIM; n++) {
      let sum = this.bNoul[n];
      const row = n * H;
      for (let h = 0; h < H; h++) sum += this.wNoul[row + h] * this.lastHidden[h];
      this.lastNoulProbs[n] = 1 / (1 + Math.exp(-sum));
    }

    // Package Directive Choice
    const dirDist = {} as Record<JevDirectiveType, number>;
    let bestDirIdx = 0;
    let bestDirProb = -1;
    for (let d = 0; d < JevNeuralBrain.DIR_DIM; d++) {
      const k = JEV_DIRECTIVES[d];
      const p = this.lastDirProbs[d];
      dirDist[k] = Math.round(p * 1000) / 1000;
      if (p > bestDirProb) {
        bestDirProb = p;
        bestDirIdx = d;
      }
    }
    this.lastChosenDirIdx = bestDirIdx;

    // Package Loadout Choice
    const loadDist = {} as Record<EnemyWeaponLoadout, number>;
    let bestLoadIdx = 0;
    let bestLoadProb = -1;
    for (let l = 0; l < JevNeuralBrain.LOAD_DIM; l++) {
      const k = JEV_LOADOUTS[l];
      const p = this.lastLoadProbs[l];
      loadDist[k] = Math.round(p * 1000) / 1000;
      if (p > bestLoadProb) {
        bestLoadProb = p;
        bestLoadIdx = l;
      }
    }
    this.lastChosenLoadIdx = bestLoadIdx;

    const urgencyScore =
      Math.round(
        (this.lastNoulProbs[0] * 0.4 +
          this.lastNoulProbs[1] * 0.3 +
          this.lastNoulProbs[2] * 0.3) *
          1000
      ) / 1000;

    return {
      directive: {
        selected: JEV_DIRECTIVES[bestDirIdx],
        confidence: Math.round(bestDirProb * 1000) / 1000,
        distribution: dirDist,
      },
      loadout: {
        selected: JEV_LOADOUTS[bestLoadIdx],
        confidence: Math.round(bestLoadProb * 1000) / 1000,
        distribution: loadDist,
      },
      vaultThreatNoul: {
        answer: this.lastNoulProbs[0] >= 0.5,
        probability: Math.round(this.lastNoulProbs[0] * 1000) / 1000,
      },
      counterAlchemyNoul: {
        answer: this.lastNoulProbs[1] >= 0.5,
        probability: Math.round(this.lastNoulProbs[1] * 1000) / 1000,
      },
      reinforceNoul: {
        answer: this.lastNoulProbs[2] >= 0.5,
        probability: Math.round(this.lastNoulProbs[2] * 1000) / 1000,
      },
      urgencyScore,
    };
  }

  /**
   * Trains the J.E.V. Neural Engine on `episodes` synthetic combat/alchemy scenarios
   * derived from the game's specific chemical & physical levers!
   */
  public trainCurriculumEpisodes(episodes: number, lr: number = 0.045): number {
    const x = new Float32Array(JevNeuralBrain.IN_DIM);
    let totalLoss = 0;

    for (let ep = 0; ep < episodes; ep++) {
      // Sample a random game state across the 12 levers
      for (let i = 0; i < 4; i++) x[i] = 0;
      // Include neutral/pressure-tool states so ordinary interception is learnable.
      const activeToolGroup = ep % 5;
      if (activeToolGroup < 4) x[activeToolGroup] = 0.85 + Math.random() * 0.15;
      x[4] = Math.random() < 0.2 ? 1.0 : 0.0; // Quantum Phase-Walk
      x[5] = activeToolGroup === 0 ? 0.65 + Math.random() * 0.35 : Math.random() * 0.5; // Temp
      x[6] = Math.random() * 0.6; // Pressure
      x[7] = activeToolGroup === 3 ? 0.6 + Math.random() * 0.4 : Math.random() * 0.25; // Radiation
      x[8] = Math.random(); // Bibbi Vault Proximity
      x[9] = Math.random() < 0.65 ? 0.4 + Math.random() * 0.6 : 0.0; // LoS ratio
      x[10] = activeToolGroup === 1 || Math.random() < 0.3 ? 1.0 : 0.0; // Player wet/conductive
      x[11] = Math.random() * 0.8; // Unit casualty rate

      // Compute optimal ground-truth counter-strategy from the game's physics & alchemy levers:
      // - If no LoS and low vault proximity -> SECTOR_PATROL (0), kinetic (0)
      // - If player is close to Bibbi's vault (x[8] > 0.72) -> FACILITY_HAZARD_FLUSH (5), acid (2)
      // - If player is wet/using water (x[10] > 0.5 or x[1] > 0.5) -> AERIAL_SODIUM_BOMB (4), sodium_bomb (4) (Na + H2O = BOOM!)
      // - If player is using Thermal/Thermite or high temp (x[0] > 0.5 or x[5] > 0.65) -> COUNTER_ALCHEMY_CRYO (2), cryo (1) (quench + cryo-brittle!)
      // - If player is using Corrosive/Quantum (x[2] > 0.5 or x[3] > 0.5) -> COUNTER_ALCHEMY_ACID (3), plasma (3)
      // - Otherwise with LoS -> CONVERGE_INTERCEPT (1), kinetic (0)
      let targetDir = 0;
      let targetLoad = 0;

      if (x[8] > 0.74) {
        targetDir = 5; // FACILITY_HAZARD_FLUSH
        targetLoad = 2; // acid
      } else if (x[9] < 0.1 && x[11] < 0.35) {
        targetDir = 0; // SECTOR_PATROL
        targetLoad = 0; // kinetic
      } else if (x[10] > 0.5 || x[1] > 0.6) {
        // Player is wet or spraying water -> drop Metallic Sodium bombs to detonate on H2O contact!
        targetDir = 4; // AERIAL_SODIUM_BOMB
        targetLoad = 4; // sodium_bomb
      } else if (x[0] > 0.5 || x[5] > 0.65) {
        // Player is using Heat/Thermite -> counter with LN2 Cryo-Jets!
        targetDir = 2; // COUNTER_ALCHEMY_CRYO
        targetLoad = 1; // cryo
      } else if (x[2] > 0.5 || x[3] > 0.5) {
        targetDir = 3; // COUNTER_ALCHEMY_ACID
        targetLoad = x[3] > 0.5 ? 3 : 2; // plasma or acid
      } else {
        targetDir = 1; // CONVERGE_INTERCEPT
        targetLoad = 0; // kinetic
      }

      const targetNoul0 = x[8] > 0.65 || (x[9] > 0.4 && x[8] > 0.45) ? 1.0 : 0.0; // Vault threat
      const targetNoul1 = x[0] > 0.5 || x[1] > 0.5 || x[10] > 0.5 ? 1.0 : 0.0; // Counter-alchemy opportunity
      const targetNoul2 = x[11] > 0.4 || x[8] > 0.7 ? 1.0 : 0.0; // Deploy reinforcements

      totalLoss += this.backpropSupervised(
        x,
        targetDir,
        targetLoad,
        targetNoul0,
        targetNoul1,
        targetNoul2,
        lr
      );
      this.trainedEpisodes++;
    }

    this.lastLoss = Math.round((totalLoss / Math.max(1, episodes)) * 10000) / 10000;
    return this.lastLoss;
  }

  /**
   * Online Reinforcement Learning (Policy Gradient / REINFORCE) during live gameplay!
   * When J.E.V.'s chosen directive & weapon loadout damages Dr. Vance or pushes him back,
   * `reward > 0` reinforces those weights for the current lever state; if J.E.V. loses units
   * or fails to stop Dr. Vance, `reward < 0` shifts probability mass toward alternative counters!
   */
  public applyOnlineReward(reward: number, lr: number = 0.025): void {
    this.lastReward = Math.round(reward * 100) / 100;
    this.baselineReward = this.baselineReward * 0.9 + reward * 0.1;
    const advantage = Math.max(-2.5, Math.min(2.5, reward - this.baselineReward));
    this.onlineUpdates++;

    const H = JevNeuralBrain.HIDDEN_DIM;
    const I = JevNeuralBrain.IN_DIM;
    const dHidden = new Float32Array(H);

    // Gradient on Directive Softmax Head: dL/dz_d = (p_d - 1_{d == chosen}) * advantage
    for (let d = 0; d < JevNeuralBrain.DIR_DIM; d++) {
      const indicator = d === this.lastChosenDirIdx ? 1.0 : 0.0;
      const grad = (this.lastDirProbs[d] - indicator) * advantage * lr;
      this.bDir[d] -= grad;
      const row = d * H;
      for (let h = 0; h < H; h++) {
        dHidden[h] += this.wDir[row + h] * grad;
        this.wDir[row + h] -= grad * this.lastHidden[h];
      }
    }

    // Gradient on Loadout Softmax Head
    for (let l = 0; l < JevNeuralBrain.LOAD_DIM; l++) {
      const indicator = l === this.lastChosenLoadIdx ? 1.0 : 0.0;
      const grad = (this.lastLoadProbs[l] - indicator) * advantage * lr;
      this.bLoad[l] -= grad;
      const row = l * H;
      for (let h = 0; h < H; h++) {
        dHidden[h] += this.wLoad[row + h] * grad;
        this.wLoad[row + h] -= grad * this.lastHidden[h];
      }
    }

    // Backprop into W1, b1
    for (let h = 0; h < H; h++) {
      const dAct = (this.lastHidden[h] > 0 ? 1.0 : 0.1) * dHidden[h];
      this.b1[h] -= dAct;
      const row = h * I;
      for (let i = 0; i < I; i++) {
        this.w1[row + i] -= dAct * this.lastLevers[i];
      }
    }
  }

  private backpropSupervised(
    x: Float32Array,
    targetDir: number,
    targetLoad: number,
    noul0: number,
    noul1: number,
    noul2: number,
    lr: number
  ): number {
    this.evaluate(x);
    const H = JevNeuralBrain.HIDDEN_DIM;
    const I = JevNeuralBrain.IN_DIM;
    const dHidden = new Float32Array(H);

    let loss =
      -Math.log(Math.max(1e-6, this.lastDirProbs[targetDir])) -
      Math.log(Math.max(1e-6, this.lastLoadProbs[targetLoad]));

    // 1. Directive cross-entropy gradient
    for (let d = 0; d < JevNeuralBrain.DIR_DIM; d++) {
      const grad = (this.lastDirProbs[d] - (d === targetDir ? 1.0 : 0.0)) * lr;
      this.bDir[d] -= grad;
      const row = d * H;
      for (let h = 0; h < H; h++) {
        dHidden[h] += this.wDir[row + h] * grad;
        this.wDir[row + h] -= grad * this.lastHidden[h];
      }
    }

    // 2. Loadout cross-entropy gradient
    for (let l = 0; l < JevNeuralBrain.LOAD_DIM; l++) {
      const grad = (this.lastLoadProbs[l] - (l === targetLoad ? 1.0 : 0.0)) * lr;
      this.bLoad[l] -= grad;
      const row = l * H;
      for (let h = 0; h < H; h++) {
        dHidden[h] += this.wLoad[row + h] * grad;
        this.wLoad[row + h] -= grad * this.lastHidden[h];
      }
    }

    // 3. Noul binary cross-entropy gradients
    const targetsNoul = [noul0, noul1, noul2];
    for (let n = 0; n < JevNeuralBrain.NOUL_DIM; n++) {
      const p = this.lastNoulProbs[n];
      const t = targetsNoul[n];
      loss -= t * Math.log(Math.max(1e-6, p)) + (1 - t) * Math.log(Math.max(1e-6, 1 - p));
      const grad = (p - t) * lr * 0.5;
      this.bNoul[n] -= grad;
      const row = n * H;
      for (let h = 0; h < H; h++) {
        dHidden[h] += this.wNoul[row + h] * grad;
        this.wNoul[row + h] -= grad * this.lastHidden[h];
      }
    }

    // 4. Hidden layer W1, b1 update
    for (let h = 0; h < H; h++) {
      const dAct = (this.lastHidden[h] > 0 ? 1.0 : 0.1) * dHidden[h];
      this.b1[h] -= dAct;
      const row = h * I;
      for (let i = 0; i < I; i++) {
        this.w1[row + i] -= dAct * x[i];
      }
    }

    return loss;
  }

  private computeSoftmax(logits: Float32Array, outProbs: Float32Array): void {
    let maxL = -Infinity;
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxL) maxL = logits[i];
    }
    let sum = 0;
    for (let i = 0; i < logits.length; i++) {
      const e = Math.exp(logits[i] - maxL);
      outProbs[i] = e;
      sum += e;
    }
    const inv = sum > 0 ? 1.0 / sum : 1.0 / logits.length;
    for (let i = 0; i < logits.length; i++) {
      outProbs[i] *= inv;
    }
  }
}

export class JevDirector {
  public readonly brain: JevNeuralBrain = new JevNeuralBrain();
  public alertLevel: number = 18; // 0..100
  public alertState: JevAlertState = 'STANDBY';
  public currentDirective: JevDirectiveType = 'SECTOR_PATROL';
  public currentLoadout: EnemyWeaponLoadout = 'kinetic';
  public directiveConfidence: number = 0.88;
  public vaultThreatProb: number = 0.12;
  public counterAlchemyProb: number = 0.25;
  public urgencyScore: number = 0.18;
  public lastBroadcast: string =
    'J.E.V. NEURAL ENGINE: 1,500 curriculum episodes trained. Monitoring facility levers.';
  public decisionTickCounter: number = 0;
  public reinforcementCooldown: number = 0;

  // State tracking between decisions to compute live RL rewards!
  private prevPlayerHp: number = 100;
  private prevDistToBibbi: number = 500;
  private prevActiveUnitCount: number = 0;

  public createSnapshot() {
    return {
      brain: this.brain.createSnapshot(),
      alertLevel: this.alertLevel, alertState: this.alertState,
      currentDirective: this.currentDirective, currentLoadout: this.currentLoadout,
      directiveConfidence: this.directiveConfidence, vaultThreatProb: this.vaultThreatProb,
      counterAlchemyProb: this.counterAlchemyProb, urgencyScore: this.urgencyScore,
      lastBroadcast: this.lastBroadcast, decisionTickCounter: this.decisionTickCounter,
      reinforcementCooldown: this.reinforcementCooldown,
      prevPlayerHp: this.prevPlayerHp, prevDistToBibbi: this.prevDistToBibbi,
      prevActiveUnitCount: this.prevActiveUnitCount,
    };
  }

  public restoreSnapshot(snapshot: ReturnType<JevDirector['createSnapshot']>): void {
    const { brain, ...state } = snapshot;
    this.brain.restoreSnapshot(brain);
    Object.assign(this, state);
  }

  public resetForLevel(mapName: string): void {
    this.alertLevel = 18;
    this.alertState = 'STANDBY';
    this.currentDirective = 'SECTOR_PATROL';
    this.currentLoadout = 'kinetic';
    this.directiveConfidence = 0.92;
    this.decisionTickCounter = 0;
    this.reinforcementCooldown = 200;
    this.prevPlayerHp = 100;
    this.prevDistToBibbi = 600;
    this.prevActiveUnitCount = 0;
    this.lastBroadcast = `J.E.V. [${mapName.toUpperCase()}]: Neural Policy active (${this.brain.trainedEpisodes} eps). Guards, Drones & Mechs online.`;
  }

  public reportIncident(deltaAlert: number, reason: string): void {
    this.alertLevel = Math.max(0, Math.min(100, this.alertLevel + deltaAlert));
    this.updateAlertState();
    this.lastBroadcast = `J.E.V. [${this.alertState} ${Math.round(this.alertLevel)}%]: ${reason}`;
  }

  private updateAlertState(): void {
    if (this.alertLevel >= 80) this.alertState = 'OMEGA_PROTOCOL';
    else if (this.alertLevel >= 50) this.alertState = 'TACTICAL_LOCK';
    else if (this.alertLevel >= 25) this.alertState = 'PATROL_ALERT';
    else this.alertState = 'STANDBY';
  }

  /**
   * Extracts the 12 normalized game levers directly from the live simulation state
   */
  public extractGameLevers(
    world: WorldGrid,
    player: Player,
    units: EnemyUnit[],
    bibbiPos: { x: number; y: number },
    loSCount: number
  ): Float32Array {
    const levers = new Float32Array(JevNeuralBrain.IN_DIM);
    const t = player.selectedTool;

    // Levers 0..3: Player's active alchemical tool category
    levers[0] = t === 2 || t === 6 ? 1.0 : 0.0; // Thermal / Thermite / Sodium
    levers[1] = t === 4 ? 1.0 : t === 2 ? 0.5 : 0.0; // Aqueous Solvents / Cryo
    levers[2] = t === 5 || t === 6 ? 1.0 : 0.0; // Acid / Alkali / Reactive
    levers[3] = t === 3 || t === 7 || t === 8 || t === 9 ? 1.0 : 0.0; // Time / Nuclear / Weak / Strong / Quantum

    // Lever 4: Player Quantum Phase-Walk active
    levers[4] = player.quantumPhaseTimer > 0 ? 1.0 : 0.0;

    // Sample local environment around player for Levers 5, 6, 7, 10
    const cx = Math.floor(player.x);
    const cy = Math.floor(player.y);
    let maxTemp = 22;
    let maxPress = 0;
    let radSum = 0;
    let wetCount = 0;

    for (let dy = -16; dy <= 16; dy += 4) {
      for (let dx = -16; dx <= 16; dx += 4) {
        if (!world.inBounds(cx + dx, cy + dy)) continue;
        const i = world.idx(cx + dx, cy + dy);
        const el = world.grid[i] as ElementId;
        if (world.temp[i] > maxTemp) maxTemp = world.temp[i];
        if (world.pressure[i] > maxPress) maxPress = world.pressure[i];
        radSum += world.radiation[i];
        if (
          el === ElementId.WATER ||
          el === ElementId.SALT_WATER ||
          el === ElementId.HEAVY_WATER ||
          el === ElementId.ACID
        ) {
          wetCount++;
        }
      }
    }

    // Lever 5: Local Temperature Anomaly
    levers[5] = Math.max(0, Math.min(1, (maxTemp + 200) / 1600));
    // Lever 6: Local Pressure Shockwave
    levers[6] = Math.max(0, Math.min(1, maxPress / 600));
    // Lever 7: Local Radiation & Neutron Flux
    levers[7] = Math.max(0, Math.min(1, (radSum + player.radiationDose * 0.5) / 50));

    // Lever 8: Bibbi Stasis Vault Proximity (1.0 = right at the vault, 0.0 = far away)
    const distToBibbi = Math.hypot(player.x - bibbiPos.x, player.y - bibbiPos.y);
    levers[8] = Math.max(0, Math.min(1, 1.0 - distToBibbi / 750));

    // Lever 9: Line-of-Sight Lock Ratio
    levers[9] = Math.max(0, Math.min(1, loSCount / 3));

    // Lever 10: Player in or near conductive/aqueous liquid (prime target for Sodium Bomb!)
    levers[10] = Math.max(0, Math.min(1, wetCount / 6));

    // Lever 11: Facility Unit Casualty Rate
    const totalUnits = Math.max(1, units.length);
    const deadOrDamaged = units.reduce(
      (acc, u) => acc + (!u.active ? 1.0 : (u.maxHp - u.hp) / u.maxHp),
      0
    );
    levers[11] = Math.max(0, Math.min(1, deadOrDamaged / totalUnits));

    return levers;
  }

  /**
   * Main 60Hz update for J.E.V. Neural Director, Guards, Drones, Heavy Robots, and Facility Defenses
   */
  public update(
    world: WorldGrid,
    player: Player,
    units: EnemyUnit[],
    defenses: FacilityDefense[],
    projectiles: Projectile[],
    bibbiPos: { x: number; y: number; rescued: boolean },
    sound: SoundEngine,
    tick: number
  ): void {
    this.decisionTickCounter++;
    if (this.reinforcementCooldown > 0) this.reinforcementCooldown--;

    // 1. Update Active Facility Defenses (Laser Grids, Ceiling Chemical Sprayers, Alarm Beacons)
    let defenseTriggeredLoS = 0;
    for (const def of defenses) {
      if (!def.active) continue;
      if (this.updateFacilityDefense(def, world, player, units, sound, tick)) {
        defenseTriggeredLoS++;
      }
    }

    // 2. Update Mobile Anti-Player Units (Hazmat Guards, Hunter-Seeker Drones, Heavy Combat Robots)
    let unitLoSCount = 0;
    let activeUnitCount = 0;

    for (const u of units) {
      if (!u.active) continue;
      activeUnitCount++;
      const hasLoS = this.updateEnemyUnit(u, world, player, projectiles, sound, tick);
      if (hasLoS) unitLoSCount++;
    }

    // 3. Every 36 ticks (~0.6s), compute online RL reward from previous action and run J.E.V. Neural Forward Pass!
    if (this.decisionTickCounter >= 36) {
      this.decisionTickCounter = 0;
      const distToBibbi = Math.hypot(player.x - bibbiPos.x, player.y - bibbiPos.y);
      const totalLoS = unitLoSCount + defenseTriggeredLoS;

      if (totalLoS > 0) {
        this.alertLevel = Math.min(100, this.alertLevel + totalLoS * 4.5);
      } else {
        this.alertLevel = Math.max(10, this.alertLevel - 0.8);
      }
      if (world.fusionTriggered) this.alertLevel = 100;
      this.updateAlertState();

      // Compute Online Reinforcement Learning Reward if J.E.V. was engaging the player:
      if (this.prevActiveUnitCount > 0 && (totalLoS > 0 || this.alertLevel > 30)) {
        const playerDmgDealt = Math.max(0, this.prevPlayerHp - player.hp);
        const vaultPushback = Math.max(-15, Math.min(15, distToBibbi - this.prevDistToBibbi)) * 0.04;
        const unitLosses = Math.max(0, this.prevActiveUnitCount - activeUnitCount);
        const reward = playerDmgDealt * 0.25 + vaultPushback - unitLosses * 1.1;
        if (Math.abs(reward) > 0.02) {
          this.brain.applyOnlineReward(reward);
        }
      }

      this.prevPlayerHp = player.hp;
      this.prevDistToBibbi = distToBibbi;
      this.prevActiveUnitCount = activeUnitCount;

      // Extract the 12 game levers & query J.E.V.'s trained neural network!
      const levers = this.extractGameLevers(world, player, units, bibbiPos, totalLoS);
      const out = this.brain.evaluate(levers);

      const prevDir = this.currentDirective;
      this.currentDirective = out.directive.selected;
      this.currentLoadout = out.loadout.selected;
      this.directiveConfidence = out.directive.confidence;
      this.vaultThreatProb = out.vaultThreatNoul.probability;
      this.counterAlchemyProb = out.counterAlchemyNoul.probability;
      this.urgencyScore = out.urgencyScore;

      if (prevDir !== this.currentDirective || totalLoS > 0) {
        const pct = Math.round(this.directiveConfidence * 100);
        switch (this.currentDirective) {
          case 'SECTOR_PATROL':
            this.lastBroadcast = `J.E.V. [PATROL ${pct}%]: Sweeping sectors (Vault Threat noul=${this.vaultThreatProb.toFixed(2)}).`;
            break;
          case 'CONVERGE_INTERCEPT':
            this.lastBroadcast = `J.E.V. [INTERCEPT ${pct}%]: Intruder locked! Converging Guards & Heavy Mechs (${this.currentLoadout.toUpperCase()}).`;
            break;
          case 'COUNTER_ALCHEMY_CRYO':
            this.lastBroadcast = `J.E.V. [CRYO-COUNTER ${pct}%]: High thermal lever detected — equipping LN₂ Cryo-Jets!`;
            break;
          case 'COUNTER_ALCHEMY_ACID':
            this.lastBroadcast = `J.E.V. [ACID-COUNTER ${pct}%]: Deploying H₂SO₄ Acid & Plasma suppression!`;
            break;
          case 'AERIAL_SODIUM_BOMB':
            this.lastBroadcast = `J.E.V. [Na-BOMB ${pct}%]: Aqueous lever detected — Drones dropping Metallic Sodium bombs!`;
            break;
          case 'FACILITY_HAZARD_FLUSH':
            this.lastBroadcast = `J.E.V. [OMEGA FLUSH ${pct}%]: Vault proximity critical! Activating ceiling sprayers & Mechs!`;
            break;
        }
      }
    }
  }

  private hasLineOfSight(
    world: WorldGrid,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    maxDist: number
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist > maxDist) return false;
    const steps = Math.max(1, Math.floor(dist / 4));
    const sx = dx / steps;
    const sy = dy / steps;
    let cx = x1;
    let cy = y1;
    for (let i = 1; i < steps; i++) {
      cx += sx;
      cy += sy;
      const gx = Math.floor(cx);
      const gy = Math.floor(cy);
      if (!world.inBounds(gx, gy)) return false;
      const el = world.getElement(gx, gy);
      if (ELEMENTS[el].state === 'solid' && el !== ElementId.GLASS && el !== ElementId.CRYO_GLASS) {
        return false;
      }
    }
    return true;
  }

  private updateFacilityDefense(
    def: FacilityDefense,
    world: WorldGrid,
    player: Player,
    units: EnemyUnit[],
    sound: SoundEngine,
    tick: number
  ): boolean {
    const gx = Math.floor(def.x);
    const gy = Math.floor(def.y);

    if (world.inBounds(gx, gy)) {
      const i = world.idx(gx, gy);
      const el = world.grid[i] as ElementId;
      const temp = world.temp[i];
      const press = world.pressure[i];
      if (
        temp > 600 ||
        el === ElementId.ACID ||
        el === ElementId.PLASMA ||
        el === ElementId.QUARK_PLASMA
      ) {
        def.hp -= 2.2;
      }
      if (press > 80) {
        def.hp -= press * 0.45;
      }
      if (def.hp <= 0) {
        def.active = false;
        world.applyPressureImpulse(gx, gy, 10, 120, sound);
        world.addReactionPopup(gx, gy, 'DEFENSE NODE OFFLINE!', '#4cc9f0');
        return false;
      }
    }

    if (def.cooldown > 0) def.cooldown--;

    if (def.type === 'laser_grid') {
      let len = 0;
      let hitX = def.x;
      let hitY = def.y;
      let hitPlayer = false;

      while (len < def.maxLength) {
        len += 2;
        hitX = def.x + def.dirX * len;
        hitY = def.y + def.dirY * len;
        const lx = Math.floor(hitX);
        const ly = Math.floor(hitY);
        if (!world.inBounds(lx, ly)) break;

        const el = world.getElement(lx, ly);
        if (ELEMENTS[el].state === 'solid' && el !== ElementId.GLASS && el !== ElementId.CRYO_GLASS) {
          if ((tick & 7) === 0) {
            world.temp[world.idx(lx, ly)] = Math.min(450, world.temp[world.idx(lx, ly)] + 8);
          }
          break;
        }

        if (
          player.quantumPhaseTimer <= 0 &&
          Math.abs(player.x - hitX) <= player.width * 0.6 &&
          Math.abs(player.y - hitY) <= player.height * 0.55
        ) {
          hitPlayer = true;
        }
      }

      def.currentEndX = hitX;
      def.currentEndY = hitY;
      def.triggered = hitPlayer;

      if (hitPlayer) {
        player.hp = Math.max(0, player.hp - 0.38);
        if (def.cooldown <= 0) {
          def.cooldown = 50;
          sound.playQuantumBeam(880);
          world.addReactionPopup(
            Math.floor(player.x),
            Math.floor(player.y) - 10,
            '🚨 J.E.V. LASER TRIPWIRE BREACHED!',
            '#ff4d6d'
          );
          this.reportIncident(18, 'Security Laser Grid breached! Dispatching interceptors.');
        }
        return true;
      }
      return false;
    }

    if (def.type === 'ceiling_sprayer') {
      const dx = Math.abs(player.x - def.x);
      const dy = player.y - def.y;
      const playerUnderneath = dx < 68 && dy > 0 && dy < 160;
      const omegaFlush =
        this.currentDirective === 'FACILITY_HAZARD_FLUSH' && dx < 140 && dy > 0 && dy < 200;
      def.triggered = playerUnderneath || omegaFlush;

      if (def.triggered && def.cooldown <= 0) {
        def.cooldown = 5;
        const sx = Math.floor(def.x + (Math.random() - 0.5) * 8);
        const sy = Math.floor(def.y + 4);
        if (world.inBounds(sx, sy) && world.getElement(sx, sy) === ElementId.EMPTY) {
          const sprayEl = def.sprayElement ?? ElementId.ACID;
          const sprayTemp = sprayEl === ElementId.LIQUID_NITROGEN ? -196 : 35;
          world.setElement(sx, sy, sprayEl, sprayTemp);
        }
        return true;
      }
      return false;
    }

    if (def.type === 'alarm_beacon') {
      const dist = Math.hypot(player.x - def.x, player.y - def.y);
      const detected =
        dist < 145 &&
        player.quantumPhaseTimer <= 0 &&
        this.hasLineOfSight(world, def.x, def.y, player.x, player.y, 145);
      def.triggered = detected;

      if (detected) {
        if (def.cooldown <= 0) {
          def.cooldown = 90;
          this.reportIncident(12, 'Sensor Beacon locked onto Dr. Vance!');
          const activeCount = units.filter((u) => u.active).length;
          if (activeCount < 7 && this.reinforcementCooldown <= 0 && this.alertLevel >= 45) {
            this.reinforcementCooldown = 420;
            units.push({
              id: `jev-drone-${tick}`,
              type: 'drone',
              name: 'J.E.V. Wasp-Drone',
              x: def.x,
              y: def.y + 10,
              vx: 0,
              vy: 0,
              width: 12,
              height: 10,
              hp: 75,
              maxHp: 75,
              facing: player.x >= def.x ? 1 : -1,
              grounded: false,
              active: true,
              cooldown: 35,
              patrolMinX: Math.max(30, def.x - 140),
              patrolMaxX: Math.min(world.width - 30, def.x + 140),
              homeY: def.y + 12,
              wetTimer: 0,
              rustedLevel: 0,
              cryoBrittleTimer: 0,
              stasisTimer: 0,
              aiState: 'pursue',
              aiThought: 'WARP INTERCEPT',
              weaponLoadout: this.currentLoadout,
            });
            sound.playQuantumBeam(740);
            world.addReactionPopup(
              Math.floor(def.x),
              Math.floor(def.y) + 8,
              '🛸 J.E.V. DRONE REINFORCEMENT WARPED!',
              '#f72585'
            );
          }
        }
        return true;
      }
      return false;
    }

    return false;
  }

  private updateEnemyUnit(
    u: EnemyUnit,
    world: WorldGrid,
    player: Player,
    projectiles: Projectile[],
    sound: SoundEngine,
    tick: number
  ): boolean {
    if (u.cooldown > 0) u.cooldown--;
    if (u.wetTimer > 0) u.wetTimer--;
    if (u.cryoBrittleTimer > 0) u.cryoBrittleTimer--;
    if (u.stasisTimer > 0) {
      u.stasisTimer--;
      u.aiState = 'stasis';
      u.aiThought = 'STASIS FROZEN (Δt=0)';
      return false;
    }

    const envDanger = this.sampleUnitEnvironment(u, world, sound);
    if (!u.active) return false;

    const sightRange = u.type === 'drone' ? 220 : u.type === 'robot' ? 190 : 175;
    const distToPlayer = Math.hypot(player.x - u.x, player.y - u.y);
    const canSeePlayer =
      player.quantumPhaseTimer <= 0 &&
      this.hasLineOfSight(world, u.x, u.y, player.x, player.y, sightRange);

    if (envDanger) {
      u.aiState = 'evade_hazard';
      u.aiThought = 'EVADING ALCHEMY HAZARD!';
    } else if (canSeePlayer) {
      u.aiState = distToPlayer < (u.type === 'robot' ? 130 : 115) ? 'attack' : 'pursue';
    } else if (
      (this.currentDirective === 'CONVERGE_INTERCEPT' ||
        this.currentDirective === 'FACILITY_HAZARD_FLUSH') &&
      distToPlayer < 290
    ) {
      u.aiState = 'pursue';
      u.aiThought = `J.E.V. ${this.currentDirective}`;
    } else {
      u.aiState = 'patrol';
      u.aiThought = 'PATROLLING SECTOR';
    }

    // Apply J.E.V.'s trained loadout decision to Guards and Drones!
    if (u.type === 'guard') {
      if (this.currentDirective === 'COUNTER_ALCHEMY_CRYO' || this.currentLoadout === 'cryo') {
        u.weaponLoadout = 'cryo';
      } else if (
        this.currentDirective === 'COUNTER_ALCHEMY_ACID' ||
        this.currentLoadout === 'acid'
      ) {
        u.weaponLoadout = 'acid';
      } else {
        u.weaponLoadout = 'kinetic';
      }
    } else if (u.type === 'drone') {
      u.weaponLoadout =
        this.currentDirective === 'AERIAL_SODIUM_BOMB' ||
        this.currentLoadout === 'sodium_bomb' ||
        (Math.abs(player.x - u.x) < 44 && player.y > u.y)
          ? 'sodium_bomb'
          : 'plasma';
    }

    if (u.type === 'drone') {
      this.moveFlyingDrone(u, world, player, projectiles, envDanger, tick);
    } else {
      this.moveGroundUnit(u, world, player, envDanger);
    }

    if (canSeePlayer && u.cooldown <= 0) {
      this.fireUnitWeapon(u, world, player, projectiles, sound);
    }

    return canSeePlayer;
  }

  private sampleUnitEnvironment(u: EnemyUnit, world: WorldGrid, sound: SoundEngine): boolean {
    const cx = Math.floor(u.x);
    const cy = Math.floor(u.y);
    const rx = Math.ceil(u.width / 2);
    const ry = Math.ceil(u.height / 2);

    let maxTemp = 20;
    let minTemp = 20;
    let maxPress = 0;
    let radSum = 0;
    let inAcid = false;
    let inWater = false;
    let inAnyLiquid = false;
    let inLavaOrFire = false;
    let inQuarkOrFusion = false;
    let hasTimeAccel = false;
    let hasTimeStasis = false;
    let hasCryoFlag = false;

    for (let dy = -ry; dy <= ry; dy += 2) {
      for (let dx = -rx; dx <= rx; dx += 2) {
        const px = cx + dx;
        const py = cy + dy;
        if (!world.inBounds(px, py)) continue;
        const i = world.idx(px, py);
        const el = world.grid[i] as ElementId;
        const t = world.temp[i];
        const p = world.pressure[i];
        const f = world.flags[i];

        if (t > maxTemp) maxTemp = t;
        if (t < minTemp) minTemp = t;
        if (p > maxPress) maxPress = p;
        radSum += world.radiation[i];

        if (ELEMENTS[el].state === 'liquid') {
          inAnyLiquid = true;
        }
        if (el === ElementId.ACID) inAcid = true;
        if (
          el === ElementId.WATER ||
          el === ElementId.SALT_WATER ||
          el === ElementId.HEAVY_WATER
        ) {
          inWater = true;
        }
        if (el === ElementId.LAVA || el === ElementId.FIRE || el === ElementId.PLASMA) {
          inLavaOrFire = true;
        }
        if (el === ElementId.QUARK_PLASMA || el === ElementId.FUSION_PLASMA) {
          inQuarkOrFusion = true;
        }
        if ((f & FLAG_TIME_ACCEL) !== 0) hasTimeAccel = true;
        if ((f & FLAG_TIME_STASIS) !== 0) hasTimeStasis = true;
        if ((f & FLAG_CRYO_BRITTLE) !== 0) hasCryoFlag = true;
      }
    }

    if (hasTimeStasis) {
      u.stasisTimer = 110;
      world.addReactionPopup(cx, cy - 8, '⏱️ UNIT LOCKED IN STASIS!', '#4361ee');
      return false;
    }

    if (inWater || inAnyLiquid) {
      u.wetTimer = Math.max(u.wetTimer, 120);
    }

    if (hasTimeAccel && (u.wetTimer > 0 || inWater)) {
      u.rustedLevel = Math.min(100, u.rustedLevel + (u.type === 'robot' ? 18 : 10));
      u.hp -= u.type === 'robot' ? 6.5 : 3.5;
      world.addReactionPopup(cx, cy - 10, '4Fe + 3O₂ + Δt → MECH RUSTED!', '#b55233');
    }

    if (minTemp < -110 || hasCryoFlag) {
      u.cryoBrittleTimer = 160;
    }

    if (maxPress > 22) {
      const mult = (u.cryoBrittleTimer > 0 ? 3.2 : 1.0) * (u.type === 'drone' ? 1.45 : 1.0);
      u.hp -= maxPress * 0.42 * mult;
      u.vy -= Math.min(2.4, maxPress * 0.014);
      if (u.cryoBrittleTimer > 0) {
        world.addReactionPopup(cx, cy - 10, '❄️ CRYO-SHATTER CRITICAL!', '#72efdd');
      }
    }

    if (inQuarkOrFusion) {
      u.hp -= 12;
    } else if (inAcid) {
      u.hp -= u.type === 'robot' ? 1.4 : 2.2;
    }
    if (maxTemp > 380 || inLavaOrFire) {
      u.hp -= (maxTemp - 300) * 0.012;
    }
    if (radSum > 4 && u.type === 'guard') {
      u.hp -= radSum * 0.08;
    }

    if (u.hp <= 0) {
      this.killUnit(u, world, sound);
      return false;
    }

    return inAnyLiquid || inAcid || inLavaOrFire || maxTemp > 320;
  }

  public killUnit(u: EnemyUnit, world: WorldGrid, sound: SoundEngine): void {
    if (!u.active) return;
    u.active = false;
    const cx = Math.floor(u.x);
    const cy = Math.floor(u.y);
    const blastRadius = u.type === 'robot' ? 16 : 11;
    world.applyPressureImpulse(cx, cy, blastRadius, 165, sound);

    // Materialize the unit's physical anatomy into real world pixels!
    const rx = u.type === 'robot' ? 6 : 5;
    const ry = u.type === 'robot' ? 7 : 5;
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        const px = cx + dx;
        const py = cy + dy;
        if (!world.inBounds(px, py) || world.getElement(px, py) !== ElementId.EMPTY) continue;

        if (u.type === 'drone') {
          // Drone: top rotors flash into fire/steam, chassis shatters into rust, bottom canister drops real SODIUM or THERMITE!
          if (dy >= 2 && Math.abs(dx) <= 2) {
            world.setElement(
              px,
              py,
              u.weaponLoadout === 'sodium_bomb' ? ElementId.SODIUM : ElementId.THERMITE,
              85
            );
          } else if (dy <= -2) {
            world.setElement(px, py, ElementId.FIRE, 780, 12);
          } else {
            world.setElement(px, py, ElementId.RUST, 180);
          }
        } else if (u.type === 'guard') {
          // Hazmat Guard: backpack tank ruptures its chemical payload while suit chars into ash & fire!
          if (dx * u.facing < -1 && Math.abs(dy) <= 2) {
            const tankEl =
              u.weaponLoadout === 'acid'
                ? ElementId.ACID
                : u.weaponLoadout === 'cryo'
                  ? ElementId.LIQUID_NITROGEN
                  : ElementId.OIL;
            world.setElement(px, py, tankEl, tankEl === ElementId.LIQUID_NITROGEN ? -196 : 60);
          } else {
            world.setElement(px, py, (dx + dy) & 1 ? ElementId.CARBON : ElementId.FIRE, 650, 14);
          }
        } else {
          // Heavy Aegis Combat Mech: collapses into a heap of rusted armor plates, thermite core, and molten steel droplets!
          const mechEl =
            u.rustedLevel > 25
              ? ElementId.RUST
              : Math.abs(dx) <= 2 && Math.abs(dy) <= 2
                ? ElementId.MOLTEN_STEEL
                : (dx + dy) & 1
                  ? ElementId.RUST
                  : ElementId.FIRE;
          world.setElement(px, py, mechEl, mechEl === ElementId.MOLTEN_STEEL ? 1600 : 750);
        }
      }
    }
    world.addReactionPopup(cx, cy - 8, `💥 ${u.name.toUpperCase()} NEUTRALIZED!`, '#ffd166');
    this.reportIncident(14, `${u.name} destroyed by alchemical reaction!`);
    // Negative RL reward so J.E.V. adapts its policy when a unit is lost!
    this.brain.applyOnlineReward(-0.85);
  }

  private moveFlyingDrone(
    u: EnemyUnit,
    world: WorldGrid,
    player: Player,
    projectiles: Projectile[],
    envDanger: boolean,
    tick: number
  ): void {
    let targetX = u.x;
    let targetY = u.homeY + Math.sin(tick * 0.06 + u.x * 0.05) * 14;

    if (u.aiState === 'patrol') {
      targetX = u.x + u.facing * 2.2;
      if (u.x <= u.patrolMinX) u.facing = 1;
      if (u.x >= u.patrolMaxX) u.facing = -1;
    } else if (u.aiState === 'pursue' || u.aiState === 'attack') {
      u.facing = player.x >= u.x ? 1 : -1;
      const hoverDistX = u.weaponLoadout === 'sodium_bomb' ? 0 : -u.facing * 58;
      targetX = player.x + hoverDistX;
      targetY = player.y - 46;
      u.aiThought =
        u.weaponLoadout === 'sodium_bomb' ? 'BOMBING VECTOR (Na/Thermite)' : 'ENGAGING TARGET';
    } else if (envDanger) {
      targetY = u.y - 28;
    }

    for (const p of projectiles) {
      if (!p.fromPlayer || p.type === 'kinetic' || p.type === 'implosion') continue;
      const dist = Math.hypot(p.x - u.x, p.y - u.y);
      if (dist < 34) {
        u.vy -= Math.sign(p.y - u.y || 1) * 0.35;
        u.vx -= Math.sign(p.x - u.x || 1) * 0.25;
        u.aiThought = 'EVADING PROJECTILE!';
        break;
      }
    }

    const ax = Math.max(-0.22, Math.min(0.22, (targetX - u.x) * 0.04));
    const ay = Math.max(-0.22, Math.min(0.22, (targetY - u.y) * 0.04));
    u.vx = Math.max(-3.8, Math.min(3.8, (u.vx + ax) * 0.92));
    u.vy = Math.max(-3.4, Math.min(3.4, (u.vy + ay) * 0.92));

    const nextX = u.x + u.vx;
    const nextY = u.y + u.vy;

    if (!this.checkBoxCollision(nextX, u.y, u.width, u.height, world)) {
      u.x = nextX;
    } else {
      if (Math.abs(u.vx) > 2.2) u.hp -= 12;
      u.vx = -u.vx * 0.6;
      u.facing = u.facing === 1 ? -1 : 1;
    }

    if (!this.checkBoxCollision(u.x, nextY, u.width, u.height, world)) {
      u.y = nextY;
    } else {
      if (Math.abs(u.vy) > 2.0) u.hp -= 12;
      u.vy = -u.vy * 0.6;
    }
  }

  private hasLiquidPoolAhead(u: EnemyUnit, dir: 1 | -1, world: WorldGrid): boolean {
    const checkX = Math.floor(u.x + dir * (u.width / 2 + 6));
    const footY = Math.floor(u.y + u.height / 2);
    for (let dy = -4; dy <= 16; dy += 2) {
      if (!world.inBounds(checkX, footY + dy)) continue;
      const el = world.getElement(checkX, footY + dy);
      const state = ELEMENTS[el].state;
      if (state === 'liquid') return true;
      if (state === 'solid' || state === 'powder') return false;
    }
    return false;
  }

  private moveGroundUnit(
    u: EnemyUnit,
    world: WorldGrid,
    player: Player,
    envDanger: boolean
  ): void {
    const rustSlowdown = Math.max(0.35, 1 - u.rustedLevel * 0.006);
    const cryoSlowdown = u.cryoBrittleTimer > 0 ? 0.55 : 1.0;
    const baseSpeed = (u.type === 'robot' ? 1.25 : 1.95) * rustSlowdown * cryoSlowdown;

    if (envDanger) {
      // Emergency hydro-thrusters: boost upward out of any liquid pool/hazard toward dry ground!
      u.vx = u.facing * baseSpeed * 1.05;
      u.vy = Math.max(-3.0, u.vy - 0.52);
      u.grounded = false;
    } else if (u.aiState === 'patrol') {
      if (this.hasLiquidPoolAhead(u, u.facing, world)) {
        u.facing = u.facing === 1 ? -1 : 1;
      }
      u.vx = u.facing * baseSpeed * 0.65;
      if (u.x <= u.patrolMinX) u.facing = 1;
      if (u.x >= u.patrolMaxX) u.facing = -1;
    } else if (u.aiState === 'pursue') {
      u.facing = player.x >= u.x ? 1 : -1;
      if (this.hasLiquidPoolAhead(u, u.facing, world)) {
        // Hold dry high ground and shoot across the vat rather than marching into the liquid!
        u.vx = 0;
        u.aiThought = 'HOLDING HIGH GROUND';
      } else {
        u.vx = u.facing * baseSpeed;
        u.aiThought = u.type === 'robot' ? 'HEAVY MECH ADVANCE' : 'PURSUING DR. VANCE';
      }
    } else if (u.aiState === 'attack') {
      u.facing = player.x >= u.x ? 1 : -1;
      const dist = Math.abs(player.x - u.x);
      const desiredDir: 1 | -1 = dist < 44 ? (u.facing === 1 ? -1 : 1) : u.facing;
      if (this.hasLiquidPoolAhead(u, desiredDir, world)) {
        u.vx = 0;
      } else if (dist < 44) {
        u.vx = -u.facing * baseSpeed * 0.55;
      } else if (dist > 88) {
        u.vx = u.facing * baseSpeed * 0.75;
      } else {
        u.vx *= 0.6;
      }
      u.aiThought = `FIRING ${u.weaponLoadout.toUpperCase()}`;
    }

    u.vy = Math.min(4.2, u.vy + 0.21);

    const nextX = u.x + u.vx;
    if (!this.checkBoxCollision(nextX, u.y, u.width, u.height, world)) {
      u.x = nextX;
    } else {
      let stepped = false;
      for (let stepY = 1; stepY <= 6; stepY++) {
        if (!this.checkBoxCollision(nextX, u.y - stepY, u.width, u.height, world)) {
          u.x = nextX;
          u.y -= stepY;
          stepped = true;
          break;
        }
      }
      if (!stepped) {
        if (u.type === 'robot') {
          this.crushBrittleAhead(u, world);
        }
        if ((u.aiState === 'pursue' || u.aiState === 'attack' || envDanger) && u.grounded) {
          u.vy = -3.2;
          u.grounded = false;
        } else {
          u.facing = u.facing === 1 ? -1 : 1;
          u.vx = 0;
        }
      }
    }

    const nextY = u.y + u.vy;
    if (!this.checkBoxCollision(u.x, nextY, u.width, u.height, world)) {
      u.y = nextY;
      u.grounded = false;
    } else {
      if (u.vy > 0) u.grounded = true;
      u.vy = 0;
    }
  }

  private crushBrittleAhead(u: EnemyUnit, world: WorldGrid): void {
    const frontX = Math.floor(u.x + u.facing * (u.width / 2 + 2));
    const cy = Math.floor(u.y);
    for (let dy = -8; dy <= 8; dy++) {
      if (!world.inBounds(frontX, cy + dy)) continue;
      const i = world.idx(frontX, cy + dy);
      const el = world.grid[i] as ElementId;
      if (
        el === ElementId.GLASS ||
        el === ElementId.CRYO_GLASS ||
        el === ElementId.ICE ||
        el === ElementId.RUST ||
        (world.flags[i] & FLAG_CRYO_BRITTLE) !== 0
      ) {
        world.setElement(frontX, cy + dy, ElementId.EMPTY);
      }
    }
  }

  private fireUnitWeapon(
    u: EnemyUnit,
    world: WorldGrid,
    player: Player,
    projectiles: Projectile[],
    sound: SoundEngine
  ): void {
    const dx = player.x - u.x;
    const dy = player.y - u.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const spawnX = u.x + nx * (u.width * 0.65);
    const spawnY = u.y + ny * (u.height * 0.4);

    // If a walking bot's weapon barrel is submerged in liquid, hold fire while jetting out!
    const barrelEl = world.getElement(Math.floor(spawnX), Math.floor(spawnY));
    const barrelInLiquid = ELEMENTS[barrelEl].state === 'liquid';
    if (u.type !== 'drone' && barrelInLiquid) {
      u.cooldown = 15;
      return;
    }

    if (u.type === 'guard') {
      u.cooldown = 58;
      // Never fire cryo while wet/near water so the guard doesn't freeze itself in solid ice!
      if (u.weaponLoadout === 'cryo' && u.wetTimer <= 0) {
        sound.playThermalStream(true);
        projectiles.push({
          x: spawnX,
          y: spawnY,
          vx: nx * 6.2,
          vy: ny * 6.2,
          type: 'cryo',
          color: '#72efdd',
          radius: 7,
          ttl: 55,
          fromPlayer: false,
        });
      } else if (u.weaponLoadout === 'acid' && !barrelInLiquid) {
        sound.playLiquidSpray(true);
        projectiles.push({
          x: spawnX,
          y: spawnY,
          vx: nx * 5.6,
          vy: ny * 5.6 - 0.3,
          type: 'chemical',
          element: ElementId.ACID,
          color: '#80ed99',
          radius: 5,
          ttl: 70,
          fromPlayer: false,
        });
      } else {
        sound.playQuantumBeam(380);
        projectiles.push({
          x: spawnX,
          y: spawnY,
          vx: nx * 5.8,
          vy: ny * 5.8,
          type: 'enemy_bolt',
          color: '#ff595e',
          radius: 5,
          ttl: 65,
          fromPlayer: false,
        });
      }
    } else if (u.type === 'drone') {
      if (u.weaponLoadout === 'sodium_bomb') {
        u.cooldown = 75;
        sound.playAlkaliLaunch(false);
        projectiles.push({
          x: u.x,
          y: u.y + 6,
          vx: nx * 2.2,
          vy: 3.5,
          type: 'chemical',
          element: Math.random() < 0.5 ? ElementId.SODIUM : ElementId.THERMITE,
          color: '#ff9f1c',
          radius: 5,
          ttl: 75,
          fromPlayer: false,
        });
      } else {
        u.cooldown = 48;
        sound.playQuantumBeam(460);
        projectiles.push({
          x: spawnX,
          y: spawnY,
          vx: nx * 6.0,
          vy: ny * 6.0,
          type: 'enemy_bolt',
          color: '#f72585',
          radius: 5,
          ttl: 65,
          fromPlayer: false,
        });
      }
    } else if (u.type === 'robot') {
      u.cooldown = 72;
      sound.playKineticShot(false);
      projectiles.push({
        x: spawnX,
        y: spawnY,
        vx: nx * 6.4,
        vy: ny * 6.4,
        type: 'kinetic',
        color: '#ffd166',
        radius: 10,
        ttl: 70,
        fromPlayer: false,
      });
    }
  }

  private checkBoxCollision(
    cx: number,
    cy: number,
    width: number,
    height: number,
    world: WorldGrid
  ): boolean {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    for (let py = Math.floor(cy - halfH); py <= Math.floor(cy + halfH); py += 2) {
      for (let px = Math.floor(cx - halfW); px <= Math.floor(cx + halfW); px += 2) {
        if (world.isSolidForEntity(px, py, false)) {
          return true;
        }
      }
    }
    return false;
  }
}
