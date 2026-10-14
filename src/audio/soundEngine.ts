export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterOut: AudioNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public muted: boolean = false;

  private lastSizzleTime = 0;
  private lastGeigerTime = 0;
  private lastThermalTime = 0;
  private lastSprayTime = 0;
  private lastJetpackTime = 0;
  private lastStepTime = 0;
  private lastHitTime = 0;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        // Master Dynamics Compressor prevents clipping during heavy alchemical chain reactions
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-14, this.ctx.currentTime);
        comp.knee.setValueAtTime(18, this.ctx.currentTime);
        comp.ratio.setValueAtTime(6, this.ctx.currentTime);
        comp.attack.setValueAtTime(0.003, this.ctx.currentTime);
        comp.release.setValueAtTime(0.18, this.ctx.currentTime);
        comp.connect(this.ctx.destination);
        this.masterOut = comp;

        // Pre-allocate 2-second white/pink hybrid noise buffer for zero-GC real-time synthesis
        const len = this.ctx.sampleRate * 2;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.997 * b0 + white * 0.029;
          b1 = 0.985 * b1 + white * 0.032;
          b2 = 0.95 * b2 + white * 0.048;
          data[i] = white * 0.65 + (b0 + b1 + b2) * 0.35;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private get dest(): AudioNode {
    return this.masterOut || this.ctx!.destination;
  }

  private createNoiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const offset = Math.random() * 1.5;
    src.start(ctx.currentTime, offset);
    return src;
  }

  /**
   * Tool 1: Graviton Pressure Cannon (LMB Kinetic Shockwave / RMB Hyper-Implosion)
   */
  public playKineticShot(overcharged: boolean = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = overcharged ? 0.42 : 0.2;

    // 1. Sub-bass graviton thump
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = overcharged ? 'sawtooth' : 'triangle';
    sub.frequency.setValueAtTime(overcharged ? 260 : 195, now);
    sub.frequency.exponentialRampToValueAtTime(26, now + dur);
    subGain.gain.setValueAtTime(overcharged ? 0.38 : 0.26, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    sub.connect(subGain);
    subGain.connect(this.dest);
    sub.start(now);
    sub.stop(now + dur + 0.01);

    // 2. High-voltage capacitor discharge chirp
    const chirp = ctx.createOscillator();
    const chirpGain = ctx.createGain();
    chirp.type = 'sine';
    chirp.frequency.setValueAtTime(overcharged ? 1680 : 1120, now);
    chirp.frequency.exponentialRampToValueAtTime(overcharged ? 95 : 180, now + dur * 0.65);
    chirpGain.gain.setValueAtTime(0.14, now);
    chirpGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.7);
    chirp.connect(chirpGain);
    chirpGain.connect(this.dest);
    chirp.start(now);
    chirp.stop(now + dur * 0.72);

    // 3. Transient air-displacement crack
    if (this.noiseBuffer) {
      const noise = this.createNoiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(overcharged ? 950 : 1400, now);
      filter.Q.setValueAtTime(1.8, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(overcharged ? 0.24 : 0.14, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.dest);
      noise.stop(now + 0.095);
    }
  }

  /**
   * Tool 2: Plasma Heat Ray (LMB) & Liquid Nitrogen Cryo-Jet (RMB)
   */
  public playThermalStream(isCryo: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    if (now - this.lastThermalTime < 0.055) return;
    this.lastThermalTime = now;

    const dur = 0.09;
    const noise = this.createNoiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (isCryo) {
      // Crystalline high-pressure LN2 frost hiss + ice shimmer
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3600 + Math.random() * 1400, now);
      filter.Q.setValueAtTime(4.2, now);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.002, now + dur);

      const chime = ctx.createOscillator();
      const cGain = ctx.createGain();
      chime.type = 'sine';
      chime.frequency.setValueAtTime(2400 + Math.random() * 1600, now);
      cGain.gain.setValueAtTime(0.025, now);
      cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      chime.connect(cGain);
      cGain.connect(this.dest);
      chime.start(now);
      chime.stop(now + 0.055);
    } else {
      // Roaring plasma torch jet
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(520 + Math.random() * 280, now);
      filter.Q.setValueAtTime(1.6, now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.002, now + dur);
    }

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.dest);
    noise.stop(now + dur + 0.01);
  }

  /**
   * Tool 3: Chroniton Time Manipulator (LMB Time Accel / RMB Time Stasis)
   */
  public playChronitonField(accelerate: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.16;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    if (accelerate) {
      // Rising clockwork harmonic shimmer
      osc1.frequency.setValueAtTime(440, now);
      osc1.frequency.exponentialRampToValueAtTime(1320, now + dur);
      osc2.frequency.setValueAtTime(660, now);
      osc2.frequency.exponentialRampToValueAtTime(1980, now + dur);
    } else {
      // Temporal slowdown pitch droop
      osc1.frequency.setValueAtTime(580, now);
      osc1.frequency.exponentialRampToValueAtTime(110, now + dur);
      osc2.frequency.setValueAtTime(870, now);
      osc2.frequency.exponentialRampToValueAtTime(165, now + dur);
    }

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.dest);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + dur + 0.01);
    osc2.stop(now + dur + 0.01);
  }

  /**
   * Tools 4 & 5: Pressurized Liquid Stream (Water, Heavy Water, Acid, Alkali)
   */
  public playLiquidSpray(isCorrosive: boolean = false): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    if (now - this.lastSprayTime < 0.05) return;
    this.lastSprayTime = now;

    const dur = 0.075;
    const noise = this.createNoiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const baseFreq = isCorrosive ? 1850 : 950;
    filter.frequency.setValueAtTime(baseFreq + Math.random() * 650, now);
    filter.Q.setValueAtTime(isCorrosive ? 3.5 : 2.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.075, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.dest);
    noise.stop(now + dur + 0.01);
  }

  /**
   * Tool 6: Reactive Pellet Launcher (Metallic Sodium / Thermite)
   */
  public playAlkaliLaunch(isThermite: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Pneumatic mortar pop
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isThermite ? 290 : 230, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.11);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.dest);
    osc.start(now);
    osc.stop(now + 0.125);
  }

  /**
   * Tool 8 & 9: Sub-Atomic Weak Force & Strong Force / Quantum Beams
   */
  public playSubatomicBeam(mode: 'weak' | 'strong' | 'tunnel'): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.15;

    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const outGain = ctx.createGain();

    if (mode === 'weak') {
      // W/Z Boson beta-decay FM warble
      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(620, now);
      carrier.frequency.exponentialRampToValueAtTime(940, now + dur);
      mod.frequency.setValueAtTime(65, now);
      modGain.gain.setValueAtTime(180, now);
    } else if (mode === 'strong') {
      // Deep gluon unbinding sawtooth growl
      carrier.type = 'sawtooth';
      carrier.frequency.setValueAtTime(145, now);
      carrier.frequency.exponentialRampToValueAtTime(52, now + dur);
      mod.frequency.setValueAtTime(38, now);
      modGain.gain.setValueAtTime(90, now);
    } else {
      // Ethereal |Ψ⟩ Quantum Superposition chord
      carrier.type = 'sine';
      carrier.frequency.setValueAtTime(528, now);
      carrier.frequency.exponentialRampToValueAtTime(1056, now + dur);
      mod.frequency.setValueAtTime(12, now);
      modGain.gain.setValueAtTime(45, now);
    }

    outGain.gain.setValueAtTime(0.11, now);
    outGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.connect(outGain);
    outGain.connect(this.dest);

    carrier.start(now);
    mod.start(now);
    carrier.stop(now + dur + 0.01);
    mod.stop(now + dur + 0.01);
  }

  /**
   * Jetpack Thruster Burn (Throttled continuous rocket rumble + turbine harmonic)
   */
  public playJetpackThrust(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    if (now - this.lastJetpackTime < 0.065) return;
    this.lastJetpackTime = now;

    const dur = 0.085;
    const noise = this.createNoiseSource(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(340 + Math.random() * 120, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.dest);
    noise.stop(now + dur + 0.01);
  }

  /**
   * Subtle Footstep / Heavy Mech Stomp
   */
  public playFootstep(heavyMech: boolean = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const minInterval = heavyMech ? 0.24 : 0.19;
    if (now - this.lastStepTime < minInterval) return;
    this.lastStepTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavyMech ? 95 : 150 + Math.random() * 30, now);
    osc.frequency.exponentialRampToValueAtTime(heavyMech ? 28 : 55, now + (heavyMech ? 0.11 : 0.045));
    gain.gain.setValueAtTime(heavyMech ? 0.14 : 0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavyMech ? 0.12 : 0.05));

    osc.connect(gain);
    gain.connect(this.dest);
    osc.start(now);
    osc.stop(now + (heavyMech ? 0.125 : 0.055));
  }

  /**
   * Weapon / Tool Switch UI Click
   */
  public playToolSwitch(toolId: number = 1): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const base = 360 + toolId * 48;
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.25, now + 0.045);

    gain.gain.setValueAtTime(0.065, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.dest);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  /**
   * Combat Impact Feedback (Player Shield Hit / Enemy Armor Impact)
   */
  public playCombatHit(isPlayerHit: boolean, isCrit: boolean = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastHitTime < 0.045) return;
    this.lastHitTime = now;

    if (isCrit) {
      this.playCryoShatter();
      return;
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isPlayerHit ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(isPlayerHit ? 185 : 520, now);
    osc.frequency.exponentialRampToValueAtTime(isPlayerHit ? 48 : 160, now + 0.09);

    gain.gain.setValueAtTime(isPlayerHit ? 0.18 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(this.dest);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Multi-Layered Alchemical Detonation (Transient Crack + Sub-Bass Shockwave + Filtered Rumble)
   */
  public playExplosion(intensity: number = 1.0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = Math.min(1.7, 0.38 + intensity * 0.45);

    // 1. Sub-bass shockwave drop
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(115 * Math.min(1.6, intensity), now);
    sub.frequency.exponentialRampToValueAtTime(22, now + dur * 0.85);
    subGain.gain.setValueAtTime(Math.min(0.5, 0.28 * intensity), now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.88);
    sub.connect(subGain);
    subGain.connect(this.dest);
    sub.start(now);
    sub.stop(now + dur * 0.9);

    // 2. Filtered detonation roar
    if (this.noiseBuffer) {
      const noise = this.createNoiseSource(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(820 * Math.min(2.2, intensity), now);
      filter.frequency.exponentialRampToValueAtTime(58, now + dur);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.min(0.55, 0.28 * intensity), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.dest);
      noise.stop(now + dur + 0.02);
    }
  }

  public playFusionIgnition(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Deep sub-bass drop + rising stellar choir harmonic
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(480, now);
    sub.frequency.exponentialRampToValueAtTime(28, now + 1.8);
    subGain.gain.setValueAtTime(0.45, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.9);
    sub.connect(subGain);
    subGain.connect(this.dest);
    sub.start(now);
    sub.stop(now + 1.9);

    const high = ctx.createOscillator();
    const highGain = ctx.createGain();
    high.type = 'sine';
    high.frequency.setValueAtTime(220, now);
    high.frequency.exponentialRampToValueAtTime(1760, now + 1.5);
    highGain.gain.setValueAtTime(0.25, now);
    highGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    high.connect(highGain);
    highGain.connect(this.dest);
    high.start(now);
    high.stop(now + 1.6);

    this.playExplosion(2.2);
  }

  public playSizzle(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    if (now - this.lastSizzleTime < 0.075) return;
    this.lastSizzleTime = now;

    const dur = 0.08;
    const noise = this.createNoiseSource(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3100 + Math.random() * 1800, now);
    filter.Q.setValueAtTime(3.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.002, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.dest);
    noise.stop(now + dur + 0.01);
  }

  public playGeigerClick(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - this.lastGeigerTime < 0.028) return;
    this.lastGeigerTime = now;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1600 + Math.random() * 1100, now);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.011);

    osc.connect(gain);
    gain.connect(this.dest);
    osc.start(now);
    osc.stop(now + 0.012);
  }

  public playQuantumBeam(freqBase: number = 520): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.setValueAtTime(freqBase, now);
    osc.frequency.exponentialRampToValueAtTime(freqBase * 1.48, now + 0.11);
    osc2.frequency.setValueAtTime(freqBase * 1.5, now);
    osc2.frequency.exponentialRampToValueAtTime(freqBase * 0.75, now + 0.11);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.115);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.dest);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.12);
    osc2.stop(now + 0.12);
  }

  public playCryoShatter(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 6-voice crystalline fracture cascade
    const freqs = [1480, 1960, 2480, 3120, 3840, 4420];
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'sine';
      const t = now + i * 0.016;
      osc.frequency.setValueAtTime(freqs[i] + Math.random() * 240, t);
      osc.frequency.exponentialRampToValueAtTime(freqs[i] * 0.72, t + 0.13);
      gain.gain.setValueAtTime(0.085, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.135);
      osc.connect(gain);
      gain.connect(this.dest);
      osc.start(t);
      osc.stop(t + 0.14);
    }
  }

  public playVictory(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((n, idx) => {
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      sub.type = 'sine';
      const t = now + idx * 0.12;
      osc.frequency.setValueAtTime(n, t);
      sub.frequency.setValueAtTime(n * 0.5, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.connect(gain);
      sub.connect(gain);
      gain.connect(this.dest);
      osc.start(t);
      sub.start(t);
      osc.stop(t + 0.62);
      sub.stop(t + 0.62);
    });
  }
}
