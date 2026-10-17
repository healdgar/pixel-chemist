const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourceCache = new Map();
const noop = () => {};

class Element {
  constructor(id = '') {
    this.id = id;
    this.style = {};
    this.classList = { add: noop, remove: noop, toggle: noop };
    this.handlers = {};
    this.open = false;
    this.textContent = '';
    this.value = 'alpine_outdoor';
  }
  addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); }
  dispatch(type, event = {}) { for (const fn of this.handlers[type] ?? []) fn(event); }
  appendChild() {}
  setAttribute() {}
  getAttribute() { return null; }
  getContext() { return {}; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  blur() {}
}

function createGame() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  const dialogs = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    .matchAll(/<dialog[^>]+id="([^"]+)"/g)].map((match) => element(match[1]));
  const document = new Element();
  Object.assign(document, {
    hidden: false,
    getElementById: element,
    createElement: () => new Element(),
    querySelectorAll: (selector) => selector === 'dialog' ? dialogs
      : selector === 'dialog[open]' ? dialogs.filter((dialog) => dialog.open) : [],
    querySelector: (selector) => selector === 'dialog[open]'
      ? dialogs.find((dialog) => dialog.open) ?? null : null,
  });
  const window = new Element();
  Object.assign(window, { innerWidth: 1280, innerHeight: 720 });
  const sound = new Proxy({ muted: false }, { get: (target, key) => target[key] ?? noop });
  class SoundEngine { constructor() { return sound; } }
  class WorldRenderer {
    constructor() { this.viewW = 448; this.viewH = 272; this.camX = 0; this.camY = 0; }
    screenToWorld() { return { wx: 400, wy: 100 }; }
    updateCamera() {}
    render() {}
    renderMinimap() {}
  }
  class GamepadManager {
    constructor() {
      this.state = { connected: false, moveX: 0, moveY: 0, aimX: 0, aimY: 0 };
    }
    poll() { return this.state; }
    triggerRumble() {}
  }
  class TouchControlsManager {
    applyToGamepadState(state) { return state; }
    toggleEnabled() {}
    requestLandscapeFullscreen() {}
  }
  const mocks = {
    'audio/soundEngine.ts': { SoundEngine },
    'render/renderer.ts': { WorldRenderer },
    'input/gamepadManager.ts': { GamepadManager },
    'input/touchControls.ts': { TouchControlsManager },
  };
  const modules = new Map();
  const context = vm.createContext({
    window, document, HTMLDialogElement: Element, performance: { now: () => 0 },
    requestAnimationFrame: noop, console,
  });
  vm.runInContext(`let testSeed = 0x12345678;
    Math.random = () => { testSeed ^= testSeed << 13; testSeed ^= testSeed >>> 17;
      testSeed ^= testSeed << 5; return (testSeed >>> 0) / 4294967296; };`, context);
  function load(file) {
    if (file.endsWith('.css')) return {};
    if (!file.endsWith('.ts')) file += '.ts';
    const relative = path.relative(path.join(root, 'src'), file);
    if (mocks[relative]) return mocks[relative];
    if (modules.has(file)) return modules.get(file).exports;
    if (!sourceCache.has(file)) {
      sourceCache.set(file, ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText);
    }
    const module = { exports: {} };
    modules.set(file, module);
    const requireSource = (specifier) => load(path.resolve(path.dirname(file), specifier));
    if (relative === 'main.ts') {
      context.require = requireSource;
      context.exports = module.exports;
      vm.runInContext(sourceCache.get(file), context, { filename: file });
    } else {
      const wrapper = vm.runInContext(`(function(require, module, exports) {\n${sourceCache.get(file)}\n})`, context, { filename: file });
      wrapper(requireSource, module, module.exports);
    }
    return module.exports;
  }
  load(path.join(root, 'src/main.ts'));
  const run = (code) => vm.runInContext(code, context);
  return {
    run, element, document, window,
    frame: (now) => run(`gameLoop(${now})`),
    key: (code) => window.dispatch('keydown', { code, repeat: false, preventDefault: noop }),
    arena() {
      run(`
        world.grid.fill(0); world.bgGrid.fill(0); world.temp.fill(22);
        world.pressure.fill(0); world.radiation.fill(0); world.flags.fill(0); world.life.fill(0);
        world.fusionTriggered = false;
        level.turrets = []; level.enemyUnits = []; level.defenses = []; level.sectors = [];
        level.debbi.x = 900; level.debbi.y = 600; level.debbi.rescued = false;
        player.x = 100; player.y = 100; player.vx = 0; player.vy = 0; player.hp = 100;
        renderer.camX = 0; renderer.camY = 0;
        projectiles.length = 0; snapshots.length = 0; saveSnapshot();
      `);
    },
  };
}

module.exports = { createGame };
