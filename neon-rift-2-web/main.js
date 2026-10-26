import * as THREE from './vendor/three.module.min.js?v=20261026c';
import {
  SAVE_KEY,
  LIVERIES,
  WEAPONS,
  BUILD_LABEL,
  defaultSave,
  createMatch,
  startRun,
  mergeSave,
  step,
} from './sim.js?v=20261026c';
import {
  commandBasis,
  commandFocus,
  cockpitFromYaw,
  cockpitEye,
  rangePose,
  shotPose,
  basisLooking,
} from './cameraRig.js?v=20261026c';
import { createAudio, vibrate } from './audio.js?v=20261026c';

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);
const debugOn = params.has('debug');
const simple = !params.has('full');
const audio = createAudio();
const PAINT = {
  factory: 0x9aa3ad,
  ion: 0x3ec0f2,
  ember: 0xf26b29,
  bone: 0xe6e0cc,
  venom: 0x59d961,
  royal: 0x9452e6,
};
const PAINT_NAME = {
  factory: 'FACTORY',
  ion: 'ION',
  ember: 'EMBER',
  bone: 'BONE',
  venom: 'VENOM',
  royal: 'ROYAL',
};

const ui = {
  speed: $('speed'),
  objective: $('objective'),
  shield: $('shield').firstElementChild,
  hull: $('hull').firstElementChild,
  viewName: $('viewName'),
  banner: $('banner'),
  flash: $('flash'),
  coach: $('coach'),
  torpedo: $('torpedo'),
  weaponName: $('weaponName'),
  charge: $('charge'),
  streak: $('streak'),
  grain: $('grain'),
  stickL: $('stickL'),
  stickR: $('stickR'),
  popups: $('popups'),
  debug: $('debug'),
  touch: $('touch'),
  nav: $('nav'),
  lock: $('lock'),
  paintName: $('paintName'),
  paints: $('paints'),
  bestLine: $('bestLine'),
  resultTitle: $('resultTitle'),
  resultStats: $('resultStats'),
  resultScar: $('resultScar'),
};

function loadSave() {
  const save = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) Object.assign(save, JSON.parse(raw));
  } catch { /* private mode */ }
  if (!LIVERIES.includes(save.livery)) save.livery = 'factory';
  save.view = save.view === 'cockpit' ? 'cockpit' : 'command';
  if (!Array.isArray(save.medals)) save.medals = [];
  return save;
}
function writeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* ignore */ }
}

let save = loadSave();
let viewMode = 'command';
let state = createMatch(save, (Math.random() * 1e9) >>> 0, { simple });
document.body.dataset.simple = simple ? '1' : '0';
$('build').textContent = BUILD_LABEL;
let savedResult = false;
const audioBus = audio;

const renderer = new THREE.WebGLRenderer({
  canvas: $('view'),
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
if (!renderer.getContext()) {
  $('fatal').style.display = 'flex';
  throw new Error('webgl');
}
renderer.setClearColor(0x05030a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 700);
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0x140818, 0.28));
const sun = new THREE.DirectionalLight(0xfff4dd, 1.15);
sun.position.set(18, 36, 12);
scene.add(sun);
const rimMagenta = new THREE.DirectionalLight(0xff2bd6, 1.55);
rimMagenta.position.set(-22, 10, 16);
scene.add(rimMagenta);
const rimCyan = new THREE.DirectionalLight(0x22f0ff, 0.85);
rimCyan.position.set(16, 8, -22);
scene.add(rimCyan);

const vx = new THREE.Vector3();
const vy = new THREE.Vector3();
const vz = new THREE.Vector3();
const basisMatrix = new THREE.Matrix4();
const projectV = new THREE.Vector3();
const xAxis = new THREE.Vector3();
const yAxis = new THREE.Vector3();
const hangarQ = new THREE.Quaternion();

function applyBasis(obj, basis) {
  basisMatrix.makeBasis(
    vx.set(basis.x[0], basis.x[1], basis.x[2]),
    vy.set(basis.y[0], basis.y[1], basis.y[2]),
    vz.set(basis.z[0], basis.z[1], basis.z[2]),
  );
  obj.quaternion.setFromRotationMatrix(basisMatrix);
}

const hullMat = new THREE.MeshStandardMaterial({
  color: PAINT[save.livery],
  metalness: 0.72,
  roughness: 0.28,
  emissive: 0x2a1040,
  emissiveIntensity: 0.55,
});
const darkMat = new THREE.MeshStandardMaterial({
  color: 0x2a3340,
  metalness: 0.7,
  roughness: 0.38,
  emissive: 0x0c181c,
  emissiveIntensity: 0.2,
});
const glowMat = new THREE.MeshBasicMaterial({ color: 0x8ef6ff });

function paintShip() {
  hullMat.color.set(PAINT[save.livery] || PAINT.factory);
  ui.paintName.textContent = PAINT_NAME[save.livery] || 'FACTORY';
  for (const button of ui.paints.querySelectorAll('button')) {
    button.classList.toggle('on', button.dataset.livery === save.livery);
  }
}

function shipMesh() {
  const g = new THREE.Group();
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.8, 4), hullMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -1.2;
  g.add(nose);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.26, 1.5), hullMat);
  body.position.z = 0.15;
  g.add(body);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 0.72), darkMat);
  wing.position.z = 0.25;
  g.add(wing);
  const canopyMat = simple
    ? new THREE.MeshStandardMaterial({ color: 0x1a1020, metalness: 0.4, roughness: 0.35, emissive: 0x2a1030, emissiveIntensity: 0.3 })
    : glowMat;
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), canopyMat);
  canopy.scale.y = 0.5;
  canopy.position.set(0, 0.2, -0.2);
  g.add(canopy);
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.85, 8), darkMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(0.42 * side, -0.02, 0.85);
    g.add(nacelle);
    if (!simple) {
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMat);
      flame.position.set(0.42 * side, -0.02, 1.32);
      g.add(flame);
    }
  }
  return g;
}

const player = new THREE.Group();
player.add(shipMesh());
const deckRing = new THREE.Mesh(
  new THREE.RingGeometry(1.15, 1.45, 28),
  new THREE.MeshBasicMaterial({ color: 0x7af6ff, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
);
const shell = new THREE.Mesh(
  new THREE.SphereGeometry(1.9, 18, 12),
  new THREE.MeshBasicMaterial({
    color: 0x7af6ff,
    transparent: true,
    opacity: 0.12,
    side: THREE.BackSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }),
);
player.add(shell);
deckRing.rotation.x = -Math.PI / 2;
deckRing.position.y = 0.06;
player.add(deckRing);
if (simple) {
  shell.visible = false;
  deckRing.visible = false;
}
scene.add(player);
const shafts = [];

function buildWorld() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 160),
    new THREE.MeshStandardMaterial({ color: 0x07060e, metalness: 0.4, roughness: 0.78, emissive: 0x05020a, emissiveIntensity: 0.4 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.05, -20);
  scene.add(floor);
  const lines = [];
  for (let x = -80; x <= 80; x += 4) lines.push(x, 0.02, -90, x, 0.02, 30);
  for (let z = -90; z <= 30; z += 4) lines.push(-80, 0.02, z, 80, 0.02, z);
  scene.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)),
    new THREE.LineBasicMaterial({ color: 0x1a6e88, transparent: true, opacity: 0.45 }),
  ));
  const stars = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    stars[i * 3] = (Math.random() - 0.5) * 240;
    stars[i * 3 + 1] = 8 + Math.random() * 60;
    stars[i * 3 + 2] = -40 - Math.random() * 200;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xe4eef8, size: 0.45 })));
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(9, 20, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4 }),
  );
  sunDisc.position.set(36, 48, -28);
  scene.add(sunDisc);
  const nebula = document.createElement('canvas');
  nebula.width = 512;
  nebula.height = 256;
  const paint = nebula.getContext('2d');
  paint.fillStyle = '#05030a';
  paint.fillRect(0, 0, 512, 256);
  for (const [color, x, y, radius] of [
    ['#3a0848', 90, 50, 150],
    ['#ff2bd6', 310, 70, 80],
    ['#102848', 180, 160, 170],
    ['#6a3cff', 430, 140, 110],
    ['#06323a', 40, 190, 120],
  ]) {
    const grad = paint.createRadialGradient(x, y, 8, x, y, radius);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    paint.fillStyle = grad;
    paint.beginPath();
    paint.arc(x, y, radius, 0, Math.PI * 2);
    paint.fill();
  }
  const skyMap = new THREE.CanvasTexture(nebula);
  skyMap.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(260, 20, 14),
    new THREE.MeshBasicMaterial({ map: skyMap, side: THREE.BackSide, depthWrite: false }),
  ));
  const haze = new THREE.Mesh(
    new THREE.CircleGeometry(96, 24),
    new THREE.MeshBasicMaterial({
      color: 0x2a1460,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  haze.rotation.x = -Math.PI / 2;
  haze.position.y = 7;
  scene.add(haze);
  for (const spec of [
    { x: -18, z: -12, color: 0xff2bd6, rot: 0.35 },
    { x: 26, z: -40, color: 0x22e7ff, rot: -0.25 },
    { x: 4, z: 10, color: 0x7a4bff, rot: 0.05 },
  ]) {
    const shaft = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 78),
      new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: 0.055,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    shaft.position.set(spec.x, 30, spec.z);
    shaft.rotation.set(0.2, spec.rot, 0);
    shaft.userData.shaft = true;
    scene.add(shaft);
    shafts.push(shaft);
  }
  const freighter = new THREE.Group();
  freighter.name = 'freighter';
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 11), new THREE.MeshStandardMaterial({
    color: 0xc5d0da, metalness: 0.55, roughness: 0.4, emissive: 0x123040, emissiveIntensity: 0.25,
  }));
  freighter.add(hull);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 2.4), darkMat);
  bridge.position.set(0, 0.8, -2.4);
  freighter.add(bridge);
  freighter.position.set(state.freighter.x, 0.6, state.freighter.z);
  scene.add(freighter);
  const pad = new THREE.Mesh(
    new THREE.RingGeometry(4.2, 4.7, 28),
    new THREE.MeshBasicMaterial({ color: 0x7af0ff, side: THREE.DoubleSide }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(state.freighter.x, 0.04, state.freighter.z);
  pad.name = 'pad';
  scene.add(pad);
  if (simple) {
    freighter.visible = false;
    pad.visible = false;
  }
}
buildWorld();

const sparkMax = 96;
const sparkPos = new Float32Array(sparkMax * 3);
const sparkCol = new Float32Array(sparkMax * 3);
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparkPoints = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
  size: 0.42,
  vertexColors: true,
  transparent: true,
  opacity: 0.95,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
}));
scene.add(sparkPoints);

const arcMax = 8;
const arcPos = new Float32Array(arcMax * 2 * 3);
const arcGeo = new THREE.BufferGeometry();
arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
const arcLines = new THREE.LineSegments(arcGeo, new THREE.LineBasicMaterial({
  color: 0xc46bff,
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
}));
scene.add(arcLines);

const speedLines = new THREE.Group();
for (let i = 0; i < 8; i++) {
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.05, 2.2),
    new THREE.MeshBasicMaterial({
      color: 0x9ff6ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  speedLines.add(line);
}
scene.add(speedLines);

const grainCtx = ui.grain.getContext('2d');
ui.grain.width = 128;
ui.grain.height = 128;
const grainPixels = grainCtx.createImageData(128, 128);
for (let i = 0; i < grainPixels.data.length; i += 4) {
  const n = 90 + Math.random() * 80;
  grainPixels.data[i] = n;
  grainPixels.data[i + 1] = n;
  grainPixels.data[i + 2] = n;
  grainPixels.data[i + 3] = 50;
}
grainCtx.putImageData(grainPixels, 0, 0);

let quality = reduceMotion ? 'low' : 'high';
let slowFrames = 0;
document.body.dataset.quality = quality;

const foeMat = {
  bandit: new THREE.MeshStandardMaterial({ color: 0x3a2412, emissive: 0xffb03a, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.4 }),
  bogey: new THREE.MeshStandardMaterial({ color: 0x3a1010, emissive: 0xff3a2a, emissiveIntensity: 0.75, metalness: 0.4, roughness: 0.4 }),
  warden: new THREE.MeshStandardMaterial({ color: 0x240808, emissive: 0xff2418, emissiveIntensity: 0.85, metalness: 0.5, roughness: 0.32 }),
};
const disabledMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3a, emissive: 0xffd27a, emissiveIntensity: 0.2, metalness: 0.3, roughness: 0.6 });
const pulseMat = new THREE.MeshBasicMaterial({ color: 0xd7fbff });
const torpedoMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
const enemyShotMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
const telegraphMat = new THREE.MeshBasicMaterial({ color: 0xff5a32, transparent: true, opacity: 0.28 });
const blastMat = new THREE.MeshBasicMaterial({ color: 0xffe1a8, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
const pickupMat = new THREE.MeshBasicMaterial({ color: 0x9ff0c8 });

const entities = new Map();

function foeVisual(enemy) {
  const g = new THREE.Group();
  const mat = enemy.role === 'warden' ? foeMat.warden : enemy.role === 'bogey' ? foeMat.bogey : foeMat.bandit;
  const body = enemy.role === 'warden'
    ? new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 7.4), mat)
    : new THREE.Mesh(new THREE.ConeGeometry(enemy.role === 'bogey' ? 1.15 : 1.35, 3.1, 4), mat);
  if (enemy.role !== 'warden') body.rotation.x = Math.PI / 2;
  g.add(body);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0xff5a45 }));
  bar.position.y = enemy.role === 'warden' ? 1.3 : 0.9;
  g.add(bar);
  const tele = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 6), telegraphMat);
  tele.visible = false;
  g.add(tele);
  g.userData = { bar, tele, body, role: enemy.role };
  scene.add(g);
  return g;
}

function syncFoe(mesh, enemy) {
  mesh.rotation.set(0, -enemy.yaw, 0);
  const frac = enemy.disabled ? 0 : Math.max(0.05, enemy.hull / enemy.hullMax);
  mesh.userData.bar.scale.x = frac;
  mesh.userData.bar.visible = !enemy.disabled;
  if (enemy.disabled && mesh.userData.body.material !== disabledMat) mesh.userData.body.material = disabledMat;
  const tele = mesh.userData.tele;
  tele.visible = enemy.windup > 0;
  if (enemy.windup > 0) {
    tele.position.set(enemy.windupDir.x * 3, 0.3, enemy.windupDir.z * 3);
    applyBasis(tele, basisLooking([-enemy.windupDir.x, 0, -enemy.windupDir.z], [0, 1, 0]));
  }
}

function syncGroup(list, kind, factory) {
  const seen = new Set();
  for (const item of list) {
    seen.add(item.id);
    let mesh = entities.get(item.id);
    if (!mesh) {
      mesh = factory(item);
      mesh.userData.kind = kind;
      entities.set(item.id, mesh);
    }
    mesh.position.set(item.x, item.y || 0, item.z);
    if (kind === 'foe') syncFoe(mesh, item);
    if (kind === 'blast') {
      const k = item.age / item.life;
      mesh.scale.setScalar(item.radius * (0.2 + k));
      mesh.traverse((child) => {
        if (child.material) child.material.opacity = (1 - k) * (child.userData.glow ? 0.4 : 0.75);
      });
    }
  }
  for (const [id, mesh] of entities) {
    if (mesh.userData.kind === kind && !seen.has(id)) {
      scene.remove(mesh);
      entities.delete(id);
    }
  }
}

function clearWorld() {
  for (const mesh of entities.values()) scene.remove(mesh);
  entities.clear();
}

let smoothX = 0;
let smoothZ = 0;
let frozenCam = null;
let frozenPose = null;
let bannerT = 0;
let coachUntil = 0;
const keys = new Set();
const pointers = new Map();
let torpedoEdge = false;
let boostEdge = false;
let skipEdge = false;
let weaponEdge = 0;
let dodgeEdge = null;
let lockEdge = 0;
let dragAccum = { x: 0, z: 0 };
let lastLeftTap = 0;
let lastRightTap = 0;

function groundUnder(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const origin = new THREE.Vector3(ndcX, ndcY, 0).unproject(camera);
  const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(camera);
  const dy = far.y - origin.y;
  if (Math.abs(dy) < 1e-6) return null;
  const t = -origin.y / dy;
  if (t < 0) return null;
  return {
    x: origin.x + (far.x - origin.x) * t,
    z: origin.z + (far.z - origin.z) * t,
  };
}

function banditAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  let best = null;
  let bestD = 72;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const point = project(enemy.x, 1.2, enemy.z);
    if (!point) continue;
    const dist = Math.hypot(point.x - x, point.y - y);
    if (dist < bestD) {
      best = enemy;
      bestD = dist;
    }
  }
  return best;
}

function resize() {
  const vv = window.visualViewport;
  const w = vv ? vv.width : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  const cap = quality === 'low' ? 1 : Math.min(1.75, window.devicePixelRatio || 1);
  renderer.setPixelRatio(cap);
  renderer.setSize(w, h, false);
  camera.aspect = Math.max(0.3, w / Math.max(1, h));
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);

function project(x, y, z) {
  projectV.set(x, y, z).project(camera);
  if (projectV.z > 1) return null;
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  return { x: (projectV.x * 0.5 + 0.5) * w, y: (-projectV.y * 0.5 + 0.5) * h };
}

function placeStick(el, pointer) {
  const knob = el.querySelector('.knob');
  if (!pointer) {
    el.style.left = '';
    el.style.right = '';
    el.style.top = '';
    el.style.bottom = '';
    knob.style.transform = '';
    return;
  }
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.left = `${pointer.ox - 59}px`;
  el.style.top = `${pointer.oy - 59}px`;
  const dx = Math.max(-48, Math.min(48, pointer.x - pointer.ox));
  const dy = Math.max(-48, Math.min(48, pointer.y - pointer.oy));
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}

function stickOf(pointer) {
  if (!pointer) return { x: 0, y: 0 };
  const dx = pointer.x - pointer.ox;
  const dy = pointer.y - pointer.oy;
  const radius = 72;
  let x = Math.max(-1, Math.min(1, dx / radius));
  let y = Math.max(-1, Math.min(1, -dy / radius));
  if (Math.hypot(x, y) < 0.12) { x = 0; y = 0; }
  return { x, y };
}

function pointerBySide(side) {
  for (const pointer of pointers.values()) if (pointer.side === side) return pointer;
  return null;
}

function tumble(dx, dy) {
  const yawSpin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * 0.012);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const pitchSpin = new THREE.Quaternion().setFromAxisAngle(right, dy * 0.012);
  hangarQ.premultiply(yawSpin);
  hangarQ.premultiply(pitchSpin);
  hangarQ.normalize();
}

ui.touch.addEventListener('pointerdown', (event) => {
  ui.touch.setPointerCapture(event.pointerId);
  const rect = ui.touch.getBoundingClientRect();
  const localY = event.clientY - rect.top;
  if (state.phase === 'run' && state.cam && localY < rect.height * 0.2) {
    skipEdge = true;
    return;
  }
  if (state.phase === 'hangar') {
    pointers.set(event.pointerId, {
      side: 'H',
      ox: event.clientX,
      oy: event.clientY,
      x: event.clientX,
      y: event.clientY,
    });
    return;
  }
  if (state.phase !== 'run') return;
  const side = (event.clientX - rect.left) < rect.width * 0.5 ? 'L' : 'R';
  const now = performance.now();
  let gesture = null;
  if (!simple && side === 'L' && now - lastLeftTap < 320) boostEdge = true;
  if (side === 'L') lastLeftTap = now;
  if (side === 'R' && now - lastRightTap < 280) {
    torpedoEdge = true;
    gesture = 'tap';
  }
  if (side === 'R') lastRightTap = now;
  pointers.set(event.pointerId, {
    side,
    ox: event.clientX,
    oy: event.clientY,
    x: event.clientX,
    y: event.clientY,
    t0: now,
    gesture,
    ground: simple ? groundUnder(event.clientX, event.clientY) : null,
  });
});
ui.touch.addEventListener('pointermove', (event) => {
  const pointer = pointers.get(event.pointerId);
  if (!pointer) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  if (pointer.side === 'H') tumble(dx, dy);
  if (simple && pointer.side === 'L') {
    const ground = groundUnder(pointer.x, pointer.y);
    if (ground && pointer.ground) {
      dragAccum.x += ground.x - pointer.ground.x;
      dragAccum.z += ground.z - pointer.ground.z;
    }
    pointer.ground = ground;
  }
  if (!simple && pointer.side === 'R' && !pointer.gesture) {
    const adx = pointer.x - pointer.ox;
    const ady = pointer.y - pointer.oy;
    const dist = Math.hypot(adx, ady);
    const elapsed = performance.now() - pointer.t0;
    if (elapsed < 190 && dist > 54) {
      if (Math.abs(adx) > Math.abs(ady) * 1.3) {
        pointer.gesture = 'swipe';
        weaponEdge = adx > 0 ? 1 : -1;
      } else {
        pointer.gesture = 'flick';
        dodgeEdge = { x: adx, y: -ady };
      }
    }
  }
});
function endPointer(event) {
  const pointer = pointers.get(event.pointerId);
  if (simple && pointer && state.phase === 'run') {
    const moved = Math.hypot(pointer.x - pointer.ox, pointer.y - pointer.oy);
    if (moved < 14) {
      const bandit = banditAt(pointer.x, pointer.y);
      if (bandit) lockEdge = bandit.id;
    }
  }
  pointers.delete(event.pointerId);
}
ui.touch.addEventListener('pointerup', endPointer);
ui.touch.addEventListener('pointercancel', endPointer);

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  keys.add(event.code);
  if (event.code === 'KeyT') torpedoEdge = true;
  if (event.code === 'KeyB') boostEdge = true;
  if (event.code === 'KeyE') weaponEdge = 1;
  if (event.code === 'KeyQ') weaponEdge = -1;
  if (event.code === 'KeyF') dodgeEdge = { x: keys.has('KeyA') ? -1 : 1, y: 0.2 };
  if (event.code === 'KeyV') toggleView();
  if (event.code === 'Enter') {
    if (state.phase === 'hangar') launch();
    else skipEdge = true;
  }
  if (event.code === 'Space') event.preventDefault();
});
window.addEventListener('keyup', (event) => keys.delete(event.code));
window.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('touchmove', (event) => {
  if (event.target.closest('.panel')) return;
  event.preventDefault();
}, { passive: false });

function readInput() {
  const move = stickOf(pointerBySide('L'));
  const aim = stickOf(pointerBySide('R'));
  let moveX = move.x;
  let moveY = move.y;
  let aimX = aim.x;
  if (keys.has('KeyA')) moveX -= 1;
  if (keys.has('KeyD')) moveX += 1;
  if (keys.has('KeyW')) moveY += 1;
  if (keys.has('KeyS')) moveY -= 1;
  if (keys.has('ArrowLeft')) aimX -= 1;
  if (keys.has('ArrowRight')) aimX += 1;
  const right = pointerBySide('R');
  const held = !simple && right && !right.gesture && performance.now() - right.t0 > 60;
  const fire = held || (!simple && keys.has('Space'));
  const dragging = simple && !!pointerBySide('L');
  const input = {
    moveX: simple ? 0 : Math.max(-1, Math.min(1, moveX)),
    moveY: simple ? 0 : Math.max(-1, Math.min(1, moveY)),
    aimX: simple ? 0 : Math.max(-1, Math.min(1, aimX)),
    fire,
    torpedo: torpedoEdge,
    boost: simple ? false : boostEdge,
    skip: skipEdge,
    weapon: simple ? 0 : weaponEdge,
    dodge: simple ? false : !!dodgeEdge,
    dodgeX: dodgeEdge ? dodgeEdge.x : 0,
    dodgeY: dodgeEdge ? dodgeEdge.y : 0,
    dragging,
    dragX: dragging ? dragAccum.x : 0,
    dragZ: dragging ? dragAccum.z : 0,
    lockId: lockEdge,
  };
  torpedoEdge = false;
  boostEdge = false;
  skipEdge = false;
  weaponEdge = 0;
  dodgeEdge = null;
  lockEdge = 0;
  dragAccum.x = 0;
  dragAccum.z = 0;
  return input;
}

function toggleView() {
  if (state.phase !== 'run') return;
  viewMode = viewMode === 'command' ? 'cockpit' : 'command';
  save.view = viewMode;
  writeSave(save);
  frozenCam = null;
}

function launch() {
  audioBus.unlock();
  if (simple || state.phase !== 'hangar') return;
  viewMode = 'command';
  startRun(state);
  coachUntil = performance.now() + 7000;
  savedResult = false;
}

function backToHangar() {
  state = createMatch(save, (Math.random() * 1e9) >>> 0);
  savedResult = false;
  clearWorld();
  hangarQ.identity();
  bannerT = 0;
  ui.banner.style.opacity = '0';
  renderPanels();
}

$('launch').addEventListener('click', launch);
$('again').addEventListener('click', backToHangar);
$('viewBtn').addEventListener('click', () => { audioBus.unlock(); toggleView(); });
$('skip').addEventListener('click', () => { skipEdge = true; });
$('torpedo').addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  torpedoEdge = true;
  audioBus.unlock();
});
ui.paints.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  save.livery = button.dataset.livery;
  writeSave(save);
  paintShip();
});

function renderPanels() {
  document.body.dataset.phase = state.phase === 'run' ? 'run' : state.phase;
  $('hangar').classList.toggle('on', state.phase === 'hangar');
  $('results').classList.toggle('on', state.phase === 'results');
  const medals = (save.medals || []).join('  ·  ');
  ui.bestLine.textContent = save.bestBounty
    ? `BEST BOUNTY ${save.bestBounty}${medals ? `  ·  ${medals}` : ''}`
    : 'SIX PAINTS  ·  DRAG THE HULL';
  if (state.phase === 'results' && !savedResult) {
    savedResult = true;
    const next = mergeSave(save, state);
    save = { ...save, ...next, view: viewMode, livery: save.livery };
    writeSave(save);
    ui.resultTitle.textContent = state.cleared ? 'WARDEN DOWN' : state.died ? 'SHIP LOST' : 'SORTIE OVER';
    ui.resultStats.innerHTML = [
      ['BOUNTY', state.bounty],
      ['DELIVERED', `${state.deliveries}/2`],
      ['KILLS', state.kills],
    ].map(([name, value]) => `<div><span>${name}</span><b>${value}</b></div>`).join('');
    ui.resultScar.textContent = state.medalsEarned.length
      ? `MEDAL  ${state.medalsEarned.join('  ·  ')}`
      : 'NO MEDAL THIS SORTIE';
  }
}

function syncHud() {
  const speed = Math.round(Math.hypot(state.vel.x, state.vel.z) * 12);
  ui.speed.textContent = String(speed).padStart(3, '0');
  ui.objective.textContent = state.phase === 'run' ? state.objective : '';
  ui.shield.style.transform = `scaleX(${Math.max(0, state.shield / state.shieldMax)})`;
  ui.hull.style.transform = `scaleX(${Math.max(0, state.hull / state.hullMax)})`;
  ui.viewName.textContent = viewMode === 'command' ? 'COMMAND CENTER' : 'COCKPIT';
  document.body.classList.toggle('cinema', !!state.cam);
  ui.flash.style.opacity = String(Math.min(0.55, state.flash * 0.5));
  ui.streak.style.opacity = String(Math.min(0.9, state.flash * 0.85));
  ui.coach.classList.toggle('show', state.phase === 'run' && performance.now() < coachUntil);
  const cool = state.torpedoCool > 0.08;
  ui.torpedo.classList.toggle('cool', cool);
  ui.torpedo.classList.toggle('armed', !!(simple && state.lockId));
  ui.torpedo.firstChild.textContent = cool ? state.torpedoCool.toFixed(1) : (simple ? 'FIRE' : 'TORPEDO');
  const weapon = WEAPONS[state.weapon] || WEAPONS[0];
  ui.weaponName.textContent = weapon.name;
  ui.charge.style.transform = `scaleX(${weapon.id === 'rail' ? state.charge : 0})`;
  ui.stickR.classList.toggle('hot', !!pointerBySide('R') || keys.has('Space'));
  const shellOn = !simple && (state.shield > 8 || state.shieldGlow > 0 || state.dodge > 0);
  shell.visible = state.phase === 'run' && shellOn;
  const shellColor = state.shieldKind === 'spike' ? 0xff4ad4 : state.shieldKind === 'aegis' ? 0xc46bff : 0x7af6ff;
  shell.material.color.setHex(state.dodge > 0 ? 0xf4fbff : shellColor);
  shell.material.opacity = state.dodge > 0 ? 0.55 : state.shieldGlow > 0 ? 0.38 : 0.16;
  if (state.say) {
    ui.banner.textContent = state.say;
    bannerT = Math.max(bannerT, state.sayT);
  }
}

function floats() {
  for (const fx of state.fx) {
    if (/DISABLED|DELIVERED|WARDEN|BOGEY|BOOST|HITCHED|SHIELD|SLOW|HIT|LOCKED/.test(fx.text)) {
      ui.banner.textContent = fx.text;
      bannerT = Math.max(bannerT, 0.8);
    }
    const point = project(fx.x, 1.5, fx.z);
    if (!point) continue;
    const el = document.createElement('div');
    el.className = 'pop';
    el.textContent = fx.text;
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    ui.popups.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }
}

function sounds() {
  let played = 0;
  for (const name of state.buzz) {
    if (played++ > 4) break;
    audioBus.play(name === 'cards' ? 'card' : name);
    vibrate(name);
  }
}

function placeCamera(dt) {
  const shake = simple || reduceMotion ? 0 : state.shake;
  const jx = Math.sin(state.time * 40) * shake * 0.35;
  const jz = Math.cos(state.time * 33) * shake * 0.35;
  let mode = state.phase === 'hangar' ? 'hangar' : (simple ? 'range' : viewMode);
  if (!simple && state.cam && state.phase === 'run') {
    mode = 'shot';
    if (frozenCam !== state.cam) {
      frozenCam = state.cam;
      frozenPose = shotPose(state.cam.from, state.cam.to);
    }
    const pose = frozenPose;
    const dolly = Math.min(reduceMotion ? 0.3 : 1.4, state.cam.age * 1.8);
    camera.position.set(
      pose.eye.x + pose.lookDir[0] * dolly + jx,
      pose.eye.y + pose.lookDir[1] * dolly,
      pose.eye.z + pose.lookDir[2] * dolly + jz,
    );
    applyBasis(camera, pose.basis);
    camera.fov = 52;
  } else if (state.phase === 'hangar') {
    frozenCam = null;
    const eye = { x: 0.15, y: 2.35 + hangarDist * 0.06, z: hangarDist };
    const look = [-eye.x, -1.35 - eye.y, 0.2 - eye.z];
    const len = Math.hypot(look[0], look[1], look[2]) || 1;
    camera.position.set(eye.x, eye.y, eye.z);
    applyBasis(camera, basisLooking([look[0] / len, look[1] / len, look[2] / len], [0, 1, 0]));
    camera.fov = 38;
  } else if (simple) {
    frozenCam = null;
    const pose = rangePose();
    camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
    applyBasis(camera, pose.basis);
    camera.fov = pose.fov;
  } else if (viewMode === 'cockpit') {
    frozenCam = null;
    const eye = cockpitEye(state.pos, state.yaw);
    camera.position.set(eye.x, eye.y, eye.z);
    applyBasis(camera, cockpitFromYaw(state.yaw));
    camera.fov = 62;
  } else {
    frozenCam = null;
    const focus = commandFocus(state.pos, camera.aspect);
    const follow = 1 - Math.exp(-7 * Math.max(0.016, dt));
    smoothX += (focus.position.x - smoothX) * follow;
    smoothZ += (focus.position.z - smoothZ) * follow;
    camera.position.set(smoothX + jx, focus.height, smoothZ + jz);
    applyBasis(camera, commandBasis());
    camera.fov = 42;
  }
  camera.updateProjectionMatrix();
  if (debugOn) {
    window.__nr = () => ({
      build: BUILD_LABEL,
      simple: !!state.simple,
      phase: state.phase,
      yaw: state.yaw,
      speed: Math.hypot(state.vel.x, state.vel.z),
      pos: { x: state.pos.x, z: state.pos.z },
      vel: { x: state.vel.x, z: state.vel.z },
      eye: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      shake: state.shake,
      blasts: state.blasts.length,
      bolts: state.bolts.map((bolt) => ({
        kind: bolt.kind,
        x: Math.round(bolt.x * 10) / 10,
        z: Math.round(bolt.z * 10) / 10,
        life: Math.round(bolt.life * 100) / 100,
      })),
      enemies: state.enemies.map((enemy) => ({
        role: enemy.role,
        x: Math.round(enemy.x * 10) / 10,
        z: Math.round(enemy.z * 10) / 10,
        hull: Math.round(enemy.hull),
        disabled: enemy.disabled,
        alive: enemy.alive,
      })),
      cam: state.cam ? state.cam.kind : '',
      bandit: (() => {
        const enemy = state.enemies.find((item) => item.alive);
        if (!enemy) return null;
        const point = project(enemy.x, 1.2, enemy.z);
        return {
          id: enemy.id,
          x: point ? point.x : null,
          y: point ? point.y : null,
        };
      })(),
      lock: state.lockId,
      deliveries: state.deliveries,
      towed: state.towedId,
      shield: Math.round(state.shield),
      hull: Math.round(state.hull),
    });
    xAxis.set(1, 0, 0).applyQuaternion(camera.quaternion);
    yAxis.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const bad = mode === 'command'
      ? Math.abs(yAxis.z + 1) > 0.08
      : mode === 'hangar' || mode === 'cockpit' || mode === 'shot' || mode === 'range'
        ? Math.abs(xAxis.y) > 0.12
        : false;
    ui.debug.style.display = 'block';
    ui.debug.textContent = `${mode} ${bad ? 'ROLL BAD' : 'ROLL OK'}`;
  }
}

function placeNav() {
  if (state.phase !== 'run' || !state.nav) {
    ui.nav.style.display = 'none';
    return;
  }
  projectV.set(state.nav.x, 1, state.nav.z).project(camera);
  const inside = projectV.z < 1 && Math.abs(projectV.x) < 0.82 && Math.abs(projectV.y) < 0.78;
  if (inside) {
    ui.nav.style.display = 'none';
    return;
  }
  const angle = Math.atan2(projectV.x, projectV.y);
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  const radius = Math.min(w, h) * 0.33;
  ui.nav.style.display = 'flex';
  ui.nav.style.left = `${w * 0.5 + Math.sin(angle) * radius}px`;
  ui.nav.style.top = `${h * 0.46 - Math.cos(angle) * radius}px`;
  ui.nav.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  ui.nav.lastElementChild.textContent = state.nav.label;
}

function placeLock() {
  const enemy = state.phase === 'run' && state.lockId
    ? state.enemies.find((item) => item.id === state.lockId)
    : null;
  if (!enemy || state.cam) {
    ui.lock.style.display = 'none';
    return;
  }
  const point = project(enemy.x, 0.9, enemy.z);
  if (!point) {
    ui.lock.style.display = 'none';
    return;
  }
  ui.lock.style.display = 'block';
  ui.lock.style.left = `${point.x}px`;
  ui.lock.style.top = `${point.y}px`;
}

let hangarDist = 8.5;
function pinchHangar() {
  const hands = [...pointers.values()].filter((pointer) => pointer.side === 'H');
  if (hands.length < 2) {
    pinchHangar.last = 0;
    return;
  }
  const dist = Math.hypot(hands[0].x - hands[1].x, hands[0].y - hands[1].y);
  if (!pinchHangar.last) pinchHangar.last = dist;
  hangarDist = Math.max(5, Math.min(16, hangarDist * (pinchHangar.last / dist)));
  pinchHangar.last = dist;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (quality === 'high') {
    if (dt > 0.021) slowFrames += 1;
    else slowFrames = Math.max(0, slowFrames - 1);
    if (slowFrames > 45) {
      quality = 'low';
      document.body.dataset.quality = 'low';
      renderer.setPixelRatio(1);
      for (const shaft of shafts) shaft.visible = false;
    }
  }
  if (state.phase !== 'run' && state.phase !== 'hangar') pointers.clear();
  const input = state.phase === 'run' ? readInput() : { skip: skipEdge };
  if (state.phase !== 'run') skipEdge = false;
  if (state.phase === 'hangar') pinchHangar();
  else pinchHangar.last = 0;
  step(state, input, dt);
  sounds();
  floats();
  syncHud();
  renderPanels();
  if (state.phase === 'hangar') {
    player.position.set(0, 0, 0);
    player.quaternion.copy(hangarQ);
  } else {
    player.position.set(state.pos.x, 0, state.pos.z);
    player.rotation.set(0, -state.yaw, 0);
    if (!simple) {
      const glow = 0.35 + Math.min(1, Math.hypot(state.vel.x, state.vel.z) / 22) * 0.65;
      glowMat.color.setRGB(0.45 + glow * 0.2, 0.9, 1);
    }
  }
  syncGroup(state.enemies, 'foe', foeVisual);
  syncGroup(state.bolts, 'bolt', (bolt) => {
    const color = bolt.color || (bolt.kind === 'enemy' ? 0xff3a6a : 0x7af6ff);
    const length = bolt.kind === 'torpedo' ? 2.8 : bolt.kind === 'rail' ? 3.4 : bolt.kind === 'mine' ? 0.7 : 1.7;
    const thick = bolt.kind === 'torpedo' ? 0.5 : bolt.kind === 'rail' ? 0.22 : bolt.kind === 'mine' ? 0.55 : 0.16;
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      bolt.kind === 'mine' ? new THREE.SphereGeometry(0.38, 8, 6) : new THREE.BoxGeometry(thick, thick, length),
      new THREE.MeshBasicMaterial({ color }),
    );
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(bolt.kind === 'torpedo' ? 0.9 : 0.42, 8, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    group.add(core);
    group.add(glow);
    scene.add(group);
    return group;
  });
  for (const bolt of state.bolts) {
    const mesh = entities.get(bolt.id);
    if (!mesh) continue;
    const speed = Math.hypot(bolt.vx, bolt.vz) || 1;
    applyBasis(mesh, basisLooking([bolt.vx / speed, 0, bolt.vz / speed], [0, 1, 0]));
  }
  syncGroup(state.pickups, 'pickup', (pickup) => {
    const color = pickup.kind === 'spike' ? 0xff4ad4 : pickup.kind === 'aegis' ? 0xc46bff : 0x7af6ff;
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending }),
    );
    scene.add(mesh);
    return mesh;
  });
  syncGroup(state.blasts, 'blast', (blast) => {
    const color = blast.color || 0xffe08a;
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.7, 28), new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    ring.rotation.x = -Math.PI / 2;
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    glow.userData.glow = true;
    group.add(ring);
    group.add(glow);
    scene.add(group);
    return group;
  });
  const sparks = quality === 'low' ? state.sparks.slice(0, 36) : state.sparks;
  for (let i = 0; i < sparkMax; i++) {
    const spark = sparks[i];
    const o = i * 3;
    if (!spark) {
      sparkPos[o + 1] = -80;
      continue;
    }
    sparkPos[o] = spark.x;
    sparkPos[o + 1] = spark.y || 0.4;
    sparkPos[o + 2] = spark.z;
    const hex = spark.color || 0xfff1c4;
    sparkCol[o] = ((hex >> 16) & 255) / 255;
    sparkCol[o + 1] = ((hex >> 8) & 255) / 255;
    sparkCol[o + 2] = (hex & 255) / 255;
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
  sparkGeo.setDrawRange(0, Math.min(sparkMax, sparks.length));
  arcPos.fill(0);
  const arcs = state.arcs.slice(0, arcMax);
  arcs.forEach((arc, i) => {
    const o = i * 6;
    arcPos[o] = arc.x;
    arcPos[o + 1] = 0.6;
    arcPos[o + 2] = arc.z;
    arcPos[o + 3] = arc.x2;
    arcPos[o + 4] = 0.6;
    arcPos[o + 5] = arc.z2;
  });
  arcGeo.attributes.position.needsUpdate = true;
  arcGeo.setDrawRange(0, arcs.length * 2);
  const fast = Math.hypot(state.vel.x, state.vel.z);
  const showLines = state.phase === 'run' && fast > 8;
  speedLines.visible = showLines;
  if (showLines) {
    const dir = fast > 0.1 ? { x: state.vel.x / fast, z: state.vel.z / fast } : { x: 0, z: -1 };
    const yaw = Math.atan2(dir.x, -dir.z);
    speedLines.position.set(state.pos.x, 0.3, state.pos.z);
    speedLines.rotation.set(0, -yaw, 0);
    speedLines.children.forEach((line, i) => {
      const side = (i - 3.5) * 0.55;
      line.position.set(side, 0, -1.2 - (i % 3) * 0.8);
      line.scale.z = 0.6 + Math.min(2.4, fast / 18);
      line.material.opacity = Math.min(0.8, (fast - 8) / 28) * (state.brake > 0 ? 1 : 0.75);
      line.material.color.setHex(state.brake > 0 ? 0xffb23a : state.boost > 0 ? 0xff4ad4 : 0x7af6ff);
    });
  }
  placeCamera(dt);
  placeStick(ui.stickL, pointerBySide('L'));
  placeStick(ui.stickR, pointerBySide('R'));
  placeNav();
  placeLock();
  if (bannerT > 0) {
    bannerT -= dt;
    ui.banner.style.opacity = String(Math.max(0, Math.min(1, bannerT * 2)));
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

LIVERIES.forEach((name) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.livery = name;
  button.style.background = `#${PAINT[name].toString(16).padStart(6, '0')}`;
  button.title = PAINT_NAME[name];
  ui.paints.appendChild(button);
});
paintShip();
if (simple) {
  ui.coach.textContent = 'Drag with your left thumb. The ship stops when you let go. Tap the bandit, then FIRE.';
  coachUntil = performance.now() + 9000;
}
renderPanels();
placeCamera(0.016);
requestAnimationFrame(frame);
