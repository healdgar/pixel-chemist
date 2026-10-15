const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./gameHarness.cjs');

function restoredState(game) {
  return JSON.parse(game.run(`JSON.stringify({
    player: player.createSnapshot(), director: jevDirector.createSnapshot(),
    units: level.enemyUnits, turrets: level.turrets, defenses: level.defenses,
    bibbi: level.bibbi, projectiles, tick, camX: renderer.camX, camY: renderer.camY,
    cell: [world.grid[500], world.bgGrid[500], world.temp[500], world.pressure[500],
      world.radiation[500], world.flags[500], world.life[500], world.colorNoise[500]],
    worldTick: world.tickCount, rng: world.rngState, parity: world.parity,
    fusion: world.fusionTriggered, fusionCoords: world.fusionCoords,
  })`));
}

test('rewind restores player, entities, projectiles, world fields, tactical state, and neural learning', () => {
  const game = createGame();
  game.arena();
  game.run(`
    snapshots.length = 0;
    Object.assign(player, { vx: 2, vy: -1, oxygen: 32, radiationDose: 40,
      jetpackFuel: 12, quantumPhaseTimer: 90, fireCooldown: 7, selectedTool: 5, bodyTemp: 45 });
    level.enemyUnits = [{ id: 'guard', active: true, hp: 80, x: 600, y: 300, stasisTimer: 30 }];
    level.turrets = [{ x: 700, y: 300, active: true, hp: 100, cooldown: 10 }];
    level.defenses = [{ id: 'laser', active: true, hp: 100, cooldown: 5 }];
    projectiles.push({ x: 500, y: 300, vx: 1, vy: 0, type: 'enemy_bolt',
      color: '#fff', radius: 6, ttl: 30, fromPlayer: false });
    world.grid[500] = 2; world.bgGrid[500] = 3; world.temp[500] = 120;
    world.pressure[500] = 45; world.radiation[500] = 6; world.flags[500] = 4;
    world.life[500] = 12; world.colorNoise[500] = 7; world.tickCount = 123;
    jevDirector.alertLevel = 65; jevDirector.reinforcementCooldown = 120;
    saveSnapshot();
  `);
  const expected = restoredState(game);
  game.run(`
    player.hp = 0; player.oxygen = 0; player.jetpackFuel = 0; player.radiationDose = 90;
    level.enemyUnits[0].active = false; level.enemyUnits[0].hp = 0;
    level.turrets[0].active = false; level.defenses[0].hp = 0; level.bibbi.rescued = true;
    projectiles[0].ttl = 1; world.grid[500] = 0; world.bgGrid[500] = 0; world.temp[500] = 22;
    world.pressure[500] = 0; world.radiation[500] = 0; world.flags[500] = 0;
    world.life[500] = 0; world.colorNoise[500] = 0; world.tickCount = 999;
    world.rngState = 999; world.parity = 1; world.fusionTriggered = true;
    world.fusionCoords = { x: 10, y: 10 };
    jevDirector.brain.w1.fill(0); jevDirector.brain.onlineUpdates = 99;
    jevDirector.alertLevel = 100; jevDirector.reinforcementCooldown = 0;
    renderer.camX = 100; tick = 600;
    rewindTime();
  `);
  assert.deepEqual(restoredState(game), expected);
  assert.equal(game.element('bibbi-status-pill').textContent, 'BIBBI: IN STASIS');
  // Continuing the restored game must not mutate the retained checkpoint.
  game.run(`level.enemyUnits[0].hp = 1; projectiles[0].ttl = 2; jevDirector.brain.w1.fill(1); rewindTime();`);
  assert.deepEqual(restoredState(game), expected);
});

test('rewind selects about five seconds ago and discards the abandoned future', () => {
  const game = createGame();
  game.arena();
  game.run(`snapshots.length = 0;
    for (tick = 60; tick <= 360; tick += 60) { player.x = tick; saveSnapshot(); }
    tick = 390; player.x = 390; rewindTime();`);
  assert.equal(game.run('tick'), 60);
  assert.equal(game.run('player.x'), 60);
  assert.equal(game.run('snapshots.length'), 1);
  game.run('rewindTime();');
  assert.equal(game.run('tick'), 60);
  assert.equal(game.run('player.x'), 60);
});

test('keyboard, button, and controller rewind share death recovery and re-arm later alerts', () => {
  for (const input of ['keyboard', 'button', 'controller']) {
    const game = createGame();
    game.arena();
    game.run('player.hp = 0; updateHud();');
    assert.equal(game.element('event-dialog').open, true);
    if (input === 'keyboard') game.key('KeyR');
    if (input === 'button') game.element('btn-event-rewind').dispatch('click');
    if (input === 'controller') {
      game.run('Object.assign(gamepad.state, { connected: true, rewindPressed: true });');
      game.frame(0);
    }
    assert.equal(game.run('player.hp'), 100, input);
    assert.equal(game.element('event-dialog').open, false, input);
    assert.equal(game.run('breachAlertShown'), false, input);
    game.run('player.hp = 0; updateHud();');
    assert.equal(game.element('event-dialog').open, true, input);
  }
});

test('closing a breach dialog cannot resume movement, shooting, phasing, or rescue at zero HP', () => {
  const game = createGame();
  game.arena();
  game.frame(0);
  game.run(`player.hp = 0; updateHud(); keys.add('KeyD'); mouseLeftDown = true;
    level.bibbi.x = player.x; level.bibbi.y = player.y;`);
  game.key('Escape');
  game.frame(1000);
  game.run('player.update(keys, world, sound); player.fireTool(400, 100, false, projectiles, world, sound); player.activateQuantumDash(sound); updateTurretsAndBibbi();');
  assert.equal(game.run('player.x'), 100);
  assert.equal(game.run('tick'), 0);
  assert.equal(game.run('projectiles.length'), 0);
  assert.equal(game.run('player.quantumPhaseTimer'), 0);
  assert.equal(game.run('level.bibbi.rescued'), false);
});

test('map restart resets the entire player state while retaining the selected tool', () => {
  const game = createGame();
  game.run(`Object.assign(player, { hp: 1, maxHp: 2, jetpackFuel: 0, maxJetpack: 2,
    oxygen: 0, maxOxygen: 2, submerged: true, radiationDose: 90, bodyTemp: 200,
    vx: 3, vy: 3, facing: -1, grounded: true, quantumPhaseTimer: 100,
    fireCooldown: 20, selectedTool: 6 }); loadMap('space_station');`);
  const actual = game.run('JSON.stringify(player.createSnapshot())');
  const expected = game.run(`JSON.stringify((() => {
    const fresh = new player.constructor(level.spawnX, level.spawnY);
    fresh.gravityScale = 0.45; fresh.selectedTool = 6; return fresh.createSnapshot();
  })())`);
  assert.equal(actual, expected);
  assert.equal(game.run('snapshots.length'), 1);
  assert.equal(game.run('tick'), 0);
});

test('Escape and M open/close menus without muting or repeating the toggle', () => {
  const game = createGame();
  game.key('KeyM');
  assert.equal(game.element('menu-dialog').open, true);
  assert.equal(game.run('sound.muted'), false);
  game.window.dispatch('keydown', { code: 'KeyM', repeat: true, preventDefault() {} });
  assert.equal(game.element('menu-dialog').open, true);
  game.key('Escape');
  assert.equal(game.element('menu-dialog').open, false);
  game.key('Escape');
  assert.equal(game.element('menu-dialog').open, true);
});

test('curriculum covers all six directives, including neutral pressure-tool interception', () => {
  const game = createGame();
  const result = JSON.parse(game.run(`JSON.stringify((() => {
    const counts = [0, 0, 0, 0, 0, 0];
    let neutralIntercepts = 0;
    jevDirector.brain.backpropSupervised = (x, directive) => {
      counts[directive]++;
      if (directive === 1 && x[0] + x[1] + x[2] + x[3] === 0) neutralIntercepts++;
      return 0;
    };
    jevDirector.brain.trainCurriculumEpisodes(3000);
    return { counts, neutralIntercepts };
  })())`));
  assert.ok(result.counts.every((count) => count > 0), JSON.stringify(result));
  assert.ok(result.neutralIntercepts > 0);
});

test('touching Bibbi puts her on the player back first and only reaching the escape vehicle wins', () => {
  const game = createGame();
  game.arena();
  game.run(`
    level.bibbi.x = 300; level.bibbi.y = 300; level.bibbi.carried = false; level.bibbi.rescued = false;
    level.escapeVehicle = { x: 100, y: 100, name: 'Cryo-VTOL Dropship', type: 'dropship' };
    player.x = 290; player.y = 300;
    updateTurretsAndBibbi();
  `);
  assert.equal(game.run('level.bibbi.carried'), true);
  assert.equal(game.run('player.carryingBibbi'), true);
  assert.equal(game.run('level.bibbi.rescued'), false);
  assert.equal(game.element('event-dialog').open, false);

  game.run(`
    player.x = 105; player.y = 100;
    updateTurretsAndBibbi();
  `);
  assert.equal(game.run('level.bibbi.rescued'), true);
  assert.equal(game.run('player.carryingBibbi'), false);
  assert.equal(game.element('event-dialog').open, true);
});

