import './style.css';
import { ElementId } from './chemistry/elements';
import { WorldGrid, WorldSnapshot } from './simulation/world';
import { FixedStepClock } from './simulation/fixedStepClock';
import { generateLevel, MAP_CATALOG, MapId, LevelData } from './world/levelGenerator';
import { Player } from './entities/player';
import { TOOLS, Projectile, updateProjectiles } from './entities/tools';
import { WorldRenderer } from './render/renderer';
import { SoundEngine } from './audio/soundEngine';
import { GamepadManager, GamepadState } from './input/gamepadManager';
import { TouchControlsManager } from './input/touchControls';
import {
  JevDirector,
  JEV_LEVER_NAMES,
  JEV_DIRECTIVES,
  JEV_LOADOUTS,
} from './ai/jevDirector';

// 1. Setup Modern Dialog Light-Dismiss Fallback (per modern-web-guidance)
function setupDialogFallbacks(): void {
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog');
  dialogs.forEach((dialog) => {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      });
    }
  });

  document.querySelectorAll<HTMLElement>('[data-close-dialog]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close-dialog');
      if (id) {
        const dlg = document.getElementById(id) as HTMLDialogElement | null;
        dlg?.close();
      }
    });
  });
}

setupDialogFallbacks();

// 2. Initialize Core Engine State (1120x720 = 4x pixel density, 1/4 visual pixel size!)
const WORLD_W = 1120;
const WORLD_H = 720;

const mainCanvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const mainCtx = mainCanvas.getContext('2d')!;
const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
const mapSelectEl = document.getElementById('map-select') as HTMLSelectElement;
const minimapTitleEl = document.getElementById('minimap-title')!;

function resizeCanvas(): void {
  mainCanvas.width = window.innerWidth;
  mainCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const sound = new SoundEngine();
const gamepad = new GamepadManager();
const touchControls = new TouchControlsManager();
const jevDirector = new JevDirector();
const world = new WorldGrid(WORLD_W, WORLD_H);
let currentMapId: MapId = 'alpine_outdoor';
let level: LevelData = generateLevel(world, currentMapId);
jevDirector.resetForLevel(level.mapInfo.shortName);
const player = new Player(level.spawnX, level.spawnY);
player.gravityScale = level.mapInfo.gravityScale;
const renderer = new WorldRenderer();
renderer.camX = Math.max(0, Math.min(WORLD_W - renderer.viewW, player.x - renderer.viewW / 2));
renderer.camY = Math.max(0, Math.min(WORLD_H - renderer.viewH, player.y - renderer.viewH / 2));
const projectiles: Projectile[] = [];

interface GameSnapshot {
  tick: number;
  world: WorldSnapshot;
  player: ReturnType<Player['createSnapshot']>;
  director: ReturnType<JevDirector['createSnapshot']>;
  enemyUnits: NonNullable<LevelData['enemyUnits']>;
  defenses: NonNullable<LevelData['defenses']>;
  turrets: LevelData['turrets'];
  debbi: LevelData['debbi'];
  projectiles: Projectile[];
  camX: number;
  camY: number;
  fusionAlertShown: boolean;
}

let tick = 0;
let fusionAlertShown = false;
let breachAlertShown = false;
let debbiDeathAlertShown = false;

// One-second checkpoints retain enough history for a roughly five-second rewind.
const snapshots: GameSnapshot[] = [];
const MAX_SNAPSHOTS = 6;
const SNAPSHOT_INTERVAL_TICKS = 60;
const REWIND_TICKS = 300;

function saveSnapshot(): void {
  if (player.hp <= 0 || level.debbi.hp <= 0) return;
  snapshots.push({
    tick,
    world: world.createSnapshot(player.x, player.y, player.hp),
    player: player.createSnapshot(),
    director: jevDirector.createSnapshot(),
    enemyUnits: (level.enemyUnits ?? []).map((unit) => ({ ...unit })),
    defenses: (level.defenses ?? []).map((defense) => ({ ...defense })),
    turrets: level.turrets.map((turret) => ({ ...turret })),
    debbi: { ...level.debbi },
    projectiles: projectiles.map((projectile) => ({ ...projectile })),
    camX: renderer.camX, camY: renderer.camY,
    fusionAlertShown,
  });
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.shift();
  }
}
saveSnapshot();

function rewindTime(): void {
  if (snapshots.length === 0) return;
  const targetTick = tick - REWIND_TICKS;
  let index = 0;
  for (let i = 0; i < snapshots.length; i++) {
    if (snapshots[i].tick <= targetTick) index = i;
  }
  const snap = snapshots[index];
  snapshots.splice(index + 1); // Abandon the future; repeated rewinds cannot move forward.
  world.restoreSnapshot(snap.world);
  player.restoreSnapshot(snap.player);
  jevDirector.restoreSnapshot(snap.director);
  level.enemyUnits = snap.enemyUnits.map((unit) => ({ ...unit }));
  level.defenses = snap.defenses.map((defense) => ({ ...defense }));
  level.turrets = snap.turrets.map((turret) => ({ ...turret }));
  level.debbi = { ...snap.debbi };
  player.carryingDebbi = level.debbi.carried;
  projectiles.splice(0, projectiles.length, ...snap.projectiles.map((projectile) => ({ ...projectile })));
  renderer.camX = snap.camX;
  renderer.camY = snap.camY;
  tick = snap.tick;
  fusionAlertShown = snap.fusionAlertShown;
  breachAlertShown = false;
  debbiDeathAlertShown = false;
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((dialog) => dialog.close());
  simulationClock.reset();
  selectTool(player.selectedTool, false);
  updateHud();
  renderer.renderMinimap(minimapCanvas, world, player, level);
  sound.playQuantumBeam(520);
  gamepad.triggerRumble(180, 0.5, 0.7);
  world.addReactionPopup(Math.floor(player.x), Math.floor(player.y) - 6, '⏪ TIME REWOUND!', '#00f5d4');
}

function loadMap(mapId: MapId): void {
  currentMapId = mapId;
  if (mapSelectEl) mapSelectEl.value = mapId;
  projectiles.length = 0;
  snapshots.length = 0;
  tick = 0;
  simulationClock.reset();
  world.fusionTriggered = false;
  fusionAlertShown = false;
  breachAlertShown = false;
  debbiDeathAlertShown = false;

  level = generateLevel(world, mapId);
  jevDirector.resetForLevel(level.mapInfo.shortName);
  player.reset(level.spawnX, level.spawnY, level.mapInfo.gravityScale);

  renderer.camX = Math.max(0, Math.min(WORLD_W - renderer.viewW, player.x - renderer.viewW / 2));
  renderer.camY = Math.max(0, Math.min(WORLD_H - renderer.viewH, player.y - renderer.viewH / 2));

  minimapTitleEl.textContent = level.mapInfo.shortName.toUpperCase();

  renderMapCards();
  saveSnapshot();
  updateHud();
  renderer.renderMinimap(minimapCanvas, world, player, level);
  sound.playQuantumBeam(580);
  world.addReactionPopup(
    Math.floor(player.x),
    Math.floor(player.y) - 8,
    `${level.mapInfo.icon} ${level.mapInfo.name}`,
    '#ffd166'
  );
}

function loadNextMap(): void {
  const idx = MAP_CATALOG.findIndex((m) => m.id === currentMapId);
  const nextInfo = MAP_CATALOG[(idx + 1) % MAP_CATALOG.length];
  loadMap(nextInfo.id);
}

function resetFacility(): void {
  loadMap(currentMapId);
}

// Populate World Map Atlas Dialog Cards
const mapCardsGrid = document.getElementById('map-cards-grid')!;
function renderMapCards(): void {
  if (!mapCardsGrid) return;
  mapCardsGrid.innerHTML = '';
  MAP_CATALOG.forEach((m) => {
    const card = document.createElement('div');
    card.className = `codex-card map-card ${m.id === currentMapId ? 'active-map' : ''}`;
    card.innerHTML = `
      <div>
        <h3>${m.icon} ${m.name}</h3>
        <p>${m.tagline}</p>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
        <span style="font-size:10px;color:#4cc9f0;">Gravity: ${m.gravityScale}G</span>
        <span class="hud-btn hud-btn-accent" style="padding:2px 8px;">${
          m.id === currentMapId ? '● ACTIVE' : '▶ LAUNCH'
        }</span>
      </div>
    `;
    card.addEventListener('click', () => {
      (document.getElementById('map-dialog') as HTMLDialogElement).close();
      loadMap(m.id);
    });
    mapCardsGrid.appendChild(card);
  });
}
renderMapCards();
minimapTitleEl.textContent = level.mapInfo.shortName.toUpperCase();

// 3. Build 9-Slot Alchemical Toolbelt UI
const toolDock = document.getElementById('tool-dock')!;
const activeToolTitle = document.getElementById('active-tool-title')!;
const activeToolDesc = document.getElementById('active-tool-desc')!;
const activeLmb = document.getElementById('active-lmb')!;
const activeRmb = document.getElementById('active-rmb')!;

function updateToolLabels(): void {
  const tool = TOOLS[player.selectedTool - 1];
  activeToolTitle.textContent = `[${tool.key}] ${tool.shortName}`;
  activeToolTitle.style.color = tool.color;
  activeToolDesc.textContent = tool.description;
  activeLmb.textContent = tool.primaryLabel;
  activeRmb.textContent = tool.secondaryLabel;
}

function selectTool(toolId: number, playSfx: boolean = true): void {
  const prev = player.selectedTool;
  player.selectedTool = Math.max(1, Math.min(9, toolId));
  if (playSfx && prev !== player.selectedTool) {
    sound.playToolSwitch(player.selectedTool);
  }
  const tool = TOOLS[player.selectedTool - 1];
  updateToolLabels();

  document.querySelectorAll('.tool-slot').forEach((el, idx) => {
    if (idx + 1 === player.selectedTool) {
      el.classList.add('active');
      (el as HTMLElement).style.borderColor = tool.color;
    } else {
      el.classList.remove('active');
      (el as HTMLElement).style.borderColor = 'rgba(148, 163, 184, 0.25)';
    }
  });
}

TOOLS.forEach((tool) => {
  const btn = document.createElement('button');
  btn.className = 'tool-slot';
  btn.innerHTML = `
    <span class="slot-key" style="color:${tool.color}">[${tool.key}]</span>
    <span class="slot-name">${tool.shortName}</span>
  `;
  btn.addEventListener('click', () => selectTool(tool.id));
  toolDock.appendChild(btn);
});
selectTool(1, false);

// 4. Input Handling (Keyboard + Mouse + Gamepad + Minimap Click)
const keys = new Set<string>();
let mouseScreenX = window.innerWidth / 2;
let mouseScreenY = window.innerHeight / 2;
let mouseLeftDown = false;
let mouseRightDown = false;
let thermalVision = false;
let manualPause = false;

function toggleManualPause(forceState?: boolean): void {
  manualPause = forceState !== undefined ? forceState : !manualPause;
  const pauseBtn = document.getElementById('btn-pause');
  if (pauseBtn) {
    pauseBtn.textContent = manualPause ? '▶' : '⏸';
    pauseBtn.style.borderColor = manualPause ? '#ffd166' : '';
    pauseBtn.style.color = manualPause ? '#ffd166' : '';
  }
}

// Controller Right-Thumbstick Reticle State (offset relative to player so reticle travels with character)
let usingGamepadAim = false;
let reticleOffsetX = 24;
let reticleOffsetY = 0;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyM') {
    e.preventDefault();
    if (e.repeat) return;
    const openDialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (openDialog) openDialog.close();
    else menuDialog?.showModal();
    return;
  }
  if (e.code === 'KeyP') {
    e.preventDefault();
    if (!e.repeat) toggleManualPause();
    return;
  }
  keys.add(e.code);

  if (e.code.startsWith('Digit')) {
    const num = parseInt(e.code.replace('Digit', ''), 10);
    if (num >= 1 && num <= 9) {
      selectTool(num);
    }
  } else if (e.code === 'KeyQ' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    player.activateQuantumDash(sound);
    world.addReactionPopup(
      Math.floor(player.x),
      Math.floor(player.y) - 6,
      '|Ψ⟩ QUANTUM PHASE WALK!',
      '#c77dff'
    );
  } else if (e.code === 'KeyR') {
    if (!e.repeat) rewindTime();
  } else if (e.code === 'KeyV') {
    thermalVision = !thermalVision;
  } else if (e.code === 'KeyC') {
    const dlg = document.getElementById('codex-dialog') as HTMLDialogElement;
    if (dlg.open) dlg.close();
    else dlg.showModal();
  } else if (e.code === 'KeyE') {
    tryOpenNearbyTerminal();
  } else if (e.code === 'KeyL') {
    const dlg = document.getElementById('map-dialog') as HTMLDialogElement;
    if (dlg.open) dlg.close();
    else {
      renderMapCards();
      dlg.showModal();
    }
  } else if (e.code === 'KeyJ') {
    const dlg = document.getElementById('jev-dialog') as HTMLDialogElement;
    if (dlg.open) dlg.close();
    else {
      renderJevTelemetryModal();
      dlg.showModal();
    }
  } else if (e.code === 'KeyN') {
    const evDlg = document.getElementById('event-dialog') as HTMLDialogElement;
    if (evDlg.open) evDlg.close();
    loadNextMap();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

mainCanvas.addEventListener('mousemove', (e) => {
  mouseScreenX = e.clientX;
  mouseScreenY = e.clientY;
  usingGamepadAim = false;
});

mainCanvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') {
    mouseScreenX = e.clientX;
    mouseScreenY = e.clientY;
    const tapWorld = renderer.screenToWorld(e.clientX, e.clientY, mainCanvas);
    reticleOffsetX = Math.max(-210, Math.min(210, tapWorld.wx - player.x));
    reticleOffsetY = Math.max(-128, Math.min(128, tapWorld.wy - player.y));
    usingGamepadAim = true;
  }
});

mainCanvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) mouseLeftDown = true;
  if (e.button === 2) mouseRightDown = true;
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseLeftDown = false;
  if (e.button === 2) mouseRightDown = false;
});

mainCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener(
  'wheel',
  (e) => {
    const dir = e.deltaY > 0 ? 1 : -1;
    const next = ((player.selectedTool - 1 + dir + 9) % 9) + 1;
    selectTool(next);
  },
  { passive: true }
);

// Minimap click allows quick Quantum Beacon Warp if desired!
minimapCanvas.addEventListener('click', (e) => {
  const rect = minimapCanvas.getBoundingClientRect();
  const nx = (e.clientX - rect.left) / rect.width;
  const ny = (e.clientY - rect.top) / rect.height;
  const wx = Math.floor(nx * world.width);
  const wy = Math.floor(ny * world.height);
  if (world.inBounds(wx, wy)) {
    player.x = wx;
    player.y = wy;
    player.vx = 0;
    player.vy = 0;
    player.activateQuantumDash(sound);
    world.addReactionPopup(wx, wy, '⚡ QUANTUM BEACON TELEPORT!', '#00f5d4');
  }
});

// HUD Top Menu Button & Unified Field Menu Handlers
const menuDialog = document.getElementById('menu-dialog') as HTMLDialogElement | null;
document.getElementById('btn-menu')?.addEventListener('click', () => {
  if (menuDialog) {
    if (menuDialog.open) menuDialog.close();
    else menuDialog.showModal();
  }
});

mapSelectEl?.addEventListener('change', () => {
  loadMap(mapSelectEl.value as MapId);
  mapSelectEl.blur();
  menuDialog?.close();
});
document.getElementById('btn-maps')?.addEventListener('click', () => {
  menuDialog?.close();
  renderMapCards();
  (document.getElementById('map-dialog') as HTMLDialogElement).showModal();
});
const openJevModal = () => {
  menuDialog?.close();
  renderJevTelemetryModal();
  (document.getElementById('jev-dialog') as HTMLDialogElement).showModal();
};
document.getElementById('btn-jev')?.addEventListener('click', openJevModal);
document.getElementById('jev-broadcast-bar')?.addEventListener('click', openJevModal);

document.getElementById('btn-jev-train')?.addEventListener('click', () => {
  const loss = jevDirector.brain.trainCurriculumEpisodes(1000, 0.045);
  sound.playQuantumBeam(680);
  jevDirector.reportIncident(
    0,
    `Trained +1,000 curriculum episodes! Total=${jevDirector.brain.trainedEpisodes}, Loss=${loss}`
  );
  renderJevTelemetryModal();
});

document.getElementById('btn-jev-spawn')?.addEventListener('click', () => {
  if (!level.enemyUnits) level.enemyUnits = [];
  const spawnX = Math.max(40, Math.min(world.width - 40, player.x + player.facing * 75));
  const spawnY = Math.max(40, Math.min(world.height - 40, player.y - 36));
  level.enemyUnits.push({
    id: `jev-custom-${Date.now()}`,
    type: 'drone',
    name: 'J.E.V. Apex Drone',
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    width: 12,
    height: 10,
    hp: 90,
    maxHp: 90,
    facing: player.facing === 1 ? -1 : 1,
    grounded: false,
    active: true,
    cooldown: 20,
    patrolMinX: Math.max(30, spawnX - 150),
    patrolMaxX: Math.min(world.width - 30, spawnX + 150),
    homeY: spawnY,
    wetTimer: 0,
    rustedLevel: 0,
    cryoBrittleTimer: 0,
    stasisTimer: 0,
    aiState: 'pursue',
    aiThought: 'J.E.V. DIRECT INTERCEPT',
    weaponLoadout: jevDirector.currentLoadout,
  });
  sound.playQuantumBeam(760);
  (document.getElementById('jev-dialog') as HTMLDialogElement).close();
});

document.getElementById('btn-jev-reset-weights')?.addEventListener('click', () => {
  jevDirector.brain.initXavierWeights();
  jevDirector.brain.evaluate(jevDirector.brain.lastLevers);
  sound.playQuantumBeam(420);
  renderJevTelemetryModal();
});

document.getElementById('btn-pause')?.addEventListener('click', () => toggleManualPause());
document.getElementById('btn-rewind')?.addEventListener('click', rewindTime);
document.getElementById('btn-qdash')?.addEventListener('click', () => {
  menuDialog?.close();
  player.activateQuantumDash(sound);
});
document.getElementById('btn-thermal')?.addEventListener('click', () => {
  thermalVision = !thermalVision;
  menuDialog?.close();
});
document.getElementById('btn-codex')?.addEventListener('click', () => {
  menuDialog?.close();
  (document.getElementById('codex-dialog') as HTMLDialogElement).showModal();
});
document.getElementById('btn-touch-toggle')?.addEventListener('click', () => {
  touchControls.toggleEnabled();
});
document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
  touchControls.requestLandscapeFullscreen();
  menuDialog?.close();
});
document.getElementById('btn-mute')?.addEventListener('click', () => {
  sound.muted = !sound.muted;
  const muteBtn = document.getElementById('btn-mute')!;
  muteBtn.textContent = sound.muted ? '🔇 Muted' : '🔊 SFX';
});
document.getElementById('btn-reset')?.addEventListener('click', () => {
  menuDialog?.close();
  resetFacility();
});

document.getElementById('btn-event-next-map')?.addEventListener('click', () => {
  (document.getElementById('event-dialog') as HTMLDialogElement).close();
  fusionAlertShown = false;
  loadNextMap();
});
document.getElementById('btn-event-rewind')?.addEventListener('click', () => {
  rewindTime();
});
document.getElementById('btn-event-reset')?.addEventListener('click', () => {
  (document.getElementById('event-dialog') as HTMLDialogElement).close();
  fusionAlertShown = false;
  resetFacility();
});

function tryOpenNearbyTerminal(): void {
  for (const term of level.terminals) {
    if (Math.hypot(player.x - term.x, player.y - term.y) < 36) {
      const dlg = document.getElementById('terminal-dialog') as HTMLDialogElement;
      document.getElementById('term-modal-title')!.textContent = `💻 ${term.title}`;
      document.getElementById('term-modal-sector')!.textContent = term.sector;
      document.getElementById('term-modal-log')!.textContent = term.logText;
      document.getElementById('term-modal-tip')!.textContent = term.alchemyTip;
      dlg.showModal();
      sound.playQuantumBeam(620);
      return;
    }
  }
}

function showEventModal(title: string, text: string): void {
  const dlg = document.getElementById('event-dialog') as HTMLDialogElement;
  if (dlg.open) return;
  document.getElementById('event-modal-title')!.textContent = title;
  document.getElementById('event-modal-text')!.textContent = text;
  dlg.showModal();
}

// 5. Update Turrets & Debbi Rescue State
function updateTurretsAndDebbi(): void {
  for (const t of level.turrets) {
    if (!t.active) continue;
    const gx = Math.floor(t.x);
    const gy = Math.floor(t.y);
    if (world.inBounds(gx, gy)) {
      const i = world.idx(gx, gy);
      const el = world.grid[i] as ElementId;
      const temp = world.temp[i];
      const press = world.pressure[i];

      // Turrets take damage from extreme heat, acid, high pressure, or plasma!
      if (temp > 500 || el === ElementId.ACID || el === ElementId.PLASMA || el === ElementId.QUARK_PLASMA) {
        t.hp -= 2.5;
      }
      if (press > 70) {
        t.hp -= press * 0.4;
      }
      if (t.hp <= 0) {
        t.active = false;
        world.applyPressureImpulse(gx, gy, 12, 140, sound);
        world.setElement(gx, gy, ElementId.FIRE, 950);
        world.addReactionPopup(gx, gy, 'TURRET DESTROYED!', '#ff595e');
        jevDirector.reportIncident(12, 'Automated turret destroyed by intruder!');
        continue;
      }
    }

    const dist = Math.hypot(player.x - t.x, player.y - t.y);
    if (dist < 136) {
      t.cooldown--;
      if (t.cooldown <= 0) {
        t.cooldown = 75;
        const dx = (player.x - t.x) / dist;
        const dy = (player.y - t.y) / dist;
        projectiles.push({
          x: t.x + dx * 6,
          y: t.y + dy * 6,
          vx: dx * 4.8,
          vy: dy * 4.8,
          type: 'enemy_bolt',
          color: '#ff595e',
          radius: 6,
          ttl: 65,
          fromPlayer: false
        });
      }
    }
  }

  // Check Debbi's Stasis Cage, Delicate Health, Piggyback Pickup & Vehicle Extraction!
  if (player.hp <= 0 || level.debbi.hp <= 0) return;

  player.carryingDebbi = level.debbi.carried;

  if (!level.debbi.rescued) {
    // When carried on Dr. Vance's back, keep Debbi's world coordinates synced to his shoulders
    if (level.debbi.carried) {
      level.debbi.x = Math.round(player.x - player.facing * 4);
      level.debbi.y = Math.round(player.y - 3);
    }

    const bx = Math.floor(level.debbi.x);
    const by = Math.floor(level.debbi.y);

    // Sample environmental hazards around delicate Debbi (she does NOT have heavy hazmat shielding!)
    if (world.inBounds(bx, by)) {
      const bi = world.idx(bx, by);
      const bEl = world.grid[bi] as ElementId;
      const bTemp = world.temp[bi];
      const bPress = world.pressure[bi];
      const bRad = world.radiation[bi];

      if (bTemp > 110) {
        level.debbi.hp -= (bTemp - 110) * 0.008;
        level.debbi.hurtReason = 'extreme thermal burns';
      } else if (bTemp < (level.debbi.carried ? -65 : -110)) {
        level.debbi.hp -= Math.abs(bTemp + 65) * 0.005;
        level.debbi.hurtReason = 'cryogenic frostbite';
      }

      if (bEl === ElementId.ACID) {
        level.debbi.hp -= 1.15 * (world.getConcentration(bi) / 100);
        level.debbi.hurtReason = 'caustic / alchemical exposure';
      } else if (
        bEl === ElementId.TOXIC_GAS ||
        bEl === ElementId.PLASMA ||
        bEl === ElementId.QUARK_PLASMA ||
        bEl === ElementId.THERMITE ||
        bEl === ElementId.LAVA ||
        bEl === ElementId.FIRE
      ) {
        level.debbi.hp -= 1.15;
        level.debbi.hurtReason = 'caustic / alchemical exposure';
      }

      if (bPress > 35) {
        level.debbi.hp -= (bPress - 35) * 0.14;
        level.debbi.hurtReason = 'barotrauma blast wave';
      }

      if (bRad > 1.2) {
        level.debbi.hp -= (bRad - 1.2) * 0.25;
        level.debbi.hurtReason = 'acute radiation exposure';
      }

      if (level.debbi.carried && player.oxygen <= 0) {
        level.debbi.hp -= 0.45;
        level.debbi.hurtReason = 'underwater hypoxia';
      }

      if (bEl === ElementId.BIO_GEL) {
        level.debbi.hp = Math.min(level.debbi.maxHp, level.debbi.hp + 0.55);
      }

      level.debbi.hp = Math.max(0, level.debbi.hp);
    }

    if (!level.debbi.carried && level.debbi.hp > 0) {
      let crystalCount = 0;
      for (let dy = -32; dy <= 32; dy += 2) {
        for (let dx = -32; dx <= 32; dx += 2) {
          if (world.getElement(bx + dx, by + dy) === ElementId.CHRONITON_CRYSTAL) {
            crystalCount++;
          }
        }
      }
      level.debbi.cageIntactCount = crystalCount;

      const distToDebbi = Math.hypot(player.x - bx, player.y - by);
      // Check if there is a breached line-of-sight opening between Debbi and Dr. Vance
      let crystalBlockingLine = false;
      if (distToDebbi < 54 && distToDebbi > 1) {
        const steps = Math.ceil(distToDebbi / 2);
        for (let s = 1; s < steps; s++) {
          const rx = Math.round(bx + ((player.x - bx) * s) / steps);
          const ry = Math.round(by + ((player.y - by) * s) / steps);
          if (world.getElement(rx, ry) === ElementId.CHRONITON_CRYSTAL) {
            crystalBlockingLine = true;
            break;
          }
        }
      }

      // Full pod ring has ~116 crystal sample points; breaching one side drops it below ~100 or opens a clear line of sight
      const cageBreached = !crystalBlockingLine || crystalCount < 100;
      if (distToDebbi < 32 || (cageBreached && distToDebbi < 54)) {
        level.debbi.carried = true;
        player.carryingDebbi = true;
        // Dissolve remaining Chroniton Stasis ring so the pod bursts open cleanly when she hops on your back
        for (let dy = -34; dy <= 34; dy++) {
          for (let dx = -34; dx <= 34; dx++) {
            if (world.getElement(bx + dx, by + dy) === ElementId.CHRONITON_CRYSTAL) {
              world.setElement(bx + dx, by + dy, ElementId.EMPTY, 22);
            }
          }
        }
        sound.playVictory();
        gamepad.triggerRumble(180, 0.45, 0.7);
        jevDirector.reportIncident(
          35,
          `ALERT: Intruder has Debbi on his back! Intercept before he reaches the ${level.escapeVehicle.name}!`
        );
        updateDebbiStatus();
      }
    } else if (level.debbi.carried && level.debbi.hp > 0) {
      const ev = level.escapeVehicle;
      const distToEv = Math.hypot(player.x - ev.x, player.y - ev.y);
      if (distToEv < 38) {
        level.debbi.rescued = true;
        player.carryingDebbi = false;
        level.debbi.x = ev.x;
        level.debbi.y = ev.y - 6;
        sound.playVictory();
        gamepad.triggerRumble(320, 0.6, 0.85);
        updateDebbiStatus();
        showEventModal(
          `🎉 EXTRACTION COMPLETE: ESCAPED IN ${ev.name.toUpperCase()}!`,
          `You carried Debbi safely across the facility (${Math.ceil(level.debbi.hp)}% health remaining) and boarded the waiting ${ev.name}! Click "Next World Map [N]" to infiltrate the next environment!`
        );
      }
    }
  }
}

// 6. HUD Update Helpers
const hpBar = document.getElementById('hp-bar')!;
const hpText = document.getElementById('hp-text')!;
const jetBar = document.getElementById('jet-bar')!;
const jetText = document.getElementById('jet-text')!;
const o2Bar = document.getElementById('o2-bar')!;
const o2Text = document.getElementById('o2-text')!;
const radBar = document.getElementById('rad-bar')!;
const radText = document.getElementById('rad-text')!;
const sectorTitle = document.getElementById('sector-title')!;
const sectorSubtitle = document.getElementById('sector-subtitle')!;
const fpsCounter = document.getElementById('fps-counter')!;
const gamepadPill = document.getElementById('gamepad-pill')!;
const jevAlertPill = document.getElementById('jev-alert-pill')!;
const jevBroadcastText = document.getElementById('jev-broadcast-text')!;

function renderJevTelemetryModal(): void {
  const statsRow = document.getElementById('jev-stats-row');
  const leversList = document.getElementById('jev-levers-list');
  const outputsList = document.getElementById('jev-outputs-list');
  if (!statsRow || !leversList || !outputsList) return;

  const b = jevDirector.brain;
  const activeUnits = (level.enemyUnits || []).filter((u) => u.active).length;
  const activeDefenses = (level.defenses || []).filter((d) => d.active).length;

  statsRow.innerHTML = `
    <span><strong>Curriculum Episodes:</strong> ${b.trainedEpisodes}</span>
    <span><strong>Live RL Updates:</strong> ${b.onlineUpdates}</span>
    <span><strong>Loss:</strong> ${b.lastLoss.toFixed(4)}</span>
    <span><strong>Last RL Reward:</strong> ${b.lastReward >= 0 ? '+' : ''}${b.lastReward.toFixed(2)}</span>
    <span><strong>Active Forces:</strong> ${activeUnits} Units / ${activeDefenses} Defenses</span>
  `;

  leversList.innerHTML = JEV_LEVER_NAMES.map((name, idx) => {
    const val = b.lastLevers[idx] ?? 0;
    const pct = Math.round(val * 100);
    return `
      <div class="jev-lever-row">
        <span>${name}</span>
        <div class="bar-track"><div class="bar-fill jet-fill" style="width:${pct}%"></div></div>
        <span style="text-align:right;color:#4cc9f0;">${val.toFixed(2)}</span>
      </div>
    `;
  }).join('');

  const dirHtml = JEV_DIRECTIVES.map((dir, idx) => {
    const p = b.lastDirProbs[idx] ?? 0;
    const pct = Math.round(p * 100);
    const isChosen = idx === b.lastChosenDirIdx;
    return `
      <div class="jev-lever-row">
        <span style="color:${isChosen ? '#ffd166' : '#cbd5e1'};font-weight:${isChosen ? '800' : '500'}">
          ${isChosen ? '▶ ' : ''}choice: ${dir}
        </span>
        <div class="bar-track"><div class="bar-fill hp-fill" style="width:${pct}%"></div></div>
        <span style="text-align:right;color:#ffd166;">${pct}%</span>
      </div>
    `;
  }).join('');

  const loadHtml = JEV_LOADOUTS.map((ld, idx) => {
    const p = b.lastLoadProbs[idx] ?? 0;
    const pct = Math.round(p * 100);
    const isChosen = idx === b.lastChosenLoadIdx;
    return `
      <div class="jev-lever-row">
        <span style="color:${isChosen ? '#ff99c8' : '#94a3b8'};font-weight:${isChosen ? '800' : '500'}">
          ${isChosen ? '● ' : ''}loadout: ${ld.toUpperCase()}
        </span>
        <div class="bar-track"><div class="bar-fill rad-fill" style="width:${pct}%"></div></div>
        <span style="text-align:right;color:#ff99c8;">${pct}%</span>
      </div>
    `;
  }).join('');

  const noul0 = Math.round((b.lastNoulProbs[0] ?? 0) * 100);
  const noul1 = Math.round((b.lastNoulProbs[1] ?? 0) * 100);
  const noul2 = Math.round((b.lastNoulProbs[2] ?? 0) * 100);

  outputsList.innerHTML = `
    ${dirHtml}
    <hr style="border:0;border-top:1px solid rgba(148,163,184,0.2);margin:4px 0;" />
    ${loadHtml}
    <hr style="border:0;border-top:1px solid rgba(148,163,184,0.2);margin:4px 0;" />
    <div style="font-size:10.5px;color:#00f5d4;display:flex;justify-content:space-between;">
      <span>noul(VaultThreat): <strong>${noul0}%</strong></span>
      <span>noul(CounterAlchemy): <strong>${noul1}%</strong></span>
      <span>noul(Reinforce): <strong>${noul2}%</strong></span>
    </div>
  `;
}

function updateDebbiStatus(): void {
  const debbiPill = document.getElementById('debbi-status-pill')!;
  const b = level.debbi;
  const hpPct = Math.max(0, Math.min(100, Math.ceil(b.hp)));
  if (b.rescued) {
    debbiPill.textContent = '♥ DEBBI EXTRACTED!';
    debbiPill.style.background = 'rgba(6, 214, 160, 0.25)';
    debbiPill.style.borderColor = '#06d6a0';
    debbiPill.style.color = '#06d6a0';
  } else if (b.hp <= 0) {
    debbiPill.textContent = '💔 DEBBI LOST!';
    debbiPill.style.background = 'rgba(255, 0, 85, 0.28)';
    debbiPill.style.borderColor = '#ff0055';
    debbiPill.style.color = '#ff4d6d';
  } else if (b.carried) {
    debbiPill.textContent = `🎒 ON BACK (${hpPct}%) → EXTRACT!`;
    debbiPill.style.background = hpPct < 45 ? 'rgba(255, 0, 85, 0.25)' : 'rgba(6, 214, 160, 0.22)';
    debbiPill.style.borderColor = hpPct < 45 ? '#ff0055' : '#06d6a0';
    debbiPill.style.color = hpPct < 45 ? '#ff4d6d' : '#06d6a0';
  } else {
    debbiPill.textContent = hpPct < 100 ? `♥ DEBBI: ${hpPct}%` : 'DEBBI: IN STASIS';
    debbiPill.style.background = hpPct < 100 ? 'rgba(255, 0, 85, 0.22)' : 'rgba(247, 37, 133, 0.2)';
    debbiPill.style.borderColor = hpPct < 100 ? '#ff0055' : 'rgba(247, 37, 133, 0.5)';
    debbiPill.style.color = hpPct < 100 ? '#ff4d6d' : '#ff99c8';
  }
}

function updateHud(): void {
  updateDebbiStatus();
  const hpPct = Math.max(0, Math.min(100, Math.round(player.hp)));
  hpBar.style.width = `${hpPct}%`;
  hpText.textContent = `${hpPct}`;

  const jetPct = Math.max(0, Math.min(100, Math.round(player.jetpackFuel)));
  jetBar.style.width = `${jetPct}%`;
  jetText.textContent = `${jetPct}`;

  const o2Pct = Math.max(0, Math.min(100, Math.round(player.oxygen)));
  o2Bar.style.width = `${o2Pct}%`;
  o2Text.textContent = `${o2Pct}`;

  const radPct = Math.max(0, Math.min(100, Math.round(player.radiationDose)));
  radBar.style.width = `${radPct}%`;
  radText.textContent = `${radPct}`;

  if (gamepad.state.connected) {
    gamepadPill.textContent = '🎮 PAD READY';
    gamepadPill.classList.add('connected');
  } else if (touchControls.enabled) {
    gamepadPill.textContent = '📱 TOUCH READY';
    gamepadPill.classList.add('connected');
  } else {
    gamepadPill.textContent = '🎮 NO PAD';
    gamepadPill.classList.remove('connected');
  }

  if (jevAlertPill && jevBroadcastText) {
    jevAlertPill.textContent = `J.E.V. ${jevDirector.alertState} ${Math.round(jevDirector.alertLevel)}%`;
    jevBroadcastText.textContent = jevDirector.lastBroadcast;
  }

  const jevDlg = document.getElementById('jev-dialog') as HTMLDialogElement | null;
  if (jevDlg && jevDlg.open) {
    renderJevTelemetryModal();
  }

  for (const sec of level.sectors) {
    if (
      player.x >= sec.x1 &&
      player.x <= sec.x2 &&
      player.y >= sec.y1 &&
      player.y <= sec.y2
    ) {
      if (sectorTitle.textContent !== sec.name) {
        sectorTitle.textContent = sec.name;
        sectorTitle.style.color = sec.color;
        sectorSubtitle.textContent = sec.subtitle;
      }
      break;
    }
  }

  // Trigger Fusion Modal if Thermonuclear Fusion just ignited!
  if (world.fusionTriggered && !fusionAlertShown) {
    fusionAlertShown = true;
    gamepad.triggerRumble(650, 1.0, 1.0);
    showEventModal(
      '☢️ THERMONUCLEAR FUSION IGNITED! (5,000+ GPa)',
      'Enormous mechanical pressure breached the Coulomb barrier! Hydrogen/Deuterium nuclei fused into Helium-4 and fast Neutrons (17.6 MeV), unleashing a miniature star inside the underground lab! Press [Y / R] or "Rewind Time 5 Seconds" to undo the fusion blast, or press [B / ESC] to watch the plasma core burn!'
    );
  }

  // Trigger Debbi Lost Modal if delicate Debbi's HP hits 0!
  if (level.debbi.hp <= 0 && !debbiDeathAlertShown) {
    debbiDeathAlertShown = true;
    gamepad.triggerRumble(550, 0.9, 1.0);
    const cause = level.debbi.hurtReason || 'alchemical crossfire';
    showEventModal(
      '💔 DEBBI PERISHED!',
      `Debbi is delicate and succumbed to ${cause}! Watch your fire and shield her from blasts and hazards while escorting her to the ${level.escapeVehicle.name}. Press [Y / R] to activate your Chroniton Time-Rewind device and rewind 5 seconds!`
    );
  }

  // Trigger Suit Breach Modal if HP hits 0
  if (player.hp <= 0 && !breachAlertShown) {
    breachAlertShown = true;
    gamepad.triggerRumble(450, 0.8, 0.9);
    showEventModal(
      '⚠️ HAZMAT SUIT BREACHED!',
      'Extreme alchemical hazards overwhelmed your suit shielding! Press [Y / R] to activate your Chroniton Time-Rewind device and rewind 5 seconds before the fatal reaction.'
    );
  }
}

// 7. Main 60Hz Game Loop
let lastFpsTime = performance.now();
let frames = 0;
const simulationClock = new FixedStepClock();

function isSimulationPaused(): boolean {
  return (
    manualPause ||
    player.hp <= 0 ||
    level.debbi.hp <= 0 ||
    document.hidden ||
    document.querySelector('dialog[open]') !== null
  );
}

function pollControls(): GamepadState {
  // Poll Gamepad + Virtual Dual-Stick Touch State
  const gp = touchControls.applyToGamepadState(gamepad.poll());

  // Handle Gamepad Edge-Triggered Buttons
  if (gp.connected) {
    // LB / RB Bumper weapon cycling
    if (gp.prevToolPressed) {
      selectTool(((player.selectedTool - 2 + 9) % 9) + 1);
    }
    if (gp.nextToolPressed) {
      selectTool((player.selectedTool % 9) + 1);
    }

    // Start / Options toggles Codex
    if (gp.codexPressed) {
      const codexDlg = document.getElementById('codex-dialog') as HTMLDialogElement;
      if (codexDlg.open) codexDlg.close();
      else codexDlg.showModal();
    }

    // Select / Back swaps LT/RT trigger polarity
    if (gp.swapTriggersPressed) {
      updateToolLabels();
      world.addReactionPopup(
        Math.floor(player.x),
        Math.floor(player.y) - 8,
        gamepad.literalLeftRightTriggers
          ? '🎮 TRIGGERS: LT=Left Click / RT=Right Click'
          : '🎮 TRIGGERS: RT=Left Click / LT=Right Click',
        '#ffd166'
      );
    }

    // Y / Triangle rewinds time (even if Fusion/Breach modal is open!)
    if (gp.rewindPressed) {
      rewindTime();
    }

    // If a modal is open, B / Circle or X / Square closes it
    const openDialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (openDialog) {
      if (gp.closeModalPressed || gp.interactPressed) {
        openDialog.close();
      }
    } else {
      // B / Circle or L3 activates Quantum Phase Walk
      if (gp.quantumDashPressed) {
        player.activateQuantumDash(sound);
        gamepad.triggerRumble(90, 0.3, 0.4);
        world.addReactionPopup(
          Math.floor(player.x),
          Math.floor(player.y) - 6,
          '|Ψ⟩ QUANTUM PHASE WALK!',
          '#c77dff'
        );
      }

      // X / Square opens nearby Lab Terminal
      if (gp.interactPressed) {
        tryOpenNearbyTerminal();
      }

      // D-Pad Up toggles Thermal & Pressure Vision
      if (gp.thermalVisionPressed) {
        thermalVision = !thermalVision;
      }

      // R3 snaps reticle to player's facing direction
      if (gp.snapReticlePressed) {
        usingGamepadAim = true;
        reticleOffsetX = player.facing * 52;
        reticleOffsetY = 0;
      }
    }
  }
  return gp;
}

function getTargetWorld(): { wx: number; wy: number } {
  return usingGamepadAim
    ? {
        wx: Math.max(2, Math.min(world.width - 3, player.x + reticleOffsetX)),
        wy: Math.max(2, Math.min(world.height - 3, player.y + reticleOffsetY)),
      }
    : renderer.screenToWorld(mouseScreenX, mouseScreenY, mainCanvas);
}

function simulateTick(gp: GamepadState): void {
  tick++;

  // Continuous input is integrated in simulation time, including controller aim.
  if (gp.connected && (Math.abs(gp.aimX) > 0 || Math.abs(gp.aimY) > 0)) {
    if (!usingGamepadAim) {
      const curMouse = renderer.screenToWorld(mouseScreenX, mouseScreenY, mainCanvas);
      reticleOffsetX = curMouse.wx - player.x;
      reticleOffsetY = curMouse.wy - player.y;
      usingGamepadAim = true;
    }
    reticleOffsetX = Math.max(-210, Math.min(210, reticleOffsetX + gp.aimX * 4.3));
    reticleOffsetY = Math.max(-128, Math.min(128, reticleOffsetY + gp.aimY * 4.3));
  }
  const targetWorld = getTargetWorld();

  // Continuous tool firing when mouse OR controller triggers are held down.
  const firePrimary = mouseLeftDown || (gp.connected && gp.primaryFireHeld);
  const fireSecondary = mouseRightDown || (gp.connected && gp.secondaryFireHeld);

  if (firePrimary) {
    const fired = player.fireCooldown === 0;
    player.fireTool(targetWorld.wx, targetWorld.wy, false, projectiles, world, sound);
    if (fired && gp.connected && gp.primaryFireHeld && player.selectedTool === 1) {
      gamepad.triggerRumble(55, 0.25, 0.4);
    }
  } else if (fireSecondary) {
    const fired = player.fireCooldown === 0;
    player.fireTool(targetWorld.wx, targetWorld.wy, true, projectiles, world, sound);
    if (fired && gp.connected && gp.secondaryFireHeld && player.selectedTool === 1) {
      gamepad.triggerRumble(110, 0.5, 0.8);
    }
  }
  player.update(keys, world, sound, gp);
  jevDirector.update(
    world,
    player,
    level.enemyUnits || [],
    level.defenses || [],
    projectiles,
    level.debbi,
    sound,
    tick
  );

  updateProjectiles(projectiles, world, sound, player, level.enemyUnits, level.debbi);
  updateTurretsAndDebbi();

  // Step atomic pixel simulation around camera
  renderer.updateCamera(player, world);
  world.step(
    renderer.camX + renderer.viewW / 2,
    renderer.camY + renderer.viewH / 2,
    sound
  );

  if (tick % SNAPSHOT_INTERVAL_TICKS === 0) saveSnapshot();
  if (
    tick % 4 === 0 ||
    player.hp <= 0 ||
    level.debbi.hp <= 0 ||
    (world.fusionTriggered && !fusionAlertShown)
  ) {
    renderer.renderMinimap(minimapCanvas, world, player, level);
    updateHud();
  }
}

function gameLoop(now: number): void {
  frames++;
  if (now - lastFpsTime >= 500) {
    fpsCounter.textContent = `${Math.round((frames * 1000) / (now - lastFpsTime))} FPS`;
    frames = 0;
    lastFpsTime = now;
  }

  // Poll edge-triggered menu actions once per render, including while paused.
  const gp = pollControls();
  simulationClock.advance(now, isSimulationPaused(), () => {
    simulateTick(gp);
    // A victory, breach, or controller interaction can open a dialog during catch-up.
    return !isSimulationPaused();
  });

  // Render fat-pixel world + entities
  renderer.render(
    mainCanvas,
    mainCtx,
    world,
    player,
    projectiles,
    level,
    getTargetWorld(),
    tick,
    thermalVision
  );

  requestAnimationFrame(gameLoop);
}

window.addEventListener('blur', () => {
  keys.clear();
  mouseLeftDown = false;
  mouseRightDown = false;
});
document.addEventListener('visibilitychange', () => simulationClock.reset());

updateHud();
renderer.renderMinimap(minimapCanvas, world, player, level);
requestAnimationFrame(gameLoop);
