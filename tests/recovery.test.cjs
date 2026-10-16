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

test('water dilutes acid and alkali solutions, and salt dissolves in water into brine', () => {
  const game = createGame();
  game.arena();
  const res = JSON.parse(game.run(`JSON.stringify((() => {
    // 1. Test Acid (25) + Water (22) dilution in a sealed diamond (6) beaker
    for (let x = 200; x <= 212; x++) {
      for (let y = 200; y <= 212; y++) {
        if (x === 200 || x === 212 || y === 212) {
          world.setElement(x, y, 6); // DIAMOND wall (acid-proof)
        } else if (y >= 204) {
          // 2 rows of ACID (25) under 6 rows of WATER (22) -> excess water dilutes acid
          world.setElement(x, y, y >= 210 ? 25 : 22);
        } else {
          world.setElement(x, y, 0);
        }
      }
    }
    const initialAcidConc = world.getConcentration(world.idx(206, 211));

    // 2. Test Salt (19) + Water (22) dissolution into Salt Water (23) in a second sealed diamond beaker
    for (let x = 230; x <= 240; x++) {
      for (let y = 200; y <= 212; y++) {
        if (x === 230 || x === 240 || y === 212) {
          world.setElement(x, y, 6);
        } else if (y >= 209) {
          world.setElement(x, y, 19); // SALT
        } else if (y >= 204) {
          world.setElement(x, y, 22); // WATER
        } else {
          world.setElement(x, y, 0);
        }
      }
    }

    for (let step = 0; step < 90; step++) {
      world.step(220, 206, sound);
    }

    let minAcidConc = 100;
    let remainingFullAcid = 0;
    let totalAcidCount = 0;
    for (let x = 201; x < 212; x++) {
      for (let y = 201; y < 212; y++) {
        const idx = world.idx(x, y);
        if (world.grid[idx] === 25) {
          totalAcidCount++;
          const c = world.getConcentration(idx);
          if (c < minAcidConc) minAcidConc = c;
          if (c === 100) remainingFullAcid++;
        }
      }
    }

    let saltWaterCount = 0;
    for (let x = 231; x < 240; x++) {
      for (let y = 201; y < 212; y++) {
        if (world.grid[world.idx(x, y)] === 23) saltWaterCount++; // SALT_WATER
      }
    }

    return { initialAcidConc, minAcidConc, remainingFullAcid, totalAcidCount, saltWaterCount };
  })())`));

  assert.equal(res.initialAcidConc, 100);
  assert.ok(res.remainingFullAcid === 0, `Expected no 100% acid left after dilution, got ${JSON.stringify(res)}`);
  assert.ok(res.totalAcidCount === 0 || res.minAcidConc < 90, `Expected acid to dilute, got ${JSON.stringify(res)}`);
  assert.ok(res.saltWaterCount > 0, `Expected salt to dissolve into SALT_WATER, got ${JSON.stringify(res)}`);
});

test('a tall hump of water rapidly flows laterally and finds a flat level instead of mounding like sand', () => {
  const game = createGame();
  game.arena();
  const res = JSON.parse(game.run(`JSON.stringify((() => {
    // Build a 30-wide flat diamond basin (x = 190..221, floor at y = 212)
    for (let x = 190; x <= 221; x++) {
      for (let y = 195; y <= 212; y++) {
        if (x === 190 || x === 221 || y === 212) {
          world.setElement(x, y, 6); // DIAMOND wall/floor
        } else if (x >= 203 && x <= 208 && y >= 202 && y <= 211) {
          // 6-wide x 10-tall column of WATER (60 pixels total -> should flatten to 2 rows deep across 30 width!)
          world.setElement(x, y, 22);
        } else {
          world.setElement(x, y, 0);
        }
      }
    }

    for (let step = 0; step < 45; step++) {
      world.step(205, 206, sound);
    }

    let highestWaterY = 212;
    let waterCount = 0;
    for (let x = 191; x < 221; x++) {
      for (let y = 196; y < 212; y++) {
        if (world.grid[world.idx(x, y)] === 22) {
          waterCount++;
          if (y < highestWaterY) highestWaterY = y;
        }
      }
    }
    const maxColumnHeight = 212 - highestWaterY;
    return { waterCount, maxColumnHeight };
  })())`));

  assert.equal(res.waterCount, 60);
  assert.ok(res.maxColumnHeight <= 3, `Expected 10-tall water column to flatten to <= 3 rows, got ${JSON.stringify(res)}`);
});

test('large 36,000-pixel liquid bodies and magma_trench fast-skip quiescent interior pixels for 60 FPS headroom', () => {
  const { performance } = require('node:perf_hooks');
  const game = createGame();

  // 1. Verify magma_trench steps rapidly
  game.run('loadMap("magma_trench"); for (let i = 0; i < 5; i++) world.step(player.x, player.y, sound);');
  const tMagma0 = performance.now();
  for (let i = 0; i < 60; i++) {
    game.run('world.step(player.x, player.y, sound)');
  }
  const magmaMsPerStep = (performance.now() - tMagma0) / 60;
  assert.ok(magmaMsPerStep < 6.0, `Expected magma_trench < 6.0 ms/step, got ${magmaMsPerStep.toFixed(2)} ms/step`);

  // 2. Verify a 36,000-pixel (300x120) Water + Acid mixing vat fast-skips >75% of interior pixels and runs < 6.0 ms/step
  game.arena();
  game.run(`
    const { ElementId } = require("./chemistry/elements");
    for (let y = 78; y <= 202; y++) {
      for (let x = 48; x <= 352; x++) {
        if (y >= 200 || x < 50 || x >= 350) {
          world.setElement(x, y, ElementId.TUNGSTEN);
        } else if (y >= 80) {
          world.setElement(x, y, x < 200 ? ElementId.WATER : ElementId.ACID);
        }
      }
    }
    world.motionCalls = 0;
    const origMotion = world.updatePixelMotion.bind(world);
    world.updatePixelMotion = function(x, y, i, el) {
      this.motionCalls++;
      return origMotion(x, y, i, el);
    };
  `);
  const tVat0 = performance.now();
  for (let i = 0; i < 60; i++) {
    game.run('world.step(200, 140, sound)');
  }
  const vatMsPerStep = (performance.now() - tVat0) / 60;
  const avgMotionCalls = game.run('world.motionCalls / 60');
  assert.ok(vatMsPerStep < 6.0, `Expected 36k liquid vat < 6.0 ms/step, got ${vatMsPerStep.toFixed(2)} ms/step`);
  assert.ok(avgMotionCalls < 6000, `Expected < 6000 motion calls/step out of 36,000 liquid pixels, got ${Math.round(avgMotionCalls)}`);
});

test('flamethrower standoff allows running forward while firing without burning the player', () => {
  const game = createGame();
  game.arena();

  const res = game.run(`(() => {
    const { ElementId } = require("./chemistry/elements");
    const { updateProjectiles } = require("./entities/tools");
    // Build a long floor and a flammable wood wall ahead
    for (let x = 20; x < 350; x++) {
      for (let y = 212; y <= 220; y++) {
        world.setElement(x, y, ElementId.TUNGSTEN);
      }
    }
    for (let x = 285; x <= 297; x++) {
      for (let y = 175; y < 212; y++) {
        world.setElement(x, y, ElementId.WOOD);
      }
    }
    player.x = 60;
    player.y = 200;
    player.hp = 100;
    player.selectedTool = 2;
    keys.add("KeyD");

    for (let t = 0; t < 60; t++) {
      player.update(keys, world, sound);
      player.fireTool(player.x + 80, player.y, false, projectiles, world, sound);
      updateProjectiles(projectiles, world, sound, player, level.enemyUnits, level.bibbi);
      world.step(player.x, player.y, sound);
    }
    keys.delete("KeyD");

    let remainingWood = 0;
    for (let x = 285; x <= 297; x++) {
      for (let y = 175; y < 212; y++) {
        if (world.getElement(x, y) === ElementId.WOOD) remainingWood++;
      }
    }
    return { hp: player.hp, x: player.x, remainingWood, initialWood: 13 * 37 };
  })()`);

  assert.equal(res.hp, 100, `Expected player to take 0 self-damage while sprinting and firing flamethrower, got ${JSON.stringify(res)}`);
  assert.ok(res.x > 130, `Expected player to advance forward while firing, got x=${res.x}`);
  assert.ok(res.remainingWood < res.initialWood, `Expected flamethrower stream to ignite wood target ahead, got ${JSON.stringify(res)}`);
});

test('lava thermal mass keeps a wide lava mound hot in air while leveling flat, and water quenches it into basalt stone', () => {
  const game = createGame();
  game.arena();

  const res = game.run(`(() => {
    const { ElementId } = require("./chemistry/elements");
    // 240px wide basin (x = 80..320, floor at y = 212)
    for (let x = 76; x <= 324; x++) {
      for (let y = 170; y <= 218; y++) {
        if (y >= 212 || x <= 80 || x >= 320) {
          world.setElement(x, y, ElementId.TUNGSTEN);
        }
      }
    }
    // Spawn a tall 80x25 mound of Lava (2,000 pixels) in the middle of the 239-wide basin
    for (let x = 160; x < 240; x++) {
      for (let y = 187; y < 212; y++) {
        world.setElement(x, y, ElementId.LAVA, 1200);
      }
    }
    for (let t = 0; t < 180; t++) {
      world.step(200, 195, sound);
    }
    let lavaCount = 0;
    let stoneInAir = 0;
    let highestLavaY = 212;
    let totalLavaTemp = 0;
    for (let x = 81; x < 320; x++) {
      for (let y = 170; y < 212; y++) {
        const el = world.getElement(x, y);
        if (el === ElementId.LAVA) {
          lavaCount++;
          totalLavaTemp += world.temp[y * world.width + x];
          if (y < highestLavaY) highestLavaY = y;
        } else if (el === ElementId.STONE) {
          stoneInAir++;
        }
      }
    }
    const maxColumnHeight = 212 - highestLavaY;
    const avgTempInAir = totalLavaTemp / Math.max(1, lavaCount);

    // Now pour high-specific-heat Water across the central span to quench a Basalt STONE crust
    for (let x = 140; x <= 260; x++) {
      for (let y = 196; y <= 201; y++) {
        world.setElement(x, y, ElementId.WATER, 20);
      }
    }
    for (let t = 0; t < 45; t++) {
      world.step(200, 195, sound);
    }
    let quenchedStone = 0;
    for (let x = 81; x < 320; x++) {
      for (let y = 170; y < 212; y++) {
        if (world.getElement(x, y) === ElementId.STONE) quenchedStone++;
      }
    }
    return { lavaCount, stoneInAir, maxColumnHeight, avgTempInAir, quenchedStone };
  })()`);

  assert.equal(res.stoneInAir, 0, `Expected 0 lava pixels to freeze against low-heat-capacity air, got ${JSON.stringify(res)}`);
  assert.ok(res.avgTempInAir > 1100, `Expected lava thermal mass to stay > 1100C against air, got ${JSON.stringify(res)}`);
  assert.ok(res.maxColumnHeight <= 9, `Expected 25-tall lava mound to level across 239-wide basin to <= 9 rows, got ${JSON.stringify(res)}`);
  assert.ok(res.quenchedStone >= 80, `Expected water to quench lava surface into basalt stone, got ${JSON.stringify(res)}`);
});

