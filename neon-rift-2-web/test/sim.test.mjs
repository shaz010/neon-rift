import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY,
  createMatch,
  startRun,
  step,
  spawnEnemy,
  idleInput,
  mergeSave,
  forward,
} from '../sim.js';
import {
  commandBasis,
  cockpitFromYaw,
  commandFocus,
  shotPose,
  dot,
  COMMAND_UP,
  COCKPIT_UP,
} from '../cameraRig.js';

function flying() {
  const state = createMatch({}, 3);
  startRun(state);
  state.enemies = [];
  state.wave = 99;
  state.god = true;
  return state;
}

test('save key belongs to this web flight, not the other games', () => {
  assert.equal(SAVE_KEY, 'neonrift2web_flight');
  assert.notEqual(SAVE_KEY, 'neonrift2_save');
  assert.notEqual(SAVE_KEY, 'neonrift_save');
  assert.notEqual(SAVE_KEY, 'neonrift2web_salvage');
});

test('the guns stay dark until the right thumb is down', () => {
  const state = flying();
  spawnEnemy(state, 'bogey', 0, state.pos.z - 12);
  const input = idleInput();
  for (let i = 0; i < 40; i++) step(state, input, 0.05);
  assert.equal(state.bolts.filter((bolt) => bolt.player).length, 0);
});

test('holding fire shoots straight and the bolt does not chase', () => {
  const state = flying();
  const bogey = spawnEnemy(state, 'bogey', 0, state.pos.z - 16);
  const input = idleInput();
  input.fire = true;
  step(state, input, 0.05);
  const pulse = state.bolts.find((bolt) => bolt.player && bolt.kind === 'pulse');
  assert.ok(pulse);
  const vx = pulse.vx;
  const vz = pulse.vz;
  const nose = forward(state.yaw);
  assert.ok(Math.abs(pulse.vx - nose.x * 48) < 0.01);
  assert.ok(Math.abs(pulse.vz - nose.z * 48) < 0.01);
  bogey.x = 20;
  for (let i = 0; i < 5; i++) step(state, input, 0.05);
  const still = state.bolts.find((bolt) => bolt.id === pulse.id);
  if (still) {
    assert.equal(still.vx, vx);
    assert.equal(still.vz, vz);
  }
});

test('aim assist only nudges when the nose is already close', () => {
  const state = flying();
  state.enemies = [];
  spawnEnemy(state, 'bogey', 2.4, state.pos.z - 20);
  const input = idleInput();
  input.fire = true;
  const before = state.yaw;
  step(state, input, 0.05);
  assert.ok(state.yaw > before);
  assert.ok(state.yaw < 0.08);

  const wide = flying();
  spawnEnemy(wide, 'bogey', 18, wide.pos.z - 12);
  const yaw = wide.yaw;
  step(wide, input, 0.05);
  assert.ok(Math.abs(wide.yaw - yaw) < 0.001);
});

test('a torpedo is a separate slow shot', () => {
  const state = flying();
  const input = idleInput();
  input.torpedo = true;
  step(state, input, 0.05);
  const torpedo = state.bolts.find((bolt) => bolt.kind === 'torpedo');
  assert.ok(torpedo);
  assert.ok(Math.hypot(torpedo.vx, torpedo.vz) < 20);
  assert.equal(state.bolts.filter((bolt) => bolt.kind === 'torpedo').length, 1);
  input.torpedo = false;
  input.fire = true;
  step(state, input, 0.05);
  assert.equal(state.bolts.filter((bolt) => bolt.kind === 'torpedo').length, 1);
  assert.ok(state.cam);
  assert.equal(state.cam.kind, 'torpedo');
});

test('bandits disable and haul, bogeys come apart', () => {
  const state = flying();
  const bandit = spawnEnemy(state, 'bandit', state.pos.x, state.pos.z - 1.2);
  bandit.hull = 1;
  const input = idleInput();
  input.fire = true;
  let guard = 0;
  while (!bandit.disabled && guard < 40) {
    step(state, input, 0.05);
    guard += 1;
  }
  assert.equal(bandit.disabled, true);
  assert.equal(bandit.alive, true);
  state.pos.x = bandit.x;
  state.pos.z = bandit.z;
  step(state, idleInput(), 0.05);
  assert.equal(state.towedId, bandit.id);
  state.deliveries = 1;
  state.pos.x = state.freighter.x;
  state.pos.z = state.freighter.z;
  step(state, idleInput(), 0.05);
  assert.equal(state.deliveries, 2);
  assert.equal(state.stage, 'warden');
  assert.ok(state.enemies.some((enemy) => enemy.role === 'warden'));

  const bogey = flying();
  const foe = spawnEnemy(bogey, 'bogey', bogey.pos.x, bogey.pos.z - 1.2);
  foe.hull = 1;
  guard = 0;
  while (foe.alive && guard < 40) {
    step(bogey, input, 0.05);
    guard += 1;
  }
  assert.equal(foe.alive, false);
  assert.equal(bogey.kills, 1);
});

test('the ship never banks while it yaws', () => {
  const state = flying();
  const input = idleInput();
  input.moveX = 1;
  input.moveY = 1;
  input.aimX = 1;
  for (let i = 0; i < 40; i++) step(state, input, 0.05);
  assert.ok(Math.abs(state.yaw) > 0.2);
  assert.equal(state.roll, undefined);
});

test('command center ignores heading and the cockpit stays level', () => {
  const a = commandBasis();
  const b = commandBasis();
  assert.deepEqual(a, b);
  assert.ok(dot(a.y, COMMAND_UP) > 0.98);
  const left = commandFocus({ x: -6, z: 2, yaw: 1 }, 0.5);
  const right = commandFocus({ x: 6, z: -4, yaw: 2 }, 0.5);
  assert.equal(left.height, right.height);
  for (const yaw of [0, 0.7, 1.6, 3]) {
    const basis = cockpitFromYaw(yaw);
    assert.ok(Math.abs(basis.x[1]) < 0.05, `cockpit rolled at ${yaw}`);
    assert.ok(dot(basis.y, COCKPIT_UP) > 0.95);
  }
  const shot = shotPose({ x: 0, y: 0.5, z: 0 }, { x: 8, y: 0.5, z: -14 });
  assert.ok(Math.abs(shot.basis.x[1]) < 0.08);
});

test('medals remember a haul without touching another save', () => {
  const state = flying();
  state.deliveries = 1;
  state.bounty = 400;
  state.medalsEarned = ['HAULER'];
  const next = mergeSave({ medals: ['FIRST BLOOD'], bestBounty: 100, livery: 'ion' }, state);
  assert.deepEqual(next.medals.sort(), ['FIRST BLOOD', 'HAULER']);
  assert.equal(next.bestBounty, 400);
  assert.equal(next.livery, 'ion');
});
