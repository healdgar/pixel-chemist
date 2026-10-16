const test = require('node:test');
const assert = require('node:assert/strict');
const { createGame } = require('./gameHarness.cjs');

function state(game) {
  return JSON.parse(game.run(`JSON.stringify({ tick, worldTick: world.tickCount,
    x: player.x, y: player.y, hp: player.hp, fuel: player.jetpackFuel, oxygen: player.oxygen,
    phase: player.quantumPhaseTimer, cooldown: player.fireCooldown,
    aimX: reticleOffsetX, aimY: reticleOffsetY,
    aiTick: jevDirector.decisionTickCounter, projectiles })`));
}

test('menus freeze damage, chemistry, turrets, AI, and snapshot capture; resume without catch-up', () => {
  const game = createGame();
  game.arena();
  game.frame(0);
  game.run(`
    tick = 179;
    level.turrets = [{ x: 120, y: 100, hp: 100, active: true, cooldown: 1 }];
    world.setElement(300, 150, 3);
    projectiles.push({ x: 100, y: 100, vx: 0, vy: 0, type: 'enemy_bolt',
      color: '#fff', radius: 6, ttl: 10, fromPlayer: false });
  `);
  const before = state(game);
  const cellBefore = game.run('JSON.stringify([world.grid[world.idx(300,150)], world.life[world.idx(300,150)]])');
  game.element('menu-dialog').showModal();
  for (let now = 1000; now <= 20000; now += 1000) game.frame(now);
  assert.deepEqual(state(game), before);
  assert.equal(game.run('level.turrets[0].cooldown'), 1);
  assert.equal(game.run('snapshots.length'), 1);
  assert.equal(game.run('JSON.stringify([world.grid[world.idx(300,150)], world.life[world.idx(300,150)]])'), cellBefore);
  game.element('menu-dialog').close();
  game.frame(20001);
  assert.deepEqual(state(game), before);
  game.frame(20001 + 1000 / 60);
  assert.equal(game.run('tick'), 180);
  assert.equal(game.run('snapshots.length'), 2);
  assert.equal(game.run('player.hp'), 94.5);
  assert.equal(game.run('level.turrets[0].cooldown'), 75);
});

test('one second produces identical gameplay at 30, 60, 120, and 144 display Hz', () => {
  const results = [];
  for (const hz of [30, 60, 120, 144]) {
    const game = createGame();
    game.arena();
    game.run(`keys.add('KeyD'); mouseLeftDown = true; player.quantumPhaseTimer = 150; player.gravityScale = 0.45;
      usingGamepadAim = true; reticleOffsetX = 0; reticleOffsetY = 0;
      Object.assign(gamepad.state, { connected: true, aimX: 0.1, aimY: 0.1 });`);
    game.frame(0);
    for (let i = 1; i <= hz; i++) game.frame(i * 1000 / hz);
    results.push(state(game));
  }
  assert.equal(results[0].tick, 60);
  assert.equal(results[0].phase, 90);
  assert.ok(results[0].oxygen < 100);
  assert.ok(results[0].x > 280);
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
});

test('controller opening a menu pauses the same frame; controller can close it while paused', () => {
  const game = createGame();
  game.arena();
  game.frame(0);
  game.run(`Object.assign(gamepad.state, { connected: true, codexPressed: true });`);
  game.frame(1000 / 30);
  assert.equal(game.element('codex-dialog').open, true);
  assert.equal(game.run('tick'), 0);
  game.run(`gamepad.state.codexPressed = false; gamepad.state.closeModalPressed = true;`);
  game.frame(1000);
  assert.equal(game.element('codex-dialog').open, false);
  assert.equal(game.run('tick'), 0);
});

test('a dialog opened during catch-up stops further simulation steps', () => {
  const game = createGame();
  game.arena();
  game.frame(0);
  game.run('world.fusionTriggered = true;');
  game.frame(1000);
  assert.equal(game.element('event-dialog').open, true);
  assert.ok(game.run('tick') > 0 && game.run('tick') < 5);
  const frozen = state(game);
  game.frame(2000);
  assert.deepEqual(state(game), frozen);
});

test('stalls have bounded catch-up and hidden-tab time never advances gameplay', () => {
  const game = createGame();
  game.arena();
  game.frame(0);
  game.frame(10000);
  assert.equal(game.run('tick'), 5);
  game.document.hidden = true;
  game.document.dispatch('visibilitychange');
  game.frame(20000);
  assert.equal(game.run('tick'), 5);
  game.document.hidden = false;
  game.document.dispatch('visibilitychange');
  game.frame(30000);
  assert.equal(game.run('tick'), 5);
  game.frame(30000 + 1000 / 60);
  assert.equal(game.run('tick'), 6);
});

test('KeyP and HUD pause button freeze simulation cleanly without opening a modal dialog', () => {
  const game = createGame();
  game.arena();
  game.frame(0);
  game.frame(1000 / 60);
  assert.equal(game.run('tick'), 1);

  game.key('KeyP');
  assert.equal(game.run('manualPause'), true);
  assert.equal(game.element('menu-dialog').open, false);
  assert.equal(game.element('btn-pause').textContent, '▶');

  for (let now = 1000; now <= 5000; now += 1000) game.frame(now);
  assert.equal(game.run('tick'), 1);

  game.element('btn-pause').dispatch('click');
  assert.equal(game.run('manualPause'), false);
  assert.equal(game.element('btn-pause').textContent, '⏸');
  game.frame(5001);
  assert.equal(game.run('tick'), 1);
  game.frame(5001 + 1000 / 60);
  assert.equal(game.run('tick'), 2);
});

