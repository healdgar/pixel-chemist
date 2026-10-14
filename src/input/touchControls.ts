import { GamepadState } from './gamepadManager';

export class TouchControlsManager {
  public enabled: boolean = false;
  public portraitDismissed: boolean = false;

  // Continuous stick axes (-1..1)
  public moveX: number = 0;
  public moveY: number = 0;
  public aimX: number = 0;
  public aimY: number = 0;
  public aimMagnitude: number = 0;

  // Held button states
  public primaryFireHeld: boolean = false;
  public secondaryFireHeld: boolean = false;

  // Single-frame edge triggers
  private pendingPrevTool: boolean = false;
  private pendingNextTool: boolean = false;
  private pendingQuantumDash: boolean = false;
  private pendingRewind: boolean = false;
  private pendingInteract: boolean = false;

  private leftPointerId: number | null = null;
  private rightPointerId: number | null = null;
  private leftOriginX: number = 0;
  private leftOriginY: number = 0;
  private rightOriginX: number = 0;
  private rightOriginY: number = 0;
  private readonly maxRadius: number = 46;

  private layerEl: HTMLElement | null = null;
  private leftZoneEl: HTMLElement | null = null;
  private leftKnobEl: HTMLElement | null = null;
  private rightZoneEl: HTMLElement | null = null;
  private rightKnobEl: HTMLElement | null = null;
  private rotateBannerEl: HTMLElement | null = null;

  constructor() {
    this.initDOM();
  }

  private initDOM(): void {
    this.layerEl = document.getElementById('touch-controls-layer');
    this.leftZoneEl = document.getElementById('touch-stick-left');
    this.leftKnobEl = document.getElementById('touch-knob-left');
    this.rightZoneEl = document.getElementById('touch-stick-right');
    this.rightKnobEl = document.getElementById('touch-knob-right');
    this.rotateBannerEl = document.getElementById('rotate-device-banner');

    // Auto-enable on coarse pointer (phones/tablets) or first touch event
    const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (isCoarse) {
      this.setEnabled(true);
    }

    window.addEventListener(
      'touchstart',
      () => {
        if (!this.enabled) {
          this.setEnabled(true);
        }
      },
      { passive: true, once: true }
    );

    this.setupLeftStick();
    this.setupRightStick();
    this.setupActionButtons();
    this.setupOrientationBanner();
  }

  public setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.layerEl) {
      this.layerEl.classList.toggle('active', on);
    }
    document.body.classList.toggle('touch-mode-active', on);
    const toggleBtn = document.getElementById('btn-touch-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = on ? '📱 Touch: ON' : '📱 Touch';
      toggleBtn.classList.toggle('hud-btn-accent', on);
    }
  }

  public toggleEnabled(): void {
    this.setEnabled(!this.enabled);
  }

  private setupLeftStick(): void {
    const zone = this.leftZoneEl;
    const knob = this.leftKnobEl;
    if (!zone || !knob) return;

    const updateStick = (clientX: number, clientY: number) => {
      const dx = clientX - this.leftOriginX;
      const dy = clientY - this.leftOriginY;
      const dist = Math.hypot(dx, dy);
      const clampedDist = Math.min(this.maxRadius, dist);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;

      knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

      const nx = kx / this.maxRadius;
      const ny = ky / this.maxRadius;
      this.moveX = Math.abs(nx) > 0.14 ? nx : 0;
      this.moveY = Math.abs(ny) > 0.14 ? ny : 0;

      zone.classList.toggle('jetpack-engaged', this.moveY < -0.28);
    };

    const resetStick = () => {
      this.leftPointerId = null;
      this.moveX = 0;
      this.moveY = 0;
      knob.style.transform = 'translate(0px, 0px)';
      zone.classList.remove('active-touch', 'jetpack-engaged');
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.setPointerCapture(e.pointerId);
      this.leftPointerId = e.pointerId;
      const rect = zone.getBoundingClientRect();
      this.leftOriginX = rect.left + rect.width / 2;
      this.leftOriginY = rect.top + rect.height / 2;
      zone.classList.add('active-touch');
      updateStick(e.clientX, e.clientY);
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.leftPointerId) return;
      e.preventDefault();
      updateStick(e.clientX, e.clientY);
    });

    zone.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.leftPointerId) return;
      resetStick();
    });

    zone.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== this.leftPointerId) return;
      resetStick();
    });
  }

  private setupRightStick(): void {
    const zone = this.rightZoneEl;
    const knob = this.rightKnobEl;
    if (!zone || !knob) return;

    const updateStick = (clientX: number, clientY: number) => {
      const dx = clientX - this.rightOriginX;
      const dy = clientY - this.rightOriginY;
      const dist = Math.hypot(dx, dy);
      const clampedDist = Math.min(this.maxRadius, dist);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;

      knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

      const nx = kx / this.maxRadius;
      const ny = ky / this.maxRadius;
      const mag = clampedDist / this.maxRadius;

      this.aimX = Math.abs(nx) > 0.1 ? nx : 0;
      this.aimY = Math.abs(ny) > 0.1 ? ny : 0;
      this.aimMagnitude = mag;

      // Pushing right stick to outer 72% ring auto-fires primary alchemical tool
      zone.classList.toggle('autofire-engaged', mag > 0.72);
    };

    const resetStick = () => {
      this.rightPointerId = null;
      this.aimX = 0;
      this.aimY = 0;
      this.aimMagnitude = 0;
      knob.style.transform = 'translate(0px, 0px)';
      zone.classList.remove('active-touch', 'autofire-engaged');
    };

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.setPointerCapture(e.pointerId);
      this.rightPointerId = e.pointerId;
      const rect = zone.getBoundingClientRect();
      this.rightOriginX = rect.left + rect.width / 2;
      this.rightOriginY = rect.top + rect.height / 2;
      zone.classList.add('active-touch');
      updateStick(e.clientX, e.clientY);
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.rightPointerId) return;
      e.preventDefault();
      updateStick(e.clientX, e.clientY);
    });

    zone.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.rightPointerId) return;
      resetStick();
    });

    zone.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== this.rightPointerId) return;
      resetStick();
    });
  }

  private setupActionButtons(): void {
    const bindHold = (id: string, onChange: (held: boolean) => void) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('pressed');
        onChange(true);
      });
      const release = () => {
        btn.classList.remove('pressed');
        onChange(false);
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
    };

    const bindTap = (id: string, onTap: () => void) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('pressed');
        onTap();
        setTimeout(() => btn.classList.remove('pressed'), 140);
      });
    };

    bindHold('touch-btn-primary', (held) => {
      this.primaryFireHeld = held;
    });
    bindHold('touch-btn-secondary', (held) => {
      this.secondaryFireHeld = held;
    });

    bindTap('touch-btn-prev', () => {
      this.pendingPrevTool = true;
    });
    bindTap('touch-btn-next', () => {
      this.pendingNextTool = true;
    });
    bindTap('touch-btn-phase', () => {
      this.pendingQuantumDash = true;
    });
    bindTap('touch-btn-rewind', () => {
      this.pendingRewind = true;
    });
    bindTap('touch-btn-term', () => {
      this.pendingInteract = true;
    });
  }

  private setupOrientationBanner(): void {
    const dismissBtn = document.getElementById('btn-dismiss-portrait');
    const lockLandscapeBtn = document.getElementById('btn-lock-landscape');

    dismissBtn?.addEventListener('click', () => {
      this.portraitDismissed = true;
      this.rotateBannerEl?.classList.add('dismissed');
    });

    lockLandscapeBtn?.addEventListener('click', async () => {
      await this.requestLandscapeFullscreen();
      this.portraitDismissed = true;
      this.rotateBannerEl?.classList.add('dismissed');
    });
  }

  public async requestLandscapeFullscreen(): Promise<void> {
    try {
      const docEl = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => Promise<void>;
      };
      if (!document.fullscreenElement) {
        if (docEl.requestFullscreen) {
          await docEl.requestFullscreen();
        } else if (docEl.webkitRequestFullscreen) {
          await docEl.webkitRequestFullscreen();
        }
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (mode: string) => Promise<void>;
      };
      if (orientation && typeof orientation.lock === 'function') {
        await orientation.lock('landscape');
      }
    } catch {
      // Orientation lock or fullscreen may be unsupported on iOS Safari; layout still adapts
    }
  }

  /**
   * Merges active virtual touch controls into the polled GamepadState so player movement,
   * jetpack, aiming reticle, and weapon firing work identically to a physical controller.
   */
  public applyToGamepadState(gp: GamepadState): GamepadState {
    if (!this.enabled) return gp;

    const anyTouchInput =
      this.leftPointerId !== null ||
      this.rightPointerId !== null ||
      this.primaryFireHeld ||
      this.secondaryFireHeld ||
      this.pendingPrevTool ||
      this.pendingNextTool ||
      this.pendingQuantumDash ||
      this.pendingRewind ||
      this.pendingInteract;

    if (!anyTouchInput && !gp.connected) {
      return gp;
    }

    const moveX = Math.abs(this.moveX) > Math.abs(gp.moveX) ? this.moveX : gp.moveX;
    const moveY = Math.abs(this.moveY) > Math.abs(gp.moveY) ? this.moveY : gp.moveY;
    const aimX = Math.abs(this.aimX) > Math.abs(gp.aimX) ? this.aimX : gp.aimX;
    const aimY = Math.abs(this.aimY) > Math.abs(gp.aimY) ? this.aimY : gp.aimY;

    const autoPrimary = this.aimMagnitude > 0.72 && !this.secondaryFireHeld;

    const merged: GamepadState = {
      ...gp,
      connected: gp.connected || anyTouchInput,
      id: gp.connected ? gp.id : 'Virtual Dual-Stick Touch',
      moveX,
      moveY,
      aimX,
      aimY,
      jumpHeld: gp.jumpHeld || moveY < -0.28,
      diveHeld: gp.diveHeld || moveY > 0.35,
      primaryFireHeld: gp.primaryFireHeld || this.primaryFireHeld || autoPrimary,
      secondaryFireHeld: gp.secondaryFireHeld || this.secondaryFireHeld,
      prevToolPressed: gp.prevToolPressed || this.pendingPrevTool,
      nextToolPressed: gp.nextToolPressed || this.pendingNextTool,
      quantumDashPressed: gp.quantumDashPressed || this.pendingQuantumDash,
      rewindPressed: gp.rewindPressed || this.pendingRewind,
      interactPressed: gp.interactPressed || this.pendingInteract,
    };

    // Clear one-frame edge triggers
    this.pendingPrevTool = false;
    this.pendingNextTool = false;
    this.pendingQuantumDash = false;
    this.pendingRewind = false;
    this.pendingInteract = false;

    return merged;
  }
}
