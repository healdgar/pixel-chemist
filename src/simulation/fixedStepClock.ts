// Gameplay always advances at 60 Hz; rendering may run at any refresh rate.
export class FixedStepClock {
  private readonly stepMs = 1000 / 60;
  private readonly maxCatchUpSteps = 5;
  private lastTime: number | null = null;
  private accumulator = 0;
  private wasPaused = false;

  public reset(): void {
    this.lastTime = null;
    this.accumulator = 0;
  }

  public advance(now: number, paused: boolean, step: () => boolean): void {
    const elapsed = this.lastTime === null ? 0 : Math.max(0, now - this.lastTime);
    this.lastTime = now;

    if (paused || this.wasPaused) {
      this.accumulator = 0;
      this.wasPaused = paused;
      return;
    }

    // Drop excess time after stalls instead of running an unbounded catch-up loop.
    this.accumulator += Math.min(elapsed, this.stepMs * this.maxCatchUpSteps);
    for (let i = 0; i < this.maxCatchUpSteps && this.accumulator + 1e-7 >= this.stepMs; i++) {
      this.accumulator = Math.max(0, this.accumulator - this.stepMs);
      if (!step()) {
        this.accumulator = 0;
        this.wasPaused = true;
        break;
      }
    }
  }
}
