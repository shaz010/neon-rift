import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rel = p => path.relative(root, p).split(path.sep).join('/');
const exists = p => fs.existsSync(path.join(root, p)) && fs.statSync(path.join(root, p)).isFile();
const missing = [];
const files = new Set();
const lazy = new Set();
function add(p) {
  const clean = p.replace(/^\.\//, '').split('?')[0];
  if (!clean || clean.endsWith('/')) return;
  if (!exists(clean)) { missing.push(clean); return; }
  files.add(clean);
}
function addLazy(p) {
  const clean = p.replace(/^\.\//, '').split('?')[0];
  if (!clean || !exists(clean) || files.has(clean)) return;
  lazy.add(clean);
}

function walkJs(file, seen = new Set()) {
  const abs = path.join(root, file);
  if (seen.has(file) || !fs.existsSync(abs)) return;
  seen.add(file);
  add(file);
  const text = fs.readFileSync(abs, 'utf8');
  const re = /(?:import\s+(?:[^'";]*?\sfrom\s*)?|import\()\s*['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(text))) {
    let spec = m[1].split('?')[0];
    if (!spec.endsWith('.js') && !spec.endsWith('.mjs')) spec += '.js';
    const next = rel(path.normalize(path.join(path.dirname(abs), spec)));
    walkJs(next, seen);
  }
}

add('vendor/three.module.min.js');
walkJs('main.mjs');
walkJs('vendor/jsm/loaders/GLTFLoader.js');

const pages = ['index.html', 'sounds.html', 'sound-bank.html', 'manifest-game.webmanifest', 'manifest-snd.webmanifest'];
for (const p of pages) add(p);
for (const p of pages.filter(x => x.endsWith('.html') || x.endsWith('.webmanifest'))) {
  const text = fs.readFileSync(path.join(root, p), 'utf8');
  const re = /(?:href|src)=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text))) {
    const u = m[1];
    if (!u || u.startsWith('#') || u.startsWith('http') || u.startsWith('data:')) continue;
    add(u);
  }
}

function walkDir(dir, re) {
  for (const name of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p = dir + '/' + name.name;
    if (name.isDirectory()) walkDir(p, re);
    else if (re.test(name.name)) add(p);
  }
}
walkDir('tex', /\.jpg$/i);
walkDir('models', /\.glb$/i);
const main = fs.readFileSync(path.join(root, 'main.mjs'), 'utf8');
for (const m of main.matchAll(/['"]((?:tex|models)\/[^'"]+\.(?:jpg|glb))['"]/g)) add(m[1]);

function soundFile(key) {
  let dir = 'sfx/', file = key;
  if (key.startsWith('sn_')) { dir = 'sfx/sonniss/'; file = key.slice(3); }
  else if (key.startsWith('nb_')) dir = 'sfx/nb/';
  else if (key.startsWith('lx_')) dir = 'sfx/lx/';
  const order = ['ogg', 'm4a', 'mp3', 'wav'];
  let best = null, bestSize = Infinity;
  for (const ext of order) {
    const p = dir + file + '.' + ext;
    if (!exists(p)) continue;
    const size = fs.statSync(path.join(root, p)).size;
    if (size < bestSize) { best = p; bestSize = size; }
  }
  return best;
}
const keys = new Set();
for (const m of main.matchAll(/\bk:\s*['"]([a-z0-9_]+)['"]/g)) keys.add(m[1]);
for (const m of main.matchAll(/C\(\s*['"][^'"]*['"]\s*,\s*['"][^'"]*['"]\s*,\s*['"]([a-z0-9_]+)['"]/g)) keys.add(m[1]);
for (const m of main.matchAll(/SB\.get\(\s*['"]([a-z0-9_]+)['"]/g)) keys.add(m[1]);
for (const k of ['brief','nuke','sub01','sub08','jet','ambient','riser','jet8','drone','flak','flak2','impact','mlaunch','mmotor','sweep','subdrop','aaaw','msub','hitsub','mus_depth','mus_dream','mus_layers','mus_waves','flare_thump','flare_hiss','deck_jet','deck_rotor','deck_clank','deck_steam','deck_call']) keys.add(k);
const unresolved = [];
for (const key of keys) {
  const file = soundFile(key);
  if (!file) unresolved.push(key);
  else add(file);
}
for (const dir of ['sfx/nb', 'sfx/lx', 'sfx/sonniss']) {
  const grouped = new Map();
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (!/\.(m4a|wav|mp3|ogg)$/i.test(name)) continue;
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    const base = name.slice(0, name.lastIndexOf('.'));
    if (!grouped.has(base)) grouped.set(base, {});
    grouped.get(base)[ext] = dir + '/' + name;
  }
  for (const [base, exts] of grouped) {
    const order = ['m4a', 'wav', 'mp3', 'ogg'];
    const hit = order.map(e => exts[e]).find(Boolean);
    if (!hit) unresolved.push(dir + '/' + base);
    else addLazy(hit);
  }
}
if (unresolved.length || missing.length) {
  console.error('PRECACHE MISSING');
  for (const k of unresolved) console.error('  sound key ' + k);
  for (const p of missing) console.error('  file ' + p);
  process.exit(1);
}
const keepSound = new Set(['jet','ambient','jet8','drone','flak','flak2','impact','mlaunch','mmotor','sub01','sub08','aaaw','hitsub','msub','sweep','subdrop','riser','flare_thump','flare_hiss','deck_jet','deck_rotor','deck_clank','deck_steam','deck_call','brief','nuke']);
for (const p of [...files]) {
  const size = fs.statSync(path.join(root, p)).size;
  const base = path.basename(p).replace(/\.[^.]+$/, '');
  if (p.endsWith('alps-field-4k.jpg') || (p.startsWith('sfx/') && size > 400 * 1024 && !keepSound.has(base))) {
    files.delete(p);
    lazy.add(p);
  }
}
const list = [...files].sort();
const extra = [...lazy].filter(p => !files.has(p)).sort();
let bytes = 0, extraBytes = 0;
for (const p of list) bytes += fs.statSync(path.join(root, p)).size;
for (const p of extra) extraBytes += fs.statSync(path.join(root, p)).size;
const body = '/* generated by scripts/build-precache.mjs — core ' + list.length + ' files, ' + bytes + ' bytes; lazy ' + extra.length + ' files, ' + extraBytes + ' bytes */\n'
  + 'self.CORE=' + JSON.stringify(list, null, 1) + ';\n'
  + 'self.LAZY=' + JSON.stringify(extra, null, 1) + ';\n'
  + 'self.PRECACHE=self.CORE;\n';
fs.writeFileSync(path.join(root, 'precache-list.js'), body);
console.log('core', list.length, 'bytes', bytes, 'mb', (bytes / 1024 / 1024).toFixed(1));
console.log('lazy', extra.length, 'bytes', extraBytes, 'mb', (extraBytes / 1024 / 1024).toFixed(1));
