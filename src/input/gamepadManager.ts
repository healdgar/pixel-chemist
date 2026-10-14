export interface GamepadState {
  connected: boolean;
  id: string;
  // Continuous axes (-1..1 after deadzone)
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  // Held states
  jumpHeld: boolean;
  diveHeld: boolean;
  primaryFireHeld: boolean;
  secondaryFireHeld: boolean;
  // Single-frame edge triggers (true only on the frame the button was pressed)
  prevToolPressed: boolean;
  nextToolPressed: boolean;
  interactPressed: boolean;     // X / Square -> Terminal [E]
  rewindPressed: boolean;       // Y / Triangle -> Rewind Time [R]
  quantumDashPressed: boolean;  // B / Circle or L3 -> Quantum Phase Walk [Q]
  thermalVisionPressed: boolean;// D-Pad Up -> Thermal Vision [V]
  codexPressed: boolean;        // Start / Options -> Codex [C]
  closeModalPressed: boolean;   // B / Circle or Start when modal is open
  snapReticlePressed: boolean;  // R3 -> Snap reticle near player
  swapTriggersPressed: boolean; // Select / Back tap -> Swap LT/RT polarity
}

export class GamepadManager {
  private prevButtons: boolean[] = new Array(20).fill(false);
  private readonly deadzone: number = 0.16;

  // When true (default): LT = Left Mouse Click (LMB), RT = Right Mouse Click (RMB).
  // Toggleable via Select/Back button if player prefers swapped triggers.
  public literalLeftRightTriggers: boolean = true;

  public state: GamepadState = {
    connected: false,
    id: '',
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    jumpHeld: false,
    diveHeld: false,
    primaryFireHeld: false,
    secondaryFireHeld: false,
    prevToolPressed: false,
    nextToolPressed: false,
    interactPressed: false,
    rewindPressed: false,
    quantumDashPressed: false,
    thermalVisionPressed: false,
    codexPressed: false,
    closeModalPressed: false,
    snapReticlePressed: false,
    swapTriggersPressed: false,
  };

  constructor() {
    window.addEventListener('gamepadconnected', (e) => {
      this.state.connected = true;
      this.state.id = e.gamepad.id;
    });
    window.addEventListener('gamepaddisconnected', () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const anyActive = Array.from(pads).some((p) => p !== null);
      this.state.connected = anyActive;
    });
  }

  private applyDeadzone(val: number): number {
    if (Math.abs(val) < this.deadzone) return 0;
    const sign = Math.sign(val);
    return sign * ((Math.abs(val) - this.deadzone) / (1 - this.deadzone));
  }

  public poll(): GamepadState {
    // Reset edge triggers
    this.state.prevToolPressed = false;
    this.state.nextToolPressed = false;
    this.state.interactPressed = false;
    this.state.rewindPressed = false;
    this.state.quantumDashPressed = false;
    this.state.thermalVisionPressed = false;
    this.state.codexPressed = false;
    this.state.closeModalPressed = false;
    this.state.snapReticlePressed = false;
    this.state.swapTriggersPressed = false;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) {
        gp = p;
        break;
      }
    }

    if (!gp) {
      this.state.connected = false;
      this.state.moveX = 0;
      this.state.moveY = 0;
      this.state.aimX = 0;
      this.state.aimY = 0;
      this.state.jumpHeld = false;
      this.state.diveHeld = false;
      this.state.primaryFireHeld = false;
      this.state.secondaryFireHeld = false;
      return this.state;
    }

    this.state.connected = true;
    this.state.id = gp.id;

    // 1. Left Thumbstick: Character Movement (axes[0] = Left/Right, axes[1] = Up/Down)
    this.state.moveX = this.applyDeadzone(gp.axes[0] ?? 0);
    this.state.moveY = this.applyDeadzone(gp.axes[1] ?? 0);

    // 2. Right Thumbstick: Reticle Movement (axes[2] = Left/Right, axes[3] = Up/Down)
    this.state.aimX = this.applyDeadzone(gp.axes[2] ?? 0);
    this.state.aimY = this.applyDeadzone(gp.axes[3] ?? 0);

    // Helper for button state & rising-edge detection
    const isPressed = (idx: number, threshold: number = 0.5): boolean => {
      const b = gp!.buttons[idx];
      if (!b) return false;
      return b.pressed || b.value >= threshold;
    };

    const justPressed = (idx: number): boolean => {
      const cur = isPressed(idx);
      const prev = this.prevButtons[idx] ?? false;
      return cur && !prev;
    };

    // Standard Gamepad Mapping:
    // 0: A / Cross (Jump / Jetpack Up)
    // 1: B / Circle (Quantum Phase Walk / Close Dialog)
    // 2: X / Square (Interact with Terminal [E])
    // 3: Y / Triangle (Rewind Time 5s [R])
    // 4: LB / L1 (Previous Tool)
    // 5: RB / R1 (Next Tool)
    // 6: LT / L2 (Trigger Left)
    // 7: RT / R2 (Trigger Right)
    // 8: Back / Select (Swap LT/RT trigger mapping)
    // 9: Start / Options (Open/Close Alchemy Codex)
    // 10: L3 (Left Stick Click -> Quantum Phase Walk)
    // 11: R3 (Right Stick Click -> Snap Reticle to Player)
    // 12: D-Pad Up (Toggle Thermal Vision)
    // 13: D-Pad Down (Dive / Drop)
    // 14: D-Pad Left (Previous Tool)
    // 15: D-Pad Right (Next Tool)

    // Jump / Jetpack Up: A button (0) or pushing Left Stick Up (< -0.45)
    this.state.jumpHeld = isPressed(0) || this.state.moveY < -0.45;
    // Dive / Fast-Drop Down: D-Pad Down (13) or pushing Left Stick Down (> 0.5)
    this.state.diveHeld = isPressed(13) || this.state.moveY > 0.5;

    // Triggers (LT = 6, RT = 7)
    const ltHeld = isPressed(6, 0.25);
    const rtHeld = isPressed(7, 0.25);

    if (this.literalLeftRightTriggers) {
      // Literal Left Trigger = Left Mouse Click, Right Trigger = Right Mouse Click
      this.state.primaryFireHeld = ltHeld;
      this.state.secondaryFireHeld = rtHeld;
    } else {
      // Twin-Stick Shooter Standard: Right Trigger = Primary (LMB), Left Trigger = Secondary (RMB)
      this.state.primaryFireHeld = rtHeld;
      this.state.secondaryFireHeld = ltHeld;
    }

    // Bumpers (LB = 4, RB = 5) + D-Pad Left/Right (14, 15) flip between weapons
    if (justPressed(4) || justPressed(14)) {
      this.state.prevToolPressed = true;
    }
    if (justPressed(5) || justPressed(15)) {
      this.state.nextToolPressed = true;
    }

    // Action Buttons
    if (justPressed(2)) this.state.interactPressed = true; // X / Square
    if (justPressed(3)) this.state.rewindPressed = true;   // Y / Triangle
    if (justPressed(1) || justPressed(10)) this.state.quantumDashPressed = true; // B or L3
    if (justPressed(1)) this.state.closeModalPressed = true;
    if (justPressed(12)) this.state.thermalVisionPressed = true; // D-Pad Up
    if (justPressed(9)) this.state.codexPressed = true; // Start
    if (justPressed(11)) this.state.snapReticlePressed = true; // R3
    if (justPressed(8)) {
      this.literalLeftRightTriggers = !this.literalLeftRightTriggers;
      this.state.swapTriggersPressed = true;
    }

    // Update prevButtons
    for (let i = 0; i < 20; i++) {
      this.prevButtons[i] = isPressed(i);
    }

    return this.state;
  }

  public triggerRumble(
    durationMs: number = 120,
    weakMagnitude: number = 0.4,
    strongMagnitude: number = 0.7
  ): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const actuator = (
        gp as unknown as {
          vibrationActuator?: {
            playEffect?: (
              type: string,
              params: {
                startDelay: number;
                duration: number;
                weakMagnitude: number;
                strongMagnitude: number;
              }
            ) => Promise<void>;
          };
        }
      ).vibrationActuator;
      if (actuator && typeof actuator.playEffect === 'function') {
        actuator
          .playEffect('dual-rumble', {
            startDelay: 0,
            duration: durationMs,
            weakMagnitude: Math.min(1, weakMagnitude),
            strongMagnitude: Math.min(1, strongMagnitude),
          })
          .catch(() => {});
      }
    }
  }
}
