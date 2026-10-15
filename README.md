# Pixel Chemist: Saving Bibbi (`|Ψ⟩`)

**[Play in your browser](https://healdgar.github.io/pixel-chemist/)** · [GitHub repository](https://github.com/healdgar/pixel-chemist)

A 2D omnidirectional cellular-automata physics & alchemy sidescroller built with TypeScript and HTML5 Canvas (`1120 × 720` active physics grid, `448 × 272` viewport).

Dr. Aris Thorne must breach **6 high-security environments** using real-time chemical reactions, thermodynamics, nuclear decay, and quantum mechanics to rescue **Bibbi** from her Cryo-Stasis Vault—while outsmarting a live-learning **J.E.V. ("System-One") Neural Decision Engine**.

---

## Features

- **16× Fine-Grain Cellular Automata Engine**:
  - Simulates 29 materials (`Titanium`, `Steel`, `Rust`, `Cryo-Brittle Metal`, `Ice`, `Water`, `Steam`, `Thermite`, `Lava`, `Acid`, `Toxic Gas`, `Metallic Sodium`, `Uranium-235`, `Plutonium`, `Lead`, `Concrete`, `Granite`, `Wood`, `Foliage`, `Snow`, `Gold`, and more).
  - Continuous per-cell fields for **Temperature (°C)**, **Pressure (GPa)**, **Radiation Flux**, and **Time-Dilation Factor**.
- **10 Alchemical & Quantum Tools**:
  1. **Thermite Lance (`[1]`)** — Ignites at 2,500°C to melt steel bulkheads into molten slag.
  2. **Cryo-Jet (`[2]`)** — Flash-freezes water into ice bridges and turns Titanium into `CRYO_BRITTLE` metal.
  3. **Fluoroantimonic Acid (`[3]`)** — Dissolves stone, organic matter, and rusted barriers.
  4. **Metallic Sodium (`[4]`)** — Reacts violently on contact with water (`2Na + 2H₂O → 2NaOH + H₂ + BOOM`).
  5. **Plasma Torch (`[5]`)** — Precision short-range cutting beam and fire starter.
  6. **Water / Matter Hose (`[6]`)** — Left-click sprays water; Right-click vacuums fluids and loose powders into your tank.
  7. **Graviton Pulse (`[7]`)** — High-GPa kinetic shockwave that shatters `CRYO_BRITTLE` walls and frozen mechs.
  8. **Weak-Force Decay (`[8]`)** — Transmutes heavy isotopes (`Lead → Gold`) and destabilizes `Uranium-235` or mech armor into `Sodium`.
  9. **Time-Twist Field (`[9]`)** — Left-click (`5×` Time Accel) rapidly rusts wet steel; Right-click (`0.05×` Stasis) freezes hazards and enemies in time.
  10. **Quantum Phase-Walk (`[0]`)** — De-coheres your matter wave (`|Ψ⟩`) to tunnel straight through solid walls and security lasers.
- **Trainable J.E.V. ("System-One") Neural Decision Engine**:
  - In-browser 2-layer neural policy network (`12 Game Levers → 16 LeakyReLU Hidden Neurons → Multi-Head Softmax choice + Calibrated Sigmoid noul outputs`).
  - Pre-trains **1,500 curriculum episodes** at startup and performs **live online REINFORCE policy gradient learning** during combat.
  - Commands **Hazmat Security Guards**, **Hunter-Seeker Drones** (which drop Sodium bombs when you stand in water), **Heavy Combat Robots / Mechs**, **Security Laser Grids**, **Ceiling Chemical Sprayers**, and **Alarm Beacons**.
- **6 Distinct Multi-Directional Sectors**:
  1. *Sector 7: Deep Vault* (Subterranean Containment Lab)
  2. *Glacier Outpost Alpha* (Outdoor Frozen Peak & Underground Cavern)
  3. *ISS Archimedes* (Orbital Space Station with Explosive Decompression into Hard Vacuum)
  4. *Aethelgard Corporate Tower* (Multi-Story Skyscraper with Wood Desks, Glass Windows & Server Vault)
  5. *Castle Schwarzstein* (Medieval Fortress over a Magma Caldera)
  6. *Reactor Core Omega* (Active Nuclear Breeder Reactor)
- **Full Gamepad + Keyboard/Mouse Support**:
  - Dual-stick controller support (`Left Stick` move + jetpack on Up, `Right Stick` reticle aim, `LB/RB` cycle tools, `RT/LT` primary/secondary fire).

---

## Getting Started

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

Run the regression checks:

```bash
npm test
```

Gameplay advances at 60 simulation ticks per second independently of display refresh rate. Menus and hidden tabs pause physics, combat, timers, and rewind history; rendering and menu controls remain responsive. Catch-up after a stall is capped at five simulation steps per frame.

Rewind restores a complete checkpoint about five seconds earlier (one-second checkpoint intervals), or the earliest checkpoint available during the first few seconds. Player resources, enemies, defenses, projectiles, rescue progress, and J.E.V.'s learned weights all rewind together. Future checkpoints are discarded. Restarting a map resets the suit and temporary effects while retaining the selected tool. Escape or M opens/closes menus; sound can be toggled in the menu.

---

## Copyright & License

**Copyright © 2026 Six Cailloux, LLC. All rights reserved.**

