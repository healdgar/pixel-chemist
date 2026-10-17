import { ElementId, FLAG_CRYO_BRITTLE, FLAG_GLUON_LOCKED } from '../chemistry/elements';
import { WorldGrid } from '../simulation/world';
import { EnemyUnit, FacilityDefense } from '../ai/jevDirector';

export type MapId =
  | 'alpine_outdoor'
  | 'office_tower'
  | 'castle_keep'
  | 'space_station'
  | 'magma_trench'
  | 'underground_lab';

export interface MapInfo {
  id: MapId;
  index: number;
  name: string;
  shortName: string;
  icon: string;
  gravityScale: number;
  tagline: string;
}

export const MAP_CATALOG: MapInfo[] = [
  {
    id: 'alpine_outdoor',
    index: 1,
    name: '1. Alpine Cryo-Valley (Outdoors)',
    shortName: '🏔️ Alpine Outdoors',
    icon: '🏔️',
    gravityScale: 1.0,
    tagline: 'Open-air mountain peaks, pine forests, glacial lake & subterranean bunker entrance',
  },
  {
    id: 'office_tower',
    index: 2,
    name: '2. OmniCorp Skyscraper (Office Building)',
    shortName: '🏢 Office Tower',
    icon: '🏢',
    gravityScale: 1.0,
    tagline: 'Multi-story glass high-rise, cubicles, server farms, elevators & penthouse vault',
  },
  {
    id: 'castle_keep',
    index: 3,
    name: '3. Castle Ravenscroft (Medieval Keep)',
    shortName: '🏰 Medieval Castle',
    icon: '🏰',
    gravityScale: 1.0,
    tagline: 'Stone battlements, boiling oil moats, iron portcullises & royal alchemy dungeons',
  },
  {
    id: 'space_station',
    index: 4,
    name: '4. Orbital Station Icarus-9 (Space)',
    shortName: '🛰️ Space Station',
    icon: '🛰️',
    gravityScale: 0.45,
    tagline: 'Low-gravity orbital ring in deep space vacuum with hydroponics & fusion tokamak pods',
  },
  {
    id: 'magma_trench',
    index: 5,
    name: '5. Abyssal Caldera (Ocean & Volcano)',
    shortName: '🌋 Magma Trench',
    icon: '🌋',
    gravityScale: 0.9,
    tagline: 'Pressurized ocean reservoir above a geothermal magma chamber & obsidian vault',
  },
  {
    id: 'underground_lab',
    index: 6,
    name: '6. Aethelgard Deep Core (Underground Lab)',
    shortName: '⚛️ Underground Lab',
    icon: '⚛️',
    gravityScale: 1.0,
    tagline: '9-sector sub-atomic research facility descending to the Deep Quantum Core',
  },
];

export interface LabTerminal {
  id: string;
  x: number;
  y: number;
  sector: string;
  title: string;
  logText: string;
  alchemyTip: string;
}

export interface LabTurret {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  active: boolean;
  type: 'kinetic' | 'thermal' | 'radiation';
}

export interface SectorZone {
  name: string;
  subtitle: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface DebbiState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  carried: boolean;
  rescued: boolean;
  inDanger: boolean;
  cageIntactCount: number;
  hurtReason?: string;
}

export interface EscapeVehicle {
  x: number;
  y: number;
  name: string;
  type: 'dropship' | 'chopper' | 'airship' | 'shuttle' | 'submersible' | 'drillpod';
}

export interface LevelData {
  mapInfo: MapInfo;
  spawnX: number;
  spawnY: number;
  debbi: DebbiState;
  escapeVehicle: EscapeVehicle;
  terminals: LabTerminal[];
  turrets: LabTurret[];
  enemyUnits?: EnemyUnit[];
  defenses?: FacilityDefense[];
  sectors: SectorZone[];
}

// Shared geometry helpers (scales logical 560x360 coordinates by S = world.width / 560)
function createHelpers(world: WorldGrid) {
  const W = world.width;
  const H = world.height;
  const S = Math.max(1, Math.round(W / 560));

  const carveRect = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    bgType: number = 1,
    wallEl?: ElementId,
    wallThickness: number = 3
  ) => {
    const minX = Math.max(5 * S, Math.round(Math.min(x1, x2) * S));
    const maxX = Math.min(W - 6 * S, Math.round(Math.max(x1, x2) * S));
    const minY = Math.max(5 * S, Math.round(Math.min(y1, y2) * S));
    const maxY = Math.min(H - 6 * S, Math.round(Math.max(y1, y2) * S));
    const wt = Math.round(wallThickness * S);

    if (wallEl !== undefined) {
      for (let y = minY - wt; y <= maxY + wt; y++) {
        for (let x = minX - wt; x <= maxX + wt; x++) {
          if (world.inBounds(x, y)) {
            world.setElement(x, y, wallEl);
            world.bgGrid[world.idx(x, y)] = bgType;
          }
        }
      }
    }

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        world.setElement(x, y, ElementId.EMPTY, 22);
        world.bgGrid[world.idx(x, y)] = bgType;
      }
    }
  };

  const fillRect = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    el: ElementId,
    temp?: number,
    flags: number = 0,
    bgOverride?: number
  ) => {
    const minX = Math.round(Math.min(x1, x2) * S);
    const maxX = Math.round(Math.max(x1, x2) * S);
    const minY = Math.round(Math.min(y1, y2) * S);
    const maxY = Math.round(Math.max(y1, y2) * S);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (world.inBounds(x, y)) {
          world.setElement(x, y, el, temp);
          if (flags) world.flags[world.idx(x, y)] |= flags;
          if (bgOverride !== undefined) world.bgGrid[world.idx(x, y)] = bgOverride;
        }
      }
    }
  };

  const buildDebbiPod = (bx: number, by: number) => {
    const sbx = Math.round(bx * S);
    const sby = Math.round(by * S);
    const rOuter = Math.round(16 * S);
    for (let dy = -rOuter; dy <= rOuter; dy++) {
      for (let dx = -rOuter; dx <= rOuter; dx++) {
        const dist = Math.hypot(dx, dy) / S;
        const px = sbx + dx;
        const py = sby + dy;
        if (dist >= 13 && dist <= 15.5) {
          world.setElement(px, py, ElementId.CHRONITON_CRYSTAL, 0);
        } else if (dist < 13) {
          world.setElement(px, py, ElementId.EMPTY, 22);
        }
      }
    }
    fillRect(bx - 10, by + 10, bx + 10, by + 15, ElementId.STEEL);
  };

  const sealWorldBorders = () => {
    const border = 4 * S;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (x < border || x >= W - border || y < border || y >= H - border) {
          world.setElement(x, y, ElementId.TUNGSTEN, 20);
          world.flags[world.idx(x, y)] |= FLAG_GLUON_LOCKED;
        }
      }
    }
  };

  return { W, H, S, carveRect, fillRect, buildDebbiPod, sealWorldBorders };
}

function makeUnit(
  id: string,
  type: 'guard' | 'drone' | 'robot',
  name: string,
  x: number,
  y: number,
  patrolMinX: number,
  patrolMaxX: number
): EnemyUnit {
  const isRobot = type === 'robot';
  const isDrone = type === 'drone';
  const hp = isRobot ? 220 : isDrone ? 80 : 110;
  return {
    id,
    type,
    name,
    x,
    y,
    vx: 0,
    vy: 0,
    width: isRobot ? 16 : isDrone ? 12 : 10,
    height: isRobot ? 24 : isDrone ? 10 : 18,
    hp,
    maxHp: hp,
    facing: 1,
    grounded: false,
    active: true,
    cooldown: 30,
    patrolMinX,
    patrolMaxX,
    homeY: y,
    wetTimer: 0,
    rustedLevel: 0,
    cryoBrittleTimer: 0,
    stasisTimer: 0,
    aiState: 'patrol',
    aiThought: 'PATROLLING SECTOR',
    weaponLoadout: isDrone ? 'plasma' : 'kinetic',
  };
}

function createJevForcesForMap(mapId: MapId): {
  enemyUnits: EnemyUnit[];
  defenses: FacilityDefense[];
} {
  switch (mapId) {
    case 'alpine_outdoor':
      return {
        enemyUnits: [
          makeUnit('alp-g1', 'guard', 'Cryo-Ranger Guard', 118, 122, 85, 148),
          makeUnit('alp-g2', 'guard', 'Bunker Hazmat Guard', 180, 212, 110, 225),
          makeUnit('alp-d1', 'drone', 'Glacier Hunter-Drone', 245, 92, 175, 315),
          makeUnit('alp-d2', 'drone', 'Watchtower Wasp-Drone', 415, 72, 360, 485),
          makeUnit('alp-r1', 'robot', 'Aegis Frost-Mech', 355, 214, 305, 425),
        ],
        defenses: [
          {
            id: 'alp-las1',
            type: 'laser_grid',
            x: 256,
            y: 192,
            dirX: 1,
            dirY: 0,
            maxLength: 50,
            currentEndX: 304,
            currentEndY: 192,
            hp: 90,
            maxHp: 90,
            active: true,
            cooldown: 0,
            triggered: false,
          },
          {
            id: 'alp-spr1',
            type: 'ceiling_sprayer',
            x: 170,
            y: 178,
            dirX: 0,
            dirY: 1,
            maxLength: 0,
            currentEndX: 170,
            currentEndY: 178,
            hp: 80,
            maxHp: 80,
            active: true,
            cooldown: 0,
            triggered: false,
            sprayElement: ElementId.LIQUID_NITROGEN,
          },
          {
            id: 'alp-bec1',
            type: 'alarm_beacon',
            x: 432,
            y: 78,
            dirX: 0,
            dirY: 0,
            maxLength: 0,
            currentEndX: 432,
            currentEndY: 78,
            hp: 95,
            maxHp: 95,
            active: true,
            cooldown: 0,
            triggered: false,
          },
        ],
      };

    case 'office_tower':
      return {
        enemyUnits: [
          makeUnit('off-g1', 'guard', 'Penthouse Security Officer', 210, 72, 145, 255),
          makeUnit('off-g2', 'guard', 'Wet-Lab Hazmat Guard', 245, 168, 215, 325),
          makeUnit('off-d1', 'drone', 'Skyline Interceptor Drone', 85, 110, 50, 104),
          makeUnit('off-d2', 'drone', 'Executive Atrium Drone', 320, 102, 185, 415),
          makeUnit('off-r1', 'robot', 'OmniCorp Enforcer Mech', 205, 262, 145, 255),
        ],
        defenses: [
          {
            id: 'off-las1',
            type: 'laser_grid',
            x: 268,
            y: 146,
            dirX: 1,
            dirY: 0,
            maxLength: 26,
            currentEndX: 292,
            currentEndY: 146,
            hp: 95,
            maxHp: 95,
            active: true,
            cooldown: 0,
            triggered: false,
          },
          {
            id: 'off-spr1',
            type: 'ceiling_sprayer',
            x: 280,
            y: 135,
            dirX: 0,
            dirY: 1,
            maxLength: 0,
            currentEndX: 280,
            currentEndY: 135,
            hp: 85,
            maxHp: 85,
            active: true,
            cooldown: 0,
            triggered: false,
            sprayElement: ElementId.ACID,
          },
          {
            id: 'off-bec1',
            type: 'alarm_beacon',
            x: 345,
            y: 52,
            dirX: 0,
            dirY: 0,
            maxLength: 0,
            currentEndX: 345,
            currentEndY: 52,
            hp: 95,
            maxHp: 95,
            active: true,
            cooldown: 0,
            triggered: false,
          },
        ],
      };

    case 'castle_keep':
      return {
        enemyUnits: [
          makeUnit('cas-g1', 'guard', 'Royal Alchemist Guard', 230, 112, 165, 355),
          makeUnit('cas-g2', 'guard', 'Great Hall Warden', 235, 172, 165, 290),
          makeUnit('cas-d1', 'drone', 'Gargoyle Hunter-Drone', 280, 50, 160, 400),
          makeUnit('cas-r1', 'robot', 'Iron Golem Automaton', 368, 168, 315, 398),
          makeUnit('cas-r2', 'robot', 'Crypt Warden Mech', 185, 258, 130, 220),
        ],
        defenses: [
          {
            id: 'cas-las1',
            type: 'laser_grid',
            x: 268,
            y: 210,
            dirX: 1,
            dirY: 0,
            maxLength: 26,
            currentEndX: 292,
            currentEndY: 210,
            hp: 90,
            maxHp: 90,
            active: true,
            cooldown: 0,
            triggered: false,
          },
          {
            id: 'cas-spr1',
            type: 'ceiling_sprayer',
            x: 280,
            y: 134,
            dirX: 0,
            dirY: 1,
            maxLength: 0,
            currentEndX: 280,
            currentEndY: 134,
            hp: 85,
            maxHp: 85,
            active: true,
            cooldown: 0,
            triggered: false,
            sprayElement: ElementId.OIL,
          },
          {
            id: 'cas-bec1',
            type: 'alarm_beacon',
            x: 280,
            y: 82,
            dirX: 0,
            dirY: 0,
            maxLength: 0,
            currentEndX: 280,
            currentEndY: 82,
            hp: 95,
            maxHp: 95,
            active: true,
            cooldown: 0,
            triggered: false,
          },
        ],
      };

    case 'space_station':
      return {
        enemyUnits: [
          makeUnit('spc-g1', 'guard', 'Zero-G Orbital Guard', 250, 206, 215, 345),
          makeUnit('spc-g2', 'guard', 'Tokamak Reactor Guard', 415, 206, 395, 435),
          makeUnit('spc-d1', 'drone', 'Bio-Dome Seeker Drone', 280, 62, 220, 340),
          makeUnit('spc-d2', 'drone', 'Orbital Hub Wasp-Drone', 305, 155, 220, 345),
          makeUnit('spc-r1', 'robot', 'Icarus Exo-Walker Mech', 235, 320, 215, 260),
        ],
        defenses: [
          {
            id: 'spc-las1',
            type: 'laser_grid',
            x: 268,
            y: 122,
            dirX: 1,
            dirY: 0,
            maxLength: 26,
            currentEndX: 292,
            currentEndY: 122,
            hp: 95,
            maxHp: 95,
            active: true,
            cooldown: 0,
            triggered: false,
          },
          {
            id: 'spc-spr1',
            type: 'ceiling_sprayer',
            x: 280,
            y: 135,
            dirX: 0,
            dirY: 1,
            maxLength: 0,
            currentEndX: 280,
            currentEndY: 135,
            hp: 85,
            maxHp: 85,
            active: true,
            cooldown: 0,
            triggered: false,
            sprayElement: ElementId.LIQUID_NITROGEN,
          },
          {
            id: 'spc-bec1',
            type: 'alarm_beacon',
            x: 145,
            y: 145,
            dirX: 0,
            dirY: 0,
            maxLength: 0,
            currentEndX: 145,
            currentEndY: 145,
            hp: 95,
            maxHp: 95,
            active: true,
            cooldown: 0,
            triggered: false,
          },
        ],
      };

    case 'magma_trench':
      return {
        enemyUnits: [
          makeUnit('mag-g1', 'guard', 'Geothermal Hazmat Guard', 255, 212, 220, 340),
          makeUnit('mag-d1', 'drone', 'Caldera Hunter-Drone West', 155, 142, 85, 260),
          makeUnit('mag-d2', 'drone', 'Caldera Hunter-Drone East', 395, 142, 290, 465),
          makeUnit('mag-r1', 'robot', 'Vulcan Magma-Walker Mech', 310, 210, 235, 340),
        ],
        defenses: [
          {
            id: 'mag-las1',
            type: 'laser_grid',
            x: 225,
            y: 175,
            dirX: 1,
            dirY: 0,
            maxLength: 110,
            currentEndX: 335,
            currentEndY: 175,
            hp: 95,
            maxHp: 95,
            active: true,
            cooldown: 0,
            triggered: false,
          },
          {
            id: 'mag-spr1',
            type: 'ceiling_sprayer',
            x: 280,
            y: 124,
            dirX: 0,
            dirY: 1,
            maxLength: 0,
            currentEndX: 280,
            currentEndY: 124,
            hp: 85,
            maxHp: 85,
            active: true,
            cooldown: 0,
            triggered: false,
            sprayElement: ElementId.ACID,
          },
          {
            id: 'mag-bec1',
            type: 'alarm_beacon',
            x: 145,
            y: 135,
            dirX: 0,
            dirY: 0,
            maxLength: 0,
            currentEndX: 145,
            currentEndY: 135,
            hp: 95,
            maxHp: 95,
            active: true,
            cooldown: 0,
            triggered: false,
          },
        ],
      };

    case 'underground_lab':
    default:
      return {
        enemyUnits: [
          makeUnit('lab-g1', 'guard', 'Cryo-Wing Hazmat Guard', 150, 64, 126, 174),
          makeUnit('lab-g2', 'guard', 'Refinery Catwalk Guard', 390, 98, 376, 404),
          makeUnit('lab-g3', 'guard', 'Reactor Deck Guard', 405, 166, 390, 424),
          makeUnit('lab-d1', 'drone', 'Alchemy Hub Hunter-Drone', 280, 165, 220, 340),
          makeUnit('lab-d2', 'drone', 'Cryo-Wing Wasp-Drone', 115, 185, 60, 175),
          makeUnit('lab-r1', 'robot', 'Aethelgard Goliath Mech', 100, 316, 65, 122),
          makeUnit('lab-r2', 'robot', 'Deep Core Warden Mech', 242, 276, 232, 255),
        ],
        defenses: [
          {
            id: 'lab-las1',
            type: 'laser_grid',
            x: 266,
            y: 122,
            dirX: 1,
            dirY: 0,
            maxLength: 28,
            currentEndX: 294,
            currentEndY: 122,
            hp: 95,
            maxHp: 95,
            active: true,
            cooldown: 0,
            triggered: false,
          },
          {
            id: 'lab-spr1',
            type: 'ceiling_sprayer',
            x: 280,
            y: 142,
            dirX: 0,
            dirY: 1,
            maxLength: 0,
            currentEndX: 280,
            currentEndY: 142,
            hp: 85,
            maxHp: 85,
            active: true,
            cooldown: 0,
            triggered: false,
            sprayElement: ElementId.ACID,
          },
          {
            id: 'lab-bec1',
            type: 'alarm_beacon',
            x: 280,
            y: 42,
            dirX: 0,
            dirY: 0,
            maxLength: 0,
            currentEndX: 280,
            currentEndY: 42,
            hp: 95,
            maxHp: 95,
            active: true,
            cooldown: 0,
            triggered: false,
          },
        ],
      };
  }
}

function scaleLevelData(data: LevelData, S: number): LevelData {
  data.spawnX = Math.round(data.spawnX * S);
  data.spawnY = Math.round(data.spawnY * S);
  data.debbi.x = Math.round(data.debbi.x * S);
  data.debbi.y = Math.round(data.debbi.y * S);
  data.escapeVehicle.x = Math.round(data.escapeVehicle.x * S);
  data.escapeVehicle.y = Math.round(data.escapeVehicle.y * S);
  for (const t of data.terminals) {
    t.x = Math.round(t.x * S);
    t.y = Math.round(t.y * S);
  }
  for (const tur of data.turrets) {
    tur.x = Math.round(tur.x * S);
    tur.y = Math.round(tur.y * S);
  }
  if (data.enemyUnits) {
    for (const u of data.enemyUnits) {
      u.x = Math.round(u.x * S);
      u.y = Math.round(u.y * S);
      u.homeY = Math.round(u.homeY * S);
      u.patrolMinX = Math.round(u.patrolMinX * S);
      u.patrolMaxX = Math.round(u.patrolMaxX * S);
    }
  }
  if (data.defenses) {
    for (const d of data.defenses) {
      d.x = Math.round(d.x * S);
      d.y = Math.round(d.y * S);
      d.maxLength = Math.round(d.maxLength * S);
      d.currentEndX = Math.round(d.currentEndX * S);
      d.currentEndY = Math.round(d.currentEndY * S);
    }
  }
  for (const sec of data.sectors) {
    sec.x1 = Math.round(sec.x1 * S);
    sec.y1 = Math.round(sec.y1 * S);
    sec.x2 = Math.round(sec.x2 * S);
    sec.y2 = Math.round(sec.y2 * S);
  }
  return data;
}

export function generateLevel(world: WorldGrid, mapId: MapId = 'underground_lab'): LevelData {
  const S = Math.max(1, Math.round(world.width / 560));
  let data: LevelData;
  switch (mapId) {
    case 'alpine_outdoor':
      data = generateAlpineOutdoor(world);
      break;
    case 'office_tower':
      data = generateOfficeTower(world);
      break;
    case 'castle_keep':
      data = generateCastleKeep(world);
      break;
    case 'space_station':
      data = generateSpaceStation(world);
      break;
    case 'magma_trench':
      data = generateMagmaTrench(world);
      break;
    case 'underground_lab':
    default:
      data = generateUndergroundLab(world);
      break;
  }
  const forces = createJevForcesForMap(mapId);
  data.enemyUnits = forces.enemyUnits;
  data.defenses = forces.defenses;
  return scaleLevelData(data, S);
}

// ============================================================================
// MAP 1: ALPINE CRYO-VALLEY (OUTDOOR ENVIRONMENT)
// ============================================================================
function generateAlpineOutdoor(world: WorldGrid): LevelData {
  const { W, H, S, carveRect, fillRect, buildDebbiPod, sealWorldBorders } = createHelpers(world);
  const mapInfo = MAP_CATALOG[0];

  // 1. Create open sky above rolling mountain terrain and subterranean limestone/basalt below
  for (let y = 0; y < H; y++) {
    const ly = y / S;
    for (let x = 0; x < W; x++) {
      const lx = x / S;
      const i = world.idx(x, y);
      const terrainY =
        118 +
        Math.sin(lx * 0.018) * 32 +
        Math.cos(lx * 0.045) * 14 +
        Math.sin(lx * 0.11) * 4;

      if (ly < terrainY) {
        world.setElement(x, y, ElementId.EMPTY, 12);
        world.bgGrid[i] = 10; // Outdoor Alpine Sky!
      } else if (ly < terrainY + 5) {
        world.setElement(x, y, terrainY < 110 ? ElementId.ICE : ElementId.SAND, terrainY < 110 ? -10 : 18);
        world.bgGrid[i] = 0;
      } else if (ly < terrainY + 35) {
        world.setElement(x, y, ElementId.CONCRETE, 18);
        world.bgGrid[i] = 0;
      } else {
        world.setElement(x, y, ElementId.STONE, 22);
        world.bgGrid[i] = 0;
      }
    }
  }

  // 2. Plant Pine Trees across the outdoor slopes (Wood trunks + Bio-Gel / Ice canopies)
  const treePositions = [65, 92, 235, 268, 305, 345, 385, 420];
  for (const tx of treePositions) {
    let groundY = 40;
    while (groundY < 200 && world.getElement(Math.round(tx * S), Math.round(groundY * S)) === ElementId.EMPTY) {
      groundY++;
    }
    if (groundY < 185) {
      fillRect(tx - 1, groundY - 22, tx + 1, groundY, ElementId.WOOD, 15, 0, 10);
      for (let tier = 0; tier < 3; tier++) {
        const halfW = 8 - tier * 2;
        const cy = groundY - 12 - tier * 6;
        fillRect(tx - halfW, cy - 3, tx + halfW, cy, ElementId.WOOD, 12, 0, 10);
        fillRect(tx - halfW + 1, cy - 4, tx + halfW - 1, cy - 3, ElementId.ICE, -5, 0, 10);
      }
    }
  }

  // 3. West Glacial Lake held back by an Ice Dam (x: 115..195, y: 95..140)
  carveRect(118, 90, 192, 138, 10);
  fillRect(118, 105, 184, 136, ElementId.WATER, 4, 0, 10);
  fillRect(118, 102, 184, 105, ElementId.ICE, -12, 0, 10); // Frozen lake surface
  fillRect(185, 98, 194, 138, ElementId.ICE, -25, 0, 10); // Glacial Ice Dam! (Melt or blast to flood valley!)

  // 4. Sky Watchtower & Weather Balloon Platform high in the sky (UP exploration!)
  fillRect(255, 42, 315, 46, ElementId.STEEL, 10, 0, 10);
  fillRect(265, 32, 280, 41, ElementId.SODIUM, 10, 0, 10);
  fillRect(290, 32, 308, 41, ElementId.THERMITE, 10, 0, 10);

  // 5. East Outpost Cabin & Acid Storage Shed on the surface (x: 435..505, y: 78..122)
  carveRect(440, 82, 502, 120, 12, ElementId.WOOD, 3);
  fillRect(465, 105, 495, 118, ElementId.ACID, 25);

  // 6. Underground Limestone Caverns & Secret Bunker beneath the mountain (y: 175..330)
  // West Ice Cavern
  carveRect(60, 185, 195, 255, 4, ElementId.CRYO_GLASS, 3);
  fillRect(75, 235, 155, 252, ElementId.LIQUID_NITROGEN, -196);
  // Shaft connecting surface canyon down to West Cavern
  carveRect(195, 135, 215, 215, 0);

  // Central Underground Bunker & Geothermal Pool
  carveRect(225, 190, 355, 260, 2, ElementId.STEEL, 4);
  fillRect(265, 190, 315, 194, ElementId.STEEL); // Bunker roof (melt with Thermite or rust!)
  fillRect(240, 242, 340, 258, ElementId.LAVA, 1400);

  // Deep Mountain Vault holding Debbi (Bottom-Center: x 220..360, y 275..336)
  carveRect(225, 275, 355, 336, 6, ElementId.TUNGSTEN, 4);
  carveRect(175, 245, 232, 310, 4); // West cavern tunnel into Deep Vault
  fillRect(218, 275, 224, 315, ElementId.CRYO_GLASS, -180, FLAG_CRYO_BRITTLE);

  const bx = 290;
  const by = 306;
  buildDebbiPod(bx, by);
  // Build flat Steel Extraction Pad on West Alpine Ridge for the waiting Dropship
  carveRect(36, 78, 76, 107, 10);
  fillRect(38, 108, 74, 112, ElementId.STEEL, 15, 0, 10);
  sealWorldBorders();

  return {
    mapInfo,
    spawnX: 85,
    spawnY: 95,
    debbi: { x: bx, y: by, hp: 100, maxHp: 100, carried: false, rescued: false, inDanger: false, cageIntactCount: 100 },
    escapeVehicle: { x: 54, y: 100, name: 'Cryo-VTOL Dropship', type: 'dropship' },
    terminals: [
      {
        id: 'alpine-1',
        x: 95,
        y: 102,
        sector: 'Alpine Ridge Overlook',
        title: 'FIELD LOG: GLACIAL DAM',
        logText:
          'We tracked Debbi’s signal to a secret bunker buried beneath this mountain valley. To the east sits a massive frozen lake held back by a Glacial Ice Dam.',
        alchemyTip:
          'Melt the Ice Dam with your Thermal Lance [2 LMB] or blast it with Kinetic Pressure [1] to unleash a torrent of water down into the canyon!',
      },
      {
        id: 'alpine-2',
        x: 285,
        y: 38,
        sector: 'High-Altitude Weather Platform',
        title: 'ATMOSPHERIC RESEARCH STATION',
        logText:
          'This floating sky-platform stores emergency Metallic Sodium and Thermite charges. Dropping Sodium into the Glacial Lake below creates an unforgettable explosion!',
        alchemyTip:
          'Fly UP with your Jetpack (Left Stick Up / W / Space) to explore sky platforms, or dive DOWN into the caverns.',
      },
      {
        id: 'alpine-3',
        x: 250,
        y: 298,
        sector: 'Sub-Mountain Bunker Vault',
        title: 'BUNKER CONTAINMENT CONSOLE',
        logText:
          'Debbi’s stasis pod is right here inside the mountain core! Dissolve the cyan Chroniton Crystal ring to rescue her.',
        alchemyTip:
          'Use Tool [3] (Time Accelerate), Tool [9] (Strong Force Unbinder), or Tool [9 RMB] (Quantum Tunneling) on the cyan crystal ring!',
      },
    ],
    turrets: [
      { x: 250, y: 102, hp: 100, maxHp: 100, cooldown: 65, active: true, type: 'kinetic' },
      { x: 455, y: 96, hp: 100, maxHp: 100, cooldown: 70, active: true, type: 'thermal' },
      { x: 290, y: 215, hp: 130, maxHp: 130, cooldown: 60, active: true, 'type': 'kinetic' },
    ],
    sectors: [
      {
        name: 'ALPINE VALLEY OVERLOOK (OUTDOORS)',
        subtitle: 'Open Sky, Pine Forests & Frozen Glacial Lake',
        x1: 0,
        y1: 0,
        x2: 560,
        y2: 165,
        color: '#4cc9f0',
      },
      {
        name: 'SUB-GLACIAL LIMESTONE CAVERNS',
        subtitle: 'Cryo-Vents & Underground Magma Conduits',
        x1: 0,
        y1: 166,
        x2: 560,
        y2: 268,
        color: '#72efdd',
      },
      {
        name: 'MOUNTAIN CORE BUNKER — DEBBI’S VAULT',
        subtitle: 'Breach the Sub-Mountain Bunker & Save Debbi!',
        x1: 0,
        y1: 269,
        x2: 560,
        y2: 360,
        color: '#e0aaff',
      },
    ],
  };
}

// ============================================================================
// MAP 2: OMNICORP SKYSCRAPER (CORPORATE OFFICE BUILDING)
// ============================================================================
function generateOfficeTower(world: WorldGrid): LevelData {
  const { W, H, S, carveRect, fillRect, buildDebbiPod, sealWorldBorders } = createHelpers(world);
  const mapInfo = MAP_CATALOG[1];

  // 1. Fill entire map with Night City Skyline open air (bgGrid = 11), with street concrete at the very bottom
  for (let y = 0; y < H; y++) {
    const ly = y / S;
    for (let x = 0; x < W; x++) {
      const i = world.idx(x, y);
      if (ly > 325) {
        world.setElement(x, y, ElementId.CONCRETE, 22);
        world.bgGrid[i] = 2;
      } else {
        world.setElement(x, y, ElementId.EMPTY, 20);
        world.bgGrid[i] = 11; // Night City Skyline outside the skyscraper!
      }
    }
  }

  // 2. Construct the towering 6-Story OmniCorp High-Rise in the center (x: 110..450, y: 28..325)
  const towerLeft = 110;
  const towerRight = 450;
  // Outer Steel frame + Floor-to-Ceiling Borosilicate Glass Curtain Walls on Left & Right!
  fillRect(towerLeft, 30, towerRight, 325, ElementId.CONCRETE, 22, 0, 12);
  carveRect(towerLeft + 5, 35, towerRight - 5, 322, 12);

  // Exterior Glass Windows along the entire Left & Right facades of the skyscraper!
  fillRect(towerLeft, 40, towerLeft + 4, 315, ElementId.GLASS, 22, 0, 12);
  fillRect(towerRight - 4, 40, towerRight, 315, ElementId.GLASS, 22, 0, 12);

  // Build 6 Office Floors (y = 82, 130, 178, 226, 274) + Central Glass Elevator Shaft (x: 268..292)
  const floorYs = [82, 130, 178, 226, 274];
  for (let idx = 0; idx < floorYs.length; idx++) {
    const fy = floorYs[idx];
    // Concrete & Steel composite office floor slab
    fillRect(towerLeft + 4, fy, towerRight - 4, fy + 3, idx % 2 === 0 ? ElementId.CONCRETE : ElementId.STEEL, 22, 0, 12);
    // Central Elevator Shaft opening wrapped in Glass doors
    carveRect(268, fy - 44, 292, fy + 4, 3);
    fillRect(268, fy, 292, fy + 2, ElementId.GLASS, 22, 0, 3);

    // Add Wooden Office Desks, Cubicle Partitions & Water Coolers on each floor!
    for (let dx = 135; dx <= 235; dx += 32) {
      // Cubicle divider (Wood + Glass top)
      fillRect(dx, fy - 12, dx + 2, fy - 1, ElementId.WOOD, 22, 0, 12);
      fillRect(dx, fy - 18, dx + 2, fy - 13, ElementId.GLASS, 22, 0, 12);
      // Desk
      fillRect(dx + 6, fy - 6, dx + 20, fy - 4, ElementId.WOOD, 22, 0, 12);
    }
    for (let dx = 315; dx <= 415; dx += 32) {
      fillRect(dx, fy - 12, dx + 2, fy - 1, ElementId.WOOD, 22, 0, 12);
      fillRect(dx, fy - 18, dx + 2, fy - 13, ElementId.GLASS, 22, 0, 12);
      fillRect(dx + 6, fy - 6, dx + 20, fy - 4, ElementId.WOOD, 22, 0, 12);
    }
  }

  // Floor 6 (Top Floor y: 35..81): Executive Penthouse, Helipad & Thermite Safe
  // Left Rooftop Balcony / Helipad extending out into the night sky (x: 45..110, y: 78..83)
  fillRect(45, 80, 110, 84, ElementId.STEEL, 20, 0, 11);
  fillRect(140, 68, 175, 81, ElementId.WATER, 20, 0, 12); // Executive Aquarium!
  fillRect(138, 65, 177, 81, ElementId.GLASS, 20, 0, 12);
  fillRect(141, 68, 174, 80, ElementId.WATER, 20, 0, 12);
  fillRect(380, 70, 420, 81, ElementId.THERMITE, 22, 0, 12); // Penthouse Thermite stockpile!

  // Floor 4 (y: 134..177): R&D Chemical Wet-Lab Floor (Acid & Sodium vats!)
  fillRect(143, 160, 217, 178, ElementId.GLASS, 22, 0, 12);
  fillRect(145, 162, 215, 176, ElementId.ACID, 28, 0, 12);
  fillRect(340, 164, 385, 177, ElementId.SODIUM, 22, 0, 12);
  fillRect(393, 160, 437, 178, ElementId.GLASS, 22, 0, 12);
  fillRect(395, 162, 435, 176, ElementId.ALKALI, 22, 0, 12);

  // Floor 3 (y: 182..225): Cryo-Cooled Mainframe Server Farm
  fillRect(135, 210, 240, 225, ElementId.LIQUID_NITROGEN, -196, 0, 4);
  fillRect(320, 210, 425, 225, ElementId.HEAVY_WATER, 20, 0, 5);
  fillRect(355, 214, 385, 224, ElementId.URANIUM, 160, 0, 5);

  // Basement Sub-Level (y: 278..324): Executive Boardroom Vault where Debbi is held!
  fillRect(220, 275, 226, 323, ElementId.TUNGSTEN, 22, 0, 6);
  fillRect(334, 275, 340, 323, ElementId.TUNGSTEN, 22, 0, 6);

  const bx = 280;
  const by = 304;
  buildDebbiPod(bx, by);
  sealWorldBorders();

  return {
    mapInfo,
    spawnX: 82,
    spawnY: 68, // Spawn on the Penthouse Helipad next to the Stealth Chopper!
    debbi: { x: bx, y: by, hp: 100, maxHp: 100, carried: false, rescued: false, inDanger: false, cageIntactCount: 100 },
    escapeVehicle: { x: 58, y: 72, name: 'Stealth Extraction Chopper', type: 'chopper' },
    terminals: [
      {
        id: 'office-1',
        x: 92,
        y: 76,
        sector: 'Penthouse Helipad (6th Floor)',
        title: 'OMNICORP TOWER INFILTRATION',
        logText:
          'You landed on the 6th-floor Penthouse Helipad of OmniCorp Tower! Debbi is locked in the Sub-Basement Vault 6 stories below. You can shatter the exterior glass windows, take the central elevator shaft, or melt straight down through every floor!',
        alchemyTip:
          'Ignite the Penthouse Thermite cache on the right side of Floor 6 with Heat [2 LMB] to burn at 2850°C straight down through all 6 office floors!',
      },
      {
        id: 'office-2',
        x: 280,
        y: 172,
        sector: '4th Floor: Corporate Wet-Lab',
        title: 'OFFICE SAFETY MEMORANDUM',
        logText:
          'Employees are reminded not to mix the 4th-floor Metallic Sodium inventory with the 6th-floor Executive Aquarium water, nor spill Sulfuric Acid onto the concrete floor slabs.',
        alchemyTip:
          'Blast the wooden cubicles with Pressure [1] or dissolve the Concrete floors with Sulfuric Acid [5 LMB]!',
      },
      {
        id: 'office-3',
        x: 245,
        y: 315,
        sector: 'Sub-Basement Executive Vault',
        title: 'CEO CONTAINMENT TERMINAL',
        logText:
          'Debbi is suspended inside the Sub-Basement Chroniton Vault! Dissolve the cyan Chroniton Crystal ring to complete the skyscraper rescue.',
        alchemyTip:
          'Use Tool [3] (Time Accelerate) or Tool [9] (Strong Force / Quantum Tunneling) on Debbi’s stasis pod!',
      },
    ],
    turrets: [
      { x: 250, y: 55, hp: 90, maxHp: 90, cooldown: 65, active: true, type: 'kinetic' },
      { x: 280, y: 150, hp: 110, maxHp: 110, cooldown: 70, active: true, type: 'thermal' },
      { x: 280, y: 248, hp: 130, maxHp: 130, cooldown: 60, active: true, type: 'radiation' },
    ],
    sectors: [
      {
        name: 'OMNICORP PENTHOUSE & HELIPAD (FLOORS 5–6)',
        subtitle: 'Glass Curtain Walls, Executive Aquarium & Thermite Safe',
        x1: 0,
        y1: 0,
        x2: 560,
        y2: 132,
        color: '#4cc9f0',
      },
      {
        name: 'CORPORATE CUBICLES & R&D WET-LAB (FLOORS 3–4)',
        subtitle: 'Wooden Desks, Acid Vats & Cryo-Cooled Server Racks',
        x1: 0,
        y1: 133,
        x2: 560,
        y2: 230,
        color: '#ffd166',
      },
      {
        name: 'LOBBY & SUB-BASEMENT VAULT (FLOORS 1–2)',
        subtitle: 'Breach the CEO’s Tungsten Vault & Rescue Debbi!',
        x1: 0,
        y1: 231,
        x2: 560,
        y2: 360,
        color: '#f72585',
      },
    ],
  };
}

// ============================================================================
// MAP 3: CASTLE RAVENSCROFT (MEDIEVAL ALCHEMIST'S KEEP)
// ============================================================================
function generateCastleKeep(world: WorldGrid): LevelData {
  const { W, H, S, carveRect, fillRect, buildDebbiPod, sealWorldBorders } = createHelpers(world);
  const mapInfo = MAP_CATALOG[2];

  // 1. Open Moonlit Sky above y = 185, bedrock stone below y = 185
  for (let y = 0; y < H; y++) {
    const ly = y / S;
    for (let x = 0; x < W; x++) {
      const i = world.idx(x, y);
      if (ly < 185) {
        world.setElement(x, y, ElementId.EMPTY, 16);
        world.bgGrid[i] = 10; // Moonlit outdoor sky
      } else {
        world.setElement(x, y, ElementId.STONE, 20);
        world.bgGrid[i] = 13; // Medieval stone masonry
      }
    }
  }

  // 2. West & East Boiling Moats (West Moat = Flammable Hydrocarbon Oil; East Moat = Sulfuric Acid!)
  carveRect(75, 175, 138, 218, 10);
  fillRect(75, 190, 138, 218, ElementId.OIL, 35, 0, 10); // Boiling Oil Moat!
  // Wooden Drawbridge spanning the West Oil Moat
  fillRect(72, 182, 142, 186, ElementId.WOOD, 22, 0, 10);

  carveRect(422, 175, 485, 218, 10);
  fillRect(422, 190, 485, 218, ElementId.ACID, 35, 0, 10); // East Acid Moat!
  fillRect(418, 182, 488, 186, ElementId.WOOD, 22, 0, 10);

  // 3. The Grand Medieval Castle Keep & Twin Towers (x: 140..420, y: 48..185)
  fillRect(140, 65, 420, 185, ElementId.STONE, 20, 0, 13);
  // West & East Battlement Turret Towers rising to y = 42
  fillRect(140, 42, 195, 70, ElementId.STONE, 20, 0, 13);
  fillRect(365, 42, 420, 70, ElementId.STONE, 20, 0, 13);

  // Carve Crenellations (battlements) along the castle roof!
  for (let cx = 144; cx <= 416; cx += 14) {
    const roofY = cx < 195 || cx > 365 ? 42 : 65;
    carveRect(cx, roofY - 2, cx + 6, roofY + 5, 10);
  }

  // Carve Castle Interior Halls:
  // Upper Royal Alchemist’s Observatory & Bellfrey (y: 78..122)
  carveRect(155, 78, 405, 122, 13);
  // Wooden Rafters & Chandeliers holding Burning Fire Torches
  fillRect(180, 92, 240, 95, ElementId.WOOD, 25, 0, 13);
  fillRect(320, 92, 380, 95, ElementId.WOOD, 25, 0, 13);
  fillRect(265, 108, 295, 121, ElementId.SODIUM, 22, 0, 13); // Royal Alchemist’s Sodium Chest!

  // Lower Great Banquet Hall (y: 132..182)
  carveRect(155, 132, 405, 182, 13);
  // Twin Iron Portcullis Gates guarding the West & East Castle Entrances!
  fillRect(140, 142, 154, 182, ElementId.STEEL, 20, 0, 13); // West Portcullis (Rust or Cryo-shatter!)
  fillRect(406, 142, 420, 182, ElementId.STEEL, 20, 0, 13); // East Portcullis

  // Banquet Tables (Wood) & Royal Carbon/Coal Treasury (compress into Diamonds!)
  fillRect(195, 172, 260, 176, ElementId.WOOD, 22, 0, 13);
  fillRect(300, 165, 345, 181, ElementId.CARBON, 22, 0, 13); // Royal Coal/Carbon Pile -> Compress to Diamond!

  // 4. Subterranean Castle Dungeons, Wine/Brine Cellar & Dragon's Lair (y: 205..335)
  // Central Dungeon Stairwell shaft
  carveRect(268, 182, 292, 235, 13);
  fillRect(268, 198, 292, 202, ElementId.STEEL, 20, 0, 13); // Dungeon trapdoor

  // West Brine & Torture Cellar (x: 110..240, y: 225..295)
  carveRect(110, 225, 240, 295, 13);
  fillRect(120, 270, 225, 293, ElementId.SALT_WATER, 18, 0, 13);

  // East Dragon’s Forge & Thermite Hoard (x: 320..450, y: 225..295)
  carveRect(320, 225, 450, 295, 13);
  fillRect(340, 272, 435, 293, ElementId.LAVA, 1450, 0, 13);
  fillRect(355, 245, 405, 255, ElementId.THERMITE, 25, 0, 13);

  // Deep Royal Crypt where Debbi is imprisoned (x: 225..335, y: 245..336)
  carveRect(225, 245, 335, 336, 13, ElementId.TUNGSTEN, 4);
  carveRect(215, 265, 240, 290, 13);
  fillRect(222, 265, 228, 290, ElementId.STEEL, 20, 0, 13);

  const bx = 280;
  const by = 304;
  buildDebbiPod(bx, by);
  fillRect(18, 184, 54, 188, ElementId.STEEL, 20, 0, 10);
  sealWorldBorders();

  return {
    mapInfo,
    spawnX: 52,
    spawnY: 170,
    debbi: { x: bx, y: by, hp: 100, maxHp: 100, carried: false, rescued: false, inDanger: false, cageIntactCount: 100 },
    escapeVehicle: { x: 28, y: 176, name: 'Alchemical Sky-Skiff', type: 'airship' },
    terminals: [
      {
        id: 'castle-1',
        x: 58,
        y: 176,
        sector: 'Castle Drawbridge & Oil Moat',
        title: 'SIEGE OF CASTLE RAVENSCROFT',
        logText:
          'Ahead lies Castle Ravenscroft! Its western moat is filled with flammable Hydrocarbon Oil, and its gate is barred by a thick Iron Portcullis. You can fly over the battlements, ignite the oil moat, or rust the portcullis!',
        alchemyTip:
          'Splash Water [4 LMB] on the Iron Portcullis and fire Time Acceleration [3 LMB] to rust the medieval gate into powder in seconds!',
      },
      {
        id: 'castle-2',
        x: 322,
        y: 160,
        sector: 'Great Banquet Hall & Royal Treasury',
        title: 'THE KING’S PHILOSOPHER STONE LOG',
        logText:
          'For centuries the Royal Alchemists tried to turn coal into Diamonds and lead into gold. With your Graviton Pressure Cannon, you can actually do it in one shot!',
        alchemyTip:
          'Fire Hyper-Implosion [1 RMB] into the black Carbon pile in the Banquet Hall (>800 GPa) to crystallize it into pure Diamond!',
      },
      {
        id: 'castle-3',
        x: 250,
        y: 288,
        sector: 'Deep Royal Crypt',
        title: 'CRYPT STASIS ALTAR',
        logText:
          'Debbi is held inside the Royal Crypt beneath the Great Hall! Dissolve the Chroniton Crystal ring to rescue her.',
        alchemyTip:
          'Use Tool [3] (Time Accelerate) or Tool [9] (Strong Force / Quantum Tunneling) to shatter the stasis crystal!',
      },
    ],
    turrets: [
      { x: 168, y: 36, hp: 100, maxHp: 100, cooldown: 65, active: true, type: 'thermal' },
      { x: 392, y: 36, hp: 100, maxHp: 100, cooldown: 65, active: true, type: 'kinetic' },
      { x: 280, y: 102, hp: 120, maxHp: 120, cooldown: 60, active: true, type: 'thermal' },
      { x: 380, y: 240, hp: 130, maxHp: 130, cooldown: 65, active: true, type: 'radiation' },
    ],
    sectors: [
      {
        name: 'CASTLE BATTLEMENTS & BELFRY TOWERS',
        subtitle: 'Moonlit Keep, Timber Rafters & Alchemist Observatory',
        x1: 0,
        y1: 0,
        x2: 560,
        y2: 125,
        color: '#ffd166',
      },
      {
        name: 'GREAT BANQUET HALL, OIL MOAT & PORTCULLIS',
        subtitle: 'Boiling Oil Moat, Iron Gates & Royal Carbon Treasury',
        x1: 0,
        y1: 126,
        x2: 560,
        y2: 215,
        color: '#ff9f1c',
      },
      {
        name: 'TORCH-LIT DUNGEONS & ROYAL CRYPT — DEBBI’S VAULT',
        subtitle: 'Brine Cellar, Dragon’s Forge & Debbi’s Stasis Altar',
        x1: 0,
        y1: 216,
        x2: 560,
        y2: 360,
        color: '#e0aaff',
      },
    ],
  };
}

// ============================================================================
// MAP 4: ORBITAL STATION ICARUS-9 (LOW-GRAVITY SPACE STATION)
// ============================================================================
function generateSpaceStation(world: WorldGrid): LevelData {
  const { W, H, carveRect, fillRect, buildDebbiPod, sealWorldBorders } = createHelpers(world);
  const mapInfo = MAP_CATALOG[3];

  // 1. Fill entire world with Deep Space Vacuum & Starfield (bgGrid = 14)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = world.idx(x, y);
      world.setElement(x, y, ElementId.EMPTY, -80);
      world.bgGrid[i] = 14; // Deep Space Starfield & Nebula!
    }
  }

  // 2. West Docking Bay & Cryo-Fuel Pod (x: 45..175, y: 125..225)
  carveRect(48, 130, 172, 220, 4, ElementId.STEEL, 5);
  fillRect(168, 155, 176, 195, ElementId.CRYO_GLASS, -180, FLAG_CRYO_BRITTLE, 4); // Airlock door
  fillRect(60, 195, 120, 216, ElementId.LIQUID_NITROGEN, -196, 0, 4);
  // Steel Docking Deck above the LN2 cryo-fuel tank for Shuttle Hermes-7 & Player spawn!
  fillRect(52, 184, 156, 188, ElementId.STEEL, 22, 0, 4);

  // 3. Upper Bio-Hydroponics Glass Dome (UP: x: 205..355, y: 32..112)
  carveRect(208, 36, 352, 110, 1, ElementId.GLASS, 4);
  fillRect(204, 106, 356, 114, ElementId.STEEL, 22, 0, 1);
  fillRect(225, 92, 275, 105, ElementId.BIO_GEL, 30, 0, 1);
  fillRect(285, 92, 335, 105, ElementId.WATER, 24, 0, 1);
  // Hydroponic trees inside the space dome!
  fillRect(250, 68, 253, 91, ElementId.WOOD, 22, 0, 1);
  fillRect(310, 68, 313, 91, ElementId.WOOD, 22, 0, 1);

  // 4. Central Zero-G Hub & Command Ring (x: 205..355, y: 130..220)
  carveRect(208, 132, 352, 218, 1, ElementId.STEEL, 5);
  // Pressurized Umbilical Tunnels connecting West, Upper, East, and Lower Pods!
  carveRect(172, 162, 210, 188, 2, ElementId.STEEL, 3);
  fillRect(204, 162, 210, 188, ElementId.CRYO_GLASS, -170, FLAG_CRYO_BRITTLE, 2);

  carveRect(268, 108, 292, 136, 2, ElementId.STEEL, 3);
  fillRect(268, 112, 292, 116, ElementId.GLASS, 22, 0, 2);

  carveRect(350, 162, 388, 188, 2, ElementId.STEEL, 3);
  fillRect(350, 162, 356, 188, ElementId.STEEL, 22, 0, 2);

  // 5. East Tokamak Fusion & Isotope Pod (RIGHT: x: 385..515, y: 125..225)
  carveRect(388, 130, 512, 220, 5, ElementId.LEAD, 5);
  // Deuterium-Tritium Fusion Fuel Sphere in the center of East Pod
  fillRect(435, 165, 485, 210, ElementId.GLASS, 22, 0, 5);
  carveRect(439, 169, 481, 206, 5);
  fillRect(439, 188, 481, 206, ElementId.HEAVY_WATER, 22, 0, 5);
  fillRect(439, 169, 481, 187, ElementId.DEUTERIUM, 25, 0, 5);

  // 6. Lower Artificial-Gravity Command Core — DEBBI'S ORBITAL POD (DOWN: x: 205..355, y: 245..336)
  carveRect(268, 216, 292, 250, 6, ElementId.TUNGSTEN, 3);
  fillRect(268, 232, 292, 238, ElementId.TUNGSTEN, 22, 0, 6);
  carveRect(208, 246, 352, 336, 6, ElementId.TUNGSTEN, 5);

  const bx = 280;
  const by = 300;
  buildDebbiPod(bx, by);
  sealWorldBorders();

  return {
    mapInfo,
    spawnX: 102,
    spawnY: 172,
    debbi: { x: bx, y: by, hp: 100, maxHp: 100, carried: false, rescued: false, inDanger: false, cageIntactCount: 100 },
    escapeVehicle: { x: 68, y: 175, name: 'Escape Shuttle Hermes-7', type: 'shuttle' },
    terminals: [
      {
        id: 'space-1',
        x: 115,
        y: 180,
        sector: 'West Docking Bay (0.45G Low Gravity)',
        title: 'ORBITAL STATION ICARUS-9 TELEMETRY',
        logText:
          'Welcome aboard Orbital Station Icarus-9! Artificial gravity is operating at 0.45G, allowing extended low-gravity jumps and jetpack flight between orbital modules.',
        alchemyTip:
          'Shatter the Cryo-Glass airlock on the right with Tool [1] (Kinetic Pressure) or phase through the hull with Quantum Tunneling [Q / B]!',
      },
      {
        id: 'space-2',
        x: 415,
        y: 175,
        sector: 'East Tokamak Fusion Module',
        title: 'ORBITAL FUSION REACTOR CORE',
        logText:
          'The glass containment sphere ahead holds pure Deuterium-Tritium gas over Heavy Water. Compressing it above 5,000 GPa will ignite a literal star in orbit!',
        alchemyTip:
          'Fire 3 Hyper-Implosion shots [1 RMB] into the Deuterium tank to ignite Thermonuclear Fusion, then press [R / Y] to rewind time!',
      },
      {
        id: 'space-3',
        x: 242,
        y: 295,
        sector: 'Lower Command Core Vault',
        title: 'ORBITAL STASIS POD',
        logText:
          'Debbi is suspended inside the Orbital Command Vault! Breach the Tungsten hatch with Weak Force [8] or Quantum Tunneling [9] and dissolve her Chroniton Pod.',
        alchemyTip:
          'Use Tool [3] (Time Accelerate) or Tool [9] (Strong Force / Quantum Tunneling) on the cyan Chroniton ring!',
      },
    ],
    turrets: [
      { x: 280, y: 165, hp: 110, maxHp: 110, cooldown: 65, active: true, type: 'kinetic' },
      { x: 420, y: 150, hp: 120, maxHp: 120, cooldown: 70, active: true, type: 'radiation' },
      { x: 245, y: 265, hp: 140, maxHp: 140, cooldown: 55, active: true, type: 'thermal' },
    ],
    sectors: [
      {
        name: 'UPPER BIO-HYDROPONICS GLASS DOME',
        subtitle: 'Orbital Botanical Garden & Regenerative Bio-Gel Tanks',
        x1: 0,
        y1: 0,
        x2: 560,
        y2: 120,
        color: '#80ed99',
      },
      {
        name: 'ZERO-G DOCKING RING & TOKAMAK FUSION POD',
        subtitle: '0.45G Low Gravity — West Airlock, Central Hub & East Fusion Core',
        x1: 0,
        y1: 121,
        x2: 560,
        y2: 235,
        color: '#4cc9f0',
      },
      {
        name: 'ORBITAL COMMAND CORE — DEBBI’S VAULT',
        subtitle: 'Tungsten-Armored Deep Space Vault',
        x1: 0,
        y1: 236,
        x2: 560,
        y2: 360,
        color: '#e0aaff',
      },
    ],
  };
}

// ============================================================================
// MAP 5: ABYSSAL CALDERA (SUB-OCEANIC VOLCANO & MAGMA TRENCH)
// ============================================================================
function generateMagmaTrench(world: WorldGrid): LevelData {
  const { W, H, S, carveRect, fillRect, buildDebbiPod, sealWorldBorders } = createHelpers(world);
  const mapInfo = MAP_CATALOG[4];

  // 1. Fill with volcanic basalt stone (bgGrid = 15)
  for (let y = 0; y < H; y++) {
    const ly = y / S;
    for (let x = 0; x < W; x++) {
      const i = world.idx(x, y);
      world.setElement(x, y, ElementId.STONE, 35 + Math.floor(ly * 0.2));
      world.bgGrid[i] = 15;
    }
  }

  // 2. Upper Abyssal Ocean Reservoir (y: 25..115) — Huge pressurized Salt Water & Heavy Water ocean!
  carveRect(45, 25, 515, 115, 4);
  fillRect(45, 55, 515, 115, ElementId.SALT_WATER, 15, 0, 4);
  // Submarine Dry-Dock Airlock on Upper-Left where player spawns (x: 50..135, y: 28..85)
  fillRect(48, 28, 140, 88, ElementId.STEEL, 22, 0, 4);
  carveRect(54, 34, 134, 82, 4);

  // Glass Observation Floor separating the Ocean from the Mid-Level Geothermal Cavern!
  fillRect(160, 114, 400, 121, ElementId.GLASS, 25, 0, 15);

  // 3. Mid-Level Geothermal Mixing Cavern (x: 65..495, y: 121..225)
  carveRect(65, 121, 495, 225, 15);
  // Suspended Sodium & Thermite Crates over the cavern
  fillRect(180, 155, 220, 165, ElementId.SODIUM, 30, 0, 15);
  fillRect(175, 166, 225, 169, ElementId.WOOD, 30, 0, 15);

  fillRect(340, 155, 385, 165, ElementId.CARBON, 30, 0, 15);
  fillRect(335, 166, 390, 169, ElementId.STEEL, 30, 0, 15);

  // 4. Deep Obsidian Caldera Core — DEBBI'S VAULT (x: 215..345, y: 235..336)
  carveRect(218, 230, 342, 336, 6, ElementId.TUNGSTEN, 5);
  fillRect(260, 202, 300, 234, ElementId.STEEL, 45, 0, 6);

  // Molten Magma Rivers on the left and right sides of the central Steel Vault Bridge!
  fillRect(65, 204, 259, 224, ElementId.LAVA, 1480, 0, 15);
  fillRect(301, 204, 495, 224, ElementId.LAVA, 1480, 0, 15);

  const bx = 280;
  const by = 300;
  buildDebbiPod(bx, by);
  sealWorldBorders();

  return {
    mapInfo,
    spawnX: 98,
    spawnY: 65,
    debbi: { x: bx, y: by, hp: 100, maxHp: 100, carried: false, rescued: false, inDanger: false, cageIntactCount: 100 },
    escapeVehicle: { x: 68, y: 72, name: 'Deep-Sea Bathysphere', type: 'submersible' },
    terminals: [
      {
        id: 'magma-1',
        x: 105,
        y: 74,
        sector: 'Submarine Dry-Dock Airlock',
        title: 'ABYSSAL CALDERA PRESSURE WARNING',
        logText:
          'Outside this airlock lies a pressurized ocean reservoir separated from an active volcanic magma chamber by a single Borosilicate Glass observation deck!',
        alchemyTip:
          'Shatter the Glass floor beneath the ocean with Pressure [1] to dump thousands of gallons of ocean water onto the 1480°C Magma Rivers—solidifying the lava into solid Basalt rock bridges!',
      },
      {
        id: 'magma-2',
        x: 280,
        y: 201,
        sector: 'Geothermal Magma Bridge',
        title: 'OBSIDIAN VAULT SEAL',
        logText:
          'Debbi’s vault lies directly beneath this Steel seal. Watch out for steam explosions when water contacts magma!',
        alchemyTip:
          'Rust the wet Steel vault seal with Time Acceleration [3 LMB] or phase straight through with Quantum Tunneling [Q / B]!',
      },
    ],
    turrets: [
      { x: 280, y: 145, hp: 120, maxHp: 120, cooldown: 60, active: true, type: 'thermal' },
      { x: 240, y: 265, hp: 130, maxHp: 130, cooldown: 65, active: true, type: 'kinetic' },
    ],
    sectors: [
      {
        name: 'ABYSSAL OCEAN RESERVOIR & SUBMARINE AIRLOCK',
        subtitle: 'High-Pressure Salt Water Basin Above Glass Observation Deck',
        x1: 0,
        y1: 0,
        x2: 560,
        y2: 120,
        color: '#3a86ff',
      },
      {
        name: 'VOLCANIC MAGMA RIVERS & STEAM CHAMBER',
        subtitle: 'Breach the Ocean Floor to Solidify Lava into Stone!',
        x1: 0,
        y1: 121,
        x2: 560,
        y2: 228,
        color: '#ff6b6b',
      },
      {
        name: 'OBSIDIAN CALDERA CORE — DEBBI’S VAULT',
        subtitle: 'Deep Geothermal Containment Chamber',
        x1: 0,
        y1: 229,
        x2: 560,
        y2: 360,
        color: '#e0aaff',
      },
    ],
  };
}

// ============================================================================
// MAP 6: AETHELGARD SUB-ATOMIC LAB (ORIGINAL 9-SECTOR UNDERGROUND FACILITY)
// ============================================================================
export function generateUndergroundLab(world: WorldGrid): LevelData {
  const { W, H, S, carveRect, fillRect, buildDebbiPod } = createHelpers(world);
  const mapInfo = MAP_CATALOG[5];

  for (let y = 0; y < H; y++) {
    const ly = y / S;
    for (let x = 0; x < W; x++) {
      const lx = x / S;
      const i = world.idx(x, y);
      world.bgGrid[i] = 0;
      if (x < 4 * S || x >= W - 4 * S || y < 4 * S || y >= H - 4 * S) {
        world.setElement(x, y, ElementId.TUNGSTEN, 20);
        world.flags[i] |= FLAG_GLUON_LOCKED;
      } else {
        const wave = Math.sin(lx * 0.06) * 6 + Math.cos(ly * 0.08) * 4;
        if ((ly + wave) % 45 < 3 && ly > 90) {
          world.setElement(x, y, ElementId.CARBON, 22);
        } else {
          world.setElement(x, y, ElementId.STONE, 20 + Math.floor(ly * 0.08));
        }
      }
    }
  }

  // SECTOR 0: SURFACE BREACH & CENTRAL ENTRY ATRIUM
  carveRect(220, 24, 340, 88, 1, ElementId.CONCRETE, 4);
  carveRect(250, 8, 310, 22, 2, ElementId.CONCRETE, 2);
  carveRect(272, 18, 288, 28, 2);
  fillRect(254, 16, 266, 21, ElementId.BIO_GEL);
  fillRect(294, 16, 306, 21, ElementId.THERMITE);

  fillRect(235, 68, 265, 70, ElementId.STEEL);
  fillRect(295, 68, 325, 70, ElementId.STEEL);
  fillRect(262, 50, 298, 52, ElementId.STEEL);

  // CORRIDORS FROM CENTRAL ATRIUM: LEFT, RIGHT, AND DOWN
  carveRect(185, 52, 224, 78, 2, ElementId.CONCRETE, 3);
  fillRect(202, 52, 206, 78, ElementId.CRYO_GLASS, -180, FLAG_CRYO_BRITTLE);

  carveRect(336, 52, 375, 78, 2, ElementId.CONCRETE, 3);
  fillRect(354, 52, 358, 78, ElementId.CONCRETE);

  carveRect(268, 86, 292, 128, 3, ElementId.STEEL, 3);
  fillRect(268, 102, 292, 105, ElementId.GLASS);

  // SECTOR 1: WEST CRYOGENICS & EMBRITTLEMENT LAB
  carveRect(48, 30, 188, 110, 4, ElementId.STEEL, 4);
  fillRect(60, 45, 110, 48, ElementId.GLASS);
  fillRect(60, 32, 63, 48, ElementId.GLASS);
  fillRect(107, 32, 110, 48, ElementId.GLASS);
  fillRect(64, 35, 106, 44, ElementId.LIQUID_NITROGEN, -196);

  fillRect(125, 72, 175, 75, ElementId.STEEL);
  fillRect(55, 85, 95, 88, ElementId.STEEL);

  carveRect(70, 108, 98, 152, 4, ElementId.CONCRETE, 3);
  fillRect(70, 122, 98, 127, ElementId.STEEL, -150, FLAG_CRYO_BRITTLE);

  // SECTOR 2: EAST SOLVENT, ACID & ALKALI REFINERY
  carveRect(372, 30, 512, 110, 2, ElementId.CONCRETE, 4);
  fillRect(405, 88, 475, 110, ElementId.GLASS);
  fillRect(410, 88, 470, 106, ElementId.ACID, 30);

  fillRect(420, 48, 460, 51, ElementId.GLASS);
  fillRect(420, 34, 423, 51, ElementId.GLASS);
  fillRect(457, 34, 460, 51, ElementId.GLASS);
  fillRect(424, 37, 456, 47, ElementId.ALKALI, 25);

  fillRect(482, 62, 505, 72, ElementId.SODIUM);
  fillRect(478, 73, 508, 76, ElementId.WOOD);
  fillRect(480, 90, 508, 108, ElementId.WATER);

  carveRect(475, 108, 504, 152, 2, ElementId.CONCRETE, 3);
  fillRect(475, 124, 504, 129, ElementId.CONCRETE);

  // SECTOR 3: CENTRAL HIGH-PRESSURE & THERMITE FOUNDRY
  carveRect(208, 125, 352, 208, 3, ElementId.STEEL, 4);
  fillRect(262, 182, 298, 192, ElementId.THERMITE);
  fillRect(250, 193, 310, 208, ElementId.STEEL);

  fillRect(216, 165, 242, 182, ElementId.CARBON);
  fillRect(214, 183, 245, 186, ElementId.STEEL);

  carveRect(176, 160, 212, 186, 3, ElementId.STEEL, 3);
  fillRect(192, 160, 196, 186, ElementId.STEEL);

  carveRect(348, 160, 384, 186, 3, ElementId.STEEL, 3);
  fillRect(364, 160, 368, 186, ElementId.LEAD);

  // SECTOR 4: MID-WEST CHRONITON ENTROPY & OXIDATION LAB
  carveRect(48, 148, 180, 235, 6, ElementId.STEEL, 4);
  fillRect(60, 195, 168, 222, ElementId.SALT_WATER);
  fillRect(95, 175, 135, 178, ElementId.STEEL);

  carveRect(68, 232, 98, 268, 6, ElementId.STEEL, 3);
  fillRect(68, 245, 98, 251, ElementId.STEEL);

  // SECTOR 5: MID-EAST HEAVY ISOTOPE FISSION REACTOR
  carveRect(380, 148, 512, 235, 5, ElementId.LEAD, 5);
  fillRect(410, 190, 482, 230, ElementId.LEAD);
  carveRect(416, 190, 476, 224, 5);
  fillRect(416, 196, 476, 224, ElementId.HEAVY_WATER);
  fillRect(425, 206, 431, 223, ElementId.URANIUM);
  fillRect(443, 206, 449, 223, ElementId.URANIUM);
  fillRect(461, 206, 467, 223, ElementId.URANIUM);

  fillRect(390, 174, 425, 177, ElementId.LEAD);
  fillRect(465, 174, 502, 177, ElementId.LEAD);

  carveRect(468, 232, 498, 268, 5, ElementId.LEAD, 3);
  fillRect(468, 246, 498, 250, ElementId.LEAD);

  // SECTOR 6: LOWER-WEST FUNDAMENTAL FORCES & QUANTUM COLLIDER
  carveRect(48, 264, 198, 336, 6, ElementId.TUNGSTEN, 4);
  fillRect(128, 264, 134, 336, ElementId.TUNGSTEN);
  fillRect(166, 264, 172, 336, ElementId.GLUON_BARRIER, 22, FLAG_GLUON_LOCKED);

  carveRect(194, 290, 232, 320, 6, ElementId.TUNGSTEN, 3);
  fillRect(210, 290, 215, 320, ElementId.TUNGSTEN);

  // SECTOR 7: LOWER-EAST HIGH-DENSITY FUSION IGNITION CHAMBER
  carveRect(362, 264, 512, 336, 5, ElementId.TUNGSTEN, 4);
  fillRect(425, 286, 475, 324, ElementId.GLASS);
  carveRect(429, 290, 471, 320, 5);
  fillRect(429, 306, 471, 320, ElementId.HEAVY_WATER);
  fillRect(429, 290, 471, 305, ElementId.DEUTERIUM);

  carveRect(328, 290, 366, 320, 5, ElementId.TUNGSTEN, 3);
  fillRect(344, 290, 349, 320, ElementId.GLUON_BARRIER, 22, FLAG_GLUON_LOCKED);

  // SECTOR 8: DEEP QUANTUM CORE — DEBBI'S CONTAINMENT VAULT
  carveRect(268, 206, 292, 245, 6, ElementId.TUNGSTEN, 3);
  fillRect(268, 224, 292, 230, ElementId.TUNGSTEN);
  carveRect(226, 242, 334, 336, 6, ElementId.TUNGSTEN, 5);

  fillRect(232, 285, 255, 288, ElementId.STEEL);
  fillRect(305, 285, 328, 288, ElementId.STEEL);
  fillRect(245, 326, 315, 335, ElementId.STEEL);

  const bx = 280;
  const by = 304;
  buildDebbiPod(bx, by);

  return {
    mapInfo,
    spawnX: 250,
    spawnY: 60,
    debbi: { x: bx, y: by, hp: 100, maxHp: 100, carried: false, rescued: false, inDanger: false, cageIntactCount: 100 },
    escapeVehicle: { x: 280, y: 42, name: 'Subterranean Extraction Pod', type: 'drillpod' },
    terminals: [
      {
        id: 'term-entry',
        x: 280,
        y: 64,
        sector: 'Sector 0: Surface Breach Atrium',
        title: 'DR. VANCE PERSONAL LOG #01',
        logText:
          'Director Kael locked my daughter Debbi inside the Deep Quantum Vault at the bottom of the facility. My Sub-Atomic Omni-Tool can manipulate heat, cold, pressure, chemicals, radiation, and the fundamental forces.',
        alchemyTip:
          'Explore LEFT (Cryo Lab), RIGHT (Acid Refinery), UP (Supply Loft), or DOWN (Foundry Shaft).',
      },
      {
        id: 'term-cryo',
        x: 145,
        y: 68,
        sector: 'Sector 1: West Cryogenics Wing',
        title: 'CRYO-METALLURGY REPORT',
        logText:
          'Cooling Steel below -110°C with Liquid Nitrogen (LN₂) or the Cryo-Jet transitions its lattice into a Cryo-Brittle phase.',
        alchemyTip:
          'Freeze thick Steel doors with Tool [2 RMB] until frosted cyan, then fire Tool [1 LMB] to shatter them!',
      },
      {
        id: 'term-acid',
        x: 392,
        y: 68,
        sector: 'Sector 2: East Solvent Refinery',
        title: 'EXOTHERMIC SOLVENTS & ALKALI METALS',
        logText:
          'Concentrated Sulfuric Acid (H₂SO₄) dissolves Concrete and Stone rapidly. Neutralize it with Caustic Alkali (NaOH) or drop Metallic Sodium (Na) into water for an explosive breach!',
        alchemyTip:
          'Use Tool [5] (Acid / Alkali) or Tool [6] (Sodium / Thermite).',
      },
      {
        id: 'term-foundry',
        x: 280,
        y: 175,
        sector: 'Sector 3: Central Pressure & Thermite Foundry',
        title: 'EXTREME PRESSURE & COULOMB BARRIER WARNING',
        logText:
          'Compressing Carbon above 800 GPa synthesizes Crystalline Diamond. Exceeding 5,000 GPa breaches the Coulomb barrier and ignites THERMONUCLEAR FUSION!',
        alchemyTip:
          'Ignite the red Thermite powder on the floor with Tool [2 LMB] to burn at 2850°C straight through the Steel vault floor!',
      },
      {
        id: 'term-chrono',
        x: 115,
        y: 170,
        sector: 'Sector 4: Mid-West Chroniton Entropy Wing',
        title: 'TEMPORAL ENTROPY & OXIDATION',
        logText:
          'Exposing wet Steel to a Chroniton Time-Acceleration beam accelerates oxidation by 3,000%, turning solid steel floodgates into crumbling Rust in seconds.',
        alchemyTip:
          'Splash Water onto Steel walls, then fire Tool [3 LMB] (Time Accelerate) to rust right through!',
      },
      {
        id: 'term-fission',
        x: 405,
        y: 170,
        sector: 'Sector 5: Mid-East Heavy Isotope Reactor',
        title: 'FISSILE URANIUM-235 & WEAK FORCE DECAY',
        logText:
          'Shooting Neutrons into U-235 triggers nuclear fission. Applying a Weak-Force W-Boson field induces rapid β-decay into stable Lead (Pb).',
        alchemyTip:
          'Use Tool [8] (Weak Force) to decay Uranium into Lead, or Tool [7] (Neutron Beam) to trigger fission!',
      },
      {
        id: 'term-quantum',
        x: 95,
        y: 325,
        sector: 'Sector 6: Fundamental Force Collider',
        title: 'TUNGSTEN VAULTS & QUANTUM TUNNELING',
        logText:
          'The Deep Core is armored with Tungsten-Carbide (W-C) and Strong-Force Gluon Barriers.',
        alchemyTip:
          'Use Tool [9 RMB / Key Q] for Quantum Tunneling, Tool [9 LMB] for Strong Force Unbinding, or Tool [8] to transmute Tungsten into Sodium!',
      },
      {
        id: 'term-debbi',
        x: 244,
        y: 280,
        sector: 'Sector 8: Deep Quantum Containment Vault',
        title: 'DEBBI STASIS POD TELEMETRY',
        logText:
          'Dissolve the cyan Chroniton Crystal ring using the Chroniton Time Beam [3], Strong Force Unbinder [9], or Quantum Phase Beam [9] to free Debbi!',
        alchemyTip:
          'Breach the cyan Chroniton Crystal dome around Debbi and walk up to her to rescue her!',
      },
    ],
    turrets: [
      { x: 155, y: 42, hp: 100, maxHp: 100, cooldown: 60, active: true, type: 'kinetic' },
      { x: 440, y: 62, hp: 100, maxHp: 100, cooldown: 75, active: true, type: 'thermal' },
      { x: 235, y: 145, hp: 120, maxHp: 120, cooldown: 65, active: true, type: 'kinetic' },
      { x: 450, y: 162, hp: 130, maxHp: 130, cooldown: 80, active: true, type: 'radiation' },
      { x: 110, y: 282, hp: 150, maxHp: 150, cooldown: 55, active: true, type: 'thermal' },
      { x: 410, y: 282, hp: 150, maxHp: 150, cooldown: 55, active: true, type: 'kinetic' },
    ],
    sectors: [
      {
        name: 'SECTOR 0: SURFACE BREACH ATRIUM',
        subtitle: 'Central Access Hub — Paths Left, Right, Up & Down',
        x1: 215,
        y1: 5,
        x2: 345,
        y2: 95,
        color: '#4cc9f0',
      },
      {
        name: 'SECTOR 1: WEST CRYOGENICS LAB',
        subtitle: 'Sub-Zero Embrittlement & Liquid Nitrogen Storage',
        x1: 40,
        y1: 25,
        x2: 214,
        y2: 120,
        color: '#72efdd',
      },
      {
        name: 'SECTOR 2: EAST SOLVENT & ACID REFINERY',
        subtitle: 'Corrosive H₂SO₄ Vats, Alkali Neutralizers & Sodium Stockpile',
        x1: 346,
        y1: 25,
        x2: 520,
        y2: 120,
        color: '#80ed99',
      },
      {
        name: 'SECTOR 3: CENTRAL BALLISTICS & THERMITE FOUNDRY',
        subtitle: 'High-Pressure Synthesis & Aluminothermic Crucible',
        x1: 200,
        y1: 121,
        x2: 360,
        y2: 215,
        color: '#ff9f1c',
      },
      {
        name: 'SECTOR 4: CHRONITON ENTROPY & OXIDATION WING',
        subtitle: 'Temporal Dilation & Accelerated Corrosion',
        x1: 40,
        y1: 140,
        x2: 199,
        y2: 245,
        color: '#48bfe3',
      },
      {
        name: 'SECTOR 5: HEAVY ISOTOPE FISSION REACTOR',
        subtitle: 'Enriched U-235 Core & Heavy Water Moderator Pool',
        x1: 361,
        y1: 140,
        x2: 520,
        y2: 245,
        color: '#70e000',
      },
      {
        name: 'SECTOR 6: FUNDAMENTAL FORCE COLLIDER',
        subtitle: 'Weak Force β-Decay, Strong Gluon Web & Quantum Tunneling',
        x1: 40,
        y1: 255,
        x2: 215,
        y2: 345,
        color: '#f72585',
      },
      {
        name: 'SECTOR 7: HIGH-DENSITY FUSION IGNITION LAB',
        subtitle: 'Deuterium-Tritium Confinement — Extreme Pressure Hazard',
        x1: 345,
        y1: 255,
        x2: 520,
        y2: 345,
        color: '#ffbe0b',
      },
      {
        name: 'SECTOR 8: DEEP QUANTUM CORE — DEBBI’S VAULT',
        subtitle: 'Primary Objective: Dissolve the Chroniton Stasis Pod & Save Debbi!',
        x1: 216,
        y1: 235,
        x2: 344,
        y2: 345,
        color: '#e0aaff',
      },
    ],
  };
}
