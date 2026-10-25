/** Build 10's haul, flattened onto a level deck.
 * Left thumb thrusts, slides, and turns. Right thumb aims and fires.
 * Shots leave the nose and fly straight. A torpedo is a separate press.
 * The ship never banks, loops, or rolls. */

export const SAVE_KEY = 'neonrift2web_flight';
export const LIVERIES = ['factory', 'ion', 'ember', 'bone', 'venom', 'royal'];
export const CAPTURE_GOAL = 2;

export function defaultSave() {
  return {
    livery: 'factory',
    medals: [],
    bestBounty: 0,
    hauls: 0,
    wardens: 0,
    view: 'command',
  };
}

export function createMatch(save = {}, seed = 1) {
  return {
    phase: 'hangar',
    stage: 'haul',
    time: 0,
    seed: (seed >>> 0) || 1,
    god: false,
    yaw: 0,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, z: 0 },
    shield: 100,
    shieldMax: 100,
    hull: 100,
    hullMax: 100,
    regenWait: 0,
    hurt: 0,
    fireCool: 0,
    torpedoCool: 0,
    boost: 0,
    bounty: 0,
    kills: 0,
    deliveries: 0,
    streak: 0,
    bestStreak: 0,
    streakLeft: 0,
    died: false,
    cleared: false,
    wardenDown: false,
    wardenSpawned: false,
    towedId: null,
    freighter: { x: 16, z: -34 },
    nav: { x: 16, z: -34, label: 'FREIGHTER' },
    objective: 'DISABLE BANDITS  0/2',
    enemies: [],
    bolts: [],
    pickups: [],
    blasts: [],
    nextId: 1,
    spawned: 0,
    spawnTimer: 0.6,
    wave: 0,
    lockId: null,
    flash: 0,
    shake: 0,
    say: '',
    sayT: 0,
    buzz: [],
    fx: [],
    cam: null,
    camGap: 0,
    medalsEarned: [],
  };
}

export function startRun(state) {
  if (state.phase !== 'hangar') return;
  state.phase = 'run';
  state.stage = 'haul';
  state.pos.x = 0;
  state.pos.z = 6;
  state.yaw = 0;
  state.buzz.push('start');
  state.say = 'DISABLE BANDITS  0/2';
  state.sayT = 1.4;
}

export function forward(yaw) {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

export function step(state, input, dt) {
  const raw = Math.max(0, Math.min(1 / 20, dt || 0));
  input = input || idleInput();
  state.buzz = [];
  state.fx = [];
  state.say = '';
  if (state.cam) {
    state.cam.age += raw;
    state.cam.left -= raw;
    if (input.skip || state.cam.left <= 0) {
      state.cam = null;
      state.camGap = input.skip ? 0.45 : 0.2;
    }
  } else {
    state.camGap = Math.max(0, state.camGap - raw);
  }
  if (state.phase === 'run') {
    state.time += raw;
    fly(state, input, raw);
    fight(state, input, raw);
  }
  state.flash = Math.max(0, state.flash - raw * 1.5);
  state.shake = Math.max(0, state.shake - raw * 1.6);
  state.sayT = Math.max(0, state.sayT - raw);
  for (const blast of state.blasts) blast.age += raw;
  state.blasts = state.blasts.filter((blast) => blast.age < blast.life);
  refreshNav(state);
  return state;
}

export function idleInput() {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    fire: false,
    torpedo: false,
    boost: false,
    skip: false,
  };
}

export function spawnEnemy(state, role, x, z) {
  const hull = role === 'warden' ? 260 : role === 'bogey' ? 52 : 40;
  const enemy = {
    id: state.nextId++,
    role,
    x,
    z,
    yaw: 0,
    vx: 0,
    vz: 0,
    hull,
    hullMax: hull,
    alive: true,
    disabled: false,
    cool: role === 'warden' ? 1.3 : 1.1,
    windup: 0,
    windupDir: { x: 0, z: 1 },
    radius: role === 'warden' ? 3.2 : 1.45,
  };
  state.enemies.push(enemy);
  return enemy;
}

function fly(state, input, dt) {
  const mx = clamp(input.moveX || 0, -1, 1);
  const my = clamp(input.moveY || 0, -1, 1);
  const ax = clamp(input.aimX || 0, -1, 1);
  if (input.boost && state.boost <= 0 && state.phase === 'run' && !state.died) {
    state.boost = 1.35;
    state.buzz.push('dash');
    state.fx.push({ text: 'BOOST', x: state.pos.x, z: state.pos.z });
  }
  if (state.boost > 0) state.boost -= dt;
  const yawFromLeft = mx * 0.4;
  let yawCmd = clamp(yawFromLeft + ax * 0.92, -1, 1);
  const shaped = yawCmd * (0.62 + 0.38 * Math.abs(yawCmd));
  state.yaw += shaped * 2.7 * dt;
  if (input.fire && !state.died) {
    const aim = aimEnemy(state);
    if (aim) {
      const err = yawError(state.yaw, state.pos, aim);
      if (Math.abs(err) < 0.28) state.yaw += err * Math.min(1, 1.8 * dt);
    }
  }
  const fwd = forward(state.yaw);
  const right = { x: fwd.z, z: -fwd.x };
  const boosting = state.boost > 0;
  const thrust = (my >= 0 ? my : my * 0.55) * (boosting ? 46 : 26) * (state.towedId ? 0.72 : 1);
  const strafe = mx * 12;
  state.vel.x += (fwd.x * thrust + right.x * strafe) * dt;
  state.vel.z += (fwd.z * thrust + right.z * strafe) * dt;
  const idle = Math.hypot(mx, my) < 0.08 && Math.abs(ax) < 0.08;
  const drag = idle ? 1.6 : 0.55;
  state.vel.x -= state.vel.x * drag * dt;
  state.vel.z -= state.vel.z * drag * dt;
  const cap = boosting ? 34 : state.towedId ? 16 : 22;
  const speed = Math.hypot(state.vel.x, state.vel.z);
  if (speed > cap) {
    state.vel.x *= cap / speed;
    state.vel.z *= cap / speed;
  }
  state.pos.x += state.vel.x * dt;
  state.pos.z += state.vel.z * dt;
  const lim = 78;
  if (Math.abs(state.pos.x) > lim) {
    state.pos.x = clamp(state.pos.x, -lim, lim);
    state.vel.x *= 0.4;
  }
  if (state.pos.z > 28) {
    state.pos.z = 28;
    state.vel.z *= 0.4;
  }
  if (state.pos.z < -86) {
    state.pos.z = -86;
    state.vel.z *= 0.4;
  }
  if (state.towedId) {
    const towed = state.enemies.find((enemy) => enemy.id === state.towedId);
    if (towed) {
      towed.x = state.pos.x - fwd.x * 3.1;
      towed.z = state.pos.z - fwd.z * 3.1;
      towed.yaw = state.yaw;
      towed.vx = state.vel.x;
      towed.vz = state.vel.z;
    } else state.towedId = null;
  }
}

function fight(state, input, dt) {
  if (state.died) return;
  state.hurt = Math.max(0, state.hurt - dt);
  state.torpedoCool = Math.max(0, state.torpedoCool - dt);
  state.streakLeft = Math.max(0, state.streakLeft - dt);
  if (state.streakLeft <= 0) state.streak = 0;
  if (state.regenWait > 0) state.regenWait -= dt;
  else if (state.shield < state.shieldMax) state.shield = Math.min(state.shieldMax, state.shield + 14 * dt);

  state.lockId = null;
  const locked = aimEnemy(state);
  if (locked) {
    const err = Math.abs(yawError(state.yaw, state.pos, locked));
    if (err < 0.22) state.lockId = locked.id;
  }

  if (input.fire) {
    state.fireCool -= dt;
    if (state.fireCool <= 0) {
      state.fireCool = 0.14;
      launchPulse(state);
    }
  } else {
    state.fireCool = Math.min(state.fireCool, 0.04);
  }
  if (input.torpedo && state.torpedoCool <= 0) launchTorpedo(state);

  updateEnemies(state, dt);
  updateBolts(state, dt);
  collide(state);
  expireBolts(state);
  updatePickups(state, dt);
  tryHitch(state);
  tryDeliver(state);
  spawnWave(state, dt);
  if (state.hull <= 0 && !state.god) lose(state);
}

function launchPulse(state) {
  const fwd = forward(state.yaw);
  const side = { x: fwd.z, z: -fwd.x };
  for (const offset of [-0.35, 0.35]) {
    spawnBolt(state, {
      x: state.pos.x + fwd.x * 1.3 + side.x * offset,
      z: state.pos.z + fwd.z * 1.3 + side.z * offset,
      vx: fwd.x * 48,
      vz: fwd.z * 48,
      life: 1.05,
      player: true,
      damage: 9,
      radius: 0.32,
      blast: false,
      kind: 'pulse',
    });
  }
  state.buzz.push('pulse');
  state.flash = Math.max(state.flash, 0.08);
}

function launchTorpedo(state) {
  const fwd = forward(state.yaw);
  const bolt = spawnBolt(state, {
    x: state.pos.x + fwd.x * 1.6,
    z: state.pos.z + fwd.z * 1.6,
    vx: fwd.x * 15,
    vz: fwd.z * 15,
    life: 2.4,
    player: true,
    damage: 36,
    radius: 0.6,
    blast: true,
    kind: 'torpedo',
  });
  state.torpedoCool = 2.4;
  state.buzz.push('torpedo');
  requestCam(state, state.pos, {
    x: state.pos.x + fwd.x * 16,
    z: state.pos.z + fwd.z * 16,
  }, 'torpedo', bolt.id);
}

function spawnBolt(state, spec) {
  const bolt = { id: state.nextId++, grazed: false, ...spec };
  state.bolts.push(bolt);
  if (state.bolts.length > 70) state.bolts.splice(0, state.bolts.length - 70);
  return bolt;
}

function updateBolts(state, dt) {
  for (const bolt of state.bolts) {
    if (bolt.dead) continue;
    bolt.px = bolt.x;
    bolt.pz = bolt.z;
    bolt.life -= dt;
    bolt.x += bolt.vx * dt;
    bolt.z += bolt.vz * dt;
  }
}

function closestOnSegment(x0, z0, x1, z1, cx, cz) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-8) return { x: x1, z: z1, dist: Math.hypot(x1 - cx, z1 - cz) };
  const t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cz - z0) * dz) / len2));
  const x = x0 + dx * t;
  const z = z0 + dz * t;
  return { x, z, dist: Math.hypot(x - cx, z - cz) };
}

function collide(state) {
  for (const bolt of state.bolts) {
    if (bolt.dead) continue;
    const x0 = bolt.px ?? bolt.x;
    const z0 = bolt.pz ?? bolt.z;
    if (bolt.player) {
      let hit = null;
      for (const enemy of state.enemies) {
        if (!enemy.alive || enemy.disabled || enemy.id === state.towedId) continue;
        const point = closestOnSegment(x0, z0, bolt.x, bolt.z, enemy.x, enemy.z);
        if (point.dist >= bolt.radius + enemy.radius) continue;
        if (!hit || point.dist < hit.point.dist) hit = { enemy, point };
      }
      if (!hit) continue;
      bolt.x = hit.point.x;
      bolt.z = hit.point.z;
      if (bolt.blast) detonate(state, bolt, hit.enemy);
      else {
        hurtEnemy(state, hit.enemy, bolt.damage, false);
        bolt.dead = true;
      }
    } else {
      const point = closestOnSegment(x0, z0, bolt.x, bolt.z, state.pos.x, state.pos.z);
      if (point.dist < bolt.radius + 1.15) {
        bolt.x = point.x;
        bolt.z = point.z;
        hurtPlayer(state, bolt.damage);
        bolt.dead = true;
      }
    }
  }
}

function expireBolts(state) {
  for (const bolt of state.bolts) {
    if (bolt.dead) continue;
    const expired = bolt.life <= 0;
    const out = expired || Math.abs(bolt.x) > 120 || bolt.z > 40 || bolt.z < -120;
    if (out && bolt.blast && bolt.player && expired) detonate(state, bolt);
    if (out) bolt.dead = true;
  }
  state.bolts = state.bolts.filter((bolt) => !bolt.dead);
}

function hurtEnemy(state, enemy, damage, fromBlast) {
  if (!enemy.alive || enemy.disabled) return false;
  enemy.hull -= damage;
  if (!fromBlast) {
    state.buzz.push('impact');
    state.shake = Math.max(state.shake, 0.35);
  }
  if (enemy.hull > 0) return false;
  if (enemy.role === 'bandit') {
    enemy.disabled = true;
    enemy.hull = 0;
    enemy.windup = 0;
    state.bounty += 120;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.streakLeft = 4;
    state.fx.push({ text: 'DISABLED', x: enemy.x, z: enemy.z });
    state.say = 'FLY INTO IT';
    state.sayT = 1.1;
    state.buzz.push('bolt');
    dropPickup(state, enemy.x + 2.2, enemy.z - 1.4, 'shield');
    requestCam(state, state.pos, enemy, 'kill', 0);
    return 'disabled';
  }
  enemy.alive = false;
  const warden = enemy.role === 'warden';
  const points = warden ? 800 : 220;
  state.bounty += points;
  state.kills += 1;
  state.streak += 1;
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  state.streakLeft = 4;
  state.fx.push({ text: warden ? 'WARDEN DOWN' : 'BOGEY DOWN', x: enemy.x, z: enemy.z });
  state.buzz.push(fromBlast ? 'blast' : 'impact');
  state.shake = Math.max(state.shake, warden ? 1 : 0.7);
  addBlast(state, enemy.x, enemy.z, warden ? 6 : 2.4, true);
  if (!fromBlast) dropPickup(state, enemy.x - 2, enemy.z + 1.5, 'shield');
  requestCam(state, state.pos, enemy, 'kill', 0);
  if (warden) {
    state.wardenDown = true;
    state.cleared = true;
    finish(state);
  }
  return 'killed';
}

function detonate(state, bolt, direct) {
  if (bolt.dead) return;
  bolt.dead = true;
  const radius = 5.4;
  let announced = false;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.disabled) continue;
    const dist = Math.hypot(bolt.x - enemy.x, bolt.z - enemy.z);
    const touch = direct && enemy === direct;
    if (touch || dist < radius) {
      const falloff = touch ? 1 : Math.max(0.4, 1 - dist / radius);
      const killed = hurtEnemy(state, enemy, (bolt.damage + 22) * falloff, true);
      if (killed === 'killed' && !announced && enemy.role !== 'warden') {
        announced = true;
        state.fx.push({ text: 'SLOW KILL', x: bolt.x, z: bolt.z });
      }
    }
  }
  for (const other of state.bolts) {
    if (other.player || other.dead) continue;
    if (Math.hypot(other.x - bolt.x, other.z - bolt.z) <= radius) other.dead = true;
  }
  addBlast(state, bolt.x, bolt.z, radius, true);
  state.shake = 1;
  state.flash = Math.max(state.flash, 0.65);
  state.buzz.push('blast');
  if (state.cam && state.cam.boltId === bolt.id) {
    state.cam.left = Math.max(0.28, Math.min(state.cam.left, 0.4));
    state.cam.to = { x: bolt.x, z: bolt.z };
  }
}

function addBlast(state, x, z, radius, heavy) {
  state.blasts.push({
    id: state.nextId++,
    x,
    z,
    age: 0,
    life: heavy ? 0.46 : 0.28,
    radius,
    heavy: !!heavy,
  });
}

function hurtPlayer(state, amount) {
  if (state.god || state.hurt > 0 || state.died || state.phase !== 'run') return;
  state.hurt = 0.7;
  state.regenWait = 2.1;
  let left = amount;
  if (state.shield > 0) {
    const used = Math.min(state.shield, left);
    state.shield -= used;
    left -= used;
  }
  if (left > 0) state.hull -= left;
  state.flash = 0.85;
  state.shake = Math.max(state.shake, 0.8);
  state.buzz.push('hurt');
  if (state.hull <= 0) {
    state.hull = 0;
    lose(state);
  }
}

function lose(state) {
  if (state.died || state.phase === 'results') return;
  state.died = true;
  state.hull = 0;
  addBlast(state, state.pos.x, state.pos.z, 4, true);
  finish(state);
}

function finish(state) {
  if (state.phase === 'results') return;
  state.phase = 'results';
  state.cam = null;
  const earned = [];
  if (state.kills > 0 || state.deliveries > 0) earned.push('FIRST BLOOD');
  if (state.deliveries > 0) earned.push('HAULER');
  if (state.wardenDown) earned.push('WARDEN');
  state.medalsEarned = earned;
  state.buzz.push(state.cleared ? 'win' : 'die');
}

export function mergeSave(previous, state) {
  const prev = previous || defaultSave();
  const medals = Array.from(new Set([...(prev.medals || []), ...(state.medalsEarned || [])]));
  return {
    ...prev,
    medals,
    bestBounty: Math.max(prev.bestBounty || 0, state.bounty || 0),
    hauls: (prev.hauls || 0) + (state.deliveries || 0),
    wardens: (prev.wardens || 0) + (state.wardenDown ? 1 : 0),
  };
}

function updateEnemies(state, dt) {
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.disabled || enemy.id === state.towedId) continue;
    enemy.cool -= dt;
    if (enemy.windup > 0) {
      enemy.windup -= dt;
      if (enemy.windup <= 0) releaseShot(state, enemy);
    } else if (enemy.cool <= 0) {
      const to = norm2(state.pos.x - enemy.x, state.pos.z - enemy.z);
      enemy.windupDir = to;
      enemy.windup = enemy.role === 'warden' ? 0.62 : 0.4;
      enemy.cool = enemy.role === 'warden' ? 1.7 : 1.45;
    }
    if (enemy.role === 'warden') {
      const desiredZ = state.pos.z - 18;
      enemy.vz += ((desiredZ - enemy.z) * 0.4 - enemy.vz) * Math.min(1, dt * 2);
      enemy.vx += (Math.sin(state.time * 0.6) * 4 - enemy.vx) * Math.min(1, dt * 2);
    } else {
      const to = norm2(state.pos.x - enemy.x, state.pos.z - enemy.z);
      const dist = Math.hypot(state.pos.x - enemy.x, state.pos.z - enemy.z);
      const speed = dist > 16 ? 9 : 4;
      const side = { x: -to.z, z: to.x };
      const sway = Math.sin(state.time * 0.8 + enemy.id) * 3;
      enemy.vx += (to.x * speed + side.x * sway - enemy.vx) * Math.min(1, dt * 1.4);
      enemy.vz += (to.z * speed + side.z * sway - enemy.vz) * Math.min(1, dt * 1.4);
    }
    enemy.x += enemy.vx * dt;
    enemy.z += enemy.vz * dt;
    const face = norm2(enemy.vx, enemy.vz);
    if (Math.hypot(enemy.vx, enemy.vz) > 0.4) enemy.yaw = Math.atan2(face.x, -face.z);
  }
  state.enemies = state.enemies.filter((enemy) => enemy.alive);
}

function releaseShot(state, enemy) {
  const dir = enemy.windupDir;
  const count = enemy.role === 'warden' ? 3 : 1;
  for (let i = 0; i < count; i++) {
    const along = count === 1 ? 0 : i - (count - 1) / 2;
    const side = { x: -dir.z, z: dir.x };
    const d = norm2(dir.x + side.x * along * 0.18, dir.z + side.z * along * 0.18);
    const speed = enemy.role === 'warden' ? 12 : 13;
    spawnBolt(state, {
      x: enemy.x + d.x * (enemy.radius + 0.4),
      z: enemy.z + d.z * (enemy.radius + 0.4),
      vx: d.x * speed,
      vz: d.z * speed,
      life: 3.2,
      player: false,
      damage: enemy.role === 'warden' ? 16 : 12,
      radius: 0.5,
      blast: false,
      kind: 'enemy',
    });
  }
}

function tryHitch(state) {
  if (state.towedId || state.stage !== 'haul') return;
  let best = null;
  let bestDist = 3.3;
  for (const enemy of state.enemies) {
    if (!enemy.disabled) continue;
    const dist = Math.hypot(enemy.x - state.pos.x, enemy.z - state.pos.z);
    if (dist < bestDist) {
      best = enemy;
      bestDist = dist;
    }
  }
  if (!best) return;
  state.towedId = best.id;
  state.say = 'HAUL TO THE FREIGHTER';
  state.sayT = 1.2;
  state.fx.push({ text: 'HITCHED', x: state.pos.x, z: state.pos.z });
  state.buzz.push('bolt');
}

function tryDeliver(state) {
  if (!state.towedId) return;
  const dist = Math.hypot(state.pos.x - state.freighter.x, state.pos.z - state.freighter.z);
  if (dist > 8) return;
  state.enemies = state.enemies.filter((enemy) => enemy.id !== state.towedId);
  state.towedId = null;
  state.deliveries += 1;
  state.bounty += 400;
  state.fx.push({ text: 'DELIVERED', x: state.freighter.x, z: state.freighter.z });
  state.buzz.push('card');
  state.say = `DELIVERED  ${state.deliveries}/${CAPTURE_GOAL}`;
  state.sayT = 1.3;
  if (state.deliveries >= CAPTURE_GOAL && !state.wardenSpawned) {
    state.wardenSpawned = true;
    state.stage = 'warden';
    const fwd = forward(state.yaw);
    spawnEnemy(state, 'warden', state.pos.x + fwd.x * 22, state.pos.z + fwd.z * 22);
    state.say = 'RIFT WARDEN';
    state.sayT = 1.6;
    state.fx.push({ text: 'RIFT WARDEN', x: state.pos.x, z: state.pos.z });
    state.buzz.push('boss');
  }
}

function spawnWave(state, dt) {
  if (state.stage !== 'haul') return;
  const times = [0.4, 3.2, 6.5, 10, 14, 18];
  if (state.wave >= times.length) return;
  state.spawnTimer -= dt;
  if (state.time < times[state.wave]) return;
  const role = state.wave % 3 === 2 ? 'bogey' : 'bandit';
  const side = state.wave % 2 === 0 ? -1 : 1;
  const fwd = forward(state.yaw);
  const x = state.pos.x + fwd.x * 26 + side * (8 + (state.wave % 3) * 3);
  const z = state.pos.z + fwd.z * 26;
  spawnEnemy(state, role, x, z);
  state.wave += 1;
  state.spawned += 1;
}

function dropPickup(state, x, z, kind) {
  state.pickups.push({ id: state.nextId++, kind, x, z, alive: true });
  if (state.pickups.length > 5) state.pickups.shift();
}

function updatePickups(state, dt) {
  const keep = [];
  for (const pickup of state.pickups) {
    const dx = state.pos.x - pickup.x;
    const dz = state.pos.z - pickup.z;
    const reach = Math.hypot(dx, dz);
    if (reach < 14 && reach > 0.2) {
      const pull = Math.min(reach, (16 - reach) * 1.4 * dt + 6 * dt);
      pickup.x += (dx / reach) * pull;
      pickup.z += (dz / reach) * pull;
    }
    if (reach < 2.1) {
      state.shield = state.shieldMax;
      state.fx.push({ text: 'SHIELD', x: state.pos.x, z: state.pos.z });
      state.buzz.push('card');
    } else keep.push(pickup);
  }
  state.pickups = keep;
}

function refreshNav(state) {
  if (state.towedId) {
    state.nav = { x: state.freighter.x, z: state.freighter.z, label: 'FREIGHTER' };
    state.objective = 'HAUL TO THE FREIGHTER';
    return;
  }
  if (state.stage === 'warden') {
    const warden = state.enemies.find((enemy) => enemy.role === 'warden' && enemy.alive);
    state.nav = warden
      ? { x: warden.x, z: warden.z, label: 'WARDEN' }
      : { x: state.pos.x, z: state.pos.z, label: '' };
    state.objective = 'STOP THE RIFT WARDEN';
    return;
  }
  const bandit = state.enemies.find((enemy) => enemy.alive && !enemy.disabled && enemy.role === 'bandit');
  if (bandit) {
    state.nav = { x: bandit.x, z: bandit.z, label: 'BANDIT' };
  } else {
    const drifting = state.enemies.find((enemy) => enemy.disabled);
    state.nav = drifting
      ? { x: drifting.x, z: drifting.z, label: 'HITCH' }
      : { x: state.freighter.x, z: state.freighter.z, label: 'FREIGHTER' };
  }
  state.objective = `DISABLE BANDITS  ${state.deliveries}/${CAPTURE_GOAL}`;
}

function aimEnemy(state) {
  const fwd = forward(state.yaw);
  let best = null;
  let bestErr = 0.34;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.disabled || enemy.id === state.towedId) continue;
    const err = Math.abs(yawError(state.yaw, state.pos, enemy));
    const dist = Math.hypot(enemy.x - state.pos.x, enemy.z - state.pos.z);
    if (dist < 42 && err < bestErr) {
      best = enemy;
      bestErr = err;
    }
  }
  if (!best) return null;
  const along = (best.x - state.pos.x) * fwd.x + (best.z - state.pos.z) * fwd.z;
  return along > 1 ? best : null;
}

function yawError(yaw, from, target) {
  const want = Math.atan2(target.x - from.x, -(target.z - from.z));
  let err = want - yaw;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  return err;
}

function requestCam(state, from, to, kind, boltId) {
  if (state.phase !== 'run') return;
  if (state.cam || state.camGap > 0) return;
  state.cam = {
    age: 0,
    left: kind === 'torpedo' ? 1.05 : 0.62,
    kind,
    from: { x: from.x, y: 0.6, z: from.z },
    to: { x: to.x, y: 0.6, z: to.z },
    boltId,
  };
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function norm2(x, z) {
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: -1 };
  return { x: x / len, z: z / len };
}
