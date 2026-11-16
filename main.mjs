const DS_MODE=(window.__DS_MODE)||(/sound-bank\.html/.test(location.pathname)?'bank':/sounds\.html/.test(location.pathname)?'sounds':/scenery\.html/.test(location.pathname)?'scenery':'game');
window.__DS_MODE=DS_MODE;
const PATCH_V=(/[?&]v=([^&]+)/.exec(import.meta.url)||['','17x8'])[1];
const PATCH_LABEL='s17 · '+PATCH_V;
function showPatch(){document.querySelectorAll('[data-patch]').forEach(el=>{el.textContent=PATCH_LABEL}); const pill=document.getElementById('verpill'); if(pill)pill.textContent=PATCH_LABEL; const badge=document.getElementById('badge'); if(badge&&DS_MODE==='game')badge.textContent=PATCH_LABEL}
showPatch();

import * as THREE from 'three';
import {Sky} from './vendor/jsm/objects/Sky.js';
import {EffectComposer} from './vendor/jsm/postprocessing/EffectComposer.js';
import {Pass,FullScreenQuad} from './vendor/jsm/postprocessing/Pass.js';
import {RenderPass} from './vendor/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from './vendor/jsm/postprocessing/OutputPass.js';
import {MeshoptDecoder} from './vendor/jsm/libs/meshopt_decoder.module.js';
import {clone as cloneSkin} from './vendor/jsm/utils/SkeletonUtils.js';
const $=id=>document.getElementById(id);
// Orientation hint only. Rotation lock on iOS never fires orientationchange and
// never updates the angle, so a full-screen gate stays up and swallows taps.
// The hint is not a hit target. It fades on its own, and the first tap dismisses
// it. That same tap still reaches the brief, which unlocks audio.
function installOrientGuard(){
  const root=document.documentElement, rot=document.getElementById('rot');
  const passThrough=()=>{
    if(!rot)return;
    rot.classList.remove('ov');
    rot.style.setProperty('pointer-events','none','important');
    rot.style.setProperty('touch-action','none','important');
    rot.style.setProperty('position','fixed','important');
    rot.style.setProperty('inset','auto','important');
    rot.style.setProperty('left','50%','important');
    rot.style.setProperty('right','auto','important');
    rot.style.setProperty('top','auto','important');
    rot.style.setProperty('bottom','calc(12px + env(safe-area-inset-bottom))','important');
    rot.style.setProperty('transform','translateX(-50%)','important');
    rot.style.setProperty('width','max-content','important');
    rot.style.setProperty('max-width','calc(100vw - 24px)','important');
    rot.style.setProperty('height','auto','important');
    rot.style.setProperty('z-index','8','important');
  };
  const kill=()=>{
    root.classList.remove('ds-port'); root.classList.add('ds-land');
    if(!rot)return;
    rot.classList.remove('ov'); rot.classList.add('hide');
    rot.setAttribute('aria-hidden','true');
    rot.style.setProperty('display','none','important');
    rot.style.setProperty('pointer-events','none','important');
  };
  if(DS_MODE!=='game'){kill(); window.__dsOrient='off'; return}
  passThrough();
  let dismissed=false;
  function landscape(){
    let land=false, port=false;
    const noteA=a=>{
      if(typeof a!=='number'||!isFinite(a))return;
      const n=((a%360)+360)%360;
      if(n===90||n===270)land=true; else if(n===0||n===180)port=true;
    };
    try{noteA(window.orientation)}catch(e){}
    try{
      const so=window.screen&&window.screen.orientation;
      if(so){noteA(so.angle); if(typeof so.type==='string'&&so.type.indexOf('landscape')>=0)land=true}
    }catch(e){}
    try{
      const w=window.innerWidth, h=window.innerHeight;
      if(w>h+24)land=true; else if(h>w+24)port=true;
    }catch(e){}
    if(land)return true;
    if(port)return false;
    try{return !window.matchMedia('(orientation: portrait)').matches}catch(e){return false}
  }
  function apply(){
    passThrough();
    const land=landscape();
    root.classList.remove('ds-port');
    root.classList.toggle('ds-land',!!land||dismissed);
    window.__dsOrient=land?'landscape':'portrait';
    if(!rot)return;
    if(land||dismissed){
      rot.classList.add('hide'); rot.setAttribute('aria-hidden','true');
      rot.style.setProperty('display','none','important');
    }else{
      rot.classList.remove('hide'); rot.removeAttribute('aria-hidden');
      rot.style.setProperty('display','flex','important');
    }
    rot.style.setProperty('pointer-events','none','important');
  }
  apply();
  // Arm the hide only after the first paint. The startup terrain build blocks
  // the main thread, and a timer started before that fires before the hint is seen.
  const arm=()=>setTimeout(()=>{dismissed=true; apply()},4500);
  if(window.requestAnimationFrame)requestAnimationFrame(()=>requestAnimationFrame(arm));
  else setTimeout(arm,0);
  window.addEventListener('pointerdown',()=>{if(dismissed)return; dismissed=true; apply()},{capture:true,passive:true});
  const burst=()=>{apply(); setTimeout(apply,150); setTimeout(apply,500)};
  window.addEventListener('resize',burst,{passive:true});
  window.addEventListener('orientationchange',burst);
  window.addEventListener('pageshow',burst);
  try{const so=window.screen&&window.screen.orientation; if(so&&so.addEventListener)so.addEventListener('change',burst)}catch(e){}
  function menuOpen(){return ['brief','tut','end'].some(id=>{const el=document.getElementById(id); return el&&!el.classList.contains('hide')})}
  function syncMenuTouch(){
    const open=menuOpen();
    const v=open?'manipulation':'';
    root.style.touchAction=v;
    if(document.body)document.body.style.touchAction=v;
    const gl=document.getElementById('gl');
    if(gl){if(open)gl.style.setProperty('pointer-events','none','important'); else gl.style.removeProperty('pointer-events')}
    if(!open){
      document.querySelectorAll('[data-ds-pass]').forEach(el=>{el.style.removeProperty('pointer-events'); el.removeAttribute('data-ds-pass')});
      return;
    }
    const vw=window.innerWidth||1, vh=window.innerHeight||1;
    document.querySelectorAll('body *').forEach(el=>{
      if(el===rot||el.closest&&el.closest('#brief,#tut,#end,#pauseOv,#setp,#setb,#pauseb'))return;
      let cs; try{cs=getComputedStyle(el)}catch(e){return}
      if(cs.display==='none'||cs.visibility==='hidden'||cs.pointerEvents==='none')return;
      if(cs.position!=='fixed'&&cs.position!=='absolute')return;
      const r=el.getBoundingClientRect();
      if(r.width>=vw*.92&&r.height>=vh*.92){el.style.setProperty('pointer-events','none','important'); el.setAttribute('data-ds-pass','1')}
    });
  }
  syncMenuTouch();
  try{
    const mo=new MutationObserver(syncMenuTouch);
    for(const id of ['brief','tut','end']){const el=document.getElementById(id); if(el)mo.observe(el,{attributes:true,attributeFilter:['class']})}
  }catch(e){}
  window.__dsSyncOrient=apply;
}
try{installOrientGuard()}catch(e){}
const D2R=Math.PI/180, clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t, rnd=(a=1)=>(Math.random()-.5)*2*a;
const sstep=(a,b,x)=>{x=clamp((x-a)/(b-a),0,1);return x*x*(3-2*x)};
// ---------- terrain function (same valley as s0) ----------
function hash(x,y){const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s)}
function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
 return lerp(lerp(hash(xi,yi),hash(xi+1,yi),u),lerp(hash(xi,yi+1),hash(xi+1,yi+1),u),v)}
function fbm(x,y){let a=0,f=1,s=.5;for(let i=0;i<4;i++){a+=vnoise(x*f,y*f)*s;f*=2.03;s*=.5}return a}
const vx=z=>Math.sin(z/1500)*380+Math.sin(z/570+1)*90;
function H(x,z){const d=Math.abs(x-vx(z));
 // large ridgelines flanking the valley (multi-scale fbm)
 const ridge=860*sstep(110,1550,d)*(.48+.52*fbm(x*.0005+2.1,z*.00048))
  +420*sstep(180,980,d)*fbm(x*.0011+7.3,z*.00105+1.4)
  +180*sstep(90,520,d)*Math.max(0,fbm(x*.0024+4,z*.0022)-.35);
 // eroded mid-slopes + rocky outcrops
 const mid=fbm(x*.0032+1.7,z*.003)*210*sstep(70,720,d);
 const outcrop=Math.max(0,fbm(x*.011+9,z*.01)-.58)*110*sstep(140,900,d);
 // dry wadi / riverbed meander on valley floor
 const wx=vx(z)+Math.sin(z*.00205+1.2)*48+Math.sin(z*.0007)*22;
 const wd=Math.abs(x-wx);const wadi=-32*Math.exp(-(wd*wd)/(68*68))*(1-sstep(0,1,d/520));
 // micro relief + valley floor fill
 const micro=fbm(x*.022,z*.021)*7+fbm(x*.06,z*.055)*2.2;
 return ridge+mid+outcrop+wadi+micro-6}
const BZ=-10000, BUNK=new THREE.Vector3(vx(BZ)+40,0,BZ); BUNK.y=H(BUNK.x,BUNK.z);
const HIGH_Y=3050, MEET_Z=9800, TANKER_Z=9480, TANKER_LEAVE_Z=1100;
function meetPos(){const z=MEET_Z,x=vx(z); return {x,y:HIGH_Y,z}}
const SAMP=new THREE.Vector3(vx(-10900)+330,0,-10900); SAMP.y=H(SAMP.x,SAMP.z);
const UA=navigator.userAgent||'', PLAT=navigator.platform||'';
const IPAD=/iPad/.test(UA)||(navigator.maxTouchPoints>1&&/Mac/.test(PLAT));
const PHONE=/iPhone|Android/.test(UA)&&!IPAD;
const MOB=matchMedia('(pointer:coarse)').matches||/iPhone|iPad|Android/.test(UA)||IPAD;
window.__dev={MOB,IPAD,PHONE};
if(navigator.serviceWorker)navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{});
const SITES=[[-3700,-340,'SA-X 1'],[-7300,370,'SA-X 2'],[-10900,330,'SA-X 3']].map(([z,o,n])=>{const p=new THREE.Vector3(vx(z)+o,0,z);p.y=H(p.x,p.z);return{p,n}});
function los(a,b){for(let i=1;i<14;i++){const k=i/14,x=a.x+(b.x-a.x)*k,y=a.y+(b.y-a.y)*k,z=a.z+(b.z-a.z)*k;if(y<H(x,z)+4)return false}return true}
const RADP=new THREE.Vector3(vx(-5200)-700,0,-5200); RADP.y=H(RADP.x,RADP.z);
const EXZ=-15200, EXIT=new THREE.Vector3(vx(EXZ),0,EXZ); EXIT.y=H(EXIT.x,EXIT.z)+80;
// Carrier sits well south of the valley mouth so the launch is open water.
// Nose points -Z, the same heading the valley transit uses.
// Real carrier model: bow is +X, deck at y=30.8, starboard island at +Z.
// The group is yawed so that bow points down the valley (-Z).
const CVN={deckY:30.8, jetX:-10, jetZ:8968, track:94};
CVN.top=CVN.deckY; CVN.jetY=CVN.deckY+1.75; CVN.bowZ=8874; CVN.midZ=9050;
// ---------- renderer ----------
const gl=$('gl'), R=new THREE.WebGLRenderer({canvas:gl,antialias:!PHONE,powerPreference:'high-performance'});
let batt=!!PHONE; try{const s=localStorage.ds17n_batt; if(s==='0')batt=false; else if(s==='1')batt=true}catch(e){}
function batteryOn(){return batt}
let renderScale=batt?0.8:1;
function pickPR(){const dpr=Math.min(devicePixelRatio||1,2); if(batteryOn()||PHONE)return 1; if(IPAD)return Math.min(dpr,1.25); return Math.min(dpr,1.75)}
let PR=pickPR(); R.setPixelRatio(PR*renderScale);
R.toneMapping=THREE.ACESFilmicToneMapping; R.toneMappingExposure=.88; R.shadowMap.enabled=!MOB; R.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(); scene.fog=null;
const cam=new THREE.PerspectiveCamera(60,1,1,16000); cam.rotation.order='YXZ';
const SCEN={turbidity:2.6,rayleigh:.95,mie:.0025,mieG:.78,sunEl:42.35,sunAz:2.198,sunInt:4.5,hemi:1.15,exposure:.88,env:.9,fogDen:0,fogFar:14000,snowAlt0:490,snowAlt1:700,snowAmt:1,warmth:0,clouds:0};
const SCEN_DEFAULT={...SCEN};
let NIGHT_ON=false, expPulse=0, nvOn=false, nightBase=SCEN.exposure, nightId='current';
function nightKick(a){if(!NIGHT_ON)return; expPulse=Math.min(.26, expPulse+(a||.16))}
function toggleNV(){nvOn=!nvOn; const g=$('nvg'); if(g)g.classList.toggle('on',nvOn); const b=$('nv'); if(b)b.classList.toggle('on',nvOn); document.querySelectorAll('#nightNV').forEach(el=>el.classList.toggle('on',nvOn))}
const SUN=new THREE.Vector3().setFromSphericalCoords(1,(90-SCEN.sunEl)*D2R,SCEN.sunAz);
const sky=new Sky(); sky.scale.setScalar(14000); const su=sky.material.uniforms;
su.turbidity.value=SCEN.turbidity; su.rayleigh.value=SCEN.rayleigh; su.mieCoefficient.value=SCEN.mie; su.mieDirectionalG.value=SCEN.mieG; su.sunPosition.value.copy(SUN);
let hemiL=new THREE.HemisphereLight(0x9bb6d4,0x5c584e,SCEN.hemi); scene.add(hemiL);
const sun=new THREE.DirectionalLight(0xfff0dc,SCEN.sunInt); sun.position.copy(SUN).multiplyScalar(1000); scene.add(sun); scene.add(sun.target);
scene.add(sky); sky.material.fog=false;
let envPM=null, wantPhotoEnv=true, photoEnvMap=null;
function rebuildEnv(){const es=new THREE.Scene(); const usePhoto=!!(photoEnvMap&&photoEnvMap.image&&wantPhotoEnv&&!NIGHT_ON);
 if(usePhoto){const ball=new THREE.Mesh(new THREE.SphereGeometry(50,28,16), new THREE.MeshBasicMaterial({map:photoEnvMap,side:THREE.BackSide,toneMapped:false,depthWrite:false,fog:false})); es.add(ball)}
 else {const s2=new Sky(); s2.scale.setScalar(1000); Object.assign(s2.material.uniforms.sunPosition.value,SUN); for(const k of['turbidity','rayleigh','mieCoefficient','mieDirectionalG'])s2.material.uniforms[k].value=su[k].value; es.add(s2)}
 if(!envPM)envPM=new THREE.PMREMGenerator(R); if(scene.environment)scene.environment.dispose?.(); scene.environment=envPM.fromScene(es).texture; scene.environmentIntensity=SCEN.env}
rebuildEnv();
const uSnowAlt0={value:SCEN.snowAlt0},uSnowAlt1={value:SCEN.snowAlt1},uSnowAmt={value:SCEN.snowAmt},uWarmth={value:SCEN.warmth};
function applyScen(){
 su.turbidity.value=SCEN.turbidity; su.rayleigh.value=SCEN.rayleigh; su.mieCoefficient.value=SCEN.mie; su.mieDirectionalG.value=SCEN.mieG;
 SUN.setFromSphericalCoords(1,(90-SCEN.sunEl)*D2R,SCEN.sunAz); su.sunPosition.value.copy(SUN); sun.position.copy(SUN).multiplyScalar(1000); sun.intensity=SCEN.sunInt; hemiL.intensity=SCEN.hemi;
 R.toneMappingExposure=SCEN.exposure*(MOB?.82/.88:1); scene.environmentIntensity=SCEN.env;
 uSnowAlt0.value=SCEN.snowAlt0; uSnowAlt1.value=SCEN.snowAlt1; uSnowAmt.value=SCEN.snowAmt; uWarmth.value=SCEN.warmth;
 if(SCEN.fogDen>0.00001){if(!scene.fog)scene.fog=new THREE.FogExp2(new THREE.Color(0xa7b2bd),SCEN.fogDen); scene.fog.density=SCEN.fogDen; scene.fog.color.setRGB(.65+SCEN.warmth*.05,.70,.74-SCEN.warmth*.04)} else scene.fog=null;
 // optional cloud cards density
 if(window.__cloudGroup){window.__cloudGroup.visible=SCEN.clouds>0.05; window.__cloudGroup.children.forEach((c,i)=>c.material.opacity=Math.min(.7,SCEN.clouds*(.35+i*.04)))}
 rebuildEnv();
}
sun.castShadow=!MOB&&!batteryOn(); sun.shadow.mapSize.set(512,512); sun.shadow.autoUpdate=false; sun.shadow.needsUpdate=true; {const c=sun.shadow.camera;c.left=c.bottom=-140;c.right=c.top=140;c.near=10;c.far=1600;} sun.shadow.bias=-.0004; sun.shadow.normalBias=.6;
// ---------- textures ----------
function tnoise(size,cells,oct,fn){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d'),im=x.createImageData(size,size);
 const h=(i,j,p)=>hash(((i%p)+p)%p,((j%p)+p)%p);
 const n=(u,v,p)=>{const i=Math.floor(u),j=Math.floor(v),fu=u-i,fv=v-j,a=fu*fu*(3-2*fu),b=fv*fv*(3-2*fv);return lerp(lerp(h(i,j,p),h(i+1,j,p),a),lerp(h(i,j+1,p),h(i+1,j+1,p),a),b)};
 for(let y=0;y<size;y++)for(let X=0;X<size;X++){let s=0,amp=.5,f=cells;for(let o=0;o<oct;o++){s+=n(X/size*f,y/size*f,f)*amp;f*=2;amp*=.5}const v=fn(s,X,y);im.data.set([v,v,v,255],(y*size+X)*4)}
 x.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t}
const detail=tnoise(256,8,5,s=>150+s*120|0); detail.repeat.set(160,440);
const panel=(()=>{const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.fillStyle='#b4b7ba';x.fillRect(0,0,512,512);
 for(let i=0;i<4000;i++){x.fillStyle=`rgba(${Math.random()<.5?0:255},${Math.random()<.5?0:255},${Math.random()<.5?0:255},.025)`;x.fillRect(Math.random()*512,Math.random()*512,3+Math.random()*30,3+Math.random()*30)}
 x.strokeStyle='rgba(40,42,46,.55)';x.lineWidth=1.2;let y=0;while(y<512){const hgt=40+Math.random()*90;x.beginPath();x.moveTo(0,y);x.lineTo(512,y);x.stroke();let X=0;while(X<512){const w=50+Math.random()*120;x.beginPath();x.moveTo(X,y);x.lineTo(X,y+hgt);x.stroke();X+=w}y+=hgt}
 x.fillStyle='rgba(30,30,34,.5)';for(let i=0;i<260;i++)x.fillRect(Math.random()*512,Math.random()*512,1.5,1.5);
 x.strokeStyle='rgba(60,62,66,.35)';for(let i=0;i<14;i++){x.beginPath();const px=Math.random()*512,py=Math.random()*512;x.moveTo(px,py);for(let k=0;k<4;k++)x.lineTo(px+(k%2?20:0)+k*15,py+(k%2?14:-14));x.stroke()}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t})();
const smokeTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),im=x.createImageData(128,128);
 for(let y=0;y<128;y++)for(let X=0;X<128;X++){const dx=(X-64)/64,dy=(y-64)/64,r=Math.sqrt(dx*dx+dy*dy);const n=fbm(X*.06+7,y*.06+3);const n2=fbm(X*.15+1,y*.15+9);const a=clamp((1-r)*1.5-.3+(n-.5)*1.2+(n2-.5)*.5,0,1);const l=clamp(.72+(64-y)/64*.22+(n2-.5)*.25,0,1)*255|0;im.data.set([l,l,l,a*a*255|0],(y*128+X)*4)}
 x.putImageData(im,0,0);return new THREE.CanvasTexture(c)})();
const glowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
 g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.3,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})();
// ---------- terrain mesh ----------
{const g=new THREE.PlaneGeometry(6400,30700,MOB?96:160,MOB?380:760); g.rotateX(-Math.PI/2); g.translate(0,0,-850);
 const p=g.attributes.position; for(let i=0;i<p.count;i++){const z=p.getZ(i),x=p.getX(i)+vx(z);p.setX(i,x);p.setY(i,H(x,z))}
 g.computeVertexNormals(); const n=g.attributes.normal, col=new Float32Array(p.count*3), c=new THREE.Color(), a=new THREE.Color(), b=new THREE.Color();
 const GR=[.27,.27,.18],SC=[.47,.44,.40],RK=[.30,.29,.28],SN=[.78,.81,.85],FL=[.38,.35,.29];
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=p.getY(i),ny=n.getY(i),r=fbm(x*.01,z*.01),r2=hash(x*.13,z*.17);
  let col0=ny>.93?GR:ny>.8?SC:RK; if(y<8&&Math.abs(x-vx(z))<70)col0=FL; a.setRGB(...col0);
  const snow=sstep(500,720,y+r*130)*sstep(.55,.9,ny)*sstep(.42,1.,ny); a.lerp(b.setRGB(...SN),snow);
  if(ny<.65&&y>200)a.lerp(b.setRGB(.34,.33,.32),sstep(.65,.35,ny)*.4);
  a.multiplyScalar(.82+r*.3+r2*.06); c.setRGB(a.r,a.g,a.b,THREE.SRGBColorSpace); col.set([c.r,c.g,c.b],i*3)}
 g.setAttribute('color',new THREE.BufferAttribute(col,3));
 const TL=new THREE.TextureLoader(),tx=f=>{const t=TL.load('tex/'+f+'.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t},txl=f=>{const t=TL.load('tex/'+f+'.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t};
 const TU={tA:{value:tx('aerial_grass_rock_diff')},tK:{value:tx('rocky_terrain_02_diff')},tAN:{value:txl('aerial_grass_rock_nor_gl')},tKN:{value:txl('rocky_terrain_02_nor_gl')},tR:{value:tx('Rock030')},tG:{value:tx('Grass004')},tD:{value:tx('Ground054')},tS:{value:tx('Snow006')},tM:{value:detail},tRN:{value:txl('rock_face_nor')},uSnowAlt0,uSnowAlt1,uSnowAmt,uWarmth};
 const tm=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.93,metalness:0,envMapIntensity:.35});
 tm.onBeforeCompile=sh=>{Object.assign(sh.uniforms,TU);
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;varying vec3 vWN;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;varying vec3 vWN;uniform sampler2D tR,tG,tD,tS,tM,tA,tK,tAN,tKN,tRN;uniform float uSnowAlt0,uSnowAlt1,uSnowAmt,uWarmth;').replace('#include <map_fragment>',`
  vec3 an=abs(normalize(vWN));an=pow(an,vec3(4.));an/=an.x+an.y+an.z;
  vec3 rk=(texture2D(tR,vWP.zy/38.).rgb*an.x+texture2D(tR,vWP.xz/38.).rgb*an.y+texture2D(tR,vWP.xy/38.).rgb*an.z);
  vec3 rk2=(texture2D(tR,vWP.zy/170.).rgb*an.x+texture2D(tR,vWP.xz/170.).rgb*an.y+texture2D(tR,vWP.xy/170.).rgb*an.z);
  rk=mix(rk,rk2,.45)*vec3(1.02,.98,.94);
  vec3 rkK=texture2D(tK,vWP.zy/64.).rgb*an.x+texture2D(tK,vWP.xz/64.).rgb*an.y+texture2D(tK,vWP.xy/64.).rgb*an.z;rk=mix(rk,rkK*vec3(.95,.93,.9),.55);
  float mac=texture2D(tM,vWP.xz/1400.).r;float mac2=texture2D(tM,vWP.xz/260.).r;
  vec3 gr=mix(texture2D(tG,vWP.xz/14.).rgb,texture2D(tG,vWP.xz/61.).rgb,.5)*vec3(.74,.70,.52);gr=mix(gr,vec3(dot(gr,vec3(.33))),.35);
  vec3 dt=mix(texture2D(tD,vWP.xz/18.).rgb,texture2D(tD,vWP.xz/83.).rgb,.5);
  vec3 aer=mix(texture2D(tA,vWP.xz/140.).rgb,texture2D(tA,vWP.xz/37.).rgb,.4);gr=mix(gr,aer*vec3(.86,.88,.8),.6);dt=mix(dt,aer,.45);
  vec3 sn=texture2D(tS,vWP.xz/22.).rgb*vec3(.88,.90,.93);
  float sl=normalize(vWN).y;
  float gw=smoothstep(.80,.93,sl+(mac2-.5)*.18)*(1.-smoothstep(320.,460.,vWP.y));
  vec3 c=mix(rk,mix(dt,gr,smoothstep(.2,.8,mac+mac2*.4-.2)*.8),gw);
  float alt=smoothstep(uSnowAlt0,uSnowAlt1,vWP.y+(mac-.5)*240.);
  float slopeKeep=smoothstep(.48,.86,sl);
  float sw=alt*slopeKeep*uSnowAmt;
  vec3 snSoft=mix(sn,rk,.18)*vec3(.94,.95,.97);
  c=mix(c,snSoft,sw);
  c=mix(c,rk,smoothstep(.7,.35,sl)*smoothstep(350.,800.,vWP.y)*.45);
  c*=.86+mac*.28;c=mix(vec3(dot(c,vec3(.33))),c,.88);
  c=mix(c,c*vec3(1.06,1.0,.92),clamp(uWarmth,0.,1.)*.35);
  diffuseColor.rgb*=c;`).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
  {vec3 wn=normalize(vWN);vec3 b=abs(wn);b=pow(b,vec3(4.));b/=b.x+b.y+b.z;
   vec2 kx=texture2D(tKN,vWP.zy/64.).xy*2.-1.,ky=texture2D(tKN,vWP.xz/64.).xy*2.-1.,kz=texture2D(tKN,vWP.xy/64.).xy*2.-1.;
   vec2 rn=texture2D(tRN,vWP.xz/48.).xy*2.-1.;ky=mix(ky,rn,.3);
   vec2 ay=texture2D(tAN,vWP.xz/37.).xy*2.-1.;float fl=smoothstep(.8,.93,wn.y);ky=mix(ky,ay,fl);
   float snN=smoothstep(uSnowAlt0,uSnowAlt1,vWP.y)*smoothstep(.48,.86,wn.y)*uSnowAmt;
   vec3 pert=vec3(0.,kx.y,kx.x)*b.x+vec3(ky.x,0.,ky.y)*b.y+vec3(kz.x,kz.y,0.)*b.z;
   normal=normalize(normal+(viewMatrix*vec4(pert,0.)).xyz*mix(.85,.45,snN));}`)};
const tmesh=new THREE.Mesh(g,tm);tmesh.receiveShadow=true;scene.add(tmesh);window.__tmesh=tmesh;}
const _gyRay=new THREE.Raycaster(), _gyDir=new THREE.Vector3(0,-1,0), _gyO=new THREE.Vector3();
function groundY(x,z){const mesh=window.__tmesh; if(!mesh)return H(x,z); _gyO.set(x,6000,z); _gyRay.set(_gyO,_gyDir); _gyRay.far=9000; const hit=_gyRay.intersectObject(mesh,false); return hit.length?hit[0].point.y:H(x,z)}
const BOMB_G=9.81, BOMB_DRAG=0.045, BOMB_BLAST=72;
const _bombRay=new THREE.Raycaster(), _bombDir=new THREE.Vector3(), _bombNext=new THREE.Vector3();
function bombAccel(v,dt){v.y-=BOMB_G*dt; v.multiplyScalar(Math.exp(-BOMB_DRAG*dt))}
const _gAim=new THREE.Vector3(), _gDir=new THREE.Vector3(), _gCur=new THREE.Vector3();
function guideBomb(b,dt){
 _gAim.set(BUNK.x, Math.max(BUNK.y+10, H(BUNK.x,BUNK.z)+6), BUNK.z);
 const dx=BUNK.x-b.p.x, dz=BUNK.z-b.p.z, dist=Math.hypot(dx, dz);
 let lift=_gAim.y;
 if(dist>140){for(let i=1;i<=5;i++){const k=i/6; lift=Math.max(lift, H(b.p.x+dx*k, b.p.z+dz*k)+70)} _gAim.y=lift}
 _gDir.subVectors(_gAim, b.p); const L=_gDir.length()||1; _gDir.multiplyScalar(1/L);
 const sp=Math.max(160, Math.min(240, b.v.length()||180));
 if(b.v.lengthSq()<4) b.v.copy(_gDir).multiplyScalar(sp);
 _gCur.copy(b.v).normalize();
 _gCur.lerp(_gDir, Math.min(1, dt*(dist<200?4.5:2.2))).normalize();
 b.v.copy(_gCur).multiplyScalar(sp)}
function bombCast(from,to){
 const dir=_bombDir.subVectors(to,from), len=dir.length();
 if(len<0.04)return null;
 dir.multiplyScalar(1/len);
 _bombRay.set(from,dir); _bombRay.near=0; _bombRay.far=len+0.25;
 const list=[];
 if(window.__tmesh&&window.__tmesh.visible)list.push(window.__tmesh);
 if(typeof bunker!=='undefined'&&bunker&&bunker.visible)list.push(bunker);
 if(!list.length)return null;
 const hits=_bombRay.intersectObjects(list,true);
 if(!hits.length)return null;
 const h=hits[0]; let onBunk=false, o=h.object;
 while(o){if(o===bunker){onBunk=true; break} o=o.parent}
 return {p:h.point.clone(), onBunk}}
// Optional cloud cards for scenery tester (hidden at SCEN.clouds=0)
{const cg=new THREE.Group();cg.visible=false;window.__cloudGroup=cg;const N=MOB?6:10;
 for(let i=0;i<N;i++){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');
  const g=x.createRadialGradient(64,64,8,64,64,60);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(.5,'rgba(255,255,255,.18)');g.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=g;x.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false,fog:true,opacity:.0}));
  const z=-2000-Math.random()*12000,x0=vx(z)+rnd(2500);s.position.set(x0,520+Math.random()*480,z);s.scale.set(800+Math.random()*1200,280+Math.random()*400,1);cg.add(s)}
 scene.add(cg)}
// Small settlement / roads near bunker (readable compound)
{const camp=new THREE.Group();const roadM=new THREE.MeshStandardMaterial({color:0x4a453c,roughness:.95});
 const pad=new THREE.Mesh(new THREE.PlaneGeometry(90,18),roadM);pad.rotation.x=-Math.PI/2;pad.position.set(30,1.2,-40);camp.add(pad);
 const pad2=pad.clone();pad2.position.set(-20,1.2,55);pad2.rotation.z=.4;camp.add(pad2);
 for(let i=0;i<(MOB?6:10);i++){const b=new THREE.Mesh(new THREE.BoxGeometry(6+Math.random()*8,3+Math.random()*4,5+Math.random()*7),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(.08,.08,.28+Math.random()*.12),roughness:.9}));
  b.position.set(rnd(120),b.geometry.parameters.height/2+1,rnd(100)-20);camp.add(b)}
 // perimeter berms
 for(const [x,z,ry] of[[-90,0,0],[90,0,0],[0,-80,1.57],[0,90,1.57]]){const berm=new THREE.Mesh(new THREE.BoxGeometry(140,3.5,10),new THREE.MeshStandardMaterial({color:0x5a5348,roughness:1}));berm.position.set(x,2,z);berm.rotation.y=ry;camp.add(berm)}
 camp.position.copy(BUNK);scene.add(camp);}
// conifers (instanced lathe, two LODs by distance band handled via fog) + boulders
{const prof=[];const T=4;prof.push(new THREE.Vector2(.0,0));prof.push(new THREE.Vector2(.35,0));prof.push(new THREE.Vector2(.35,2));
 for(let i=0;i<T;i++){const y0=2+i*3.2,r0=3.2*(1-i/T)+.6;prof.push(new THREE.Vector2(r0,y0));prof.push(new THREE.Vector2(r0*.35,y0+3.4))}prof.push(new THREE.Vector2(0,15.5));
 const g=new THREE.LatheGeometry(prof,7); const N=MOB?520:2800, m=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({color:0x1f2a1b,roughness:.97}),N), M=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), C=new THREE.Color();
 let k=0; for(let i=0;i<N*4&&k<N;i++){const z=1000-Math.random()*17000, x=vx(z)+rnd(700), y=H(x,z); if(y>260||y<4||Math.hypot(x-BUNK.x,z-BUNK.z)<230||fbm(x*.004,z*.004)<.45)continue;
  const s=.7+Math.random()*.9; q.setFromEuler(e.set(rnd(.05),Math.random()*6,rnd(.05))); M.compose(new THREE.Vector3(x,y-.5,z),q,new THREE.Vector3(s,s*(.85+Math.random()*.5),s)); m.setMatrixAt(k,M); m.setColorAt(k,C.setHSL(.25+rnd(.05),.18+Math.random()*.1,.55+Math.random()*.45)); k++} m.count=k; m.castShadow=false; scene.add(m); (window.__farBits=window.__farBits||[]).push(m);
 const bg=new THREE.DodecahedronGeometry(1,0), bm=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x8a847c,roughness:1,map:(()=>{const t=new THREE.TextureLoader().load('tex/rocky_terrain_02_diff.jpg');t.colorSpace=THREE.SRGBColorSpace;return t})(),normalMap:new THREE.TextureLoader().load('tex/rocky_terrain_02_nor_gl.jpg')}),MOB?140:1100); k=0;bm.castShadow=!MOB;bm.receiveShadow=true;
 for(let i=0;i<(MOB?140:1100);i++){const z=1000-Math.random()*17000, x=vx(z)+rnd(500), y=H(x,z); const s=1+Math.random()*4; q.setFromEuler(e.set(Math.random()*3,Math.random()*3,0)); M.compose(new THREE.Vector3(x,y-s*.3,z),q,new THREE.Vector3(s,s*(.45+Math.random()*.35),s*(.9+Math.random()*.6))); bm.setMatrixAt(k++,M)} scene.add(bm); window.__farBits.push(bm);}
// Photographic sky. Alps Field, Poly Haven, CC0. The photo's meadow is faded
// to the same haze as the valley fog, so the ridges meet the picture.
const HAZE_HEX=0x616c76, HAZE_DEN=0.0002;
const skyFile=PHONE?'tex/sky/alps-field-2k.jpg':'tex/sky/alps-field-4k.jpg';
const skyTex=new THREE.TextureLoader().load(skyFile);
skyTex.colorSpace=THREE.SRGBColorSpace; skyTex.anisotropy=4;
const skyMat=new THREE.MeshBasicMaterial({map:skyTex,side:THREE.BackSide,fog:false,toneMapped:false,depthWrite:false});
skyMat.onBeforeCompile=sh=>{
 sh.uniforms.uHaze={value:new THREE.Color(HAZE_HEX)};
 sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 uHaze;').replace('#include <map_fragment>',`#include <map_fragment>
  float g=smoothstep(0.60,0.50,vMapUv.y);
  diffuseColor.rgb=mix(diffuseColor.rgb,uHaze,g);`)};
const photoSky=new THREE.Mesh(new THREE.SphereGeometry(12000,PHONE?32:48,PHONE?16:24),skyMat);
photoSky.frustumCulled=false; photoSky.renderOrder=-2; scene.add(photoSky); window.__photoSky=photoSky;
new THREE.TextureLoader().load('tex/sky/alps-field-env.jpg', t=>{photoEnvMap=t; t.colorSpace=THREE.SRGBColorSpace; if(wantPhotoEnv&&!NIGHT_ON)rebuildEnv()});
const tankerBeacon=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xffc14a,transparent:true,depthWrite:false,depthTest:false,fog:false,blending:THREE.AdditiveBlending}));
tankerBeacon.visible=false; tankerBeacon.renderOrder=4; tankerBeacon.frustumCulled=false; scene.add(tankerBeacon);
const fuelGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xffc56a,transparent:true,depthWrite:false,depthTest:false,fog:false,blending:THREE.AdditiveBlending,opacity:.95}));
fuelGlow.material.opacity=.16; fuelGlow.scale.setScalar(2.2); fuelGlow.visible=false; fuelGlow.frustumCulled=false; fuelGlow.renderOrder=5; scene.add(fuelGlow);
const fuelMist=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xd5e2ee,transparent:true,depthWrite:false,depthTest:false,fog:false,blending:THREE.AdditiveBlending,opacity:.1}));
fuelMist.visible=false; fuelMist.frustumCulled=false; fuelMist.renderOrder=5; fuelMist.scale.setScalar(2.4); scene.add(fuelMist);
window.__hiScenery={skirt:0,clouds:0,peaks:0,photo:1};
// ---------- materials ----------
const concrete=new THREE.MeshStandardMaterial({color:0x8d8a83,roughness:.95,map:detail.clone()}); concrete.map.repeat.set(2,2);
const steel=new THREE.MeshStandardMaterial({color:0x4a4d4e,roughness:.6,metalness:.6});
const olive=new THREE.MeshStandardMaterial({color:0x4a4e3a,roughness:.85,metalness:.1});
const dark=new THREE.MeshStandardMaterial({color:0x151617,roughness:.9});
const earth=new THREE.MeshStandardMaterial({color:0x5b5246,roughness:1,map:detail});
const box=(w,h,d,mat,x,y,z,par,ry=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.rotation.y=ry;par.add(m);return m};
function truck(par,x,z,ry,tel){const t=new THREE.Group();t.position.set(x,0,z);t.rotation.y=ry;par.add(t);box(2.5,2.2,2.2,olive,0,1.9,-3.4,t);box(2.6,.5,7.5,steel,0,.9,0,t);
 if(tel){const r=new THREE.Group();r.position.set(0,1.6,1);r.rotation.x=-.55;t.add(r);for(let i=0;i<4;i++)box(.75,.75,6,olive,-.6+(i%2)*1.2,(i>>1)*.8,-1.5,r)}else box(2.5,2.4,5,olive,0,2.4,1,t);
 const wg=new THREE.CylinderGeometry(.55,.55,.4,10);wg.rotateZ(Math.PI/2);for(const wz of[-3.2,-.5,2.4])for(const s of[-1,1]){const w=new THREE.Mesh(wg,dark);w.position.set(s*1.3,.55,wz);t.add(w)}return t}
// ---------- bunker complex ----------
const bunker=new THREE.Group(); bunker.position.copy(BUNK); scene.add(bunker);
const tgtGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xffd27a,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
tgtGlow.position.set(BUNK.x,BUNK.y+48,BUNK.z); tgtGlow.scale.setScalar(36); scene.add(tgtGlow);
const tgtBeam=new THREE.Mesh(new THREE.CylinderGeometry(.8,.8,90,6,1,true),new THREE.MeshBasicMaterial({color:0xffc56a,transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
tgtBeam.position.set(BUNK.x,BUNK.y+45,BUNK.z); scene.add(tgtBeam);
const radDish=new THREE.Group();
{const ry=Math.atan2(vx(BZ-50)-vx(BZ+50),-100); bunker.rotation.y=0;
 box(150,1.2,110,concrete,0,-.4,0,bunker);
 const berm=new THREE.Mesh(new THREE.SphereGeometry(40,24,10,0,Math.PI*2,0,Math.PI/2),earth);berm.scale.set(1,.32,.8);berm.position.z=8;bunker.add(berm);
 box(26,12,6,concrete,0,6,-22,bunker); box(18,9,1,dark,0,4.5,-25.2,bunker);
 const hz=(()=>{const c=document.createElement('canvas');c.width=128;c.height=128;const x=c.getContext('2d');x.fillStyle='#585b58';x.fillRect(0,0,128,128);x.fillStyle='#8c7a3a';for(let i=-4;i<8;i++){x.beginPath();x.moveTo(i*24,128);x.lineTo(i*24+12,128);x.lineTo(i*24+44,100);x.lineTo(i*24+32,100);x.fill()}x.strokeStyle='#3a3c3a';x.lineWidth=2;for(let i=0;i<4;i++)x.strokeRect(6,6+i*24,116,20);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t})();
 const dm=new THREE.MeshStandardMaterial({map:hz,roughness:.55,metalness:.6});box(8.2,8.5,.8,dm,-4.15,4.4,-25.6,bunker);box(8.2,8.5,.8,dm,4.15,4.4,-25.6,bunker);
 for(const s of[-1,1])box(3,10,14,concrete,s*14,5,-16,bunker,s*.25);
 for(const [x,z] of[[-30,25],[30,28],[0,40]]){box(3,5,3,concrete,x,2.5,z,bunker);box(3.6,.4,3.6,steel,x,5.2,z,bunker)}
 // fence (instanced posts + chain-link planes)
 const fc=document.createElement('canvas');fc.width=fc.height=64;{const x=fc.getContext('2d');x.strokeStyle='rgba(150,150,150,.9)';x.lineWidth=1;for(let i=-64;i<128;i+=8){x.beginPath();x.moveTo(i,0);x.lineTo(i+64,64);x.moveTo(i+64,0);x.lineTo(i,64);x.stroke()}}
 const ft=new THREE.CanvasTexture(fc);ft.wrapS=ft.wrapT=THREE.RepeatWrapping;const fm=new THREE.MeshStandardMaterial({map:ft,transparent:true,alphaTest:.3,side:THREE.DoubleSide,metalness:.5,roughness:.6});
 const FW=170,FD=130;for(const [w,x,z,r] of[[FW,0,-FD/2,0],[FW,0,FD/2,0],[FD,-FW/2,0,Math.PI/2],[FD,FW/2,0,Math.PI/2]]){const t=ft.clone();t.repeat.set(w/2.5,1);const pm=new THREE.Mesh(new THREE.PlaneGeometry(w,2.6),fm.clone());pm.material.map=t;pm.position.set(x,1.3,z);pm.rotation.y=r;if(z===-FD/2){pm.scale.x=.4;pm.position.x=-FW*.3}bunker.add(pm)}
 const pg=new THREE.CylinderGeometry(.08,.08,2.9,4),posts=new THREE.InstancedMesh(pg,steel,140),M=new THREE.Matrix4();let k=0;
 for(let i=0;i<=FW;i+=5){for(const z of[-FD/2,FD/2]){if(z<0&&i>FW*.5)continue;M.makeTranslation(-FW/2+i,1.45,z);posts.setMatrixAt(k++,M)}}for(let i=0;i<=FD;i+=5)for(const x of[-FW/2,FW/2]){M.makeTranslation(x,1.45,-FD/2+i);posts.setMatrixAt(k++,M)}posts.count=k;bunker.add(posts);
 // radar dish
 box(1,14,1,steel,52,7,30,bunker);radDish.position.set(52,14.5,30);bunker.add(radDish);
 const dg=new THREE.SphereGeometry(5,20,8,0,Math.PI*2,0,.6);const d=new THREE.Mesh(dg,new THREE.MeshStandardMaterial({color:0xb9bcbc,roughness:.5,metalness:.3,side:THREE.DoubleSide}));d.rotation.x=-1.3;radDish.add(d);
 // buildings, tower, vehicles, barriers
 box(22,5,10,concrete,-48,2.5,-38,bunker);box(23,.5,11,steel,-48,5.2,-38,bunker);box(14,4,9,concrete,-50,2,40,bunker);
 box(4,.4,4,steel,70,10,-55,bunker);for(const [a,b] of[[-1,-1],[1,-1],[-1,1],[1,1]])box(.3,10,.3,steel,70+a*1.6,5,-55+b*1.6,bunker);box(4,2.2,4,olive,70,11.5,-55,bunker);
 truck(bunker,-20,-40,.3);truck(bunker,22,-44,-.2);truck(bunker,40,10,1.5);truck(bunker,-12,50,Math.PI/2);
 for(let i=0;i<10;i++)box(3,1.2,.6,concrete,-20+i*4.2,.6,-60,bunker);
 box(8,.8,500,new THREE.MeshStandardMaterial({color:0x3e3a34,roughness:1}),0,-.5,-310,bunker);}
function mergeByMaterial(group, skip){if(!group)return; group.updateWorldMatrix(true,true); const inv=new THREE.Matrix4().copy(group.matrixWorld).invert(); const buckets=new Map(); const meshes=[];
 group.traverse(o=>{if(!o.isMesh||o.isInstancedMesh)return; let p=o; while(p){if(p===skip)return; p=p.parent} meshes.push(o)});
 for(const m of meshes){const key=m.material&&m.material.uuid; if(!key)continue; if(!buckets.has(key))buckets.set(key,[]); buckets.get(key).push(m)}
 const v=new THREE.Vector3(), nrm=new THREE.Vector3(), normalMatrix=new THREE.Matrix3();
 for(const list of buckets.values()){if(list.length<2)continue; let vc=0, ic=0; for(const m of list){const g=m.geometry; vc+=g.attributes.position.count; ic+=g.index?g.index.count:g.attributes.position.count}
  const pos=new Float32Array(vc*3), nor=new Float32Array(vc*3), idx=new Uint32Array(ic); let vo=0, io=0;
  for(const m of list){const g=m.geometry, pa=g.attributes.position, na=g.attributes.normal; const local=new THREE.Matrix4().multiplyMatrices(inv,m.matrixWorld); normalMatrix.getNormalMatrix(local); const base=vo;
   for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i).applyMatrix4(local); pos[vo*3]=v.x; pos[vo*3+1]=v.y; pos[vo*3+2]=v.z; if(na){nrm.fromBufferAttribute(na,i).applyMatrix3(normalMatrix).normalize(); nor[vo*3]=nrm.x; nor[vo*3+1]=nrm.y; nor[vo*3+2]=nrm.z} vo++}
   if(g.index){for(let i=0;i<g.index.count;i++)idx[io++]=g.index.getX(i)+base} else {for(let i=0;i<pa.count;i++)idx[io++]=base+i}
   m.visible=false}
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(pos,3)); geo.setAttribute('normal',new THREE.BufferAttribute(nor,3)); geo.setIndex(new THREE.BufferAttribute(idx,1));
  const mesh=new THREE.Mesh(geo,list[0].material); mesh.castShadow=list.some(m=>m.castShadow); mesh.receiveShadow=true; group.add(mesh)}}
mergeByMaterial(bunker, radDish);
// SAM site and EW radar
const sam=new THREE.Group(); sam.position.copy(SAMP); scene.add(sam);
{truck(sam,0,0,.6,true);truck(sam,14,8,-.4);const rv=new THREE.Mesh(new THREE.TorusGeometry(10,1.2,6,24),earth);rv.rotation.x=Math.PI/2;rv.scale.z=.8;sam.add(rv);}
const SITE_G=[];
SITES.slice(0,2).forEach((st,i)=>{const g=new THREE.Group();g.position.copy(st.p);scene.add(g);truck(g,0,0,1.2,true);truck(g,12,-6,.2);const rv=new THREE.Mesh(new THREE.TorusGeometry(9,1.1,6,24),earth);rv.rotation.x=Math.PI/2;rv.scale.z=.8;g.add(rv);g.traverse(o=>{if(o.isMesh)o.castShadow=true});SITE_G[i]=g});
SITE_G[2]=sam; mergeByMaterial(sam); SITE_G.slice(0,2).forEach(mergeByMaterial);
const bulge=new THREE.Mesh(new THREE.SphereGeometry(1,24,10,0,Math.PI*2,0,Math.PI/2),earth);bulge.visible=false;scene.add(bulge);
const radar=new THREE.Group(); radar.position.copy(RADP); scene.add(radar);
{box(1.4,22,1.4,steel,0,11,0,radar);const d=new THREE.Mesh(new THREE.SphereGeometry(9,20,12),new THREE.MeshStandardMaterial({color:0xd8d8d4,roughness:.6}));d.position.y=27;radar.add(d);box(10,4,8,concrete,8,2,6,radar);}
mergeByMaterial(radar);
// ---------- jet (procedural, detailed) ----------
const jet=new THREE.Group(); jet.rotation.order='YXZ'; scene.add(jet);
const skin=new THREE.MeshStandardMaterial({color:0x6c7177,map:panel,roughness:.78,metalness:.18,envMapIntensity:.9});
function loft(secs){const P=[],U=[],idx=[],NP=8;secs.forEach((s,i)=>{const {z,w,h,hb,cy=0,ch=0}=s;const pts=[[w,cy+ch],[w*.62,cy+h*.78],[0,cy+h],[-w*.62,cy+h*.78],[-w,cy+ch],[-w*.66,cy-hb*.82],[0,cy-hb],[w*.66,cy-hb*.82]];
 pts.forEach((p,j)=>{P.push(p[0],p[1],z);U.push(j*.5,z/3)});pts.length&&(P.push(pts[0][0],pts[0][1],z),U.push(NP*.5,z/3))});
 const RW=NP+1;for(let i=0;i<secs.length-1;i++)for(let j=0;j<NP;j++){const a=i*RW+j,b=a+1,c=a+RW,d=c+1;idx.push(a,c,b,b,c,d)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));g.setIndex(idx);const n=g.toNonIndexed();n.computeVertexNormals();return n}
function slab(pts,depth=.12){const s=new THREE.Shape();s.moveTo(...pts[0]);pts.slice(1).forEach(p=>s.lineTo(...p));const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:.03,bevelSize:.04,bevelSegments:1});
 const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/3,uv.getY(i)/3);return g}
{const fus=loft([{z:-9.4,w:.04,h:.04,hb:.04},{z:-8.4,w:.38,h:.26,hb:.2},{z:-7,w:.75,h:.5,hb:.36,ch:-.05},{z:-5.2,w:1.08,h:.82,hb:.48,ch:-.08},{z:-3.4,w:1.55,h:.95,hb:.55,ch:-.1},
  {z:-1.4,w:2.3,h:.85,hb:.62,ch:-.12},{z:1.2,w:2.45,h:.78,hb:.64,ch:-.1},{z:3.4,w:2.1,h:.7,hb:.6},{z:5.2,w:1.35,h:.66,hb:.62},{z:6.1,w:1.05,h:.62,hb:.62}]);
 jet.add(new THREE.Mesh(fus,skin));
 // DSI intakes: angled boxes + dark inlets + bump
 for(const s of[-1,1]){const g=loft([{z:-3.6,w:.18,h:.35,hb:.35},{z:-3.0,w:.42,h:.48,hb:.45},{z:-.5,w:.5,h:.5,hb:.5},{z:1.5,w:.35,h:.42,hb:.42}]);const m=new THREE.Mesh(g,skin);m.position.set(s*1.55,-.05,0);m.rotation.z=s*.18;jet.add(m);
  const inl=new THREE.Mesh(new THREE.PlaneGeometry(.75,.85),dark);inl.position.set(s*1.62,-.05,-3.05);inl.rotation.y=s*.35;jet.add(inl)}
 const wing=new THREE.Mesh(slab([[-1.8,2.6],[1.8,2.6],[5.6,-2.3],[5.6,-3.25],[2.1,-4.15],[-2.1,-4.15],[-5.6,-3.25],[-5.6,-2.3]]),skin);wing.rotation.x=-Math.PI/2;wing.position.y=-.18;jet.add(wing);
 const st=new THREE.Mesh(slab([[-1.2,-3.9],[1.2,-3.9],[3.6,-5.7],[3.6,-6.75],[1.0,-6.6],[-1.0,-6.6],[-3.6,-6.75],[-3.6,-5.7]],.08),skin);st.rotation.x=-Math.PI/2;st.position.y=-.05;jet.add(st);
 for(const s of[-1,1]){const fg=slab([[0,0],[1.85,2.35],[2.75,2.35],[3.25,0]],.08);fg.rotateY(-Math.PI/2);const f=new THREE.Mesh(fg,skin);const p=new THREE.Group();p.position.set(s*1.25,.55,1.6);p.rotation.z=-s*.44;p.add(f);jet.add(p)}
 // canopy: tinted gold, reflective
 const cg=new THREE.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI/2);const can=new THREE.Mesh(cg,new THREE.MeshPhysicalMaterial({color:0x50411f,metalness:.9,roughness:.08,clearcoat:1,envMapIntensity:1.6}));
 can.scale.set(.62,.55,2.3);can.position.set(0,.72,-4.6);jet.add(can);const fr=new THREE.Mesh(new THREE.TorusGeometry(.6,.04,4,16,Math.PI),dark);fr.position.set(0,.72,-4.1);fr.scale.y=.92;jet.add(fr);
 // nozzle: serrated ring, dark interior, faint heat glow, shimmer quad
 const nz=new THREE.Mesh(new THREE.CylinderGeometry(.82,.95,1.3,14,1,true),new THREE.MeshStandardMaterial({color:0x3b3633,metalness:.7,roughness:.45,side:THREE.DoubleSide}));nz.rotation.x=Math.PI/2;nz.position.z=6.6;jet.add(nz);
 const core=new THREE.Mesh(new THREE.CircleGeometry(.6,14),new THREE.MeshBasicMaterial({color:0x40180a}));core.position.z=6.1;jet.add(core);jet.userData.core=core;
 const sh=new THREE.Mesh(new THREE.PlaneGeometry(2.4,2.4),new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{t:{value:0},a:{value:.5}},
  vertexShader:'varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform float t,a;varying vec2 u;void main(){vec2 p=u-.5;float r=length(p);float n=sin(p.x*40.+t*30.)*sin(p.y*36.-t*24.);gl_FragColor=vec4(vec3(1.,.55,.25)*(.06+.04*n)*smoothstep(.5,.0,r)*a,1.);}'}));
 sh.position.z=7.6;jet.add(sh);jet.userData.sh=sh;
 // nav lights
 for(const [x,c] of[[-5.55,0xff2a20],[5.55,0x30ff50]]){const l=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:c,blending:THREE.AdditiveBlending,depthWrite:false}));l.scale.setScalar(.6);l.position.set(x,-.15,2.7);jet.add(l)}
 const probeG=new THREE.Group(); probeG.name='probe';
 const pMat=new THREE.MeshStandardMaterial({color:0xc5ccd2,metalness:.82,roughness:.3,envMapIntensity:.85});
 const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.04,.056,2.85,16), pMat); shaft.rotation.x=Math.PI/2; shaft.position.set(.95,-.28,-7.52);
 const neck=new THREE.Mesh(new THREE.CylinderGeometry(.05,.04,.34,16), pMat); neck.rotation.x=Math.PI/2; neck.position.set(.95,-.28,-8.9);
 const tip=new THREE.Mesh(new THREE.SphereGeometry(.052,16,12), pMat); tip.position.set(.95,-.28,-9.05); tip.name='tip';
 const band=new THREE.Mesh(new THREE.TorusGeometry(.064,.011,6,18), pMat); band.position.set(.95,-.28,-8.68);
 probeG.add(shaft,neck,tip,band); jet.add(probeG); jet.userData.probe=probeG;}
bunker.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});sam.traverse(o=>{if(o.isMesh)o.castShadow=true});
// ---------- GLB jet (F-35 Lightning II by bohmerang, Sketchfab) ----------
jet.traverse(o=>{if(o.isMesh&&o!==jet.userData.sh)o.castShadow=true});
window.__glb='loading';
import('./vendor/jsm/loaders/GLTFLoader.js').then(({GLTFLoader})=>new GLTFLoader().load('models/f35.glb',gl=>{
 const m=gl.scene;const bb=new THREE.Box3().setFromObject(m),sz=bb.getSize(new THREE.Vector3()),ct=bb.getCenter(new THREE.Vector3());
 const ax=sz.x>sz.z?'x':'z';const wrap=new THREE.Group();m.position.sub(ct);wrap.add(m);
 const L=Math.max(sz.x,sz.z);wrap.scale.setScalar(14.5/L);
 wrap.rotation.y=(ax==='x'?Math.PI/2:0)+(window.__jetFlip?Math.PI:0);
 m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;const mt=o.material;if(mt&&mt.isMeshStandardMaterial){mt.envMapIntensity=1;if(!mt.transparent){mt.roughness=Math.max(mt.roughness,.45)}}}});
 for(const c of[...jet.children])if(c.isMesh&&c!==jet.userData.sh&&c!==jet.userData.core&&c.parent&&c.parent.name!=='probe')c.visible=false;
 for(const c of jet.children)if(c.isGroup&&c.name!=='probe')c.visible=false;
 jet.userData.core.visible=false;jet.add(wrap);window.__glb='ok';
 const sc=14.5/L, lat=(ax==='x'?sz.z:sz.x)*sc, tall=sz.y*sc;
 jet.userData.span=Math.max(8,lat); jet.userData.jetH=Math.max(2.4,tall);
},undefined,e=>{window.__glb='fail';console.warn('glb',e)})).catch(e=>{window.__glb='fail'});
// ---------- carrier, real models, golden-hour sea ----------
const carrier=new THREE.Group();
carrier.rotation.y=Math.PI/2; carrier.position.set(0,0,9200); carrier.visible=false; scene.add(carrier);
const deckDetail=new THREE.Group(); carrier.add(deckDetail); CVN.detail=deckDetail;
CVN._cam=new THREE.Vector3(); CVN._look=new THREE.Vector3(); CVN._cam2=new THREE.Vector3(); CVN._look2=new THREE.Vector3();
CVN._hub=new THREE.Vector3(8,CVN.deckY,9020); CVN._shW=new THREE.Vector3();
const deckFill=new THREE.PointLight(0xffe0b8,0,80,2); deckFill.position.set(-40,52,8986); scene.add(deckFill); CVN.fill=deckFill;
CVN.nJets=0; CVN.nCrew=0; CVN.nTugs=0; CVN.wake={children:[]};
const seaGeo=new THREE.PlaneGeometry(10000,15000,24,32); seaGeo.rotateX(-Math.PI/2);
const seaMat=new THREE.ShaderMaterial({
  uniforms:{uTime:{value:0},uSun:{value:new THREE.Vector3(.45,.22,-.35)}},
  vertexShader:`uniform float uTime; varying vec3 vW; varying vec3 vN;
    void main(){vec3 p=position;
      float wx=p.x*0.018+uTime*0.65, wz=p.z*0.015-uTime*0.42;
      p.y+=sin(wx)*0.42+sin(wz)*0.32;
      vN=normalize(vec3(-cos(wx)*0.018*0.42,1.0,-cos(wz)*0.015*0.32));
      vec4 w=modelMatrix*vec4(p,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform vec3 uSun; varying vec3 vW; varying vec3 vN;
    void main(){vec3 n=normalize(vN); vec3 v=normalize(cameraPosition-vW); vec3 s=normalize(uSun);
      float fres=pow(1.0-max(dot(n,v),0.0),3.2);
      float spec=pow(max(dot(reflect(-s,n),v),0.0),90.0);
      vec3 deep=vec3(0.03,0.07,0.12); vec3 body=vec3(0.07,0.18,0.24); vec3 gold=vec3(1.0,0.68,0.38);
      vec3 col=mix(deep,body,0.35+fres*0.55); col+=gold*(spec*0.9+fres*0.16);
      gl_FragColor=vec4(col,1.0);}`
});
const sea=new THREE.Mesh(seaGeo,seaMat); sea.position.set(0,0,7800); sea.visible=false; sea.frustumCulled=false; scene.add(sea); CVN.sea=sea;
function prepMat(root,fn){root.traverse(o=>{if(!o.isMesh)return; const list=[].concat(o.material); list.forEach(m=>{if(m)fn(m,o)}); o.castShadow=true; o.receiveShadow=true;})}
function tintCrew(root,hex){root.traverse(o=>{if(!o.isMesh||!o.material)return;
  const list=[].concat(o.material).map(m=>{const n=(m.name||'').toLowerCase(); if(n.includes('skin')||n.includes('hair'))return m;
    const c=m.clone(); c.map=null; c.normalMap=null; c.color.setHex(hex); c.roughness=.62; c.metalness=.02; return c});
  o.material=Array.isArray(o.material)?list:list[0]; o.castShadow=true; o.frustumCulled=false;})}
function armBones(root){const names=['upper_armL','forearmL','handL','upper_armR','forearmR','handR','thighL','shinL','footL','thighR','shinR','footR','spine','pelvis'];
  const rig={},rest={}; names.forEach(n=>{const b=root.getObjectByName(n); if(!b)return; rest[n]=b.rotation.clone(); rig[n]=b}); return {rig,rest}}
function setBone(pack,n,dx,dy,dz){const b=pack.rig[n],r=pack.rest[n]; if(!b||!r)return; b.rotation.set(r.x+dx,r.y+dy,r.z+dz)}
function armsDown(pack){setBone(pack,'upper_armL',0,0,1.35); setBone(pack,'upper_armR',0,0,-1.35); setBone(pack,'forearmL',0,0,.25); setBone(pack,'forearmR',0,0,-.25)}
function loadDeck(){if(CVN._loading||CVN._ready)return; CVN._loading=1;
 import('./vendor/jsm/loaders/GLTFLoader.js').then(({GLTFLoader})=>{
  const loader=new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const get=url=>new Promise((res,rej)=>loader.load(url,res,undefined,rej));
  Promise.all(['carrier','f15','crew','tractor','heli'].map(k=>get('models/deck/'+k+'.glb'))).then(([ship,jetM,crewM,tugM,heliM])=>{
    const shipRoot=ship.scene; carrier.add(shipRoot);
    prepMat(shipRoot,m=>{if(m.envMapIntensity!=null)m.envMapIntensity=1.15; if(m.metalness!=null&&m.metalness>.2)m.envMapIntensity=1.4});
    shipRoot.traverse(o=>{if(o.isMesh){o.castShadow=/Hull|Island|Flight|Gallery|mast/i.test((o.parent&&o.parent.name)||o.name||''); o.receiveShadow=true}});
    const face=Math.PI/2;
    function parkJet(x,z,yaw){const g=jetM.scene.clone(true); g.position.set(x,CVN.deckY,z); g.rotation.y=yaw==null?face:yaw; g.traverse(o=>{if(!o.isMesh)return; o.castShadow=false; o.receiveShadow=true;
      const n=(o.name||''); if(/Canopy/i.test(n)){const m=o.material.clone(); m.roughness=.05; m.metalness=.92; m.envMapIntensity=2.2; o.material=m}});
      deckDetail.add(g); return g}
    [[244,8],[250,-12],[248,14],[178,28],[150,26],[142,-27]].forEach((p,i)=>parkJet(p[0],p[1], face+(i%3?0:.08)));
    CVN.taxiBase=238; CVN.taxi=parkJet(238,-16,face); CVN.cat2=parkJet(308,12,face);
    const tug=tugM.scene.clone(true); tug.position.set(250,CVN.deckY,18); tug.rotation.y=face; tug.scale.setScalar(1.7); tug.traverse(o=>{if(o.isMesh&&o.material){const n=(o.material.name||'').toLowerCase(); if(n.includes('leaf')||n.includes('gold')){o.material=o.material.clone(); o.material.color.setHex(0xd6a31a)}}}); deckDetail.add(tug); CVN.tug=tug;
    const tug2=tug.clone(true); tug2.position.set(168,CVN.deckY,22); tug2.scale.setScalar(1.15); deckDetail.add(tug2);
    const colors=[0xd6a31a,0x2f7a3a,0xa33b32,0xe6e2d8,0x6e3b78];
    const spots=[[296,-4,0],[254,22,1],[248,14,2],[242,8,0],[236,-8,3],[186,26,3],[150,-22,4],[220,22,4]];
    spots.forEach((s,i)=>{const g=cloneSkin(crewM.scene); g.position.set(s[0],CVN.deckY,s[1]); g.rotation.y=face+(i%2?.2:-.15); tintCrew(g,colors[s[2]]);
      const pack=armBones(g); armsDown(pack); g.frustumCulled=false; g.traverse(o=>{if(o.isMesh){o.frustumCulled=false; o.castShadow=false}}); deckDetail.add(g);
      if(i===1)g.scale.setScalar(2.3); else if(i>1&&i<5)g.scale.setScalar(1.8);
      if(i===0){CVN.shooter=g; CVN.crewPack=pack; CVN.rig=pack.rig; CVN.rest=pack.rest}
      else g.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton){o.skeleton.update(); o.skeleton.update=function(){}}});});
    const heli=heliM.scene; heli.position.set(236,CVN.deckY+10,-33); heli.scale.setScalar(0.7); deckDetail.add(heli); CVN.heli=heli;
    const mast=heli.getObjectByName('Continuous main mast');
    const rotor=new THREE.Group(); rotor.position.copy(mast?mast.position:new THREE.Vector3(-2.4,3.7,0));
    const blade=new THREE.MeshStandardMaterial({color:0x2c2e32,roughness:.45,metalness:.55});
    for(let i=0;i<2;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(12,.07,.42),blade); b.rotation.y=i*Math.PI/2; b.castShadow=false; rotor.add(b)}
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.35,.35,.2,8),blade); rotor.add(hub); heli.add(rotor);
    const tail=new THREE.Mesh(new THREE.BoxGeometry(.08,1.6,.16),blade); tail.position.set(-6.1,2.5,0); heli.add(tail); CVN.tailRotor=tail;
    CVN.rotor=rotor; CVN.heliY=CVN.deckY+10;
    CVN.nJets=8; CVN.nCrew=spots.length; CVN.nTugs=2; CVN._ready=1; CVN.wake={children:[1,2,3,4,5]};
    // raised blast deflector just aft of the player's exhaust
    const jbd=new THREE.Group(); jbd.position.set(224,CVN.deckY,-10); carrier.add(jbd);
    const panel=new THREE.Mesh(new THREE.BoxGeometry(8,3.4,.16),new THREE.MeshStandardMaterial({color:0x8a7048,roughness:.45,metalness:.55}));
    panel.position.set(0,1.8,.2); panel.rotation.z=-.35; jbd.add(panel);
    CVN.jbd=jbd;
  }).catch(e=>{console.warn('deck models',e); CVN._loading=0});
 }).catch(e=>{console.warn('deck loader',e); CVN._loading=0});
}
loadDeck();
window.__CVN=CVN;
let skipTakeoff=false, valleyRespawn=false;
function takingOff(){return S&&(S.phase==='deck'||S.phase==='signal'||S.phase==='cat'||S.phase==='climb'||S.phase==='hand')}
function steamAt(x,z,big){spr(new THREE.Vector3(x+(Math.random()-.5)*.8, CVN.top+.4, z), 0xf7f4ef, big?2.8:1.5, big?1.3:.9, new THREE.Vector3((Math.random()-.5)*.8, 1.6+Math.random()*1.8, .25), {add:true, tex:glowTex, grow:big?3.2:1.8, o:.32, drag:.2, must:1})}
function poseShooter(t){const pack=CVN.crewPack; if(!pack)return;
 for(const n in pack.rest){const b=pack.rig[n]; if(b)b.rotation.copy(pack.rest[n])}
 if(pack.rig.pelvis&&pack._py!=null)pack.rig.pelvis.position.y=pack._py;
 armsDown(pack);
 if(t==null)return;
 if(t<1.7){setBone(pack,'upper_armR',-1.15,.15,-1.35); setBone(pack,'forearmR',Math.sin(t*8)*.45,t*7,-.1); setBone(pack,'handR',0,t*9,0)}
 else if(t<2.7){const k=sstep(1.7,2.15,t); setBone(pack,'upper_armR',lerp(-1.15,-2.3,k),0,lerp(-1.35,-.35,k)); setBone(pack,'forearmR',lerp(0,-1.25,k),0,0)}
 else{const k=sstep(2.7,3.2,t); const pel=pack.rig.pelvis; if(pel){if(pack._py==null)pack._py=pel.position.y; pel.position.y=pack._py+lerp(0,-.28,k)}
  setBone(pack,'thighL',lerp(0,1.15,k),0,0); setBone(pack,'shinL',lerp(0,-1.15,k),0,0);
  setBone(pack,'thighR',lerp(0,1.05,k),0,0); setBone(pack,'shinR',lerp(0,-1.05,k),0,0);
  setBone(pack,'spine',lerp(0,.4,k),0,0);
  setBone(pack,'upper_armR',0,-1.25,lerp(-1.35,-.15,k)); setBone(pack,'forearmR',0,lerp(-1.25,-.1,k),0)}}
function launchCat(){if(!S||S.phase!=='deck'||!S.to||!S.to.armed)return;
 S.phase='signal'; S.to.sig=0; S.roll=0; S.pitch=0; S.yaw=0;
 document.body.classList.remove('to-arm'); deckOne('deck_call',.5)}
function beginShot(){S.phase='cat'; S.to.shot=0; S.roll=0; S.pitch=0; S.yaw=0; deckOne('deck_clank',.62); deckOne('deck_steam',.38)}
function flyClimb(rdt){
 let tP=-inp.y*30*D2R;
 // Below a safe height the nose will not stay down. A few degrees of climb,
 // using the same return rate as the stick, so a missed pull-up settles instead of hitting the sea.
 const overDeck=S.pos.z>CVN.bowZ+10; const floor=overDeck?CVN.deckY+2:14;
 if(!overDeck && S.pos.y<floor+22 && tP<0.08){tP=0.1; if((S.to.climb||0)>0.8){S.to.settled=1; S.msg='SETTLE — PULL UP'; S.msgT=Math.max(S.msgT,.5)}}
 const pk=(!steer)?50:7.5;
 S.pitch+=(tP-S.pitch)*clamp(rdt*pk,0,1);
 S.roll=0; S.yaw=0;
 const target=85+S.thr*195;
 S.spd+=(target-S.spd)*clamp(rdt*.28,0,1);
 S.pos.y+=Math.sin(S.pitch)*S.spd*rdt;
 S.pos.z+=-Math.cos(S.pitch)*S.spd*rdt;
 S.pos.y=Math.min(S.pos.y,900);
 // Soft settle: the first take-off cannot hit the water. If they never pull up,
 // the nose eases into a shallow climb and the warning stays until they do.
 if(S.pos.y<floor){S.pos.y=floor; S.pitch=Math.max(S.pitch,.08)}
 if(S.pos.z<3600){const g=H(S.pos.x,S.pos.z)+45; if(S.pos.y<g){S.pos.y=g; if(S.pitch<.08)S.pitch=.08}}
 if(inp.y<-0.22)S.to.pulled=1;
}
function enterMission(){
 S.to.swapped=1; S.phase='ingress';
 const meet=meetPos(); S.pos.set(meet.x,meet.y,meet.z); S.yaw=0; S.pitch=0; S.roll=0;
 S.spd=85+S.thr*195; S.cine=false; S.shake=0; S.msg=''; S.msgT=0;
 document.body.classList.remove('takingoff','to-deck','to-arm');
 seaLight(false); carrier.visible=false; if(CVN.sea)CVN.sea.visible=false; stopIntroMusic(); stopDeckAmbience(); if(JET){startBed(); ambS=bedS} startMood(); if(CVN.fill)CVN.fill.intensity=0;
 if(window.__tmesh)window.__tmesh.visible=true;
 if(window.__farBits)window.__farBits.forEach(o=>o.visible=true);
 if(!(SCEN.fogDen>0.00001))scene.fog=new THREE.FogExp2(HAZE_HEX,HAZE_DEN);
 const f=$('tofade'); if(f)f.classList.add('on');
 S.to.fade=1.05;
}
let seaLit=false;
function seaLight(on){
 if(on&&!seaLit){seaLit=1; wantPhotoEnv=false; CVN._lit={scen:{...SCEN}, sun:sun.color.getHex(), hemi:hemiL.color.getHex(), ground:hemiL.groundColor.getHex(), bloom:bloom.strength, thr:bloom.threshold, sh:sun.castShadow};
  const go=()=>{if(!seaLit)return; Object.assign(SCEN,{turbidity:8,rayleigh:2.1,mie:.012,mieG:.86,sunEl:3.4,sunAz:1.35,sunInt:2.8,hemi:.72,exposure:1.08,env:.95,warmth:.85,fogDen:0,clouds:0});
   sun.color.set(0xffb15e); hemiL.color.set(0xffd0a0); hemiL.groundColor.set(0x3e3830); bloom.strength=.42; bloom.threshold=.8; sun.castShadow=!MOB; applyScen()};
  requestAnimationFrame(()=>requestAnimationFrame(go))}
 else if(!on&&seaLit){seaLit=0; wantPhotoEnv=true; const L=CVN._lit; Object.assign(SCEN,L.scen); sun.color.setHex(L.sun); hemiL.color.setHex(L.hemi); hemiL.groundColor.setHex(L.ground); bloom.strength=L.bloom; bloom.threshold=L.thr; sun.castShadow=L.sh; applyScen()}
}
function updateTakeoff(rdt){
 S.t+=rdt; if(S.msgT>0)S.msgT-=rdt;
 document.body.classList.add('takingoff');
 seaLight(true); carrier.visible=true; if(CVN.sea)CVN.sea.visible=true;
 if(CVN.fill)CVN.fill.intensity=(S.phase==='deck'||S.phase==='signal'||S.phase==='cat')?22:0;
 if(window.__tmesh)window.__tmesh.visible=false;
 if(window.__farBits)window.__farBits.forEach(o=>o.visible=false);
 if(S.phase==='deck'||S.phase==='signal'){
  document.body.classList.toggle('to-deck',S.phase==='deck');
  if(S.phase==='deck'){const full=S.thr>=.97; S.to.armed=full?1:0; document.body.classList.toggle('to-arm',!!S.to.armed)}
  else document.body.classList.remove('to-deck','to-arm');
  S.pos.set(CVN.jetX,CVN.jetY,CVN.jetZ); S.yaw=S.pitch=S.roll=0; S.spd=0;
  deckBusy(rdt);
  if(S.phase==='signal'){S.to.sig+=rdt; poseShooter(S.to.sig); if(S.to.sig>=5.35)beginShot()}
  else poseShooter(null);
 }
 else if(S.phase==='cat'){
  document.body.classList.remove('to-deck','to-arm');
  S.to.shot+=rdt; const T=2.15, u=clamp(S.to.shot/T,0,1), dist=CVN.track*u*u;
  S.pos.set(CVN.jetX, CVN.jetY, CVN.jetZ-dist);
  S.yaw=S.pitch=S.roll=0; S.spd=CVN.track*2*u/T;
  if(Math.random()<.85)steamAt(CVN.jetX, S.pos.z+4+Math.random()*10, 1);
  if(u>=1){S.phase='climb'; S.to.climb=0; S.spd=CVN.track*2/T; S.pitch=0}
 }
 else if(S.phase==='climb'){
  S.to.climb+=rdt; flyClimb(rdt);
  if(S.to.climb<1.2 && Math.random()<.5)steamAt(CVN.jetX, CVN.bowZ+2, 1);
  if(S.to.pulled && S.to.climb>5.5 && S.pos.y>100){S.phase='hand'; S.to.hand=0; const f=$('tofade'); if(f)f.classList.add('on')}
 }
 else if(S.phase==='hand'){
  S.to.hand+=rdt; flyClimb(rdt);
  if(!S.to.swapped && S.to.hand>=1.02)enterMission();
 }
 if(S.phase!=='deck'&&S.phase!=='signal')poseShooter(S.phase==='cat'?4:null);
 updParts(rdt);
}
function deckBusy(rdt){S.to.steam=(S.to.steam||0)-rdt;
 if(S.to.steam<=0){S.to.steam=.14; for(const dz of[-6,-20,-38,-60])steamAt(CVN.jetX,CVN.jetZ+dz,dz>-16?1:0); steamAt(4,CVN.jetZ-16,0)}
 if(S.phase==='deck'){S.to.chuff=(S.to.chuff||1.4)-rdt; if(S.to.chuff<=0){S.to.chuff=2.6; deckOne('deck_steam',.28)}}
 if(CVN.taxi){CVN.taxiT=(CVN.taxiT||0)+rdt; CVN.taxi.position.x=CVN.taxiBase+((CVN.taxiT*1.4)%12)}
 if(CVN.tug)CVN.tug.position.x=250+Math.sin((S.t||0)*.5)*1.5
 if(CVN.heli){CVN.heli.position.y=(CVN.heliY||CVN.deckY+7)+Math.sin((S.t||0)*.8)*.55; if(CVN.rotor)CVN.rotor.rotation.y+=rdt*22; if(CVN.tailRotor)CVN.tailRotor.rotation.x+=rdt*36}}
// Same mix the valley sortie uses. The engine and the wind are built in updateFlightBed.
function mixFlightAudio(rdt){if(!AC||!eng)return; const tt=AC.currentTime;
 startJet();flyCD=Math.max(0,flyCD-rdt);const warnA=S.missile&&!S.missile.decoy&&!S.missile.lost;
 updateFlightBed(rdt,warnA);AC.sub.gain.setTargetAtTime(JET&&JET.plain?0:(S.cine?.03:.05+S.thr*.12),tt,.35);AC.subO&&AC.subO.forEach((o,k)=>o.frequency.setTargetAtTime((36+S.thr*14)*(k+1),tt,.4));updListener();
 const tense=S.th&&(S.th.anyTrk||S.th.anySrch);AC.mus.gain.setTargetAtTime(warnA?.45:1,tt,.15);
 const bedOn=!takingOff()&&BED!=='off';AC.amb.gain.setTargetAtTime(bedOn?MUSIC_CAP:0,tt,takingOff()?.3:.4);
 if(AC.deckJetG){const hold=takingOff()&&(S.phase==='deck'||S.phase==='signal'||S.phase==='cat'); const fade=takingOff()&&!hold; AC.deckJetG.gain.setTargetAtTime(hold?.1:fade?.03:0,tt,.35); AC.deckRotorG.gain.setTargetAtTime(hold?.15:fade?.04:0,tt,.35); if(CVN.heli&&AC.rotorPan){CVN.heli.updateWorldMatrix(true,false); const e=CVN.heli.matrixWorld.elements; setP(AC.rotorPan,{x:e[12],y:e[13],z:e[14]})} if(CVN.taxi&&AC.jetIdlePan){CVN.taxi.updateWorldMatrix(true,false); const e=CVN.taxi.matrixWorld.elements; setP(AC.jetIdlePan,{x:e[12],y:e[13],z:e[14]})}}
 const moodId=musicChoice('mood'); const moodOn=moodId!=='current'&&moodId!=='off'&&!takingOff()&&!(S&&S.quiet); if(moodOn)AC.amb.gain.setTargetAtTime(0,tt,.4); if((moodId==='off'||(S&&S.quiet))&&moodHandle)stopMood(true);
 if(S&&S.quiet){if(!S._bedHeld){try{stopBed()}catch(e){} S._bedHeld=1} stopMood(true); AC.amb.gain.cancelScheduledValues(tt); AC.amb.gain.value=0; if(AC.moodG){AC.moodG.gain.cancelScheduledValues(tt); AC.moodG.gain.value=0} AC.sub.gain.cancelScheduledValues(tt); AC.sub.gain.value=.01}
 else if(S&&S._bedHeld){S._bedHeld=0; if(!takingOff()&&BED!=='off')startBed()}
 const warn=S.missile&&!S.missile.decoy&&!S.missile.lost; const trkOn=!warn&&S.th&&S.th.anyTrk; if(trkOn)trkG.gain.setTargetAtTime(.018,tt,.03); else {trkG.gain.cancelScheduledValues(tt); trkG.gain.value=0} S.srchT-=rdt;if(S.th&&S.th.anySrch&&!S.th.anyTrk&&S.srchT<=0){S.srchT=1.3;blip(380,.09,.03,'sine')}
 {const md=warn?S.missile.p.distanceTo(S.pos):9e3,rate=warn?4+18*clamp(1-md/6000,0,1):8;S.wph=(S.wph||0)+rdt*rate; if(warn){warnG.gain.setTargetAtTime((S.wph|0)%2?.04:0,tt,.02); tone.frequency.setTargetAtTime((S.wph|0)%2?480:560,tt,.02)} else {warnG.gain.cancelScheduledValues(tt); warnG.gain.value=0}}
 const seek=S.phase==='ingress'&&bDist()<4500&&inBox()>0; const seekOn=seek&&((S.t*5|0)%2); if(S.phase==='release')seekG.gain.setTargetAtTime(.012,tt,.03); else if(seekOn)seekG.gain.setTargetAtTime(.016,tt,.02); else {seekG.gain.cancelScheduledValues(tt); seekG.gain.value=0} if(seekG.o)seekG.o.frequency.setTargetAtTime(S.phase==='release'?420:380,tt,.05); syncWindBed()}
window.__tones=()=>{if(!AC)return {ready:0}; const gv=n=>n&&n.gain?+n.gain.value.toFixed(4):0; const fv=n=>n&&n.frequency?+n.frequency.value.toFixed(1):0; return {ready:1, whineHz:fv(AC.engWhineLP), jlpHz:fv(AC.jlp), tone:{type:tone&&tone.type, hz:fv(tone), gain:gv(warnG)}, trackGain:gv(trkG), seek:{hz:fv(seekG&&seekG.o), gain:gv(seekG)}, wind:{hz:fv(AC.wind&&AC.wind.bp), gain:gv(AC.wind&&AC.wind.g)}, jet:JET?{plain:JET.plain?1:0, rate:+((JET.rate!=null?JET.rate:(JET.a&&JET.a.playbackRate.value))||0).toFixed(3), gain:JET.g?gv(JET.g):gv(AC.jet), slices:JET.slices?JET.slices.length:0}:null, subGain:gv(AC.sub)}};
let windBed=null;
function syncWindBed(){if(windBed){try{windBed.stop()}catch(e){} windBed=null}}
// In-flight air only. Fresh noise each piece, and the F-105 whine in random
// overlapping slices, so nothing repeats on a few-second clock.
let bedDrift=0, bedNear=0, bedWhoosh=0, bedSide=0, bedSideT=0;
function noiseGrain(seconds, brown){const sr=AC.sampleRate||44100, n=Math.max(1,sr*seconds|0), b=AC.createBuffer(1,n,sr), d=b.getChannelData(0); let pink=0, br=0, sum=0;
 for(let i=0;i<n;i++){const w=Math.random()*2-1; pink=pink*0.97+w*0.12; br=(br+w*0.015)*0.998; const s=brown?br:pink; d[i]=s; sum+=s}
 const mean=sum/n; let peak=1e-4; for(let i=0;i<n;i++){d[i]-=mean; const a=Math.abs(d[i]); if(a>peak)peak=a}
 const sc=0.2/peak; const fade=Math.min(n>>1, (sr*1.15)|0);
 for(let i=0;i<n;i++){let w=1; if(i<fade)w=Math.sin((i/fade)*Math.PI*0.5); else if(i>n-1-fade)w=Math.sin(((n-1-i)/fade)*Math.PI*0.5); d[i]*=sc*w}
 d[0]=0; d[n-1]=0; return b}
function playGrain(buf, dest){const s=AC.createBufferSource(); s.buffer=buf; s.loop=false; const g=AC.createGain(); const t=AC.currentTime, len=buf.duration;
 g.gain.setValueAtTime(0.0008,t); g.gain.linearRampToValueAtTime(1,t+0.03); s.connect(g).connect(dest); s.start(t); try{s.stop(t+len)}catch(e){}
 const node={s,g,end:t+len}; s.onended=()=>{try{g.disconnect();s.disconnect()}catch(e){}}; return node}
function pumpNoise(slot, dest, brown){if(!slot||!AC)return; const now=AC.currentTime; if(slot.live.length>=2)return; if(now<slot.next-0.03)return; const len=4.2+Math.random()*1.6, fade=1.15; const node=playGrain(noiseGrain(len, brown), dest); slot.live.push(node); slot.next=node.end-fade;
 slot.live=slot.live.filter(n=>n.end>now-0.05)}
function stopLive(list){if(!list)return; for(const n of list){try{n.s.stop()}catch(e){}} list.length=0}
function pumpWhine(jet){if(!jet||!jet.buf||!AC)return; const now=AC.currentTime; if(now<jet.next-0.03)return; const buf=jet.buf, trim=Math.min(jet.off||0, Math.max(0, buf.duration-1)), usable=Math.max(0.8, buf.duration-trim-0.04);
 if(jet.slices.length>=2)return; const fade=1.5, want=7+Math.random()*3, play=Math.min(want, usable), off=trim+Math.random()*Math.max(0.04, usable-play), rate=jet.rate||0.8;
 const s=AC.createBufferSource(); s.buffer=buf; s.loop=false; s.playbackRate.value=rate; const eg=AC.createGain(); const heard=play/rate, f=Math.min(fade, heard*0.35);
 eg.gain.setValueAtTime(0.0008,now); eg.gain.linearRampToValueAtTime(1,now+f); eg.gain.linearRampToValueAtTime(1,now+Math.max(f+0.05, heard-f)); eg.gain.linearRampToValueAtTime(0.0008,now+heard); s.connect(eg).connect(jet.g); try{s.start(now, off, play)}catch(e){return} try{s.stop(now+heard+0.02)}catch(e){}
 const node={s,eg}; jet.slices.push(node); s.onended=()=>{const i=jet.slices.indexOf(node); if(i>=0)jet.slices.splice(i,1); try{eg.disconnect();s.disconnect()}catch(e){}}; jet.next=now+heard-f}
function updateFlightBed(rdt, warnA){if(!AC||!AC.wind)return; const tt=AC.currentTime, hold=window.__bedHold||null;
 const thr=hold&&hold.thr!=null?hold.thr:clamp(S.thr||0,0,1);
 const spdN=hold&&hold.air!=null?hold.air:clamp(((S.spd||90)-70)/210,0,1);
 const turn=hold&&hold.turn!=null?hold.turn:clamp(Math.abs(S.roll||0)*1.3+Math.abs(inp.x||0)*0.55+Math.abs(inp.y||0)*0.35,0,1);
 let close=hold&&hold.close!=null?hold.close:0;
 if(!(hold&&hold.close!=null)&&!takingOff()&&S.pos){const agl=S.agl==null?400:S.agl; const ground=agl<260?clamp(1-agl/260,0,1):0; bedSideT-=rdt; if(bedSideT<=0){bedSideT=0.3; const gy=groundY(S.pos.x,S.pos.z), left=groundY(S.pos.x-110,S.pos.z), right=groundY(S.pos.x+110,S.pos.z); const clearance=S.pos.y-Math.max(left,right); bedSide=clearance<170?clamp(1-clearance/170,0,1):0}
  close=Math.max(ground, bedSide)}
 if(close>bedNear+0.07)bedWhoosh=Math.min(1, bedWhoosh+0.6);
 bedWhoosh=Math.max(0, bedWhoosh-rdt*0.75); bedNear=close;
 bedDrift+=(Math.random()-0.5)*rdt*0.45; bedDrift*=Math.exp(-rdt*0.28); bedDrift=clamp(bedDrift,-1,1);
 const air=Math.max(spdN, thr*0.8);
 let wind=(0.012+air*0.026+turn*0.02+close*0.032+bedWhoosh*0.02)*(1+bedDrift*0.05);
 if(S.cine)wind*=0.35; if(takingOff())wind*=0.35; if(S.quiet)wind=0.004; wind=Math.min(0.08, wind);
 const cut=Math.min(1100, 280+air*460+close*160+turn*70+bedWhoosh*90);
 AC.wind.g.gain.setTargetAtTime(wind,tt,.45); if(AC.wind.lp)AC.wind.lp.frequency.setTargetAtTime(cut,tt,.5);
 pumpNoise(AC.wind, AC.wind.hp, false);
 const rate=(0.72+thr*0.16)+bedDrift*0.012;
 const lv=(S.quiet?0.028:(S.cine?0.04:0.05+thr*0.1))*(1+bedDrift*0.04)*(warnA?0.65:1);
 const lp=S.cine?400:Math.min(900, 460+thr*380);
 if(JET&&JET.g){JET.rate=rate; JET.g.gain.setTargetAtTime(lv,tt,.4); for(const n of JET.slices){try{n.s.playbackRate.setTargetAtTime(rate,tt,.45)}catch(e){}} pumpWhine(JET)}
 if(AC.engWhineLP)AC.engWhineLP.frequency.setTargetAtTime(lp,tt,.4); if(AC.jlp)AC.jlp.frequency.setTargetAtTime(lp,tt,.4);
 let rum=S.quiet?0.006:(S.cine?0.015:0.02+thr*0.055); rum*=1+turn*0.2; if(AC.rumble){AC.rumble.g.gain.setTargetAtTime(Math.min(0.09,rum),tt,.4); if(AC.rumble.lp)AC.rumble.lp.frequency.setTargetAtTime(Math.min(220, 110+thr*80),tt,.5); pumpNoise(AC.rumble, AC.rumble.lp, true)}
 window.__bed=()=>({wind:+wind.toFixed(4), windHz:+cut.toFixed(0), eng:JET&&JET.g?+lv.toFixed(4):0, engHz:+lp.toFixed(0), rumble:+Math.min(0.09,rum).toFixed(4), rate:+rate.toFixed(3), slices:JET&&JET.slices?JET.slices.length:0, windPieces:AC.wind.live.length, drift:+bedDrift.toFixed(3), close:+close.toFixed(2), turn:+turn.toFixed(2)})}
// ---------- particles ----------
const parts=[],_pool=[];
function _mkSpr(add,tex){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:tex||smokeTex,color:0xffffff,transparent:true,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending,fog:true,rotation:0}));m.visible=false;scene.add(m);return m}
function partMax(){return batteryOn()?80:(MOB?160:420)}
function spr(pos,color,size,life,vel,o={}){if(parts.length>partMax()&&!o.must)return null;
 let m=_pool.pop();const add=!!o.add,tex=o.tex||smokeTex;
 if(!m){m=_mkSpr(add,tex)}else{m.material.map=tex;m.material.blending=add?THREE.AdditiveBlending:THREE.NormalBlending;m.material.fog=o.fog??true}
 m.material.color.set(color);m.material.opacity=o.o??1;m.material.rotation=Math.random()*6.28;m.material.needsUpdate=true;
 m.position.copy(pos);m.scale.setScalar(size);m.visible=true;
 const p={m,life,t:0,vel:vel?vel.clone():new THREE.Vector3(),grow:o.grow||0,g:o.g||0,o:o.o??1,size,drag:o.drag||0,fadeIn:o.fadeIn||0,c1:o.c1?o.c1.clone():null};parts.push(p);return p}
function updParts(dt){for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.t+=dt;if(p.t>=p.life){p.m.visible=false;_pool.push(p.m);parts.splice(i,1);continue}
 p.vel.y-=p.g*dt;if(p.drag)p.vel.multiplyScalar(Math.max(0,1-p.drag*dt));p.m.position.addScaledVector(p.vel,dt);p.size+=p.grow*dt*(1-p.t/p.life*.7);p.m.scale.setScalar(p.size);
 const k=p.t/p.life;p.m.material.opacity=p.o*(p.fadeIn?Math.min(1,p.t/p.fadeIn):1)*(1-k)*(1-k*.3);if(p.c1)p.m.material.color.lerp(p.c1,Math.min(1,dt*2.5))}}
const ring=new THREE.Mesh(new THREE.RingGeometry(.85,1,64),new THREE.MeshBasicMaterial({color:0xd8c8b0,transparent:true,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.visible=false;scene.add(ring);
const dome=new THREE.Mesh(new THREE.SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI/2),new THREE.MeshBasicMaterial({color:0xeee6da,transparent:true,depthWrite:false,side:THREE.DoubleSide}));dome.visible=false;scene.add(dome);
const debG=new THREE.DodecahedronGeometry(1,0), debM=new THREE.MeshStandardMaterial({color:0x3b3733,roughness:1,flatShading:true}), debris=[];
const bomb=new THREE.Mesh(new THREE.CylinderGeometry(.36,.36,4.2,10),olive);bomb.geometry.rotateX(Math.PI/2);bomb.visible=false;scene.add(bomb);
const msl=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,4.2,8),new THREE.MeshStandardMaterial({color:0xe4e4dc,roughness:.55}));msl.geometry.rotateX(Math.PI/2);msl.visible=false;scene.add(msl);msl.scale.setScalar(3.6);const mslG=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xffd8a0,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,fog:false}));mslG.visible=false;scene.add(mslG);
const ironMesh=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,2.4,8),olive);ironMesh.geometry.rotateX(Math.PI/2);ironMesh.visible=false;scene.add(ironMesh);
const rounds=[];
const tracerMat=new THREE.SpriteMaterial({map:glowTex,color:0xffe2a8,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
const tracers=[];
for(let ti=0;ti<14;ti++){const m=new THREE.Sprite(tracerMat.clone());m.visible=false;m.scale.setScalar(5);scene.add(m);tracers.push(m)}
// ---------- post ----------
const composer=new EffectComposer(R);composer.addPass(new RenderPass(scene,cam));const bloom=new UnrealBloomPass(new THREE.Vector2(256,128),.32,.5,.92);composer.addPass(bloom);composer.addPass(new OutputPass());
class GradeP extends Pass{constructor(){super();this.u={tDiffuse:{value:null},uT:{value:0},uC:{value:new THREE.Vector2(.5,.5)},uS:{value:0}};
 this.q=new FullScreenQuad(new THREE.ShaderMaterial({uniforms:this.u,depthTest:false,depthWrite:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
 fragmentShader:`uniform sampler2D tDiffuse;uniform float uT,uS;uniform vec2 uC;varying vec2 vUv;void main(){vec2 d=vUv-uC;float r=length(d*vec2(1.,.62));float w=uS*smoothstep(.42,0.,r)*smoothstep(-.05,.12,vUv.y-uC.y+.25);
 vec2 uv=vUv+w*vec2(sin(vUv.y*95.+uT*8.3)+.5*sin(vUv.y*211.-uT*13.),cos(vUv.x*73.+uT*6.1))*.0035;vec3 c=texture2D(tDiffuse,uv).rgb;
 float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,.86);c=mix(c,c*c*(3.-2.*c),.22);c*=mix(vec3(.97,.99,1.04),vec3(1.03,1.0,.95),smoothstep(.2,.8,l));
 vec2 q=vUv-.5;c*=1.-dot(q,q)*.38;gl_FragColor=vec4(clamp(c,0.,1.),1.);}`}))}
 render(r,w,rd){this.u.tDiffuse.value=rd.texture;if(this.renderToScreen)r.setRenderTarget(null);else{r.setRenderTarget(w);if(this.clear)r.clear()}this.q.render(r)}}
const grade=new GradeP();composer.addPass(grade);if(MOB){grade.enabled=false;R.toneMappingExposure=.82;document.body.insertAdjacentHTML('beforeend','<div id="mvig"></div>')}
let useBloom=!MOB&&!batteryOn(); if(!useBloom)bloom.enabled=false
// ---------- audio (unchanged from s0) ----------
let AC=null,trkG=null,eng=null,lockBuf=null,warnG=null,seekG=null,tone=null;
const _nb={};function noiseBuf(sec){sec=Math.min(2.5,Math.max(.25,+sec||1)); const key=(sec*10|0)/10; if(_nb[key])return _nb[key]; const n=AC.sampleRate*key|0,b=AC.createBuffer(1,n,AC.sampleRate),d=b.getChannelData(0); for(let i=0;i<n;i++)d[i]=Math.random()*2-1; return _nb[key]=b}
function mkSeamless(buf,xf=.35){if(!buf||buf.__seam)return buf;const n=buf.length,sr=buf.sampleRate,w=Math.min(sr*xf|0,n>>2);if(w<64){buf.__seam=1;return buf}const out=AC.createBuffer(buf.numberOfChannels,Math.max(w*4,n-w),sr);
 for(let c=0;c<buf.numberOfChannels;c++){const i=buf.getChannelData(c),o=out.getChannelData(c),L=out.length;o.set(i.subarray(0,Math.min(L,i.length)));
  for(let k=0;k<w;k++){const f=k/w;o[k]=i[k]*f+i[n-w+k]*(1-f)}}
 out.__seam=1;return out}
function startSmoothLoop(buf,vol,dest,opt={}){if(!AC||!buf)return null; buf=mkSeamless(buf,opt.xf||.35); const tag=opt.tag||'loop', rate=opt.rate||1;
  // Single BufferSource — dual crossfade layers + drift timers caused multi-second main-thread stalls on iOS
  const s=AC.createBufferSource(); s.buffer=buf; s.loop=true; s.playbackRate.value=rate;
  const g=AC.createGain(); g.gain.value=0; g.gain.setTargetAtTime(vol, AC.currentTime, .04);
  s.connect(g).connect(dest); s.start(); sfxLog(tag,{vol,rate,mode:'single'});
  return {a:s,b:null,g,stop(t){try{g.gain.setTargetAtTime(0,AC.currentTime,.08); s.stop((t||AC.currentTime)+.2)}catch(e){}}};
}
function kickAudio(){if(!AC)return; try{if(AC.state!=='running')AC.resume()}catch(e){} try{const b=AC.createBuffer(1,8,AC.sampleRate||44100); const s=AC.createBufferSource(); s.buffer=b; s.connect(AC.destination); s.start()}catch(e){}}
function initAudio(){if(AC){kickAudio();return}const ACC=window.AudioContext||window.webkitAudioContext;try{AC=new ACC({latencyHint:'playback'})}catch(e){AC=new ACC()}AC.voices=0;
 const mg=AC.createGain();mg.gain.value=.8;mg.connect(AC.destination);AC.mg=mg;const out=AC.createDynamicsCompressor();out.threshold.value=-3;out.knee.value=6;out.ratio.value=2.5;out.attack.value=.01;out.release.value=.25;out.connect(mg); // gentle safety limiter only
 AC.bigB=AC.createGain();const bl=AC.createDynamicsCompressor();bl.threshold.value=-2;bl.knee.value=4;bl.ratio.value=3;bl.attack.value=.008;bl.release.value=.2;const bg=AC.createGain();bg.gain.value=.85;AC.bigB.connect(bl).connect(bg).connect(AC.destination);AC.bigOut=bg;
 AC.tone=AC.createBiquadFilter();AC.tone.type='lowpass';AC.tone.frequency.value=1400;AC.tone.Q.value=.5;{const pk=AC.createBiquadFilter();pk.type='peaking';pk.frequency.value=3200;pk.Q.value=.7;pk.gain.value=-15;AC.tone.connect(pk).connect(out)}
 AC.fxB=AC.createGain();AC.fxB.connect(out);AC.out=AC.fxB;AC.engB=AC.createGain();AC.musB=AC.createGain();AC.bedB=AC.createGain();AC.bedB.gain.value=1;
 // Bed bus: independent of engine slider and duck bus — goes to master compressor only via out path? No: direct to destination after light makeup so AAA duck / engine don't bury it.
 AC.bedHP=AC.createBiquadFilter();AC.bedHP.type='highpass';AC.bedHP.frequency.value=120;AC.bedHP.Q.value=.7;
 AC.bedPK=AC.createBiquadFilter();AC.bedPK.type='peaking';AC.bedPK.frequency.value=420;AC.bedPK.Q.value=.8;AC.bedPK.gain.value=6;
 AC.bedB.connect(AC.bedHP).connect(AC.bedPK).connect(mg); // bypass compressor + duck so engine/AAA don't bury the bed
 AC.an=AC.createAnalyser();AC.an.fftSize=1024;AC.musB.connect(AC.an);applyVol();
 eng={g:AC.createGain()};
 {const L=AC.listener;if(L.positionX){L.positionX.value=0}}
 // engine sub layer: 38 Hz + harmonics (phone speakers) under the jet loop
 AC.sub=AC.createGain();AC.sub.gain.value=0;{const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=180;AC.sub.connect(lp).connect(AC.engB);
  for(const [f,v] of[[38,1],[76,.35],[114,.12]]){const o=AC.createOscillator();o.frequency.value=f;const g=AC.createGain();g.gain.value=v;o.connect(g).connect(AC.sub);o.start();(AC.subO=AC.subO||[]).push(o)}
  const nb=mkSeamless(noiseBuf(2),.5);const n=AC.createBufferSource();n.buffer=nb;n.loop=true;n.playbackRate.value=.97;const nf=AC.createBiquadFilter();nf.type='lowpass';nf.frequency.value=90;const ng=AC.createGain();ng.gain.value=1.4;n.connect(nf).connect(ng).connect(AC.sub);n.start(0,Math.random()*4)}
 AC.dk=AC.createGain();AC.dk.connect(out);AC.mus=AC.createGain();AC.mus.gain.value=1;AC.mus.connect(AC.musB).connect(AC.dk);AC.amb=AC.createGain();AC.amb.gain.value=0;AC.amb.connect(AC.bedB);
 AC.introG=AC.createGain();AC.introG.gain.value=1;AC.introG.connect(AC.mus);
 AC.deckJetG=AC.createGain();AC.deckJetG.gain.value=0; AC.jetIdlePan=mkPan(true,70); AC.deckJetG.connect(AC.jetIdlePan); AC.jetIdlePan.connect(AC.mus);
 AC.deckRotorG=AC.createGain();AC.deckRotorG.gain.value=0; AC.rotorPan=mkPan(true,22); AC.deckRotorG.connect(AC.rotorPan); AC.rotorPan.connect(AC.mus);
 AC.moodG=AC.createGain();AC.moodG.gain.value=0;AC.moodG.connect(mg);
 // ambience sub drone
 {const nb=mkSeamless(noiseBuf(2),.5);const n=AC.createBufferSource();n.buffer=nb;n.loop=true;n.playbackRate.value=.48;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=70;const g=AC.createGain();g.gain.value=.75;const o=AC.createOscillator();o.frequency.value=46;const og=AC.createGain();og.gain.value=.05;o.connect(og).connect(AC.amb);o.start();n.connect(f).connect(g).connect(AC.amb);n.start(0,Math.random()*5)}

 AC.jet=AC.createGain();AC.jet.gain.value=0;AC.jlp=AC.createBiquadFilter();AC.jlp.type='lowpass';AC.jlp.frequency.value=700;AC.jlp.Q.value=.5;AC.jet.connect(AC.jlp).connect(AC.engB).connect(AC.dk);
 AC.engWhineLP=AC.createBiquadFilter();AC.engWhineLP.type='lowpass';AC.engWhineLP.frequency.value=640;AC.engWhineLP.Q.value=.4;AC.engWhineLP.connect(AC.engB);
 {const hp=AC.createBiquadFilter();hp.type='highpass';hp.frequency.value=160;hp.Q.value=.7; const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=420;lp.Q.value=.45; const g=AC.createGain();g.gain.value=0; hp.connect(lp).connect(g).connect(AC.mus); AC.wind={g,hp,lp,bp:lp,live:[],next:0}}
 {const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=140;lp.Q.value=.5; const g=AC.createGain();g.gain.value=0; lp.connect(g).connect(AC.engB); AC.rumble={g,lp,live:[],next:0}}
 SB.load();prewarmAudio(); kickAudio();
 warnG=AC.createGain();warnG.gain.value=0;tone=AC.createOscillator();tone.type='sine';tone.frequency.value=520;const tf=AC.createGain();tf.gain.value=.05;tone.connect(tf).connect(warnG).connect(AC.tone);tone.start();
 trkG=AC.createGain();trkG.gain.value=0;{const o=AC.createOscillator();o.type='sine';o.frequency.value=440;o.connect(trkG).connect(AC.tone);o.start()}
 seekG=AC.createGain();seekG.gain.value=0;const so=AC.createOscillator();so.type='sine';so.frequency.value=520;so.connect(seekG).connect(AC.tone);so.start();seekG.o=so;
}
// Briefing music: swap this ONE reference to change the entry track (sfx/<name>.mp3 + optional .ogg)
const BRIEF_TRACK='brief';
// Take-off intro slot. Null plays nothing. Set this to an sfx key (sfx/<key>.m4a)
// when Shahbaz's kick-off track is ready. startIntroMusic() is the only starter.
const INTRO_TRACK=null;
const ASSET_V='15';
const SB={b:{},load(){for(const k of[BRIEF_TRACK,'nuke','sub01','sub08','jet','ambient','riser','jet8','drone','flak','flak2','impact','mlaunch','mmotor','sweep','subdrop','aaaw','msub','hitsub','mus_depth','mus_dream','mus_layers','mus_waves','flare_thump','flare_hiss'])this.get(k)},
 get(k){if(this.b[k])return this.b[k]; let dir='sfx/', file=k; if(k.indexOf('sn_')===0){dir='sfx/sonniss/'; file=k.slice(3)} else if(k.indexOf('nb_')===0)dir='sfx/nb/'; else if(k.indexOf('lx_')===0)dir='sfx/lx/'; const tryf=ext=>fetch(dir+file+'.'+ext+'?v='+ASSET_V).then(r=>{if(!r.ok)throw 0;return r.arrayBuffer()}).then(a=>new Promise((res,rej)=>AC.decodeAudioData(a.slice(0),res,rej)));
  const wavFirst=/^flare_(thunder|soft|deep|sub|body)$/.test(k)||k.indexOf('snd_')===0;
  const order=wavFirst?['wav','m4a','mp3','ogg']:['m4a','wav','mp3','ogg'];
  const chain=order.slice(1).reduce((p,ext)=>p.catch(()=>tryf(ext)), tryf(order[0]));
  return this.b[k]=chain.then(b=>(this[k]=b)).catch(()=>null)}};
window.__sfxLog=[];function sfxLog(name,extra={}){try{window.__sfxLog.push(Object.assign({t:AC?AC.currentTime:0,name},extra));if(window.__sfxLog.length>400)window.__sfxLog.shift()}catch(e){}}
function src(buf,vol,dest,opt={}){if(!AC||!buf)return {onended:null,stop(){}}; const s=AC.createBufferSource();s.buffer=buf;s.loop=!!opt.loop;s.playbackRate.value=opt.rate||1;const g=AC.createGain(),t0=opt.when||AC.currentTime; const cap=!opt.loop&&!opt.pri&&AC.voices>=18; if(cap){sfxLog(opt.tag||'buf',{vol:0,skipped:1}); return {onended:null,stop(){}}; } const fi=opt.fadeIn!=null?opt.fadeIn:0.008; // 8ms declick only — preserve Logic attack
  g.gain.setValueAtTime(0,t0); g.gain.linearRampToValueAtTime(vol,t0+Math.max(.005,fi)); sfxLog(opt.tag||'buf',{vol,rate:opt.rate||1,fadeIn:fi,pri:!!opt.pri}); if(!opt.loop){AC.voices++; s.onended=()=>{AC.voices--; try{g.disconnect()}catch(e){}}} s.connect(g).connect(dest||AC.out); s.start(t0); s.g=g; return s}
function psrc(k,vol,P,hrtf,o={}){if(!AC||!SB[k])return null;o.tag=o.tag||('psrc:'+k);const pn=mkPan(hrtf,o.ref||150);setP0(pn,P);pn.connect(AC.out);const s=src(SB[k],vol,pn,o);const e=s.onended;s.onended=()=>{if(pn._hrtf)hrtfN=Math.max(0,hrtfN-1); e&&e(); try{pn.disconnect()}catch(x){}};return s}
window.__aud=()=>({st:AC&&AC.state,loaded:Object.keys(SB).filter(k=>SB[k]&&SB[k].duration),jet:!!JET,brief:!!briefSrc,riser:!!riserS,jg:AC&&AC.jet&&+AC.jet.gain.value.toFixed(3),amb:AC&&AC.amb&&+AC.amb.gain.value.toFixed(3),rate:JET&&+((JET.a||JET).playbackRate.value).toFixed(3),musdb:+(20*Math.log10(musRMS()+1e-9)).toFixed(1),dk:AC&&+AC.dk.gain.value.toFixed(2),flyCD:+flyCD.toFixed(1)});
// ---- 3D audio: HRTF for few key sources, equal-power for the rest ----
const SURR={on:localStorage.ds16_surr!=='0', width:Math.min(2,Math.max(0,+(localStorage.ds16_width||1.35)))};
function mkPan(hrtf,ref=120){const p=AC.createPanner(); const use=!!(SURR.on&&hrtf&&hrtfN<4); p.panningModel=use?'HRTF':'equalpower'; if(use){hrtfN++; p._hrtf=1} p.distanceModel='inverse'; p.refDistance=ref; p.rolloffFactor=SURR.on?1.05:.4; p.maxDistance=12000; return p}
function spat(v){if(!v||!cam)return v; const w=SURR.on?SURR.width:0; if(!w)return {x:cam.position.x,y:v.y,z:cam.position.z}; return {x:cam.position.x+(v.x-cam.position.x)*w, y:v.y, z:cam.position.z+(v.z-cam.position.z)*w}}
function setP(p,v){const q=spat(v),t=AC.currentTime;if(p.positionX){p.positionX.setTargetAtTime(q.x,t,.03);p.positionY.setTargetAtTime(q.y,t,.03);p.positionZ.setTargetAtTime(q.z,t,.03)}else p.setPosition(q.x,q.y,q.z)}
function setP0(p,v){const q=spat(v);if(p.positionX){p.positionX.value=q.x;p.positionY.value=q.y;p.positionZ.value=q.z}else p.setPosition(q.x,q.y,q.z)}
function sweepLR(pn,P,dur){if(!pn||!P||!cam||!SURR.on||!SURR.width)return; const right=new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion); const a=spat({x:P.x-right.x*520,y:P.y,z:P.z-right.z*520}); const b=spat({x:P.x+right.x*520,y:P.y,z:P.z+right.z*520}); const t=AC.currentTime,d=dur||1.2; if(!pn.positionX)return; pn.positionX.cancelScheduledValues(t); pn.positionY.cancelScheduledValues(t); pn.positionZ.cancelScheduledValues(t); pn.positionX.setValueAtTime(a.x,t); pn.positionX.linearRampToValueAtTime(b.x,t+d); pn.positionY.setValueAtTime(a.y,t); pn.positionY.linearRampToValueAtTime(b.y,t+d); pn.positionZ.setValueAtTime(a.z,t); pn.positionZ.linearRampToValueAtTime(b.z,t+d)}
function boomPan(P,bus){const pn=mkPan(true,220); setP0(pn,P); pn.connect(bus||AC.out); setTimeout(()=>{if(pn._hrtf){hrtfN=Math.max(0,hrtfN-1); pn._hrtf=0} try{pn.disconnect()}catch(e){}},3200); return pn}
function updListener(){if(!AC)return;const L=AC.listener,c=cam.position,f=new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion),u=new THREE.Vector3(0,1,0).applyQuaternion(cam.quaternion),t=AC.currentTime;
 if(L.positionX){L.positionX.setTargetAtTime(c.x,t,.02);L.positionY.setTargetAtTime(c.y,t,.02);L.positionZ.setTargetAtTime(c.z,t,.02);L.forwardX.setTargetAtTime(f.x,t,.02);L.forwardY.setTargetAtTime(f.y,t,.02);L.forwardZ.setTargetAtTime(f.z,t,.02);L.upX.setTargetAtTime(u.x,t,.02);L.upY.setTargetAtTime(u.y,t,.02);L.upZ.setTargetAtTime(u.z,t,.02)}else{L.setPosition(c.x,c.y,c.z);L.setOrientation(f.x,f.y,f.z,u.x,u.y,u.z)}}
// deep thud: sine sweep + 2nd/3rd harmonic so phones hear it
function thud(dest,v,f0=70,f1=32,dur=.35,t=AC.currentTime){f0=Math.min(f0,55);for(const [m,a] of[[1,1],[2,.25],[3,.08]]){const o=AC.createOscillator(),g=AC.createGain();o.frequency.setValueAtTime(f0*m,t);o.frequency.exponentialRampToValueAtTime(f1*m,t+dur*.85);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v*a,t+.08);g.gain.exponentialRampToValueAtTime(.0008,t+dur);o.connect(g).connect(dest);o.start(t);o.stop(t+dur+.02)}sfxLog('thud',{v,f0,dur,fadeIn:.08})}
function nburst(dest,v,lp,dur,t=AC.currentTime,bp){lp=Math.min(lp,220);const n=AC.createBufferSource();n.buffer=noiseBuf(1.5);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(lp,t);f.frequency.exponentialRampToValueAtTime(Math.max(40,lp*.2),t+dur);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.12);g.gain.exponentialRampToValueAtTime(.0008,t+dur);n.connect(f).connect(g).connect(dest);n.start(t,Math.random());n.stop(t+dur+.02);sfxLog('nburst',{v,lp,dur,fadeIn:.12})}
let hrtfN=0;
// AAA cannon burst at world pos: heavy thud + crack per round, HRTF positioned
function aaaBurst(P,rounds=5){if(!AC)return; if(holdCustom('aaa',P))return; if(AC.voices>10&&!window.__sfxTest)return; const d=P.distanceTo(S.pos),pn=mkPan(true,220);setP0(pn,P);const g=AC.createGain();g.gain.value=1;pn.connect(g).connect(AC.out);const t=AC.currentTime+d/343*.28;AC.voices++;
 const near=clamp(1-d/9000,.15,1);sfxLog('aaaBurst',{d:+d.toFixed(0),near:+near.toFixed(2)});
 // ONLY cannon aaaw — never old aaa.mp3; synth fallback is slow dark thud only (no nburst crack)
 if(SB.aaaw){const s=src(SB.aaaw,.6+near*.35,pn,{when:t,pri:1,fadeIn:.008,tag:'aaaw'});AC.voices--;s.onended=null; if(sndBypass&&s.stop)sndPrev.push(s)}
 else thud(pn,.9*near,42,18,1.6,t);
 if(d>2000&&SB.aaaw){const s2=src(SB.aaaw,.22*near,pn,{when:t+.4,pri:1,fadeIn:.008,tag:'aaaw_far'});AC.voices--;s2.onended=null; if(sndBypass&&s2.stop)sndPrev.push(s2)}
 setTimeout(()=>{AC.voices--;if(pn._hrtf)hrtfN=Math.max(0,hrtfN-1);try{g.disconnect()}catch(e){}},(t-AC.currentTime+4.5)*1000)}
// flak shell: deep boom at burst point
function flakBoom(P){if(!AC||(AC.voices>10&&!window.__sfxTest))return;const pn=mkPan(true,90);setP0(pn,P);const g=AC.createGain();g.gain.value=1;pn.connect(g).connect(AC.out);AC.voices++;const t=AC.currentTime+.02;
 const fk=Math.random()<.5?'flak':'flak2';sfxLog('flakBoom',{fk});
 if(SB[fk]){const s=src(SB[fk],.6,pn,{when:t,pri:1,fadeIn:.008,tag:fk});AC.voices--;s.onended=null}
 else thud(pn,.85,45,20,1.2,t);
 const d=P.distanceTo(S.pos);if(d<300)heavy('sub01',.3*(1-d/300),1);setTimeout(()=>{AC.voices--;if(pn._hrtf)hrtfN=Math.max(0,hrtfN-1);try{g.disconnect()}catch(e){}},2500)}
// missile motor: roar loop + low rumble, HRTF, filter/pitch from Doppler
function mslAudioStart(m){if(!AC)return;const pn=mkPan(true,160);setP0(pn,m.p);const g=AC.createGain();g.gain.value=0;g.gain.linearRampToValueAtTime(1,AC.currentTime+.15);pn.connect(g).connect(AC.out);
 const n=AC.createBufferSource();n.buffer=SB.mmotor||noiseBuf(4);n.loop=true;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=220;lp.Q.value=.7;const ng=AC.createGain();ng.gain.setValueAtTime(0,AC.currentTime);ng.gain.linearRampToValueAtTime(SB.mmotor?1.1:.7,AC.currentTime+.2);n.connect(lp).connect(ng).connect(pn);n.start();sfxLog('mmotor',{lp:220,fadeIn:.2});
 const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=48;const of=AC.createBiquadFilter();of.type='lowpass';of.frequency.value=220;const og=AC.createGain();og.gain.value=.35;o.connect(of).connect(og).connect(pn);o.start();
 m.au={pn,g,n,lp,o}}
function mslAudioUpd(m,dt){const a=m.au;if(!a)return;const t=AC.currentTime;setP(a.pn,m.p);const rel=m.p.clone().sub(S.pos),d=rel.length(),vr=-m.v.dot(rel)/(d||1)+S.spd*fwd.dot(rel)/(d||1);
 const dop=clamp(343/(343-clamp(vr,-300,300)*.5),.6,1.9);const boost=m.life>17;a.lp.frequency.setTargetAtTime(clamp((boost?1100:780)*dop,220,1200),t,.05);a.o.frequency.setTargetAtTime(48*dop,t,.05);a.n.playbackRate.setTargetAtTime(dop,t,.05);a.g.gain.setTargetAtTime(boost?1:.65,t,.2)}
function mslAudioStop(m){const a=m&&m.au;if(!a)return;m.au=null;const t=AC.currentTime;a.g.gain.cancelScheduledValues(t);a.g.gain.setTargetAtTime(0,t,.15);setTimeout(()=>{try{a.n.stop();a.o.stop();a.g.disconnect()}catch(e){} if(a.pn&&a.pn._hrtf){hrtfN=Math.max(0,hrtfN-1); a.pn._hrtf=0}},900)}
function heavy(k,v,rate=1,pri){if(!AC||!SB[k])return false;src(SB[k],v,pri?AC.bigB:AC.out,{rate,pri,fadeIn:.008,tag:'heavy:'+k});return true}
function duck(depth,hold,rec){if(!AC)return;const t=AC.currentTime,g=AC.dk.gain;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(depth,t+.03);g.setValueAtTime(depth,t+hold);g.linearRampToValueAtTime(1,t+hold+rec)}
const BED_OPTS=['ambient','mus_depth','mus_dream','mus_layers','mus_waves','off'];
let BED='off'; try{const saved=localStorage.ds17g_bed; if(saved&&BED_OPTS.includes(saved))BED=saved}catch(e){}
let bedS=null,droneS=null;
const VOL=Object.assign({eng:.7,mus:.7,bed:.85,fx:.85},JSON.parse(localStorage.ds_vol||'{}'));
function applyVol(){[['eng','s_eng','v_eng'],['mus','s_mus','v_mus'],['bed','s_bedvol','v_bed'],['fx','s_fx','v_fx']].forEach(([k,id,vid])=>{const el=$(id),v=$(vid);if(el)el.value=Math.round((VOL[k]??.7)*100);if(v)v.textContent=Math.round((VOL[k]??.7)*100)});if(!AC)return;const t=AC.currentTime;AC.engB.gain.setTargetAtTime(VOL.eng*1.4,t,.05);AC.musB.gain.setTargetAtTime(VOL.mus*1.4,t,.05);if(AC.bedB)AC.bedB.gain.setTargetAtTime((VOL.bed??.85)*1.8,t,.05);AC.fxB.gain.setTargetAtTime(VOL.fx/.85,t,.05)}
[['eng','s_eng'],['mus','s_mus'],['bed','s_bedvol'],['fx','s_fx']].forEach(([k,id])=>{const el=$(id);if(el)el.addEventListener('input',e=>{VOL[k]=e.target.value/100;localStorage.ds_vol=JSON.stringify(VOL);applyVol()})});
window.__frozen=false;let freezeWhy=null;
function setFrozen(on,why){window.__frozen=!!on;freezeWhy=on?why:null; if(!on)wake();
 if(on&&why==='user'){$('pauseOv').classList.add('on');$('pauseb').textContent='▶';if(AC&&AC.state==='running')AC.suspend().catch(()=>{})}
 else if(!on){$('pauseOv').classList.remove('on');$('pauseb').textContent='⏸';if(AC&&AC.state==='suspended')AC.resume().catch(()=>{})}
 else if(on&&why==='settings'){$('pauseOv').classList.remove('on')}}
function openSettings(){initAudio();$('setp').classList.add('on');if(running)setFrozen(true,'settings')}
function closeSettings(){$('setp').classList.remove('on');if(freezeWhy==='settings')setFrozen(false)}
for(const ev of['pointerdown','pointermove','pointerup','touchstart','touchmove'])for(const id of['setp','setb','pauseb','pauseOv']){const el=$(id);if(!el)continue;el.addEventListener(ev,e=>{e.stopPropagation();if(ev==='touchmove'&&(id==='setb'||id==='pauseb'))e.preventDefault()},{passive:false})}
$('setb').addEventListener('pointerdown',e=>{e.stopPropagation();if($('setp').classList.contains('on'))closeSettings();else openSettings()});
if($('setx'))$('setx').addEventListener('pointerdown',e=>{e.stopPropagation();closeSettings()});
if($('pauseb'))$('pauseb').addEventListener('pointerdown',e=>{e.stopPropagation();initAudio();if(!running)return;if(freezeWhy==='user')setFrozen(false);else{closeSettings();setFrozen(true,'user')}});
if($('resume')){const _res=e=>{e.preventDefault();e.stopPropagation();setFrozen(false)};$('resume').addEventListener('pointerdown',_res,{passive:false});$('resume').addEventListener('click',_res)}
[['s_eng','eng'],['s_mus','mus'],['s_bedvol','bed'],['s_fx','fx']].forEach(([id])=>{const el=$(id);if(!el)return;el.addEventListener('pointerdown',e=>{try{el.setPointerCapture(e.pointerId)}catch(x){}e.stopPropagation()});el.addEventListener('touchmove',e=>e.stopPropagation(),{passive:false})});
applyVol();if($('s_bed')){$('s_bed').value=BED;$('s_bed').addEventListener('change',e=>{initAudio();setBed(e.target.value)})}
function setBattery(on){batt=!!on; try{localStorage.ds17n_batt=batt?'1':'0'}catch(e){} renderScale=batt?0.8:1; useBloom=!MOB&&!batt; bloom.enabled=useBloom; sun.castShadow=!MOB&&!batt; PR=pickPR(); applyRenderScale(); if(AC&&AC.state==='suspended')AC.resume(); wake()}
if($('s_batt')){$('s_batt').value=batt?'1':'0'; $('s_batt').addEventListener('change',e=>{setBattery(e.target.value==='1')})}
function musRMS(){if(!AC||!AC.an)return 0;const a=new Float32Array(AC.an.fftSize);AC.an.getFloatTimeDomainData(a);let s=0;for(const v of a)s+=v*v;return Math.sqrt(s/a.length)}
let JET=null,briefSrc=null,briefT=null,riserS=null,flyCD=0,ambS=null;
async function prewarmAudio(){if(!AC||AC._pw)return;AC._pw=1;
 for(const sec of[1,1.5,2])noiseBuf(sec);
 const keys=[BRIEF_TRACK,'nuke','sub01','sub08','jet','ambient','riser','jet8','drone','flak','flak2','impact','mlaunch','mmotor','sweep','subdrop','aaaw','msub','hitsub','mus_depth','mus_dream','mus_layers','mus_waves','flare_thump','flare_hiss'];
 await Promise.all(keys.map(k=>SB.get(k).catch(()=>null)));
 // Bake seamless ONLY for the engine loop used at sortie start — baking every bed here stalled iOS 1–2s
 try{ if(SB.jet8) SB.jet8=mkSeamless(SB.jet8,.3); else if(SB.jet) SB.jet=mkSeamless(SB.jet,.3); if(SB.ambient) SB.ambient=mkSeamless(SB.ambient,.3); }catch(e){}
 AC._pwDone=1;
}
function prewarmGfx(){if(window.__pwG)return;window.__pwG=1;
 // ONE lightweight compile — repeated R.compile + nukeStart was causing multi-second iOS freezes
 try{ if(jet)jet.visible=true; R.compile(scene,cam); }catch(e){ try{R.render(scene,cam)}catch(e2){} }
}
const C=(id,name,key,desc)=>({id,name,key,desc});
const SND=[
 {id:'gun',title:'Gun — choose one',loop:0,notLogic:1,cur:'The cannon the jet fires now.',cands:[C('current','',null),C('g1','Deep cannon','snd_gun1','Cannon boom, almost all low body.'),C('g2','Naval gun','snd_gun2','Ship gun under a round sub thump.'),C('g3','Howitzer','snd_gun3','Short howitzer thump, highs rolled off.'),C('g4','Mortar','snd_gun4','Mortar body. The lowest of the set.'),C('g5','Tank gun','snd_gun5','Tank shot with the crack taken out.'),C('g6','Field cannon','snd_gun6','Field cannon, bass first.')]},
 {id:'engine',title:'Engine — choose one',loop:1,notLogic:1,cur:'Jet loop plus a synth sub layer.',cands:[C('current','',null),C('t1','Jet Take off 1 (roar)','snd_t1'),C('t2','Jet Take off 2 (roar)','snd_t2'),C('t3','Jet Take Off 3 (roar)','snd_t3'),C('t1h','Jet Take off 1 (hold)','snd_t1h'),C('js','Jet Stream Synth (cycle)','snd_js'),C('jp','Jet Propulsion Synth Layers (steady)','snd_jp')]},
 {id:'aaa',title:'Cannon / AAA — choose one',loop:0,notLogic:0,cur:'Thunder cannon sample, as the game plays it now.',cands:[C('current','',null),C('tv','Thunder_VideoStar (hit)','snd_tv'),C('ds1','Deep Space Boomer 01 (hit)','snd_ds1'),C('ds2','Deep Space Boomer 02 (hit)','snd_ds2'),C('ths','Thunder (strike)','snd_ths'),C('thu','Thunder (single)','snd_thu'),C('thl','Thunder (late hit)','snd_thl')]},
 {id:'sam',title:'SAM launch — choose one',loop:0,notLogic:1,cur:'Layered launch roar, not one Logic file.',cands:[C('current','',null),C('s1','Boomer FX 15.caf','snd_s1'),C('s2','Boomer FX 45.caf','snd_s2'),C('s3','Boomer FX 02.caf','snd_s3'),C('s4','Asteroid Dust Impact.caf','snd_s4'),C('s5','Boomer FX 16.caf','snd_s5')]},
 {id:'pass',title:'Missile pass — choose one',loop:0,notLogic:1,cur:'Synth whoosh plus a thud. Not one Logic file.',cands:[C('current','',null),C('p1','Subsonic Bass 01.caf','snd_p1'),C('p2','Boomer FX 12.caf','snd_p2'),C('p3','Boomer FX 28.caf','snd_p3'),C('p4','Boomer FX 32.caf','snd_p4'),C('p5','Boomer FX 44.caf','snd_p5')]},
 {id:'boom',title:'Explosions — choose one',loop:0,notLogic:1,cur:'Impact, hit and sub stacked together.',reals:[C('rl1','Real 1','snd_rl1','Nikkō single blast + long debris tail + Subsonic 06 and 01.'),C('rl2','Real 2','snd_rl2','Nikkō multi-blast take + Subsonic 06 + Boomer FX 29.'),C('rl3','Real 3','snd_rl3','Nikkō three-hit demolition + Subsonic 06 + Boomer FX 29.'),C('rl4','Real 4','snd_rl4','Nikkō long take, Subsonic 06 on the first hit, Boomer FX 29 on the loudest.'),C('rl5','Real 5','snd_rl5','Reversed Nikkō debris suck-in + late blast + Subsonic 06 + Boomer FX 29.'),C('rl6','Real 6','snd_rl6','Nikkō cluster + Subsonic 06 + Boomer FX 29 + long debris tail.')],mixes:[C('nk1','Mix 1','snd_nk1','Reversed Subsonic 06 suck-in + Boomer FX 29 + Subsonic 06 tail.'),C('nk2','Mix 2','snd_nk2','Kick crack + Pound Down impact + Sun Up rumble.'),C('nk3','Mix 3','snd_nk3','Reversed Sun Up suck-in + Subsonic 01 + In Rotation debris.'),C('nk4','Mix 4','snd_nk4','Subsonic 09 pre-blast + Boomer FX 29 + Subsonic 06 + Subsonic 07 bed.'),C('nk5','Mix 5','snd_nk5','Pound Down + Boomer FX 29 + Subsonic 06, then Sun Up tail.'),C('nk6','Mix 6','snd_nk6','Reversed In Rotation suck-in + Sun Up + delayed Subsonic 09 + Subsonic 08 bed.')],cands:[C('current','',null),C('dbi','Deep Boom Impact','snd_xdbi'),C('sei','Smoldering Embers Impact 01','snd_xsei'),C('cci','Cosmic Craze Impact 01','snd_xcci'),C('bai','Back at It Bass Impact','snd_xbai'),C('nb','Noisy Boomer','snd_xnb'),C('dlb','Deep Laser Boomer','snd_xdlb')],bounces:[C('b29','Boomer FX 29','snd_b29'),C('sun','Sun Up Impact 01','snd_sun'),C('pnd','Pound Down Impact','snd_pnd'),C('rot','In Rotation FX','snd_rot'),C('s06','Subsonic Boom FX 06','snd_s06'),C('s01','Subsonic Boom FX 01','snd_s01')]},
 {id:'bombrelease',title:'Bomb release — choose one',loop:0,notLogic:1,cur:'Riser, sub and whoosh layered together.',cands:[C('current','',null),C('br1','Rack clunk','snd_br1','Kick strike from the pylon.'),C('br2','Latch thunk','snd_br2','Low latch after the store leaves.'),C('br3','Pylon release','snd_br3','Rack clunk, then the latch.'),C('br4','Store away','snd_br4','Heavy latch, then a smaller clunk.'),C('br5','Release whoosh','snd_br5','Clunk plus a short falling whoosh.'),C('br6','Heavy pickle','snd_br6','Heavy clunk plus a short whistle.')]},
 {id:'nuke',title:'Nuclear blast — choose one',loop:0,notLogic:0,cur:'The single bunker-blast sample used now.',cands:[C('current','',null),C('n1','Boomer FX 49.caf','snd_n1'),C('n2','Boomer FX 50.caf','snd_n2'),C('n3','Boomer FX 51.caf','snd_n3'),C('n4','Boomer FX 18.caf','snd_n4'),C('n5','Boomer FX 30.caf','snd_n5')]},
 {id:'bunker',title:'Bunker blast — choose one',loop:0,notLogic:1,cur:'The single bunker sample the game used before these blasts.',cands:[
  C('current','',null),
  Object.assign(C('b1','Shock Front',null,'Real flash, a short gap, then Subsonic 06 and Back at It. The strongest blast.'),{layers:[{k:'bk_crack',v:.6,d:0,hold:1.6},{k:'lx_drop',v:.28,d:.16,hold:1.1},{k:'lx_s06',v:.48,d:.28,hold:11},{k:'lx_back',v:.34,d:.55,hold:12}]}),
  Object.assign(C('b2','Long Roll',null,'Ten-second field recording under Subsonic 09 and Boomer FX 29.'),{layers:[{k:'bk_long',v:.52,d:0,hold:10},{k:'lx_s09',v:.4,d:.2,hold:12},{k:'lx_b29',v:.34,d:.65,hold:12}]}),
  Object.assign(C('b3','Double Wave',null,'Field blast, Deep Space Boomer, then a second Subsonic 06.'),{layers:[{k:'bk_mid',v:.55,d:0,hold:5.3},{k:'lx_boomer',v:.46,d:.18,hold:8},{k:'lx_s01k',v:.36,d:.5,hold:12},{k:'lx_s06',v:.3,d:1.05,hold:10}]}),
  Object.assign(C('b4','Titan Break',null,'Flash, SubDrop, Titan Call, then the Back at It tail.'),{layers:[{k:'bk_crack',v:.5,d:0,hold:1.6},{k:'lx_drop',v:.34,d:.1,hold:1.1},{k:'lx_titan',v:.52,d:.22,hold:12},{k:'lx_back',v:.32,d:.75,hold:11}]}),
  Object.assign(C('b5','Valley Hammer',null,'Seven-second field roll, Subsonic 09, Boomer FX 29 and Subsonic 01.'),{layers:[{k:'bk_roll',v:.5,d:0,hold:7.1},{k:'lx_s09',v:.38,d:.22,hold:12},{k:'lx_b29',v:.36,d:.5,hold:12},{k:'lx_s01k',v:.26,d:.9,hold:10}]}),
  Object.assign(C('b6','Deep End',null,'Long field roll, SubDrop, Deep Space Boomer, Subsonic 06 and Back at It.'),{layers:[{k:'bk_long',v:.46,d:0,hold:10},{k:'lx_drop',v:.26,d:.14,hold:1.1},{k:'lx_boomer',v:.4,d:.24,hold:8},{k:'lx_s06',v:.34,d:.42,hold:11},{k:'lx_back',v:.28,d:1.1,hold:12}]}),
  Object.assign(C('b7','Rising Cluster',null,'Staggered detonations that swell to a peak, then a long rumble. Not the saved default.'),{layers:[
    {k:'bk_crack',v:.2,d:0,attack:1.5,hold:.35,decay:1.8},
    {k:'bk_mid',v:.24,d:1.15,attack:1.7,hold:.4,decay:2.2},
    {k:'bk_roll',v:.26,d:2.4,attack:1.8,hold:.5,decay:2.6},
    {k:'lx_s06',v:.4,d:.7,attack:3.3,hold:.7,decay:6.2},
    {k:'lx_b29',v:.22,d:1.7,attack:2.8,hold:1.1,decay:6},
    {k:'bk_long',v:.2,d:3.6,attack:2.4,hold:2.2,decay:5.2}
  ]})
 ]},
 {id:'radar',title:'Radar / lock — choose one',loop:0,notLogic:1,cur:'Synth beeps, not a Logic file.',cands:[C('current','',null),C('d1','Boomer FX 40.caf','snd_d1'),C('d2','Rumble Sub Bass.caf','snd_d2'),C('d3','Rumble Noise FX.caf','snd_d3'),C('d4','Boomer FX 26.caf','snd_d4'),C('d5','Boomer FX 21.caf','snd_d5')]},
 {id:'crash',title:'Crash — choose one',loop:0,notLogic:1,cur:'Impact plus sub, two files at once.',cands:[C('current','',null),C('c1','Boomer FX 20.caf','snd_c1'),C('c2','Boomer FX 46.caf','snd_c2'),C('c3','Boomer FX 13.caf','snd_c3'),C('c4','Boomer FX 19.caf','snd_c4'),C('c5','Boomer FX 43.caf','snd_c5')]},
 {id:'overhead',title:'Overhead pass — choose one',loop:0,notLogic:1,cur:'Whoosh, pass and jet layered together.',cands:[C('current','',null),C('o1','Jet Passing Overhead 01.caf','snd_o1'),C('o2','Jet Passing Overhead 02.caf','snd_o2'),C('o3','Jet Stream Synth.caf','snd_o3'),C('o4','Boomer FX 17.caf','snd_o4'),C('o5','Boomer FX 38.caf','snd_o5')]},
 {id:'ambience',title:'Ambience — choose one',loop:1,notLogic:1,cur:'Ambient loop plus a drone layer.',cands:[C('current','',null),C('m1','Warm Summer Waves Sub Bass.caf','snd_m1'),C('m2','Rumble Sub Bass.caf','snd_d2'),C('m3','Rumble Noise FX.caf','snd_d3'),C('m4','Boomer FX 40.caf','snd_d1'),C('m5','Boomer FX 34.caf','snd_m5')]},
 {id:'bed',title:'Music bed — choose one',loop:1,notLogic:1,cur:'Bed loop plus a drone layer.',cands:[C('current','',null),C('b1','Jet Set Bass.caf','snd_b1'),C('b2','Jet Set Piano.caf','snd_b2'),C('b3','Jet Set Strings.caf','snd_b3'),C('b4','Jet Set Horns.caf','snd_b4'),C('b5','Warm Summer Waves Sub Bass.caf','snd_m1')]},
];
function sndSec(id){return SND.find(s=>s.id===id)}
function sndList(s){return [].concat(s.reals||[],s.mixes||[],s.cands||[],s.bounces||[])}
// Shahbaz's approved s15 ticks. Used when this browser has no saved choice
// (Home Screen storage is separate from Safari, and a new folder starts empty).
const SND_DEFAULTS={engine:'t2',aaa:'tv',sam:'s2',pass:'p3',bunker:'b1'};
const FLARE_DEFAULT='thunder';
const SND_MEM={};
function rememberSnd(id,v){if(!id)return; SND_MEM[id]=v; try{ if(v)localStorage['ds15_snd_'+id]=v; else localStorage.removeItem('ds15_snd_'+id)}catch(e){}}
function sndChoice(id){const s=sndSec(id); if(!s)return {id:'current'}; let pick=SND_MEM[id]||SND_DEFAULTS[id]||'current'; if(!SND_MEM[id]){try{const saved=localStorage['ds15_snd_'+id]; if(saved)pick=saved}catch(e){}} const found=sndList(s).find(c=>c.id===pick); if(found)return found; if(id==='engine'||id==='aaa'||id==='boom'){try{localStorage.removeItem('ds15_snd_'+id)}catch(e){}} return s.cands[0]}
let sndBypass=0, sndPrev=[];
function stopSndPrev(){const a=sndPrev; sndPrev=[]; for(const s of a){try{s&&s.stop&&s.stop()}catch(e){}}}
function plainLoop(buf,vol,dest,meta){if(!AC||!buf)return null; const s=AC.createBufferSource(); s.buffer=buf; s.loop=true; s.playbackRate.value=1; const g=AC.createGain(); g.gain.value=0; g.gain.setTargetAtTime(vol,AC.currentTime,.05); s.connect(g).connect(dest); s.start(); sfxLog('sndPlay',Object.assign({rate:1,vol,mode:'plain'},meta||{})); return {a:s,g,plain:1,stop(t){try{g.gain.setTargetAtTime(0,AC.currentTime,.08); const end=(t||AC.currentTime)+.2; s.stop(end); s.onended=()=>{try{g.disconnect();s.disconnect()}catch(e){}}}catch(e){}}}}
let aaaShots=[], boomShots=[], gunShots=[];
function useSnd(sec,P){if(sndBypass)return false; const c=sndChoice(sec); if(!c||c.id==='current')return false; if(!c.key)return false; if(!SB[c.key]){SB.get(c.key); sfxLog('sndWait',{sec,id:c.id}); return true} const buf=SB[c.key]; const fade=sec==='gun'?0.012:sec==='aaa'?0.005:0.008; const vol=sec==='gun'?0.9:0.5; const bag=sec==='gun'?gunShots:sec==='aaa'?aaaShots:sec==='boom'?boomShots:null; if(bag){while(bag.length>=2){const old=bag.shift(); try{old&&old.stop&&old.stop(0); sfxLog(sec+'Cap',{stopped:1})}catch(e){}}} let node; if(P){const pn=mkPan(true,140); setP0(pn,P); if(sec==='pass')sweepLR(pn,P,1.3); pn.connect(AC.out); node=src(buf,vol,pn,{pri:1,rate:1,fadeIn:fade,tag:'snd:'+sec+':'+c.id}); const hold=((buf.duration)||3)*1000+500; setTimeout(()=>{if(pn._hrtf){hrtfN=Math.max(0,hrtfN-1); pn._hrtf=0} try{pn.disconnect()}catch(e){} if(bag){const i=bag.indexOf(node); if(i>=0)bag.splice(i,1)}},hold)} else node=src(buf,vol,AC.out,{pri:1,rate:1,fadeIn:fade,tag:'snd:'+sec+':'+c.id}); if(bag&&node&&node.stop){bag.push(node); const prev=node.onended; node.onended=()=>{if(typeof prev==='function')prev(); const i=bag.indexOf(node); if(i>=0)bag.splice(i,1)}} sfxLog('sndPlay',{sec,id:c.id,rate:1,file:c.name}); return !!node}
function playSndBuf(sec,c,dest){if(!AC||!c||!c.key||!SB[c.key])return false; const out=dest||AC.out; const s=sndSec(sec); if(s&&s.loop){const h=plainLoop(SB[c.key],.45,out,{sec,id:c.id,file:c.name}); if(h)sndPrev.push(h)} else {const n=src(SB[c.key],sec==='gun'?0.9:.5,out,{pri:1,rate:1,fadeIn:sec==='gun'?0.012:.008,tag:'snd:'+sec+':'+c.id}); if(n&&n.stop)sndPrev.push(n); sfxLog('sndPlay',{sec,id:c.id,rate:1,file:c.name})} return true}
function stopBed(){if(bedS){try{bedS.stop()}catch(e){}bedS=null}if(droneS){try{droneS.stop()}catch(e){}droneS=null}}
function startBed(){if(!AC)return;stopBed();
 const bedC=sndChoice('bed'), ambC=sndChoice('ambience');
 const bedAlt=bedC.id!=='current', ambAlt=ambC.id!=='current';
 if(!bedAlt){
  if(BED==='off'){AC.amb.gain.setTargetAtTime(0,AC.currentTime,.3); if(!ambAlt)return}
  else {const k=BED==='ambient'?'ambient':BED;const buf=SB[k]||SB.ambient;if(!buf){if(!ambAlt)return}else{
   const vol=BED==='ambient'?1.05:BED==='mus_dream'?.7:BED==='mus_layers'?.65:.55;
   bedS=startSmoothLoop(buf,vol,AC.amb,{tag:'bed:'+BED,xf:.45,detune:1.002,fadeIn:1.2});
  }}
 }else if(SB[bedC.key]) bedS=plainLoop(SB[bedC.key],.4,AC.amb,{sec:'bed',id:bedC.id});
 else SB.get(bedC.key);
 if(!ambAlt){
  if(!bedAlt&&BED!=='off'){
   if(BED==='ambient'&&SB.drone)droneS=startSmoothLoop(SB.drone,.32,AC.amb,{tag:'drone',xf:.5,detune:.998,fadeIn:1.4});
   else if(SB.drone)droneS=startSmoothLoop(SB.drone,.12,AC.amb,{tag:'drone',xf:.5,detune:.998,fadeIn:1.4});
  }
 }else if(SB[ambC.key]) droneS=plainLoop(SB[ambC.key],.28,AC.amb,{sec:'ambience',id:ambC.id});
 else SB.get(ambC.key);
}
const MUSIC_CAP=0.0316;
function setBed(id){if(!BED_OPTS.includes(id))return;BED=id;try{localStorage.ds17g_bed=id; localStorage.ds15_bed=id}catch(e){}const sel=$('s_bed');if(sel)sel.value=id;if(JET||ambS)startBed()}
let introS=null, introTok=0, introHandle=null, moodHandle=null, endHandle=null, musicRoll={};
const MUSIC_DEF={intro:'i1',ending:'e1',mood:'off'};
const MUSIC_LV={intro:70,ending:75,mood:55};
const MUSIC_PRE={
 intro:[['current','Deck only','No added music. Deck sounds stay.'],['i1','Kick Riser','Floating Frequency Kick Space Riser.'],['i2','Synth Riser','80s Synth FX Riser.'],['i3','Layers Under','Dream Space Layers with a quiet sub.'],['i4','Jet Arrival','Jet pass, then the kick riser.'],['random','Random','A different intro each sortie.']],
 ending:[['current','Space Dub','The mission-complete dub already in the game.'],['e1','Dub Lift','Deep Space Dub 02.'],['e2','Low Landing','Dub with Subsonic Boom 01 under it.'],['e3','Sun Down','Sun Up Impact, left long.'],['e4','Pound Close','Pound Down Impact.'],['e5','Back at It','Back at It Bass Impact, played once.'],['random','Random','A different ending each sortie.']],
 mood:[['off','Off','No mood music. The synth layer stays silent. The valley bed is the separate bed switch.'],['current','Iron Veil','The valley bed already in the game. No added synth.'],['m1','Dream Layers','Layers, then a Titan phrase that enters and leaves.'],['m2','Dub Bed','Dub, with a sub that rises and falls.'],['m3','Drift','Layers, then a slow sub that fades away.'],['m4','Rotation','In Rotation from its body, a tom hit, then the phrase returns.'],['m5','Hollow','A low sub, then a hollow boom.'],['m6','Aftershock','The pound hits, then the layers.'],['m7','Sun Under','Sun impact from its body, with a sub under it.'],['m8','Wide Pass','A jet pass, a low bed, then a second pass.'],['m9','Boomer Bed','A boomer swell, then the dub.'],['m10','Kick Space','A kick hit, then the riser underneath.'],['random','Random','A different bed each sortie.']]
};
const MUSIC_LAY={
 i1:[{k:'lx_riser',v:.62,fade:1.2}], i2:[{k:'lx_80s',v:.55,fade:1}], i3:[{k:'lx_layers',v:.42,loop:1,fade:1.6},{k:'lx_sub08',v:.16,loop:1,fade:2.4}], i4:[{k:'lx_jet1',v:.4,fade:.2},{k:'lx_riser',v:.38,d:.3,fade:1.2}],
 e1:[{k:'lx_dub',v:.55,loop:1,fade:1.4}], e2:[{k:'lx_dub',v:.48,loop:1,fade:1.4},{k:'lx_sub01',v:.26,d:.4,fade:1.2,hold:3,decay:3}], e3:[{k:'lx_sun',v:.5,fade:1.6}], e4:[{k:'lx_pound',v:.46,fade:1.1}], e5:[{k:'lx_back',v:.42,fade:1.4}],
 m1:[{k:'lx_layers',v:.46,loop:1,fade:2.6},{k:'lx_titan',v:.2,d:12,fade:4,hold:6,decay:7}],
 m2:[{k:'lx_dub',v:.4,loop:1,fade:2.2},{k:'lx_sub01',v:.18,d:7,fade:2.2,hold:2,decay:5}],
 m3:[{k:'lx_layers',v:.36,loop:1,fade:2.8},{k:'lx_sub08',v:.2,d:6,fade:4,hold:8,decay:6}],
 m4:[{k:'lx_rot',v:1.15,off:10,d:0,fade:.55,hold:11,decay:2.2},{k:'lx_tom',v:.42,off:13.6,d:5.2,fade:.12,hold:1.1,decay:1.3},{k:'lx_rot',v:1.15,off:10,d:11.2,fade:1.2,hold:11,decay:2.4}],
 m5:[{k:'lx_sub08',v:.72,d:0,fade:.7,hold:2.2,decay:2.4},{k:'lx_s08k',v:1.35,off:8,d:.4,fade:.8,hold:6,decay:2},{k:'lx_sub01',v:.55,d:3.2,fade:.5,hold:2,decay:2}],
 m6:[{k:'lx_pound',v:1.5,off:8,d:0,fade:.35,hold:2.4,decay:2.2},{k:'lx_layers',v:.95,d:1.6,loop:1,fade:.8}],
 m7:[{k:'lx_sun',v:1.25,off:13,d:0,fade:.6,hold:8,decay:3},{k:'lx_sub08',v:.62,d:.35,fade:.45,hold:4,decay:2.5}],
 m8:[{k:'lx_jet2',v:1.15,d:0,fade:.08,hold:1.6,decay:.8},{k:'lx_layers',v:.7,d:.2,loop:1,fade:.6},{k:'lx_jet1',v:1.05,d:3.4,fade:.08,hold:1.3,decay:.7}],
 m9:[{k:'lx_boomer',v:.85,d:0,fade:.25,hold:3.2,decay:2},{k:'lx_dub',v:.7,d:1.3,loop:1,fade:.7}],
 m10:[{k:'lx_kick',v:1.05,off:10.8,d:0,fade:.04,hold:1.6,decay:1.2},{k:'lx_riser',v:.48,d:.35,fade:.4,hold:8,decay:3}]
};
const MUSIC_SPAN={m1:34,m2:26,m3:32,m4:26,m5:12,m6:16,m7:14,m8:8,m9:14,m10:12};
function musicChoice(cat){let id=MUSIC_DEF[cat]; try{const s=localStorage['ds16_'+cat]; if(s)id=s}catch(e){} if(cat==='mood'&&id!=='off'){let allow=''; try{allow=localStorage.ds17g_mood||''}catch(e){} if(allow!==id)id='off'} return MUSIC_PRE[cat].some(x=>x[0]===id)?id:MUSIC_DEF[cat]}
function musicLevel(cat){let v=MUSIC_LV[cat]; try{const s=localStorage['ds16_lv_'+cat]; if(s!=null&&s!=='')v=+s}catch(e){} return Math.min(MUSIC_CAP, Math.min(100,Math.max(0,v))/100)}
function rememberMusic(cat,id){try{localStorage['ds16_'+cat]=id; if(cat==='mood'){localStorage.ds17g_mood=id; localStorage.ds17f_mood=id}}catch(e){} musicRoll[cat]=null; try{writePickStores(pickCode())}catch(e){}}
function resolveMusic(cat){const id=musicChoice(cat); if(id!=='random')return id; if(musicRoll[cat])return musicRoll[cat]; const opts=MUSIC_PRE[cat].map(x=>x[0]).filter(x=>x!=='current'&&x!=='random'&&x!=='off'); let i=Math.floor(Math.random()*opts.length); if(opts[i]===musicRoll.prev)i=(i+1)%opts.length; musicRoll[cat]=opts[i]; musicRoll.prev=opts[i]; return opts[i]}
function spawnLayers(spec, dest, level){const nodes=[]; const t0=AC.currentTime;
 for(const layer of spec){const buf=SB[layer.k]; if(!buf){SB.get(layer.k); continue} const s=AC.createBufferSource(); s.buffer=buf; s.loop=!!layer.loop; const off=Math.min(layer.off||0, Math.max(0,buf.duration-.05)); if(layer.loop&&off>0){s.loopStart=off; s.loopEnd=Math.max(off+.25, buf.duration-.03)} const g=AC.createGain(); const t=t0+(layer.d||0); const peak=Math.max(.0008,(layer.v||.4)*level); const fade=Math.max(.04,layer.fade!=null?layer.fade:.8); g.gain.setValueAtTime(.0008,t); g.gain.exponentialRampToValueAtTime(peak,t+fade); const hold=layer.hold||0, decay=layer.decay||0; if(hold||decay){ if(hold)g.gain.setValueAtTime(peak,t+fade+hold); if(decay)g.gain.exponentialRampToValueAtTime(.0008,t+fade+hold+decay); if(!layer.loop){try{s.stop(t+fade+hold+decay+.06)}catch(e){}} } s.connect(g).connect(dest); try{s.start(t, off)}catch(e){} nodes.push({s,g}); sfxLog('music',{k:layer.k,d:layer.d||0,off,fade:+fade.toFixed(2),v:+peak.toFixed(3)})}
 if(!nodes.length)return null;
 return {nodes, stop(out){const tt=AC.currentTime,o=out==null?1.35:out; for(const n of nodes){try{const cur=Math.max(.0008,n.g.gain.value); n.g.gain.cancelScheduledValues(tt); n.g.gain.setValueAtTime(cur,tt); n.g.gain.exponentialRampToValueAtTime(.0008,tt+Math.max(.2,o)); n.s.stop(tt+o+.06)}catch(e){}}}}}
function playMusic(id, dest, level){const spec=MUSIC_LAY[id]; if(!AC||!spec||!dest)return null; let dead=false, cur=null, timer=0;
 const arm=()=>{ if(dead)return; const prev=cur; cur=spawnLayers(spec,dest,level); if(prev)prev.stop(1.5); const span=MUSIC_SPAN[id]; if(span) timer=setTimeout(arm, Math.max(4,span-1.1)*1000); };
 arm();
 return {stop(){dead=true; clearTimeout(timer); if(cur)cur.stop(1.3)}}}
function playLayers(id, dest, level){return playMusic(id, dest, level)}
function startIntroMusic(){if(!AC||!takingOff())return; if(INTRO_TRACK){if(introS)return; const token=++introTok; const arm=buf=>{if(token!==introTok||!buf||introS||!takingOff())return; introS=plainLoop(buf,.18*musicLevel('intro'),AC.introG,{tag:'intro'})}; if(SB[INTRO_TRACK])arm(SB[INTRO_TRACK]); else SB.get(INTRO_TRACK).then(arm); return}
 const id=resolveMusic('intro'); if(id==='current')return; if(introHandle)return; const go=()=>{if(introHandle||!takingOff())return; introHandle=playMusic(id,AC.introG,musicLevel('intro'))}; const need=(MUSIC_LAY[id]||[]).filter(l=>!SB[l.k]); if(!need.length)go(); else Promise.all(need.map(l=>SB.get(l.k))).then(go)}
function stopIntroMusic(){introTok++; if(introS){try{introS.stop()}catch(e){} introS=null} if(introHandle){try{introHandle.stop()}catch(e){} introHandle=null}}
function startMood(){if(!AC||takingOff())return; const id=resolveMusic('mood'); if(id==='off'||id==='current'||musicLevel('mood')<=0.001){stopMood(true); return}
 if(moodHandle&&moodHandle.id===id)return; stopMood(false); const go=()=>{if(takingOff()||(S&&(S.dead||S.phase==='done'))||($('end')&&!$('end').classList.contains('hide')))return; const now=musicChoice('mood'); if(now==='off'||now==='current'||musicLevel('mood')<=0.001){stopMood(true); return} if(AC.moodG)AC.moodG.gain.setTargetAtTime(1,AC.currentTime,.3); moodHandle=playMusic(id,AC.moodG,musicLevel('mood')); if(moodHandle)moodHandle.id=id; sfxLog('mood',{id})}; const need=(MUSIC_LAY[id]||[]).filter(l=>!SB[l.k]); if(!need.length)go(); else Promise.all(need.map(l=>SB.get(l.k))).then(go)}
function stopMood(fast){if(moodHandle){try{moodHandle.stop(fast?0.08:1.2)}catch(e){} moodHandle=null} if(AC&&AC.moodG){const t=AC.currentTime; AC.moodG.gain.cancelScheduledValues(t); if(fast)AC.moodG.gain.setValueAtTime(0,t); else AC.moodG.gain.setTargetAtTime(0,t,.2)}}
function playEnding(){if(!AC)return; const id=resolveMusic('ending'); if(id==='current'){SB.get(BRIEF_TRACK).then(b=>{if(!b||running)return; stopWin(); winSrc=src(b,0,AC.musB,{loop:true}); winSrc.g.gain.setValueAtTime(0,AC.currentTime); winSrc.g.gain.linearRampToValueAtTime(.5*musicLevel('ending')/.75,AC.currentTime+1.2)}); return}
 const go=()=>{if(running)return; if(endHandle)endHandle.stop(); endHandle=playMusic(id,AC.musB,musicLevel('ending'))}; const need=(MUSIC_LAY[id]||[]).filter(l=>!SB[l.k]); if(!need.length)go(); else Promise.all(need.map(l=>SB.get(l.k))).then(go)}
let deckJet=null, deckRotor=null;
function deckOne(key,vol){if(!AC||!SB[key])return; src(SB[key],vol,AC.mus,{pri:1,fadeIn:.012,tag:'deck:'+key})}
function startDeckAmbience(){if(!AC||!takingOff())return;
 const nbD=nbSpec('deck'); if(nbD){const k=nbD.layers[0].k; if(!SB[k]){SB.get(k); return} if(!deckJet){deckJet=plainLoop(SB[k],(nbD.layers[0].v||.24)*(nbLevel()/0.8),AC.deckJetG,{tag:'nb:deck',id:nbD.id}); sfxLog('nb',{cat:'deck',id:nbD.id,k})} return}
 if(!deckJet&&SB.deck_jet)deckJet=plainLoop(SB.deck_jet,1,AC.deckJetG,{tag:'deck:jet'});
 if(!deckRotor&&SB.deck_rotor)deckRotor=plainLoop(SB.deck_rotor,1,AC.deckRotorG,{tag:'deck:rotor'})}
function stopDeckAmbience(){if(deckJet){try{deckJet.stop()}catch(e){} deckJet=null} if(deckRotor){try{deckRotor.stop()}catch(e){} deckRotor=null}
 if(AC&&AC.deckJetG){const t=AC.currentTime; AC.deckJetG.gain.setTargetAtTime(0,t,.15); AC.deckRotorG.gain.setTargetAtTime(0,t,.15)}}
function armJet(buf, off, meta){if(!buf||JET)return; const g=AC.createGain(); g.gain.value=0; g.connect(AC.engWhineLP||AC.engB); JET={plain:1, g, buf, off:off||0, slices:[], next:0, rate:0.8, stop(){stopLive(this.slices); try{g.gain.setTargetAtTime(0,AC.currentTime,.08)}catch(e){}}}; sfxLog('nb', meta||{cat:'engine'}); if(!takingOff()){startBed(); ambS=bedS}}
function startJet(){
 const nbE=nbSpec('engine'); if(nbE){const k=nbE.layers[0].k; if(!SB[k]){SB.get(k); return} if(!JET)armJet(SB[k], nbE.layers[0].off||0, {cat:'engine',id:nbE.id,k}); return}
 const engC=sndChoice('engine');
 if(engC.id!=='current'){
  if(!SB[engC.key]){SB.get(engC.key); return}
  if(!JET)armJet(SB[engC.key], 0, {sec:'engine',id:engC.id});
  return}
 if(JET||!(SB.jet8||SB.jet))return;
 armJet(SB.jet8||SB.jet, 0, {tag:'jet'})}
function briefMusic(){if(!AC)return;const go=()=>{if(!$('brief')||$('brief').classList.contains('hide'))return;if(SB.ambient&&!briefSrc){briefSrc=src(mkSeamless(SB.ambient,.45),0,AC.mus,{loop:true,off:Math.random()*2,tag:'brief'});briefSrc.g.gain.cancelScheduledValues(AC.currentTime);briefSrc.g.gain.setValueAtTime(0,AC.currentTime);briefSrc.g.gain.linearRampToValueAtTime(.16,AC.currentTime+2)}};
 if(briefT)return;briefT=1;SB.get('ambient').then(()=>go())}
let winSrc=null;function stopBrief(){briefT=1;if(briefSrc){const b=briefSrc;b.g.gain.setTargetAtTime(0,AC.currentTime,.4);setTimeout(()=>{try{b.stop()}catch(e){}},2500);briefSrc=null}stopWin()}
function stopWin(){if(winSrc&&AC){const w=winSrc;w.g.gain.cancelScheduledValues(AC.currentTime);w.g.gain.setTargetAtTime(0,AC.currentTime,.3);setTimeout(()=>{try{w.stop()}catch(e){}},2000);winSrc=null}}
function riser(on){if(!AC)return;const t=AC.currentTime;if(on&&!riserS&&SB.riser){riserS=src(SB.riser,.001,AC.mus,{rate:.92});riserS.g.gain.exponentialRampToValueAtTime(.38,t+5);riserS.playbackRate.linearRampToValueAtTime(1.12,t+6)}
 if(!on&&riserS){riserS.g.gain.cancelScheduledValues(t);riserS.g.gain.setTargetAtTime(0,t,.08);const r=riserS;setTimeout(()=>{try{r.stop()}catch(e){}},800);riserS=null}}
function play(buf,vol=.5){if(!AC||!buf)return;src(buf,vol,AC.out)}
function blip(f,d=.08,v=.15,type='sine'){if(!AC)return;sfxLog('blip',{f,d,v});const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();o.type='sine';o.frequency.value=Math.min(f,600);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v*.45,t+.025);g.gain.exponentialRampToValueAtTime(.0005,t+d+.05);o.connect(g).connect(AC.tone);o.start(t);o.stop(t+d+.08)}
function blastDest(P){const pn=AC.createPanner(); pn.panningModel='equalpower'; pn.distanceModel='linear'; pn.refDistance=1; pn.maxDistance=20000; pn.rolloffFactor=0; setP0(pn,P); pn.connect(AC.bigB); setTimeout(()=>{try{pn.disconnect()}catch(e){}},18000); return pn}
function playBunker(c,P){if(!AC||!c||!c.layers)return; const go=()=>{if(!AC)return; const loud=c.id&&String(c.id).indexOf('nb_')===0; let dest=AC.bigB; if(P) dest=loud?blastDest(P):(function(){const pn=mkPan(true,320); setP0(pn,P); pn.connect(AC.bigB); setTimeout(()=>{if(pn._hrtf){hrtfN=Math.max(0,hrtfN-1); pn._hrtf=0} try{pn.disconnect()}catch(e){}},16000); return pn})(); const t0=AC.currentTime; for(const layer of c.layers){const buf=SB[layer.k]; if(!buf)continue; if(layer.attack){const s=AC.createBufferSource(); s.buffer=buf; const g=AC.createGain(); const t=t0+(layer.d||0); const peak=Math.max(.0008,layer.v||.2); const atk=Math.max(.2,layer.attack); const hold=layer.hold==null?.4:layer.hold; const dec=layer.decay==null?3:layer.decay; g.gain.setValueAtTime(.0008,t); g.gain.exponentialRampToValueAtTime(peak,t+atk); g.gain.setValueAtTime(peak,t+atk+hold); g.gain.exponentialRampToValueAtTime(.0008,t+atk+hold+dec); s.connect(g).connect(dest); const off=Math.min(layer.off||0, Math.max(0,buf.duration-.05)); s.start(t, off); try{s.stop(t+atk+hold+dec+.05)}catch(e){} sndPrev.push(s); sfxLog('bunker',{id:c.id,k:layer.k,d:layer.d||0,off,attack:atk,peak:+peak.toFixed(3),loud:loud?1:0})} else {const s=src(buf,layer.v,dest,{when:t0+(layer.d||0),pri:1,fadeIn:.004,tag:'bunker:'+layer.k}); if(s&&s.stop){if(layer.hold){try{s.stop(t0+(layer.d||0)+layer.hold)}catch(e){}} sndPrev.push(s)} sfxLog('bunker',{id:c.id,k:layer.k})}}}; const need=c.layers.filter(l=>!SB[l.k]); if(!need.length)go(); else Promise.all(need.map(l=>SB.get(l.k))).then(go)}
function bunkerLayered(){if(typeof nbSpec==='function'&&nbSpec('bunker'))return true; const c=sndChoice('bunker'); return !!(c&&c.layers&&c.layers.length)}
function bunkerBlast(P){if(playBank('bunker',P||BUNK)){window.__bunkerPlayed='nb:'+nbChoice('bunker'); return} const c=sndChoice('bunker'); window.__bunkerPlayed=c&&c.id||''; if(c&&c.layers&&c.layers.length)playBunker(c,P||BUNK); else boomSfx(true,P||BUNK)}
function boomSfx(big,P){if(!AC)return;sfxLog('boomSfx',{big:!!big});
  const at=P||null;
  if(!big&&holdCustom('boom',at||(S&&S.pos)))return;
  if(big){ if(useSnd('nuke',at||S.pos))return; try{duck(.3,1.8,4)}catch(e){}
    const dest=at?boomPan(at,AC.bigB):AC.bigB;
    if(SB.nuke){src(SB.nuke,1.0,dest,{pri:1,fadeIn:.008,tag:'heavy:nuke'}); return}
    if(SB.impact)src(SB.impact,.95,dest,{pri:1,fadeIn:.008,tag:'boom:impact'});
    if(SB.sub08)src(SB.sub08,.65,dest,{pri:1,fadeIn:.008,tag:'boom:sub08'});
    return}
  const dest=at?boomPan(at,AC.bigB):AC.bigB;
  if(SB.sub08)src(SB.sub08,.55,dest,{pri:1,fadeIn:.008,tag:'boom:sub08'});
  else if(SB.impact)src(SB.impact,.5,dest,{pri:1,fadeIn:.008,tag:'boom:impact'});
}
function crashSfx(){if(!AC)return; if(holdCustom('crash',S.pos))return; sfxLog('crashSfx',{});
  try{duck(.25,1.0,2.5)}catch(e){}
  // One clean Logic hit + one sub — no stacked pitch-shifts / huge noise graphs (was freezing iOS)
  const dest=AC.bigB||AC.out;
  if(SB.impact)src(SB.impact,.9,dest,{pri:1,fadeIn:.008,tag:'crash:impact'});
  else if(SB.hitsub)src(SB.hitsub,.85,dest,{pri:1,fadeIn:.008,tag:'crash:hitsub'});
  if(SB.sub08)src(SB.sub08,.7,dest,{pri:1,fadeIn:.008,tag:'crash:sub08'});
}
function whoosh(){if(!AC)return;sfxLog('whoosh',{});const t=AC.currentTime,n=AC.createBufferSource();n.buffer=noiseBuf(1.2);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(280,t);f.frequency.exponentialRampToValueAtTime(120,t+1.1);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.4,t+.35);g.gain.exponentialRampToValueAtTime(.001,t+1.4);n.connect(f).connect(g).connect(AC.out);n.start();thud(AC.out,.4,48,22,1.2)}
function passBy(P){if(!AC)return; if(holdCustom('pass',P))return; sfxLog('passBy',{});const pn=mkPan(true,80);setP0(pn,P);sweepLR(pn,P,1.3);pn.connect(AC.out);const t=AC.currentTime,n=AC.createBufferSource();n.buffer=noiseBuf(1.5);n.playbackRate.setValueAtTime(.85,t);n.playbackRate.exponentialRampToValueAtTime(.55,t+1.2);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(320,t);f.frequency.exponentialRampToValueAtTime(100,t+1.2);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.7,t+.25);g.gain.exponentialRampToValueAtTime(.001,t+1.5);n.connect(f).connect(g).connect(pn);n.start();n.stop(t+1.6);n.onended=()=>{if(pn._hrtf){hrtfN=Math.max(0,hrtfN-1);pn._hrtf=0} try{pn.disconnect()}catch(e){}};thud(pn,.55,45,20,1.3);if(SB.subdrop)psrc('subdrop',.3,P,true,{ref:80,rate:.85,pri:1,fadeIn:.2,tag:'subdrop'})}
// ---------- state ----------
let S;
function reset(){clearGrids(); releaseControls(); try{document.body.classList.remove('tanking','gridding')}catch(e){} try{stopMood()}catch(e){} const fromDeath=valleyRespawn; const hadFuel=!!(S&&S.fuelDone); valleyRespawn=false; if(S&&S.missile&&AC)mslAudioStop(S.missile); const meet=meetPos(); S={phase:'ingress',pos:new THREE.Vector3(meet.x,meet.y,meet.z),yaw:0,pitch:0,roll:0,thr:.7,det:0,detT:0,t:0,ts:1,locked:false,relHold:0,bomb:null,boomT:-1,penT:0,flares:8,missile:null,cine:false,cineA:null,aaaT:0,srchT:0,sites:SITES.map(()=>({st:'off',trk:0,shots:0,dead:0,warned:0,warnT:0})),samShots:0,err:0,dead:null,shake:0,msg:'',msgT:0,flareCD:0,egressLaunch:false,sec:[],hp:2,brk:0,brkCD:0,brkDir:1,ecm:0,ecmCD:0,ecmN:2,defeated:0,flakT:2,aaaS:0,teachT:0,smT:0,gunCD:0,gunSnd:0,iron:2,ironHold:0,ironBomb:null,beamT:0};
 if(S&&S.missile)mslAudioStop(S.missile);mslG.visible=bomb.visible=msl.visible=ring.visible=dome.visible=bulge.visible=false;debris.forEach(d=>{d.m.visible=false;scene.remove(d.m)});debris.length=0;parts.forEach(p=>{p.m.visible=false;_pool.push(p.m)});parts.length=0;bunker.visible=true;$('end').classList.add('hide');
 rounds.forEach(r=>{if(r.m)r.m.visible=false});rounds.length=0;SITE_G.forEach(g=>{if(g)g.visible=true});ironMesh.visible=false;if(banditMesh)banditMesh.visible=false;gunDown=false;stopIntroMusic();stopDeckAmbience();
 if(DS_MODE==='game'&&!skipTakeoff&&!fromDeath){S.phase='deck';S.pos.set(CVN.jetX,CVN.jetY,CVN.jetZ);S.yaw=0;S.pitch=0;S.roll=0;S.thr=.18;S.spd=0;S.to={armed:0,shot:0,climb:0,hand:0,pulled:0,settled:0,steam:0,swapped:0,fade:0};setThr(.18);document.body.classList.add('takingoff','to-deck');document.body.classList.remove('to-arm')}
 else{S.to=null;setThr(.7);document.body.classList.remove('takingoff','to-deck','to-arm');
  if(fromDeath){releaseSteer(); if(hadFuel){const z=300,x=vx(z); S.phase='ingress'; S.pos.set(x,H(x,z)+80,z); S.msg='RUN-IN — SETTLE'} else {const p=meetPos(); S.phase='ingress'; S.pos.set(p.x,p.y,p.z); S.msg='TANKER HIGH — JOIN UP'} S.yaw=0; S.pitch=0; S.roll=0; S.spd=85+.7*195; S.shake=0; S.msgT=3}}
 const fade=$('tofade'); if(fade)fade.classList.remove('on')}
// ---------- input ----------
let steer=null;const inp={x:0,y:0};
// One steering pointer, captured on the game canvas. The HUD canvas sits above
// #gl and on iPhone can take the finger, so the listeners are on the document.
// A missed pointerup used to leave inp stuck; every end path zeroes it.
const steerBlock='#brief,#tut,#end,#thr,#setb,#pauseb,#setp,#setx,#pauseOv,#pauseCard,.btn,a,button,input,select,textarea,label';
function steerBlocked(t){return !!(t&&t.closest&&t.closest(steerBlock))}
function steerTo(x,y){const r=Math.max(48,Math.min(innerWidth,innerHeight)*.22);inp.x=clamp((x-steer.x)/r,-1,1);inp.y=clamp((y-steer.y)/r,-1,1)}
function releaseSteer(){
  if(steer){try{steer.el&&steer.el.releasePointerCapture&&steer.el.releasePointerCapture(steer.pointerId)}catch(e){}}
  steer=null; inp.x=0; inp.y=0;
}
if(DS_MODE==='game'){
  const hud=$('hud');
  if(hud){hud.style.setProperty('pointer-events','none','important'); hud.style.touchAction='none'}
  gl.style.touchAction='none';
  let recentTouch=null, arming=false;
  document.addEventListener('pointerdown',e=>{
    try{initAudio()}catch(err){}
    if(e.button>0||steerBlocked(e.target))return;
    if(steer&&e.pointerId===steer.pointerId)return;
    if(steer){try{steer.el&&steer.el.releasePointerCapture(steer.pointerId)}catch(err){}}
    let touchId=e.pointerId;
    if(recentTouch&&performance.now()-recentTouch.t<80&&Math.hypot(recentTouch.x-e.clientX,recentTouch.y-e.clientY)<48)touchId=recentTouch.id;
    arming=true;
    try{gl.setPointerCapture(e.pointerId); steer={pointerId:e.pointerId,touchId,x:e.clientX,y:e.clientY,el:gl}}
    catch(err){steer={pointerId:e.pointerId,touchId,x:e.clientX,y:e.clientY,el:null}}
    arming=false;
  },{capture:true});
  document.addEventListener('pointermove',e=>{
    if(!steer||e.pointerId!==steer.pointerId)return;
    if(e.cancelable)e.preventDefault();
    steerTo(e.clientX,e.clientY);
  },{capture:true,passive:false});
  const endPointer=e=>{if(!arming&&steer&&e.pointerId===steer.pointerId)releaseSteer()};
  document.addEventListener('pointerup',endPointer,{capture:true});
  document.addEventListener('pointercancel',endPointer,{capture:true});
  document.addEventListener('lostpointercapture',endPointer,{capture:true});
  // Remember the touch id so touchend still centres the stick if Safari drops pointerup.
  // The throttle finger is a different id and does not clear the stick.
  document.addEventListener('touchstart',e=>{
    for(const t of e.changedTouches){
      if(steerBlocked(e.target))continue;
      recentTouch={id:t.identifier,x:t.clientX,y:t.clientY,t:performance.now()};
      if(steer&&Math.hypot(t.clientX-steer.x,t.clientY-steer.y)<48)steer.touchId=t.identifier;
    }
  },{capture:true,passive:true});
  const endTouch=e=>{
    if(!steer)return;
    let gone=e.touches.length===0;
    for(const t of e.changedTouches){ if(t.identifier===steer.touchId||t.identifier===steer.pointerId)gone=true }
    if(gone)releaseSteer();
  };
  document.addEventListener('touchend',endTouch,{capture:true});
  document.addEventListener('touchcancel',endTouch,{capture:true});
  window.addEventListener('blur',releaseSteer);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseSteer()});
  window.addEventListener('pagehide',releaseSteer);
}
function setThr(v){S&&(S.thr=v);$('thrk').style.bottom=(3+v*(130-12))+'px';const kcas=Math.round((85+v*195)*1.94);$('thrl').innerHTML='THROTTLE<br><span style="opacity:.85">'+kcas+' KTS</span>';if(S&&!S._thrHint&&v>.05&&v<.95&&!takingOff()){S._thrHint=1;msg('THROTTLE — SLIDE FOR SPEED')}}
{const t=$('thr');let id=null; window.__thrUp=()=>{const p=id; id=null; try{if(p!=null)t.releasePointerCapture(p)}catch(e){}}; const f=e=>{const r=t.getBoundingClientRect();setThr(clamp(1-(e.clientY-r.top-3)/(r.height-6),0,1))};
 t.addEventListener('pointerdown',e=>{e.stopPropagation();id=e.pointerId;try{t.setPointerCapture(id)}catch(err){} f(e)});t.addEventListener('pointermove',e=>{if(e.pointerId===id)f(e)});t.addEventListener('pointerup',()=>{id=null});t.addEventListener('pointercancel',()=>{id=null})}
let relDown=false, gunDown=false, gunPid=null;
function releaseControls(){gunDown=false; relDown=false; const g=$('gun'); if(g&&gunPid!=null){try{if(g.hasPointerCapture&&g.hasPointerCapture(gunPid))g.releasePointerCapture(gunPid)}catch(e){}} gunPid=null}
let lockDown=false; window.__lockDown=v=>{lockDown=!!v};
$('lock').addEventListener('pointerup',()=>{lockDown=false});
$('lock').addEventListener('pointercancel',()=>{lockDown=false});
function armRelease(e){if(e&&e.cancelable)e.preventDefault(); if(e)e.stopPropagation(); tryRelease()}
const tapGate={};
function tapOnce(key){const n=performance.now(); if(tapGate[key]&&n-tapGate[key]<320)return false; tapGate[key]=n; return true}
function poke(el){if(!el)return; el.classList.add('hot'); setTimeout(()=>{if(el)el.classList.remove('hot')},220)}
function actFlare(){if(!tapOnce('flr'))return; poke($('flr')); fireFlares()}
function actBreak(){if(!tapOnce('brk'))return; poke($('brk')); doBreak()}
function actEcm(){if(!tapOnce('ecm'))return; poke($('ecm')); doECM()}
function actGun(e){if(!tapOnce('gun'))return; poke($('gun')); gunDown=true; gunPid=e&&e.pointerId; const g=$('gun'); if(g&&e&&e.pointerId!=null){try{g.setPointerCapture(e.pointerId)}catch(err){}} fireCannon()}
function actLock(e){if(!tapOnce('lock'))return; poke($('lock')); lockDown=true; const el=$('lock'); if(el&&e&&e.pointerId!=null){try{el.setPointerCapture(e.pointerId)}catch(err){}}
 if(!S||S.locked||canLock())return; const d=bDist(); msg(d<350?'TOO CLOSE':d>4500?'OUT OF RANGE':'LOCK — AIM THE BOX'); if(AC)blip(240,.05,.04)}
function actRel(e){if(!tapOnce('rel'))return; poke($('rel')); tryRelease()}
function bindTap(el, fn){if(!el)return; const go=e=>{if(e.cancelable)e.preventDefault(); e.stopPropagation(); fn(e)}; el.addEventListener('pointerdown', go); el.addEventListener('touchstart', go, {passive:false})}
bindTap($('flr'), actFlare); bindTap($('brk'), actBreak); bindTap($('ecm'), actEcm); bindTap($('gun'), actGun); bindTap($('lock'), actLock); bindTap($('rel'), actRel);
function combatAt(x,y){const ids=[['flr',actFlare],['brk',actBreak],['ecm',actEcm],['gun',actGun],['lock',actLock],['rel',actRel]];
 for(const [id,fn] of ids){const el=$(id); if(!el)continue; const st=getComputedStyle(el); if(st.visibility==='hidden'||st.display==='none'||st.pointerEvents==='none')continue; const r=el.getBoundingClientRect(); if(x>=r.left-8&&x<=r.right+8&&y>=r.top-8&&y<=r.bottom+8)return fn} return null}
document.addEventListener('touchstart', e=>{for(const t of e.changedTouches){const hit=document.elementFromPoint(t.clientX,t.clientY); if(hit&&hit.closest&&hit.closest('.btn'))continue; const fn=combatAt(t.clientX,t.clientY); if(fn){if(e.cancelable)e.preventDefault(); fn({pointerId:t.identifier})}}}, {capture:true, passive:false});
if($('gun')){$('gun').addEventListener('pointerup',()=>{gunDown=false;gunPid=null});$('gun').addEventListener('pointercancel',()=>{gunDown=false;gunPid=null});$('gun').addEventListener('lostpointercapture',()=>{gunDown=false;gunPid=null}); $('gun').addEventListener('touchend',()=>{gunDown=false;gunPid=null}); $('lock').addEventListener('touchend',()=>{lockDown=false})}
addEventListener('keydown',e=>{if(e.key==='l')lockDown=true;if(e.key==='f')fireFlares();if(e.key==='b')doBreak();if(e.key==='e')doECM();if(e.key===' '){e.preventDefault();armRelease(e)}if(e.key==='g'){gunDown=true;fireCannon()}});addEventListener('keyup',e=>{if(e.key==='g')gunDown=false; if(e.key==='l')lockDown=false});
// ---------- gameplay ----------
const V=new THREE.Vector3(),fwd=new THREE.Vector3(),tmp=new THREE.Vector3();
function scr(p){V.copy(p).project(cam);if(V.z>1||!isFinite(V.x)||!isFinite(V.y))return null;return{x:(V.x*.5+.5)*(W||innerWidth),y:(-V.y*.5+.5)*(Hh||innerHeight)}}
function inBox(){const s=scr(BUNK);if(!s)return 0;const bw=innerWidth*.34,bh=innerHeight*.42,cx=innerWidth/2,cy=innerHeight*.5;const dx=Math.abs(s.x-cx)/bw,dy=Math.abs(s.y-cy)/bh;return dx<1&&dy<1?1-Math.max(dx,dy):0}
const bDist=()=>S.pos.distanceTo(BUNK);
function facingBunker(){if(!S)return false; const dx=BUNK.x-S.pos.x, dz=BUNK.z-S.pos.z, fx=-Math.sin(S.yaw), fz=-Math.cos(S.yaw), d=Math.hypot(dx,dz)||1; return (dx*fx+dz*fz)/d>0.5}
function reattackTurn(){return !!(S&&S.reattack&&bunker.visible&&!facingBunker())}
function bombLive(){return !!(S&&(S.bomb||S.bombSpent||S.phase==='bombfall'||S.phase==='penetrate'||S.phase==='egress'||S.phase==='done'))}
function missileUp(){return !!(S&&S.missile&&!S.missile.decoy&&!S.missile.lost)}
// One plan for the words and the drop. The button never says RELEASE unless this same plan will drop.
function dropPlan(){
 if(!S||takingOff()||S.dead||missileUp())return {cue:'',act:''};
 if(S.phase!=='ingress'&&S.phase!=='release')return {cue:'',act:''};
 const d=bDist();
 const bunkLeft=!bombLive();
 // While the bunker bomb is still aboard, the button talks only about that bomb.
 if(bunkLeft&&(S.locked||(d>=350&&d<=4500)))return {cue:'RELEASE',act:S.locked?'guided':'free'};
 if(bunkLeft&&d<350&&d>40)return {cue:'TOO CLOSE',act:''};
 if(bunkLeft&&d>4500&&d<6500)return {cue:'OUT OF RANGE',act:''};
 let site=-1;
 if(!S.ironBomb&&S.iron>0&&typeof aimSite==='function')site=aimSite();
 if(site>=0)return {cue:'RELEASE',act:'iron',site};
 return {cue:'',act:''}}
function dropCue(){return dropPlan().cue}
function paintRelease(){const plan=dropPlan(); const el=$('rel'); if(el){const span=el.querySelector('span'); if(span&&span.textContent!==plan.cue)span.textContent=plan.cue; const hot=plan.cue==='RELEASE'; el.classList.toggle('off',!hot); el.classList.toggle('hot',hot)}
 const lk=$('lock'); if(lk&&S){const lab=S.locked?'LOCKED':((S.lockT||0)>0?'LOCKING':'LOCK'); if(lk.textContent!==lab)lk.textContent=lab; const on=!!(canLock()||S.locked); lk.classList.toggle('off',!on); lk.classList.toggle('hot',on)}}
window.__cue=dropCue; window.__paint=paintRelease;
function canLock(){return S&&S.phase==='ingress'&&!S.locked&&bDist()<=4500&&bDist()>=350&&inBox()>0}
function grantLock(){if(!S||S.locked)return; S.lockT=0; S.locked=true; S.phase='release'; blip(560,.18,.07); setTimeout(()=>blip(740,.22,.06),120); msg('LOCKED'); S.msgT=1.8}
function tryRelease(){const plan=dropPlan(); if(plan.cue==='RELEASE'){if(plan.act==='guided'||plan.act==='free'){release(); return} if(plan.act==='iron'){dropIron(plan.site); return}} msg(plan.cue||'NO RELEASE'); if(AC)blip(220,.07,.05)}
const flrWin=()=>S.samShots<=1?3200:2600;
function defeat(m,why){if(m.def)return;m.def=1;S.defeated++;msg(why)}
function doBreak(){if(!S||S.dead||S.phase==='done')return; if(S.cine){msg('BREAK'); if(AC)blip(300,.08,.05); return} if(S.brkCD>0){msg('BREAK — WAIT'); if(AC)blip(240,.06,.04); return} S.brkCD=3.5;S.brk=1.3;const m=S.missile;let dir=1;if(m){const rx=m.p.x-S.pos.x,rz=m.p.z-S.pos.z;const side=(-Math.cos(S.yaw))*rx-(-Math.sin(S.yaw))*rz;dir=side>0?1:-1}S.brkDir=dir;if(AC){thud(AC.out,.3,55,30,.5);nburst(AC.out,.12,600,.8)}
 if(m&&!m.decoy&&!m.lost){const d=m.p.distanceTo(S.pos),w=S.samShots<=1?1500:1100;if(d<w&&d>220){m.lost=true;m.over=1;defeat(m,'BREAK! MISSILE OVERSHOOT')}else msg(d>=w?'BREAK TOO EARLY — WAIT <'+(w/1000).toFixed(1)+' KM':'TOO LATE')} else msg('BREAK')}
function doECM(){if(!S||S.dead||S.phase==='done')return; if(S.ecmN<=0&&S.ecmCD<=0){msg('NO JAMS'); if(AC)blip(220,.08,.05); return} if(S.ecmCD>0){msg('JAMS — WAIT'); if(AC)blip(240,.06,.04); return} S.ecmN--;S.ecmCD=12;S.ecm=4;if(AC){for(let k=0;k<6;k++)blip(k%2?340:300,.12,.05);nburst(AC.out,.08,900,1.2)}
 const m=S.missile;if(m&&!m.decoy&&!m.lost){const d=m.p.distanceTo(S.pos);if(d>1600){m.lost=true;defeat(m,'ECM — MISSILE SEEKER JAMMED')}else msg('ECM ON — TOO CLOSE TO JAM, FLARE/BREAK')}else msg('JAMS '+S.ecmN)}
function fireFlares(){if(!S||S.dead||S.phase==='done')return; if(S.flares<=0){msg('NO FLARES'); if(AC)blip(180,.1,.06); const el=$('flr'); if(el)el.textContent='NO FLARES'; return} if(S.flareCD>0){msg('FLARE — WAIT'); if(AC)blip(260,.05,.04); return} S.flares--;S.flareCD=1;S.flareT=2.4; msg('FLARE'); const el=$('flr'); if(el)el.textContent=S.flares>0?('FLR '+S.flares):'NO FLARES';
 for(let i=0;i<8;i++){const v=new THREE.Vector3(rnd(22),-8-Math.random()*18,rnd(22)).add(fwd.clone().multiplyScalar(-42));spr(S.pos,0xffe8b0,6,3.4,v,{g:7,fog:false,add:true,tex:glowTex,must:1,grow:4});spr(S.pos,0xc8c4bc,4,5.5,v.clone().multiplyScalar(.55),{grow:14,o:.55,drag:.25,must:1,fadeIn:.08,c1:new THREE.Color(0x6a6660)});spr(S.pos,0x9a968e,3,7,v.clone().multiplyScalar(.35),{grow:18,o:.4,drag:.35,must:1,fadeIn:.15})}
 flareSfx();
 const m=S.missile;if(m&&!m.decoy){const d=m.p.distanceTo(S.pos);if(d<flrWin()){m.decoy=S.pos.clone();m.decoyV=fwd.clone().multiplyScalar(-30);m.dt=1.3;defeat(m,'MISSILE DECOYED')}else msg('FLARE EARLY — WAIT FOR <'+(flrWin()/1000).toFixed(1)+' KM')}}
function msg(t){if(S&&S.msgT>1.1&&(S.msg==='SHORT'||S.msg==='LONG'||S.msg==='MISS'||S.msg==='LOCKED'||S.msg==='GUIDED')&&t!==S.msg)return; S.msg=t;S.msgT=2}
const FLARE_OPTS=[
 {id:'current',name:'Current',desc:'Thump + hiss. Quieter single shot, no pitch shift.',key:null},
 {id:'thunder',name:'Clean Thunder',desc:'Soft rumble. Source: Thunder_VideoStar.aif (PCM).',key:'flare_thunder'},
 {id:'soft',name:'Soft Boom',desc:'Single bass boom. Source: Boomer FX 11.caf.',key:'flare_soft'},
 {id:'deep',name:'Deep Space',desc:'Short deep hit. Source: Deep Space Boomer 01.caf.',key:'flare_deep'},
 {id:'sub',name:'Deep Sub',desc:'Long sub tail. Source: Boomer FX 03.caf.',key:'flare_sub'},
 {id:'body',name:'Full Body',desc:'Bass with more body. Source: Boomer FX 14.caf.',key:'flare_body'},
];
function flareChoice(){let id=FLARE_DEFAULT; try{const saved=localStorage.ds15_flare; if(saved)id=saved}catch(e){} return FLARE_OPTS.find(o=>o.id===id)||FLARE_OPTS[0]}
// New bank. Current means "keep the sound-tester choice". Layers are the same
// object the preview and the sortie both play.
const NB_MEM={};
const NB={
 gun:[
  {id:'current',name:'Current',desc:'The gun already chosen on the sound tester.'},
  {id:'reverb',name:'Big Cannon',desc:'Short hall cannon, SSE/USC. The shot only, not a snare.',layers:[{k:'nb_gun_reverb',off:0,dur:.5,v:.7}]},
  {id:'naval',name:'Naval 6-inch',desc:'Close naval thud. Playback starts after the quiet opening.',layers:[{k:'nb_gun_naval',off:.25,dur:.65,v:.85}]},
  {id:'deep',name:'Deep Report',desc:'Bass-heavy Gold Library gun. The report near the end of the take.',layers:[{k:'nb_gun_deep',off:11.15,dur:.7,v:.8}]}
 ],
 bunker:[
  {id:'current',name:'Current',desc:'The bunker blast already chosen, including Rising Cluster.'},
  {id:'oil',name:'Oil Rise',desc:'Several booms that build, then a long low tail. Vintage field tape, not listened to here.',layers:[
    {k:'nb_b_oil',v:1.55,off:.35,d:0,attack:1.15,hold:3.6,decay:6.5},
    {k:'nb_b_cluster',v:.9,off:.08,d:1.05,attack:.7,hold:1.8,decay:3.4},
    {k:'nb_b_rumble',v:1.25,off:.15,d:1.4,attack:1.5,hold:3.4,decay:7.2}
  ]},
  {id:'atom',name:'Atomic Tail',desc:'A heavy hit, a rumble under it, then the burn. Swells, then fades.',layers:[
    {k:'nb_b_huge',v:.4,off:.17,d:0,attack:1.15,hold:1.3,decay:4.2},
    {k:'nb_b_atom',v:.36,off:.11,d:.7,attack:1.7,hold:2,decay:5},
    {k:'nb_b_burn',v:.28,off:.05,d:3.1,attack:2,hold:1.8,decay:4}
  ]},
  {id:'sn_bass',name:'Bass Drop Slow',desc:'',layers:[{k:'sn_bunker_bass_slow_drop',v:1.05,off:0,d:0,attack:.4,hold:2.2,decay:3.2}]},
  {id:'sn_multi',name:'Multi Blast Near',desc:'',layers:[{k:'sn_bunker_fireworks_multi',v:1.05,off:0,d:0,attack:.45,hold:2.6,decay:4.2}]},
  {id:'sn_thunder',name:'Thunder Crash Boom',desc:'',layers:[{k:'sn_bunker_thunder_crash',v:1.05,off:0,d:0,attack:.4,hold:2.2,decay:3.4}]},
  {id:'sn_boom011',name:'Trailer Boom 011',desc:'',layers:[{k:'sn_bunker_trailer_boom_011',v:1.1,off:0,d:0,attack:.35,hold:2.2,decay:3.4}]},
  {id:'sn_boom075',name:'Trailer Boom 075',desc:'',layers:[{k:'sn_bunker_trailer_boom_075',v:1.1,off:0,d:0,attack:.3,hold:1.8,decay:2.6}]},
  {id:'sn_boom214',name:'Trailer Boom 214',desc:'',layers:[{k:'sn_bunker_trailer_boom_214',v:1.1,off:0,d:0,attack:.35,hold:2,decay:3.2}]},
  {id:'sn_stack',name:'Sonniss Stack',desc:'',layers:[
    {k:'sn_bunker_trailer_boom_011',v:1.15,off:0,d:0,attack:.85,hold:2.2,decay:3.4},
    {k:'sn_bunker_fireworks_multi',v:1.25,off:0,d:.8,attack:.7,hold:2.4,decay:4.2},
    {k:'sn_rumble_boom_tail',v:1.05,off:0,d:1.5,attack:1.3,hold:2.6,decay:6.4}
  ]},
  {id:'sn_stack2',name:'Sonniss Stack Thunder',desc:'',layers:[
    {k:'sn_bunker_trailer_boom_214',v:1.1,off:0,d:0,attack:.8,hold:2,decay:3.2},
    {k:'sn_bunker_thunder_crash',v:1.15,off:0,d:.55,attack:.85,hold:2.2,decay:3.8},
    {k:'sn_rumble_thunder_int',v:1,off:0,d:1.7,attack:1.5,hold:3,decay:7}
  ]}
 ],
 flare:[
  {id:'current',name:'Current',desc:'The flare already chosen on the sound tester.'},
  {id:'pop',name:'Flare Gun',desc:'The report of a flare gun, then the start of the burn.',layers:[{k:'nb_fl_gun',off:.09,dur:1.15,v:.7}]},
  {id:'hiss',name:'Pressure Hiss',desc:'A short pressurized blast. Not a siren.',layers:[{k:'nb_fl_hiss',off:1.15,dur:1.5,v:.8}]}
 ],
 sam:[
  {id:'current',name:'Current',desc:'The SAM launch already chosen on the sound tester.'},
  {id:'atlas',name:'Atlas Roar',desc:'Rocket ignition and the first climb. Trimmed past the quiet head.',layers:[{k:'nb_sam_atlas',off:.3,dur:4.2,v:.42}]},
  {id:'v2',name:'V2 Fire',desc:'A different rocket fire-up. Starts where the roar is.',layers:[{k:'nb_sam_v2',off:7.6,dur:3.2,v:.5}]}
 ],
 pass:[
  {id:'current',name:'Current',desc:'The missile pass already chosen on the sound tester.'},
  {id:'shells',name:'Shells Overhead',desc:'Large shells going over. A pass, not a launch.',layers:[{k:'nb_pass_shells',off:3.4,dur:2.2,v:.6}]},
  {id:'jet',name:'Fighter Doppler',desc:'A fast jet pass. Used when a missile goes by.',layers:[{k:'nb_pass_jet',off:.33,dur:2.3,v:.62}]},
  {id:'sn_fire',name:'Fire Whoosh Growl',desc:'',layers:[{k:'sn_missile_fire_whoosh',off:0,dur:2.2,v:.7}]},
  {id:'sn_jet',name:'Jet Close Pass',desc:'',layers:[{k:'sn_missile_jet_close',off:0,dur:4.2,v:.62}]},
  {id:'sn_metal',name:'Metal Pass-By Whoosh',desc:'',layers:[{k:'sn_missile_metal_pass',off:0,dur:1.28,v:.7}]}
 ],
 boom:[
  {id:'current',name:'Current',desc:'Impacts other than the bunker stay on the sound-tester explosion.'},
  {id:'metal',name:'Metal Debris',desc:'Fighter kill and other blasts. The bunker mix is separate.',layers:[{k:'nb_boom_metal',off:3,dur:2.4,v:.85,bus:'big'}]},
  {id:'hit',name:'Violent Hit',desc:'A hotter debris blast, played quieter so it does not clip.',layers:[{k:'nb_boom_hit',off:.55,dur:1.8,v:.32,bus:'big'}]},
  {id:'sn_sweep',name:'Impact Cut Sweep',desc:'',layers:[{k:'sn_impact_cut_sweep',off:0,dur:2.2,v:.85,bus:'big'}]},
  {id:'sn_jump',name:'Jump Start Drop',desc:'',layers:[{k:'sn_impact_jump_drop',off:0,dur:3.2,v:.8,bus:'big'}]},
  {id:'sn_mthud',name:'Metal Hit Thud',desc:'',layers:[{k:'sn_impact_metal_thud',off:0,dur:3.5,v:.8,bus:'big'}]},
  {id:'sn_debris',name:'Woosh Debris',desc:'',layers:[{k:'sn_impact_woosh_debris',off:0,dur:2.05,v:.75,bus:'big'}]}
 ],
 crash:[
  {id:'current',name:'Current',desc:'The crash already chosen on the sound tester.'},
  {id:'long',name:'Breakup',desc:'A long wood-and-metal crash for the player jet.',layers:[{k:'nb_crash_long',off:0,dur:3.2,v:.62,bus:'big'}]},
  {id:'sn_fast',name:'Bass Drop Fast',desc:'',layers:[{k:'sn_crash_bass_fast',off:0,dur:2,v:.7,bus:'big'}]},
  {id:'sn_chit',name:'Boom Hit Short',desc:'',layers:[{k:'sn_crash_boom_hit',off:0,dur:2.4,v:.7,bus:'big'}]},
  {id:'sn_rattle',name:'Rattling Downer',desc:'',layers:[{k:'sn_crash_rattling',off:0,dur:4.8,v:.65,bus:'big'}]}
 ],
 aaa:[
  {id:'current',name:'Current',desc:'The valley cannon already chosen on the sound tester.'},
  {id:'fifty',name:'Fifty Cal',desc:'A short machine-gun burst for the valley AAA, not the player gun.',layers:[{k:'nb_aaa_50',off:2.05,dur:.55,v:.75}]}
 ],
 engine:[
  {id:'current',name:'Current',desc:'The engine loop already chosen on the sound tester.'},
  {id:'whine',name:'F-105 Whine',desc:'The F-105 whine, heard in long overlapping pieces rather than a short loop.',layers:[{k:'nb_eng_whine',off:.45,v:.28,loop:1}]},
  {id:'idle',name:'Jet Idle',desc:'An idling jet, looped under the sortie.',layers:[{k:'nb_eng_idle',off:0,v:.4,loop:1}]},
  {id:'sn_blast',name:'Jet Blast Off',desc:'',layers:[{k:'sn_jet_blast_off',off:0,v:.22,loop:1}]},
  {id:'sn_flyc',name:'Jet Flyby Close',desc:'',layers:[{k:'sn_jet_flyby_close',off:0,v:.2,loop:1}]},
  {id:'sn_flym',name:'Jet Flyby Mid',desc:'',layers:[{k:'sn_jet_flyby_mid',off:0,v:.2,loop:1}]}
 ],
 deck:[
  {id:'current',name:'Current',desc:'The carrier deck sounds already in the take-off.'},
  {id:'pier',name:'Pier Bed',desc:'Deck and water ambience during take-off only. Replaces the deck loops while it is selected.',layers:[{k:'nb_deck_pier',off:0,v:.24,loop:1}]}
 ],
 nearmiss:[
  {id:'current',name:'Current',desc:''},
  {id:'sn_debris',name:'Debris Whoosh',desc:'',layers:[{k:'sn_nearmiss_debris',off:0,dur:1.65,v:.55}]},
  {id:'sn_fire',name:'Fire Near-Miss Whoosh',desc:'',layers:[{k:'sn_nearmiss_fire_whoosh',off:0,dur:1.9,v:.5}]},
  {id:'sn_wind',name:'Wind Rush Whoosh',desc:'',layers:[{k:'sn_nearmiss_wind_rush',off:0,dur:1.1,v:.45}]}
 ],
 wind:[
  {id:'current',name:'Current',desc:''},
  {id:'sn_eye',name:'Eye Of The Storm',desc:'',layers:[{k:'sn_wind_eye_storm',off:0,v:.04,loop:1}]},
  {id:'sn_gust',name:'Hurricane Gust',desc:'',layers:[{k:'sn_wind_hurricane_gust',off:0,v:.04,loop:1}]},
  {id:'sn_rush',name:'Wind Rush Short',desc:'',layers:[{k:'sn_wind_rush_looplet',off:0,v:.035,loop:1}]}
 ],
 warn:[
  {id:'current',name:'Current',desc:''},
  {id:'sn_half',name:'Trailer Alarm Half',desc:'',layers:[{k:'sn_warn_alarm_half',off:0,dur:1.15,v:.4}]},
  {id:'sn_quarter',name:'Trailer Alarm Quarter',desc:'',layers:[{k:'sn_warn_alarm_quarter',off:0,dur:1.05,v:.4}]},
  {id:'sn_whole',name:'Trailer Alarm Whole',desc:'',layers:[{k:'sn_warn_alarm_whole',off:0,dur:1.2,v:.38}]}
 ],
 rumble:[
  {id:'current',name:'Current',desc:''},
  {id:'sn_bass',name:'Bass Drop Tail',desc:'',layers:[{k:'sn_rumble_bass_tail',off:0,d:1.2,v:.75,bus:'big'}]},
  {id:'sn_boom',name:'Boom Decay Tail',desc:'',layers:[{k:'sn_rumble_boom_tail',off:0,d:1.1,v:.8,bus:'big'}]},
  {id:'sn_thun',name:'Interior Thunder Rumble',desc:'',layers:[{k:'sn_rumble_thunder_int',off:0,d:1.3,v:.7,bus:'big'}]}
 ],
 flyby:[
  {id:'current',name:'Current',desc:''},
  {id:'sn_close',name:'Jet Flyby Close',desc:'',layers:[{k:'sn_jet_flyby_close',off:0,dur:4.5,v:.55}]},
  {id:'sn_mid',name:'Jet Flyby Mid',desc:'',layers:[{k:'sn_jet_flyby_mid',off:0,dur:4.2,v:.5}]}
 ]
};
const NB_DEFAULT={gun:'deep',bunker:'oil',flare:'hiss',sam:'current',pass:'shells',boom:'hit',crash:'current',aaa:'fifty',engine:'whine',deck:'pier'};
function rememberNb(cat,id){const v=id||'current'; NB_MEM[cat]=v; try{localStorage['ds17_nb_'+cat]=v}catch(e){}}
function nbChoice(cat){let id=NB_MEM[cat]; if(!id){try{id=localStorage['ds17_nb_'+cat]||''}catch(e){id=''}} if(!id)id=NB_DEFAULT[cat]||'current'; if(!NB[cat]||!NB[cat].some(o=>o.id===id))id=NB_DEFAULT[cat]||'current'; return id}
function nbSpec(cat){const id=nbChoice(cat); if(id==='current')return null; return NB[cat].find(o=>o.id===id)||null}
function nbLevel(){let v=NB_MEM.lv; if(v==null){try{v=localStorage.ds17_nb_lv}catch(e){} } v=v==null||v===''?80:+v; return Math.min(100,Math.max(0,v))/100}
function nbKeys(){const keys=[]; for(const cat of Object.keys(NB)){const spec=nbSpec(cat); if(spec)for(const l of spec.layers||[])keys.push(l.k)} return keys}
function nbHandoff(){const parts=[]; for(const cat of Object.keys(NB)){const id=nbChoice(cat); if(id!=='current')parts.push(cat+':'+id)} parts.push('lv:'+Math.round(nbLevel()*100)); return parts.join(',')}
const NB_LEGACY=['gun','bunker','flare','sam','pass','boom','crash','aaa','engine','deck'];
const NB_EXTRA=['nearmiss','wind','warn','rumble','flyby'];
const NB_CATS=NB_LEGACY.concat(NB_EXTRA);
window.__picks=()=>{const o={}; for(const c of NB_CATS)o[c]=nbChoice(c); o.lv=Math.round(nbLevel()*100); return o};
function pickCode(){let s=''; for(const c of NB_LEGACY){const i=NB[c].findIndex(o=>o.id===nbChoice(c)); s+=(i<0?0:i).toString(36)} s+=String(Math.round(nbLevel()*100)).padStart(3,'0'); for(const c of NB_EXTRA){const i=NB[c].findIndex(o=>o.id===nbChoice(c)); s+=(i<0?0:i).toString(36)} const ds=sndHandoff(); return ds?s+'-'+ds:s}
function applyPickCode(code){if(!code)return false; const dash=code.indexOf('-'); const head=dash<0?code:code.slice(0,dash); if(head.length<13)return false; NB_LEGACY.forEach((c,i)=>{const idx=parseInt(head[i],36); const opt=NB[c]&&NB[c][idx]; if(opt)rememberNb(c,opt.id)}); const lv=String(Math.min(100,Math.max(0,+head.slice(10,13)||80))); NB_MEM.lv=lv; try{localStorage.ds17_nb_lv=lv}catch(e){} const extra=head.slice(13); NB_EXTRA.forEach((c,i)=>{if(i>=extra.length)return; const idx=parseInt(extra[i],36); const opt=NB[c]&&NB[c][idx]; if(opt)rememberNb(c,opt.id)}); if(dash>=0&&code.length>dash+1)applyDsString(code.slice(dash+1)); return true}
function writePickStores(code){if(!code)return; try{localStorage.ds17_pick=code}catch(e){} try{document.cookie='ds17p='+encodeURIComponent(code)+'; Max-Age=31536000; Path=/; SameSite=Lax'}catch(e){}}
function readPickCookie(){try{const m=document.cookie.match(/(?:^|; )ds17p=([^;]*)/); return m?decodeURIComponent(m[1]):''}catch(e){return ''}}
function applyDsString(raw){if(!raw)return; for(const part of raw.split(',')){const i=part.indexOf(':'); if(i<1)continue; const k=decodeURIComponent(part.slice(0,i)), v=decodeURIComponent(part.slice(i+1)); if(!v)continue; if(k==='flare'){ if(FLARE_OPTS.some(o=>o.id===v)){try{localStorage.ds15_flare=v}catch(e){}} } else if(k==='mood'){ let allow=''; try{allow=localStorage.ds17g_mood||''}catch(e){} const use=(v==='off'||(allow&&allow===v))?v:'off'; try{localStorage.ds16_mood=use; if(!allow)localStorage.ds17g_mood=use}catch(e){} } else if(k==='intro'||k==='ending'){ if(MUSIC_PRE[k].some(x=>x[0]===v)){try{localStorage['ds16_'+k]=v}catch(e){}} } else if(k==='surr'){ SURR.on=v!=='0'; try{localStorage.ds16_surr=SURR.on?'1':'0'}catch(e){} } else if(k==='width'){ SURR.width=Math.min(2,Math.max(0,+v||0)); try{localStorage.ds16_width=SURR.width}catch(e){} } else if(k==='lv_intro'||k==='lv_ending'||k==='lv_mood'){ try{localStorage['ds16_'+k]=Math.min(100,Math.max(0,+v||0))}catch(e){} } else { const s=sndSec(k); if(s&&sndList(s).some(c=>c.id===v))rememberSnd(k,v) } }}
function bankDest(P,bus){const dest=bus==='big'?(AC.bigB||AC.out):AC.out; if(!P)return dest; const pn=mkPan(true,bus==='big'?280:160); setP0(pn,P); pn.connect(dest); setTimeout(()=>{if(pn._hrtf){hrtfN=Math.max(0,hrtfN-1);pn._hrtf=0} try{pn.disconnect()}catch(e){}},9000); return pn}
function spawnNb(layer,dest,lv,cat,id){const buf=SB[layer.k]; if(!buf||!AC)return; const s=AC.createBufferSource(); s.buffer=buf; const off=Math.min(layer.off||0, Math.max(0,buf.duration-.05)); const dur=layer.dur?Math.min(layer.dur, Math.max(.05,buf.duration-off)):undefined; if(layer.loop){s.loop=true; if(off>0){s.loopStart=off; s.loopEnd=Math.max(off+.25, buf.duration-.03)}} const g=AC.createGain(); const t=AC.currentTime+(layer.d||0); const peak=Math.max(.0008,(layer.v||.5)*lv); g.gain.setValueAtTime(.0008,t); g.gain.exponentialRampToValueAtTime(peak,t+Math.max(.01,layer.fade||.02)); if(!layer.loop&&dur){const end=t+dur; g.gain.setValueAtTime(peak,Math.max(t+.04,end-.1)); g.gain.exponentialRampToValueAtTime(.0008,end)} s.connect(g).connect(dest); try{s.start(t,off,layer.loop?undefined:dur)}catch(e){try{s.start(t,off)}catch(e2){}} if(!layer.loop&&dur){try{s.stop(t+dur+.03)}catch(e){}} if(DS_MODE!=='game')sndPrev.push({stop(tt){try{g.gain.cancelScheduledValues(AC.currentTime); g.gain.setTargetAtTime(0,AC.currentTime,.05); s.stop((tt||AC.currentTime)+.12)}catch(e){}}}); sfxLog('nb',{cat,id,k:layer.k,off:+off.toFixed(2),dur:dur||0,v:+peak.toFixed(3)})}
function playBank(cat,P){const spec=nbSpec(cat); if(!spec)return false; const lv=nbLevel()/0.8; if(spec.layers.some(l=>l.attack)){const layers=spec.layers.map(l=>Object.assign({},l,{v:Math.max(.0008,(l.v||.4)*lv)})); playBunker({id:'nb_'+cat+'_'+spec.id,layers},P||(S&&S.pos)); sfxLog('nb',{cat,id:spec.id,mix:1}); return true} const bus=(spec.layers[0]&&spec.layers[0].bus)||''; const dest=bankDest(P,bus); let pending=false; for(const layer of spec.layers){if(!SB[layer.k]){SB.get(layer.k); pending=true; continue} spawnNb(layer,dest,lv,cat,spec.id)} if(pending)sfxLog('nbWait',{cat,id:spec.id}); return true}
function holdCustom(sec,P){if(playBank(sec,P))return true; return useSnd(sec,P)}
// Safari and an iPhone Home Screen icon do not share localStorage. sounds.html
// can hand the ticks over by opening index.html?ds=flare:thunder,boom:rl1
function applySndFromUrl(){
  let raw='', nb='', pic=''; try{const q=new URLSearchParams(location.search); raw=q.get('ds')||''; nb=q.get('nb')||''; pic=q.get('p')||''}catch(e){return}
  if(pic){applyPickCode(pic); writePickStores(pic)}
  else if(!raw&&!nb){let saved=''; try{saved=localStorage.ds17_pick||''}catch(e){} if(!saved)saved=readPickCookie(); if(saved){applyPickCode(saved); writePickStores(saved)}}
  if(nb){for(const part of nb.split(',')){const i=part.indexOf(':'); if(i<1)continue; const k=decodeURIComponent(part.slice(0,i)), v=decodeURIComponent(part.slice(i+1)); if(k==='lv'){NB_MEM.lv=v; try{localStorage.ds17_nb_lv=v}catch(e){}} else if(NB[k]&&NB[k].some(o=>o.id===v))rememberNb(k,v)}}
  if(raw)applyDsString(raw);
  if((raw||nb)&&!pic)writePickStores(pickCode());
  try{const u=new URL(location.href); let changed=false; if(u.searchParams.has('ds')){u.searchParams.delete('ds'); changed=true} if(u.searchParams.has('nb')){u.searchParams.delete('nb'); changed=true} if(changed)history.replaceState(null,'',u.pathname+u.search+u.hash)}catch(e){}
  paintPickCode();
}
function gameQuery(){const parts=['p='+encodeURIComponent(pickCode())]; try{const n=localStorage.ds16_night; if(n&&n!=='current')parts.push('night='+encodeURIComponent(n)); if(localStorage.ds16_nv==='1')parts.push('nv=1')}catch(e){} return '?'+parts.join('&')}
function paintPickCode(){const el=$('pickshow'); if(!el)return; let code=''; try{code=localStorage.ds17_pick||''}catch(e){} if(!code)code=readPickCookie(); if(!code)code=pickCode(); el.value=code}
function bindPickBox(){const go=$('pickgo'); if(!go||go._b)return; go._b=1; go.addEventListener('click',e=>{e.preventDefault(); const code=(($('pickin')&&$('pickin').value)||'').trim(); if(!applyPickCode(code)){const el=$('pickshow'); if(el){el.value=''; el.placeholder='That code did not apply'} return} writePickStores(pickCode()); paintPickCode(); paintSndLive()})}
const SND_SHORT={gun:'Gun',engine:'Engine',aaa:'Cannon',sam:'SAM',pass:'Pass',boom:'Explosion',bombrelease:'Release',nuke:'Nuke',bunker:'Bunker',radar:'Radar',crash:'Crash',overhead:'Overhead',ambience:'Ambience',bed:'Bed'};
function sndSummary(){
  const bits=[];
  const fl=flareChoice(); if(fl.id!=='current')bits.push('Flare '+(fl.name||fl.id));
  for(const s of SND){ const c=sndChoice(s.id); if(!c||c.id==='current')continue; bits.push((SND_SHORT[s.id]||s.id)+' '+(c.name||c.id)); }
  for(const cat of Object.keys(NB)){const spec=nbSpec(cat); if(spec)bits.push(cat+' '+spec.name)}
  return bits.length?('Sounds: '+bits.join(' · ')):'Sounds: all Current';
}
function paintSndLive(){const el=$('sndlive'); if(el)el.textContent=sndSummary()}
applySndFromUrl(); paintSndLive(); bindPickBox();
function sndHandoff(){
  const parts=[];
  const fl=flareChoice().id; if(fl&&fl!=='current')parts.push('flare:'+fl);
  for(const s of SND){ const id=sndChoice(s.id).id; if(id&&id!=='current')parts.push(s.id+':'+id); }
  for(const cat of ['intro','ending','mood']) parts.push(cat+':'+musicChoice(cat));
  parts.push('surr:'+(SURR.on?1:0)); parts.push('width:'+SURR.width);
  for(const cat of ['intro','ending','mood']) parts.push('lv_'+cat+':'+Math.round(musicLevel(cat)*100));
  return parts.join(',');
}
let flareLive=[];
function stopFlareVoices(){const live=flareLive; flareLive=[]; for(const group of live){for(const s of group){try{s&&s.stop&&s.stop()}catch(e){}}}}
function startFlare(opt){if(!AC)return; const choice=opt||flareChoice();
 if(choice.key&&!SB[choice.key]){if(choice._ld)return; choice._ld=1; SB.get(choice.key).then(b=>{choice._ld=0; if(b)startFlare(choice)}); return}
 if(!choice.key&&!SB.flare_thump){if(choice._ld)return; choice._ld=1; Promise.all(['flare_thump','flare_hiss'].map(k=>SB.get(k).catch(()=>null))).then(()=>{choice._ld=0; if(SB.flare_thump||SB.flare_hiss)startFlare(choice)}); return}
 while(flareLive.length>=2){const old=flareLive.shift(); for(const s of old){try{s&&s.stop&&s.stop()}catch(e){}}}
 const lvl=0.32*(0.92+Math.random()*0.08);
 const P=tmp.copy(S.pos).addScaledVector(fwd,-18); const pn=mkPan(true,90); setP0(pn,P); pn.connect(AC.out);
 const nodes=[];
 const add=(buf,vol,tag)=>{if(!buf)return; const s=src(buf,vol,pn,{pri:1,rate:1,fadeIn:.012,tag}); if(s&&s.stop)nodes.push(s)};
 if(!choice.key){ if(SB.flare_thump)add(SB.flare_thump,lvl,'flare:current'); else thud(pn,lvl*.8,48,22,.55); if(SB.flare_hiss)add(SB.flare_hiss,lvl*.45,'flare:current-hiss') }
 else add(SB[choice.key],lvl,'flare:'+choice.id);
 flareLive.push(nodes); sfxLog('flareSfx',{id:choice.id,lvl:+lvl.toFixed(3),rate:1});
 const dur=((choice.key&&SB[choice.key]&&SB[choice.key].duration)||2.4)+.35;
 setTimeout(()=>{try{pn.disconnect()}catch(e){} const i=flareLive.indexOf(nodes); if(i>=0)flareLive.splice(i,1)}, dur*1000)}
function flareSfx(){if(playBank('flare',S.pos))return; startFlare(flareChoice())}
function launchSAM(i){if(S.missile||S.samShots>=7||S.cine||S.safe||S.calm||S.gridSafe||(S.bandit&&!S.bandit.dead))return;if(i==null){let bd=1e9;SITES.forEach((st,k)=>{const d=st.p.distanceTo(S.pos);if(d<bd){bd=d;i=k}});if(bd>9000)return}
 const P=SITES[i].p;S.samShots++;S.missile={p:P.clone().add(new THREE.Vector3(0,8,0)),v:new THREE.Vector3(0,90,0),life:20,decoy:null,site:i,blind:0,lost:false};msl.visible=true;mslAudioStart(S.missile);if(S.samShots===1&&!localStorage.ds14_def){localStorage.ds14_def=1;S.teachT=5}const sal=S.sites[i].shots>1;msg((sal?'SECOND LAUNCH — ':'LAUNCH LAUNCH — ')+SITES[i].n);S.lastLaunch=S.t;samRoar(P.distanceTo(S.pos));rwrLaunch(P,sal);
 for(let k=0;k<(MOB?16:28);k++){const a=Math.random()*6.283,sp=20+Math.random()*45;spr(tmp.copy(P).setY(P.y+3),k%3?0xcfc8bc:0xe8e2d8,14,6+Math.random()*5,new THREE.Vector3(Math.cos(a)*sp,4+Math.random()*12,Math.sin(a)*sp),{grow:16,o:.75,drag:.5,fadeIn:.15,must:1})}
 spr(tmp.copy(P).setY(P.y+6),0xffd8a0,70,.5,null,{add:true,tex:glowTex,fog:false,grow:60,must:1});for(let k=0;k<6;k++)spr(P,0xffa050,10,.6,new THREE.Vector3(rnd(30),20+Math.random()*30,rnd(30)),{add:true,fog:false,must:1})}
function samRoar(d){if(!AC)return; if(holdCustom('sam',S.missile?S.missile.p:S.pos))return; sfxLog('samRoar',{d:+d.toFixed(0)});const t=AC.currentTime,v=.45*clamp(1-d/9000,0.08,1),n=AC.createBufferSource();n.buffer=noiseBuf(4);const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(280,t);lp.frequency.exponentialRampToValueAtTime(120,t+3.5);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.25);g.gain.setTargetAtTime(v*.5,t+.5,.7);g.gain.setTargetAtTime(0,t+2,.9);n.connect(lp).connect(g).connect(AC.out);n.start(t);n.stop(t+4);if(SB.sub08)src(SB.sub08,.35*clamp(1-d/9000,.2,1),AC.out,{fadeIn:.008,tag:'heavy:sub08'});if(S.missile){psrc('mlaunch',.85,S.missile.p,true,{ref:400,pri:1,fadeIn:.008,tag:'mlaunch'});psrc('msub',.65,S.missile.p,true,{ref:500,pri:1,fadeIn:.008,tag:'msub'})}else heavy('msub',.5*clamp(1-d/9000,.25,1),1,true)}
function rwrLaunch(P,sal){if(!AC)return; if(useSnd('radar',P))return; sfxLog('rwrLaunch',{});const t=AC.currentTime;for(let k=0;k<8;k++){const o=AC.createOscillator(),g=AC.createGain();o.type='sine';o.frequency.value=k%2?520:400;g.gain.setValueAtTime(0,t+k*.09);g.gain.linearRampToValueAtTime(.028,t+k*.09+.03);g.gain.linearRampToValueAtTime(0,t+k*.09+.1);o.connect(g).connect(AC.tone);o.start(t+k*.09);o.stop(t+k*.09+.12)}
 try{if(false){const rx=P.x-S.pos.x,rz=P.z-S.pos.z;let a=Math.atan2(-rx,-rz)-S.yaw;let c=Math.round(((-a/(Math.PI*2))*12%12+12)%12)||12;const u=new SpeechSynthesisUtterance((sal?'Second missile, ':'Missile launch, ')+c+' o clock');u.rate=1.2;u.pitch=.75;u.volume=Math.min(1,VOL.fx+.2);speechSynthesis.cancel();speechSynthesis.speak(u)}}catch(e){}}
function lockTone(){if(!AC)return; if(playBank('warn',S&&S.pos)){sfxLog('lockTone',{bank:1}); return} sfxLog('lockTone',{});const t=AC.currentTime;for(let k=0;k<4;k++){const o=AC.createOscillator(),g=AC.createGain();o.type='sine';o.frequency.value=k%2?680:540;g.gain.setValueAtTime(0,t+k*.16);g.gain.linearRampToValueAtTime(.045,t+k*.16+.02);g.gain.linearRampToValueAtTime(0,t+k*.16+.12);o.connect(g).connect(AC.tone);o.start(t+k*.16);o.stop(t+k*.16+.14)}}
function updSites(dt){let anyTrk=false,anySrch=false;if(S.cine||S.safe||S.calm||S.gridSafe||S.phase==='done'){return {anyTrk,anySrch}}
 SITES.forEach((st,i)=>{const s=S.sites[i],d=st.p.distanceTo(S.pos);
  if(s.dead){s.st='off';s.trk=0;s.warned=0;return}
  if(d>7500){if(s.st!=='off'&&s.trk>0)s.trk=0;s.st='off';s.warned=0;s.warnT=0;return}
  if(s.st==='off'){s.st='search'; if(!(S.msg||'').includes('LOCK BROKEN'))msg(st.n+' SEARCH RADAR ACTIVE')}
  const vis=d<6000&&los(tmp.copy(st.p).setY(st.p.y+12),S.pos);const was=s.trk>.25;
  s.trk=vis&&!(S.ecm>0)?s.trk+dt:Math.max(0,s.trk-dt*1.5);s.st=s.trk>.25?'track':'search';if(was&&s.trk<=.25)msg(st.n+' LOCK BROKEN');
  if(s.st==='track')anyTrk=true;else anySrch=true;
  const canShot=s.shots<(i>0?2:1)&&!S.missile&&S.phase!=='bombfall';
  if(canShot&&s.trk>1.5&&!s.warned){s.warned=1;s.warnT=0;msg(st.n+' LOCK ON');lockTone()}
  if(s.warned&&s.st==='track')s.warnT+=dt;
  if(s.trk<.3){s.warned=0;s.warnT=0}
  if(s.warned&&s.warnT>=1.75&&s.trk>1.2&&canShot&&S.t>(s.next||0)&&!reattackTurn()){s.shots++;s.warned=0;s.warnT=0;launchSAM(i)}});
 return {anyTrk,anySrch}}
const GUN_RANGE=2600, MSL_HIT=36, SITE_HIT=50, BOMB_R=78;
function nose(){fwd.set(-Math.sin(S.yaw)*Math.cos(S.pitch),Math.sin(S.pitch),-Math.cos(S.yaw)*Math.cos(S.pitch));return fwd}
function segNear(ax,ay,az,bx,by,bz,px,py,pz){const abx=bx-ax,aby=by-ay,abz=bz-az,apx=px-ax,apy=py-ay,apz=pz-az,L=abx*abx+aby*aby+abz*abz||1e-6;let t=(apx*abx+apy*aby+apz*abz)/L;if(t<0)t=0;else if(t>1)t=1;return Math.hypot(apx-abx*t,apy-aby*t,apz-abz*t)}
function gunSnd(){if(!AC||S.gunSnd>0)return;S.gunSnd=.28;if(playBank('gun',S.pos))return;if(useSnd('gun',S.pos))return;if(useSnd('aaa',S.pos))return;if(SB.aaaw)src(SB.aaaw,.32,AC.out,{pri:1,fadeIn:.005,tag:'gun'});else thud(AC.out,.22,46,24,.18)}
function fireCannon(){if(!S||S.dead||S.cine||takingOff()||S.phase==='done'||S.phase==='bombfall'||S.phase==='penetrate'||S.gunCD>0)return;S.gunCD=.11;nose();
 const p=S.pos.clone().addScaledVector(fwd,14),v=fwd.clone().multiplyScalar(1800);let m=tracers.find(t=>!t.visible)||tracers[0];m.visible=true;m.position.copy(p);
 rounds.push({p,v,life:GUN_RANGE/1800,m,px:p.x,py:p.y,pz:p.z});if(rounds.length>14){const old=rounds.shift();if(old.m&&old.m!==m)old.m.visible=false}gunSnd()}
function splashMissile(m){if(!m||S.missile!==m)return;const P=m.p.clone();fire(P,.55);spr(P,0xfff0d0,86,.4,null,{add:true,tex:glowTex,fog:false,grow:100,must:1});
 for(let k=0;k<12;k++)spr(P,0xffc080,4,1.1,new THREE.Vector3(rnd(90),rnd(90),rnd(90)),{add:true,tex:glowTex,g:12,fog:false,must:1});
 boomSfx(false);mslAudioStop(m);if(m.site!=null&&S.sites[m.site])S.sites[m.site].next=S.t+3.5;S.missile=null;msl.visible=false;mslG.visible=false;
 if(AC&&warnG)warnG.gain.setTargetAtTime(0,AC.currentTime,.02);S.defeated++;msg('MISSILE DESTROYED')}
function killSite(i){const s=S.sites[i];if(!s||s.dead)return;s.dead=1;s.st='off';s.trk=0;s.warned=0;s.warnT=0;if(SITE_G[i])SITE_G[i].visible=false;
 const P=SITES[i].p;fire(P,.65);spr(new THREE.Vector3(P.x,P.y+8,P.z),0xffe0b0,76,.45,null,{add:true,tex:glowTex,fog:false,grow:90,must:1});boomSfx(false,P);S.defeated++;msg(SITES[i].n+' DESTROYED')}
function updRounds(rdt){for(let i=rounds.length-1;i>=0;i--){const r=rounds[i];r.px=r.p.x;r.py=r.p.y;r.pz=r.p.z;r.p.addScaledVector(r.v,rdt);r.life-=rdt;if(r.m){r.m.visible=true;r.m.position.copy(r.p)}
  let hit=false;const m=S.missile;if(m&&segNear(r.px,r.py,r.pz,r.p.x,r.p.y,r.p.z,m.p.x,m.p.y,m.p.z)<MSL_HIT){splashMissile(m);hit=true}
  if(!hit){for(let k=0;k<SITES.length;k++){if(S.sites[k].dead)continue;const P=SITES[k].p;if(segNear(r.px,r.py,r.pz,r.p.x,r.p.y,r.p.z,P.x,P.y+5,P.z)<SITE_HIT){killSite(k);hit=true;break}}}
  if(!hit&&S.bandit&&!S.bandit.dead&&!(S.bandit.flare>0)&&segNear(r.px,r.py,r.pz,r.p.x,r.p.y,r.p.z,S.bandit.p.x,S.bandit.p.y,S.bandit.p.z)<40){hitBandit();hit=true}
  if(hit||r.life<=0||r.p.y<H(r.p.x,r.p.z)){if(r.m)r.m.visible=false;rounds.splice(i,1)}}}
function siteInBox(p){const s=scr(p);if(!s)return 0;const bw=innerWidth*.16,bh=innerHeight*.2,cx=innerWidth/2,cy=innerHeight*.5;const dx=Math.abs(s.x-cx)/bw,dy=Math.abs(s.y-cy)/bh;return dx<1&&dy<1?1-Math.max(dx,dy):0}
function aimSite(){if(!S||S.iron<=0||S.phase!=='ingress'||S.cine||S.ironBomb)return -1;let best=-1,sc=0;for(let i=0;i<SITES.length;i++){if(S.sites[i].dead)continue;const d=S.pos.distanceTo(SITES[i].p);if(d<700||d>4200)continue;const q=siteInBox(SITES[i].p);if(q>sc){sc=q;best=i}}return best}
function dropIron(i){if(i<0||!S||S.iron<=0||S.ironBomb||S.sites[i].dead)return;S.iron--;S.ironHold=0;const spd=Math.max(40,S.spd||(85+(S.thr||0)*195));S.ironBomb={p:S.pos.clone().add(new THREE.Vector3(0,-2,0)),v:new THREE.Vector3(-Math.sin(S.yaw)*Math.cos(S.pitch),Math.sin(S.pitch),-Math.cos(S.yaw)*Math.cos(S.pitch)).multiplyScalar(spd),i,age:0};ironMesh.visible=true;if(AC)thud(AC.out,.35,52,28,.4);msg('BOMB AWAY — '+SITES[i].n)}
function updIron(rdt){const b=S.ironBomb;if(!b)return;b.age=(b.age||0)+rdt;const prev=b.p.clone();bombAccel(b.v,rdt);_bombNext.copy(b.p).addScaledVector(b.v,rdt);const hit=bombCast(prev,_bombNext);if(hit)b.p.copy(hit.p);else b.p.copy(_bombNext);ironMesh.position.copy(b.p);ironMesh.lookAt(b.p.clone().add(b.v));
 if(hit||b.age>16){const p=b.p.clone();ironMesh.visible=false;S.ironBomb=null;groundBurst(p);if(!S.sites[b.i].dead&&p.distanceTo(SITES[b.i].p)<BOMB_R)killSite(b.i);else msg('BOMB MISS')}}
function lockSite(){let best=-1,t=-1;for(let i=0;i<SITES.length;i++){const s=S.sites[i];if(s.warned&&!s.dead&&s.warnT>=t){t=s.warnT;best=i}}return best}
let endTimer=0;
let banditMesh=null;
const _bd=new THREE.Vector3(), _bf=new THREE.Vector3(), _lead=new THREE.Vector3();
function radio(line){msg(line); sfxLog('radio',{line}); if(AC){const t=AC.currentTime,n=AC.createBufferSource(); n.buffer=noiseBuf(.1); const f=AC.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1500; f.Q.value=1.2; const g=AC.createGain(); g.gain.setValueAtTime(.0008,t); g.gain.exponentialRampToValueAtTime(.035,t+.012); g.gain.exponentialRampToValueAtTime(.0008,t+.08); n.connect(f).connect(g).connect(AC.tone||AC.out); try{n.start(t); n.stop(t+.09)}catch(e){}} try{ if(window.speechSynthesis){const u=new SpeechSynthesisUtterance(line); u.rate=1.02; u.pitch=.8; u.volume=.85; speechSynthesis.cancel(); speechSynthesis.speak(u)} }catch(e){}}
function ensureBanditMesh(){if(banditMesh)return banditMesh; const g=new THREE.Group(); g.name='bandit'; g.visible=false; g.scale.setScalar(2.4); const holdMat=new THREE.MeshStandardMaterial({color:0xb7c0c8,metalness:.35,roughness:.5}); const hold=new THREE.Group(); hold.name='hold'; const hb=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.3,16),holdMat); const hw=new THREE.Mesh(new THREE.BoxGeometry(14,.25,3.2),holdMat); hw.position.set(0,.2,-1); hold.add(hb,hw); g.add(hold); scene.add(g); banditMesh=g;
 import('./vendor/jsm/loaders/GLTFLoader.js').then(({GLTFLoader})=>{ const loader=new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load('models/deck/f15.glb', gl=>{ const hold=g.getObjectByName('hold'); if(hold)hold.visible=false; const m=gl.scene; m.rotation.y=Math.PI; m.traverse(o=>{ if(!o.isMesh)return; const n=o.name||''; if(/Landing_Gear|Tires/i.test(n)){o.visible=false; return} o.castShadow=true; o.receiveShadow=true; const mats=[].concat(o.material||[]); mats.forEach(mt=>{ if(mt&&mt.isMeshStandardMaterial){mt.envMapIntensity=Math.max(mt.envMapIntensity||1,1.35); mt.roughness=Math.min(mt.roughness??.45,.48); mt.emissive=mt.emissive||new THREE.Color(); mt.emissive.setHex(0x2a3138); mt.emissiveIntensity=.45} }); }); g.add(m);
   const glowMat=c=>new THREE.SpriteMaterial({map:glowTex,color:c,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
   const abL=new THREE.Sprite(glowMat(0xff6a1a)); abL.position.set(1.15,1.95,-9.3); abL.scale.set(3.2,1.4,1); const abR=new THREE.Sprite(glowMat(0xff6a1a)); abR.position.set(-1.15,1.95,-9.3); abR.scale.set(3.2,1.4,1); m.add(abL,abR);
   const hot=new THREE.PointLight(0xff6a22,6,36,2); hot.position.set(0,1.9,-10.4); m.add(hot);
   const shimMat=()=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{t:{value:0}},vertexShader:'varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform float t;varying vec2 u;void main(){vec2 p=u-.5;float r=length(p);float n=sin(p.x*28.+t*16.)*sin(p.y*24.-t*12.);float a=smoothstep(.5,.04,r)*(.07+.05*n);gl_FragColor=vec4(1.,.5,.2,a);}'});
   const s1=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),shimMat()); s1.position.set(1.15,1.95,-10.6); const s2=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),shimMat()); s2.position.set(-1.15,1.95,-10.6); m.add(s1,s2);
   g.userData.model=m; g.userData.ab=[abL,abR]; g.userData.hot=hot; g.userData.shim=[s1,s2]; g.userData.real=1;
  }, undefined, e=>console.warn('bandit',e));
 }); return g}
function spawnBandit(){ensureBanditMesh(); nose();
 const p=S.pos.clone().addScaledVector(fwd,1700); p.y=Math.max(groundY(p.x,p.z)+90, S.pos.y+20);
 const dx=S.pos.x-p.x, dz=S.pos.z-p.z;
 S.bandit={p,yaw:Math.atan2(-dx,-dz),pitch:0,roll:0,hp:10,state:'merge',timer:8,warnYaw:S.yaw,spoiled:0,dead:0,weave:0,spd:Math.max(220,(S.spd||200)+30),flare:0,flareCD:2,aimT:0,passes:0,msl:null,breakSide:'LEFT',trailT:0};
 banditMesh.visible=true; radio('Bandit, twelve o\'clock'); msg('BANDIT, TWELVE O\'CLOCK')}
function banditSpoiled(b){const dy=Math.abs(Math.atan2(Math.sin(S.yaw-b.warnYaw),Math.cos(S.yaw-b.warnYaw))); return S.brk>0||(S.flareT||0)>0||dy>.7}
function hitBandit(){const b=S.bandit; if(!b||b.dead)return; b.hp--; spr(b.p,0xffe2a8,14,.28,null,{add:true,tex:glowTex,fog:false,must:1});
 if(b.hp<=0){b.dead=1; b.timer=0; b.msl=null; fire(b.p,1.35); boomSfx(false,b.p); for(let i=0;i<10;i++){const m=new THREE.Mesh(debG,debM); const sz=.5+Math.random()*1.6; m.scale.setScalar(sz); m.position.copy(b.p); scene.add(m); debris.push({m,v:new THREE.Vector3(rnd(40),20+Math.random()*50,rnd(40)),r:new THREE.Vector3(Math.random()*4,Math.random()*4,0)})} radio('Splash one')}
 else msg('BANDIT HIT  '+b.hp)}
function threatBehind(p){if(!p||!S)return false; nose(); const dx=p.x-S.pos.x, dz=p.z-S.pos.z; return dx*fwd.x+dz*fwd.z<-30}
function warnSix(kind){if(!S||S.dead)return; const now=S.t||0; if(S._sixAt!=null&&now-S._sixAt<1.4&&S._sixKind===kind)return; S._sixAt=now; S._sixKind=kind; S.six=kind; msg('SIX O\'CLOCK — '+kind); lockTone()}
function updBandit(rdt){if(!S||S.dead||takingOff()||S.calm||S.gridSafe)return; if(!S.bandit){const ready=!S.cine&&!S.safe; const after=S.phase==='egress'&&S.boomT>8&&ready; const timed=S.t>75&&ready&&(S.phase==='ingress'||S.phase==='egress')&&!reattackTurn(); if(after||timed)spawnBandit(); return} const b=S.bandit;
 if(b.dead){b.timer+=rdt; b.pitch=Math.max(-1.15,(b.pitch||0)-rdt*.45); b.roll+=(b.roll>0?1:-1)*rdt*.35;
  _bf.set(-Math.sin(b.yaw)*Math.cos(b.pitch),Math.sin(b.pitch),-Math.cos(b.yaw)*Math.cos(b.pitch)); b.p.addScaledVector(_bf,70*rdt); b.p.y-=(30+b.timer*40)*rdt;
  const floor=H(b.p.x,b.p.z)+4; if(b.p.y<floor){b.p.y=floor; if(!b.impact){b.impact=1; fire(b.p,1.5); boomSfx(false,b.p)}}
  if(Math.random()<.65)spr(b.p,0x2a2622,6,2.4,new THREE.Vector3(rnd(6),8,rnd(6)),{grow:14,o:.8,must:1}); if(Math.random()<.45)spr(b.p,0xff6a20,3.2,.3,null,{add:true,tex:glowTex,fog:false});
  if(banditMesh){banditMesh.visible=b.timer<9; banditMesh.position.copy(b.p); banditMesh.lookAt(_bd.copy(b.p).add(_bf)); banditMesh.rotateZ(b.roll)} return}
 nose(); const side=new THREE.Vector3(fwd.z,0,-fwd.x); if(side.lengthSq()<1e-4)side.set(1,0,0); side.normalize();
 b.weave=(b.weave||0)+rdt; b.flare=Math.max(0,(b.flare||0)-rdt); b.flareCD=Math.max(0,(b.flareCD||0)-rdt);
 const rel0=_bd.copy(b.p).sub(S.pos); const dist0=rel0.length()||1; const aimDot=(fwd.x*rel0.x+fwd.y*rel0.y+fwd.z*rel0.z)/dist0;
 if(aimDot>.975&&dist0<850)b.aimT=(b.aimT||0)+rdt; else b.aimT=Math.max(0,(b.aimT||0)-rdt);
 if(b.aimT>.55&&b.flareCD<=0){b.flare=.8; b.flareCD=6; b.aimT=0; msg('BANDIT FLARES'); for(let i=0;i<6;i++)spr(b.p.clone().addScaledVector(_bf.set(-Math.sin(b.yaw),0,-Math.cos(b.yaw)),-8),0xffe6b0,4,2.2,new THREE.Vector3(rnd(18),-4,rnd(18)),{add:true,tex:glowTex,fog:false,grow:10,must:1})}
 let aim, spd=Math.max(230,(S.spd||200)+24), turn=1.8;
 if(b.state==='merge'){aim=S.pos.clone(); aim.y=S.pos.y+8; spd=Math.max(240,(S.spd||200)+36)}
 else if(b.state==='extend'){aim=S.pos.clone().addScaledVector(fwd,900); aim.y=Math.max(H(aim.x,aim.z)+80,S.pos.y+24); spd=Math.max(220,(S.spd||200)+10)}
 else if(b.state==='slash'){aim=S.pos.clone().addScaledVector(fwd,420); aim.y=Math.max(H(aim.x,aim.z)+70,S.pos.y+16); spd=Math.max(230,(S.spd||200)+20)}
 else {aim=S.pos.clone().addScaledVector(fwd,700); aim.y=S.pos.y+12; spd=Math.max(240,(S.spd||200)+30)}
 const to=_bd.copy(aim).sub(b.p), distAim=to.length()||1; const want=Math.atan2(-to.x,-to.z); let dyaw=Math.atan2(Math.sin(want-b.yaw),Math.cos(want-b.yaw));
 b.yaw+=clamp(dyaw,-turn*rdt,turn*rdt); const wantP=clamp(to.y/distAim,-.45,.55); b.pitch+=(wantP-b.pitch)*clamp(rdt*1.8,0,1); b.roll=clamp(-dyaw*1.3,-.9,.9); b.spd=spd;
 _bf.set(-Math.sin(b.yaw)*Math.cos(b.pitch),Math.sin(b.pitch),-Math.cos(b.yaw)*Math.cos(b.pitch));
 b.p.addScaledVector(_bf,spd*rdt); const floor=H(b.p.x,b.p.z)+48; if(b.p.y<floor)b.p.y=floor; if(b.p.y>S.pos.y+420)b.p.y=S.pos.y+420;
 b.timer-=rdt; const rel=_bd.copy(b.p).sub(S.pos); const ahead=fwd.x*rel.x+fwd.z*rel.z; const dist=rel.length()||1; const behind=ahead<-30;
 if(dist<320&&!b._flew){b._flew=1; playBank('flyby',b.p)} else if(dist>700)b._flew=0;
 b.breakSide=(side.x*rel.x+side.z*rel.z)>0?'LEFT':'RIGHT';
 if(behind&&dist>500){b.p.copy(S.pos).addScaledVector(fwd,1600); b.p.y=Math.max(groundY(b.p.x,b.p.z)+90,S.pos.y+16); const rdx=S.pos.x-b.p.x, rdz=S.pos.z-b.p.z; b.yaw=Math.atan2(-rdx,-rdz); b.state='merge'; b.timer=8; if(!b._re){b._re=1; radio('Bandit, twelve o\'clock'); msg('BANDIT, TWELVE O\'CLOCK')}} else if(!behind)b._re=0;
 if(b.state==='merge'){ if(!behind)msg('BANDIT, TWELVE O\'CLOCK'); if(dist<220||b.timer<=0){b.state='extend'; b.timer=2.4; b.passes=(b.passes||0)+1} }
 else if(b.state==='extend'){ if(b.timer<=0){b.state='merge'; b.timer=7} }
 else if(b.state==='slash'){ if(b.timer<=0){b.state='merge'; b.timer=6} }
 else if(b.state==='lock'){ if(!b._called)b._called=1; if(b.timer<=0){ b.msl={p:b.p.clone(), v:_bf.clone().multiplyScalar(220), life:6.5, spoiled:0}; b.state='missile'; b.timer=5; msg('MISSILE, MISSILE') } }
 else if(b.state==='missile'){ if(b.timer<=0&&!b.msl){b.state='slash'; b.timer=3.2} }
 const ms=b.msl; if(ms){ ms.life-=rdt; const tp=S.pos.clone().sub(ms.p); const md=tp.length()||1; const wantV=tp.multiplyScalar(1/md).multiplyScalar(ms.spoiled?160:460); ms.v.lerp(wantV,clamp(rdt*2.4,0,1)); if(ms.spoiled)ms.v.y-=50*rdt; ms.p.addScaledVector(ms.v,rdt); spr(ms.p,0xffd090,2.4,.12,null,{add:true,tex:glowTex,fog:false,must:1}); if((S.flareT||0)>0||S.brk>0)ms.spoiled=1;
  if(threatBehind(ms.p)){ms._sixT=(ms._sixT||0)+rdt; warnSix('BANDIT MISSILE')} else ms._sixT=0;
  if(!ms.spoiled&&md<58){ if(S.safe||(ms._sixT||0)>0&&(ms._sixT||0)<1.5){ms.p.addScaledVector(fwd,-30)} else {b.msl=null; S.hp--; nightKick(.16); S.shake=Math.max(S.shake,.7); if(S.hp>0){fire(S.pos,.4); msg('HIT — BANDIT MISSILE')} else {fire(S.pos,.9); die('BANDIT MISSILE','SIX O\'CLOCK'); return}} }
  else if(ms.life<=0||ms.p.y<H(ms.p.x,ms.p.z)+6){b.msl=null; msg(ms.spoiled?'MISSILE — FLARES':'MISSILE — WIDE'); if(b.state==='missile'){b.state='slash'; b.timer=3.2}} }
 if(b.hp<=6&&Math.random()<.5)spr(b.p,0x2c2926,5,2.2,new THREE.Vector3(rnd(4),3,rnd(4)),{grow:10,o:.7,must:1});
 if(b.hp<=3&&Math.random()<.55)spr(b.p,0xff5a18,2.8,.28,null,{add:true,tex:glowTex,fog:false,must:1});
 if(banditMesh){banditMesh.visible=true; banditMesh.position.copy(b.p); _bf.set(-Math.sin(b.yaw)*Math.cos(b.pitch),Math.sin(b.pitch),-Math.cos(b.yaw)*Math.cos(b.pitch)); banditMesh.lookAt(_bd.copy(b.p).add(_bf)); banditMesh.rotateZ(b.roll);
  const ab=banditMesh.userData.ab, boost=b.state==='six'||b.state==='climb'||b.state==='slash'; if(ab)ab.forEach(s=>s.scale.set(boost?4.2:2.2,boost?1.7:1,1)); if(banditMesh.userData.hot)banditMesh.userData.hot.intensity=boost?14:4; const sh=banditMesh.userData.shim; if(sh){const tt=performance.now()*.001; sh.forEach(s=>{if(s.material.uniforms)s.material.uniforms.t.value=tt})}
  b.trailT-=rdt; if(b.trailT<=0&&banditMesh.userData.model){b.trailT=.08; for(const sx of[-6.4,6.4]){const w=_lead.set(sx,1.4,-.6); banditMesh.userData.model.localToWorld(w); spr(w.clone(),0xdfe6ee,1.5,1.6,new THREE.Vector3(0,.3,0),{grow:7,o:.28,drag:.15,must:1})}} }}
window.__bandit=()=>S&&S.bandit;
window.__banditReady=()=>!!(banditMesh&&banditMesh.userData.real);
window.__mood=()=>({id:musicChoice('mood'),live:!!moodHandle,g:AC&&AC.moodG?+AC.moodG.gain.value.toFixed(4):0});
window.__music=()=>({mood:musicChoice('mood'),moodOn:!!moodHandle,moodG:AC&&AC.moodG?+AC.moodG.gain.value.toFixed(3):0,amb:AC&&AC.amb?+AC.amb.gain.value.toFixed(3):0,mus:AC&&AC.mus?+AC.mus.gain.value.toFixed(3):0,introG:AC&&AC.introG?+AC.introG.gain.value.toFixed(3):0,wind:AC&&AC.wind?+AC.wind.g.gain.value.toFixed(3):0,deck:AC&&AC.deckJetG?+AC.deckJetG.gain.value.toFixed(3):0,bed:!!bedS||!!droneS,intro:!!introS||!!introHandle,ending:!!(typeof endHandle!=='undefined'&&endHandle)||!!winSrc,brief:!!briefSrc,riser:!!riserS,quiet:!!(S&&S.quiet),jet:AC&&AC.jet?+AC.jet.gain.value.toFixed(3):0});
window.__sb=k=>SB[k]||null; window.__load=k=>SB.get(k); window.__end=win=>showEnd(!!win);
window.__tanker=()=>S&&S.tanker; window.__ground=(x,z)=>groundY(x,z); window.__kill=()=>S&&S.kill; window.__learned=()=>tankerLearned(); window.__calm=()=>S&&S.calm||'';
window.__aim=()=>{ if(!S||!S.tanker||!S.tanker.basket)return null; const v=tankerScreen(); const b=S.tanker.basket; const tip=probeTipWorld(); return {dist:S.tanker.dist, contact:!!S.tanker.contact, fuel:S.tanker.fuel, calm:S.calm||'', cue:S.tanker.cue, ahead:S.tanker.ahead, lock:S.tanker.lock||'', lockT:S.tanker.lockT||0, sep:v&&v.sep, rad:v&&v.rad, bs:v&&v.cs, fp:v&&v.fp, dpr, W, H:Hh, z:S.pos.z, bunk:bDist(), rig:!!(tankerRig&&tankerRig.visible), hose:!!(tankerHose&&tankerHose.visible), client:[hud.clientWidth,hud.clientHeight], basket:[b.x,b.y,b.z], tipD:+Math.hypot(tip.x-S.pos.x,tip.y-S.pos.y,tip.z-S.pos.z).toFixed(2), jScale:jet.scale.x} };
window.__render=()=>{ try{render()}catch(e){} };
function placeProbeCam(){const p=probeTipWorld(); const b=S&&S.tanker&&S.tanker.basket; const tx=b?b.x:p.x, ty=b?b.y:p.y, tz=b?b.z:p.z; const pod=podPoint();
 _h0.set(pod.x-tx,pod.y-ty,pod.z-tz); if(_h0.lengthSq()<1)_h0.set(0,0,1); _h0.normalize(); _h1.set(0,1,0).cross(_h0); if(_h1.lengthSq()<1e-4)_h1.set(1,0,0); _h1.normalize();
 const o=window.__probeOff||{side:8,back:.4,up:2.4,fov:16};
 cam.position.set(tx+_h1.x*o.side-_h0.x*o.back, ty+o.up, tz+_h1.z*o.side-_h0.z*o.back); cam.up.set(0,1,0); cam.lookAt(tx,ty,tz); cam.fov=o.fov; cam.updateProjectionMatrix()}
window.__shotProbe=()=>{ window.__probeCam=1 };
window.__hug=()=>S&&({mult:+(S.mult||1).toFixed(2),score:Math.round(S.score||0),streak:S.streak||0,best:S.bestStreak||0,spike:+(S.spike||0).toFixed(1),arm:+(S.spikeArm||0).toFixed(2),agl:Math.round(S.agl||0),spd:Math.round(S.spd||0),msg:S.msg||'',missile:!!(S.missile&&!S.missile.lost),flash:+((S.missFlash||0).toFixed(2))});
window.__tick=n=>{for(let i=0;i<(n||1);i++){ if(!S||S.dead||S.phase==='done')return; update(0.05) }};
window.__step=dt=>{ if(S&&!S.dead&&S.phase!=='done') update(dt==null?1/30:dt); };
if(DS_MODE==='game')ensureBanditMesh();
function causeLine(why){const w=String(why||''); if(/TERRAIN/i.test(w))return 'TERRAIN'; if(/COLLID|TANKER/i.test(w))return 'COLLIDED WITH TANKER'; if(/BANDIT MISSILE/i.test(w))return 'HIT BY BANDIT MISSILE'; if(/BANDIT/i.test(w))return 'HIT BY BANDIT'; if(/SAM/i.test(w))return 'HIT BY SAM'; if(/GRID|CABLE/i.test(w))return 'HIT THE DEFENCE GRID'; if(/AO|AREA/i.test(w))return 'LEFT THE AREA'; if(/BLAST/i.test(w))return 'OWN BLAST'; return w?w.toUpperCase():'UNKNOWN'}
function die(why,detail){if(S.dead)return;if(takingOff())return;valleyRespawn=true;S.dead=why;S.cause=causeLine(why);S.kill={why,detail:detail||'',agl:+(S.agl||0).toFixed(1),ground:Math.round(S.ground||0),analytic:Math.round(S.hAnalytic||H(S.pos.x,S.pos.z)),y:Math.round(S.pos.y)};try{sfxLog('death',S.kill)}catch(e){}crashSfx();fire(S.pos,.9);jet.visible=false;releaseControls();try{document.body.classList.remove('tanking','gridding')}catch(e){} msg(S.cause); S.msgT=8; clearTimeout(endTimer);endTimer=setTimeout(()=>{if(S&&S.dead)showEnd(false)},1800)}
function killText(){const k=S.kill||{}; const name=S.cause||causeLine(k.why||S.dead||''); const extra=k.detail||(/TERRAIN/i.test(name)?'AGL '+(k.agl!=null?k.agl:0)+' M · GROUND '+(k.ground||0):''); return name+(extra?' · '+extra:'')}
function fire(at,sc){for(let i=0;i<14;i++)spr(tmp.copy(at).add(new THREE.Vector3(rnd(20*sc),rnd(10*sc),rnd(20*sc))),0xffb060,40*sc,1+Math.random()*.8,new THREE.Vector3(rnd(30*sc),20*sc+Math.random()*40*sc,rnd(30*sc)),{add:true,grow:60*sc,fog:false,c1:new THREE.Color(0x902800)});
 for(let i=0;i<10;i++)spr(at,0x1e1b19,40*sc,4+Math.random()*3,new THREE.Vector3(rnd(15*sc),15*sc+Math.random()*25*sc,rnd(15*sc)),{grow:40*sc,o:.85,fadeIn:.4})}
// ---------- nuclear-style mushroom (persistent sprite rig) ----------
const nkL=new THREE.PointLight(0xffb070,0,9000,1.2);scene.add(nkL);
let NK=null;
const _nkMat=new THREE.SpriteMaterial({map:smokeTex,color:0xffffff,transparent:true,depthWrite:false,blending:THREE.NormalBlending,fog:true});
const _nkAdd=new THREE.SpriteMaterial({map:glowTex,color:0xffffff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
function nkS(add){const s=new THREE.Sprite((add?_nkAdd:_nkMat).clone());s.material.rotation=Math.random()*6.28;scene.add(s);return s}
function nukeStart(){if(NK)NK.all.forEach(x=>scene.remove(x));const nS=MOB?10:14,nC=MOB?20:30;NK={t:0,r:0,hit:false,dust:0,stem:[],cap:[],top:[],all:[]};
 for(let i=0;i<nS;i++)NK.stem.push(nkS());for(let i=0;i<nC;i++)NK.cap.push(nkS());for(let i=0;i<6;i++)NK.top.push(nkS());NK.fb=nkS(true);NK.fb2=nkS(true);
 NK.cond=new THREE.Mesh(new THREE.RingGeometry(.78,1,64),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));NK.cond.rotation.x=-Math.PI/2;scene.add(NK.cond);
 NK.all=[...NK.stem,...NK.cap,...NK.top,NK.fb,NK.fb2,NK.cond];nkL.position.copy(BUNK).y+=300;nkL.intensity=2e4}
const _c1=new THREE.Color(),_c2=new THREE.Color(0xffe0b0),_c3=new THREE.Color(0xff7a30);
function updNuke(dt,rdt){if(!NK)return;NK.t+=dt;NK.r+=rdt;const t=NK.t,B=BUNK;
 const h=80+2100*(1-Math.exp(-t/9)),cR=200+760*(1-Math.exp(-t/12)),sR=45+150*(1-Math.exp(-t/8)),hot=Math.max(0,1-t/7),fade=t<45?1:Math.max(0,1-(t-45)/25);
 nkL.intensity=2e4*Math.max(0,1-t/5)**2;nkL.position.set(B.x,B.y+h,B.z);
 NK.stem.forEach((s,i)=>{const f=i/NK.stem.length,w=sR*(1.35-.5*f)*(1+.12*Math.sin(i*2.1+t*.4));s.position.set(B.x+Math.sin(i*1.7+t*.15)*sR*.25,B.y+h*f*.92,B.z+Math.cos(i*2.3)*sR*.25);s.scale.setScalar(w*3.2);
  _c1.set(0x62584f).lerp(_c1.clone().set(0x8f8478),f).lerp(_c3,hot*(1-f*.4)*.9);s.material.color.copy(_c1);s.material.opacity=.93*fade*Math.min(1,t*1.5+f);s.material.rotation+=dt*.03});
 NK.cap.forEach((s,j)=>{const n=NK.cap.length,a=j/n*6.283+t*.02,b=j*2.39+t*.35,rr=cR+cR*.42*Math.cos(b);s.position.set(B.x+rr*Math.cos(a),B.y+h+cR*.38*Math.sin(b),B.z+rr*Math.sin(a));s.scale.setScalar(cR*1.75);
  const up=.5+.5*Math.sin(b);_c1.set(0x6a5f57).lerp(_c1.clone().set(0xb4aaa0),up).lerp(_c2,hot*.85);if(hot>0)_c1.lerp(_c3,hot*(1-up)*.7);s.material.color.copy(_c1);s.material.opacity=.95*fade;s.material.rotation+=dt*.05*(j%2?1:-1)});
 NK.top.forEach((s,k)=>{s.position.set(B.x+Math.cos(k)*cR*.35,B.y+h+cR*.45+(k%2)*cR*.15,B.z+Math.sin(k)*cR*.35);s.scale.setScalar(cR*2.1);_c1.set(0xc2b8ad).lerp(_c2,hot);s.material.color.copy(_c1);s.material.opacity=.92*fade});
 NK.fb.position.set(B.x,B.y+h,B.z);NK.fb.scale.setScalar(cR*2.2*(.6+hot*.6));NK.fb.material.color.set(0xffc070);NK.fb.material.opacity=hot**1.5;
 NK.fb2.position.set(B.x,B.y+h*.45,B.z);NK.fb2.scale.setScalar(sR*4);NK.fb2.material.color.set(0xff8040);NK.fb2.material.opacity=hot**2*.8;
 const ct=t;NK.cond.position.set(B.x,B.y+h*.6,B.z);NK.cond.scale.setScalar(260+Math.max(0,ct-2.5)*150);NK.cond.material.opacity=.55*sstep(2.5,3.6,ct)*(1-sstep(7,11,ct));
 // ground shockwave in REAL time: reaches the BDA camera at 2.6 s (matches baked shock in nuke.mp3)
 const D=S.cineA?Math.hypot(S.cineA.x-B.x,S.cineA.z-B.z):1900,rad=D*NK.r/2.6;
 if(NK.r<6){ring.visible=true;ring.scale.setScalar(rad);ring.material.opacity=.7*Math.max(0,1-NK.r/6);NK.dust-=rdt;if(NK.dust<=0){NK.dust=MOB?.09:.05;for(let k=0;k<(MOB?3:6);k++){const a=Math.random()*6.283,x=B.x+Math.cos(a)*rad,z=B.z+Math.sin(a)*rad;spr(tmp.set(x,H(x,z)+12,z),0xa59a88,70+Math.random()*50,2.6,new THREE.Vector3(Math.cos(a)*90,14,Math.sin(a)*90),{grow:45,o:.6,drag:.6,fadeIn:.1,must:1})}}}else ring.visible=false;
 if(!NK.hit&&NK.r>=2.6){NK.hit=true;S.shake=Math.max(S.shake,.85)}
 grade.u.uS.value=Math.max(0,1-t/16)*sstep(0,.6,t);const sc=tmp.set(B.x,B.y+h*.35,B.z).project(cam);grade.u.uC.value.set(sc.x*.5+.5,sc.y*.5+.5);
 if(fade<=0){NK.all.forEach(x=>scene.remove(x));NK=null;grade.u.uS.value=0}}
window.__nuke=()=>{S.phase="penetrate";S.penT=1.7;bigBoom()};window.__sam=i=>{S.sites[i].shots=0;S.missile=null;launchSAM(i)};
function jetSpan(){return jet.userData.span||11.2}
function jetTall(){return jet.userData.jetH||4.2}
function gridLearned(){try{if(localStorage.ds17m_grid==='1')return true}catch(e){} try{if(/(?:^|; )ds17mg=1/.test(document.cookie))return true}catch(e){} return false}
function rememberGrid(){try{localStorage.ds17m_grid='1'}catch(e){} try{document.cookie='ds17mg=1; Max-Age=31536000; Path=/; SameSite=Lax'}catch(e){}}
let gridRoots=[], gridHum=null;
function clearGrids(){for(const g of gridRoots){const mats=new Set(); g.traverse(o=>{if(!o.isMesh)return; if(o.geometry){try{o.geometry.dispose()}catch(e){}} const list=[].concat(o.material||[]); list.forEach(m=>{if(m&&!mats.has(m)){mats.add(m); try{m.dispose()}catch(e){}}})}); scene.remove(g)} gridRoots=[]; if(gridHum){try{gridHum.stop()}catch(e){} gridHum=null} if(S)S.grids=null}
const _gsA=new THREE.Vector3(),_gsB=new THREE.Vector3(),_gsC=new THREE.Vector3(),_gsD=new THREE.Vector3(),_gsE=new THREE.Vector3();
function segDist(p0,p1,q0,q1){
 const u=_gsA.subVectors(p1,p0), v=_gsB.subVectors(q1,q0), w=_gsC.subVectors(p0,q0);
 const a=u.dot(u)||1e-8, b=u.dot(v), c=v.dot(v)||1e-8, d=u.dot(w), e=v.dot(w), D=a*c-b*b;
 let sN,sD=D,tN,tD=D;
 if(D<1e-7){sN=0;sD=1;tN=e;tD=c}
 else{sN=b*e-c*d;tN=a*e-b*d; if(sN<0){sN=0;tN=e;tD=c} else if(sN>sD){sN=sD;tN=e+b;tD=c}}
 if(tN<0){tN=0; if(-d<0)sN=0; else if(-d>a)sN=sD; else{sN=-d;sD=a}}
 else if(tN>tD){tN=tD; if(-d+b<0)sN=0; else if(-d+b>a)sN=sD; else{sN=-d+b;sD=a}}
 const sc=Math.abs(sN)<1e-8?0:sN/sD, tc=Math.abs(tN)<1e-8?0:tN/tD;
 return _gsE.copy(w).addScaledVector(u,sc).addScaledVector(v,-tc).length();
}
function gridSiren(){if(!AC)return; sfxLog('gridSiren'); const t=AC.currentTime,o=AC.createOscillator(),o2=AC.createOscillator(),g=AC.createGain(),f=AC.createBiquadFilter();
 o.type='sine'; o.frequency.setValueAtTime(400,t); o.frequency.linearRampToValueAtTime(540,t+1.4); o.frequency.linearRampToValueAtTime(430,t+3.1); o.frequency.linearRampToValueAtTime(500,t+4.6);
 o2.type='triangle'; o2.frequency.setValueAtTime(610,t); o2.frequency.linearRampToValueAtTime(500,t+4);
 f.type='lowpass'; f.frequency.value=1200; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.04,t+.35); g.gain.setValueAtTime(.032,t+2); g.gain.exponentialRampToValueAtTime(.0008,t+5.4);
 o.connect(f); o2.connect(f); f.connect(g); g.connect(AC.tone||AC.out); o.start(t); o2.start(t); o.stop(t+5.5); o2.stop(t+5.5)}
function gridHumSet(on){if(!AC)return; if(on){ if(gridHum)return; const o=AC.createOscillator(),o2=AC.createOscillator(),g=AC.createGain(); o.type='sine'; o.frequency.value=74; o2.type='sine'; o2.frequency.value=148; g.gain.value=.018; o.connect(g); o2.connect(g); g.connect(AC.tone||AC.out); o.start(); o2.start(); gridHum={stop(){try{o.stop();o2.stop()}catch(e){} try{g.disconnect()}catch(e){} gridHum=null}, g}} else if(gridHum)gridHum.stop()}
function buildOneGrid(z,gx,gy,gapW,gapH){
 const group=new THREE.Group(); scene.add(group); gridRoots.push(group);
 const steel=new THREE.MeshStandardMaterial({color:0x9aa1a8,metalness:.78,roughness:.32});
 const cableMat=new THREE.MeshStandardMaterial({color:0xf0e2c4,emissive:0xffd48a,emissiveIntensity:2.6,metalness:.45,roughness:.35});
 const floor=H(gx,z), yTop=gy+gapH/2, yBot=gy-gapH/2, gapL=gx-gapW/2, gapR=gx+gapW/2;
 const leftX=vx(z)-200, rightX=vx(z)+200;
 const cables=[], finals=[];
 function addMesh(mesh,pylon){group.add(mesh); finals.push({mesh,y:mesh.position.y,pylon:!!pylon}); return mesh}
 function pylon(x){const h=Math.max(18,yTop+22-H(x,z)); const m=new THREE.Mesh(new THREE.CylinderGeometry(.5,.72,h,8),steel); m.position.set(x,H(x,z)+h/2,z); m.castShadow=true; addMesh(m,1);
  const cap=new THREE.Mesh(new THREE.BoxGeometry(1.6,.35,1.6),steel); cap.position.set(x,H(x,z)+h,z); addMesh(cap,0)}
 pylon(leftX); pylon(rightX); pylon(gapL); pylon(gapR);
 const Rvis=.12;
 function cableR(x0,y0,x1,y1){const a=new THREE.Vector3(x0,y0,z), b=new THREE.Vector3(x1,y1,z); const len=Math.max(.3,a.distanceTo(b));
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(Rvis,Rvis,len,6),cableMat); const mid=a.clone().add(b).multiplyScalar(.5);
  mesh.position.copy(mid); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), b.clone().sub(a).normalize()); addMesh(mesh,0);
  cables.push({a:a.clone(),b:b.clone(),ya:y0,yb:y1,r:Rvis,mesh})}
 for(const y of [yTop,yTop+7,yTop+16]) cableR(leftX,y,rightX,y);
 if(yBot>floor+6) cableR(leftX,yBot,rightX,yBot);
 if(yBot-8>floor+6) cableR(leftX,yBot-8,rightX,yBot-8);
 for(let y=yBot;y<=yTop+0.01;y+=.42){cableR(leftX,y,gapL,y); cableR(gapR,y,rightX,y)}
 cableR(gapL,yBot,gapL,yTop); cableR(gapR,yBot,gapR,yTop);
 const oMat=new THREE.MeshBasicMaterial({color:0xfff4cc,toneMapped:false,fog:false,transparent:true,opacity:0});
 const outline=new THREE.Group();
 function edge(x0,y0,x1,y1){const a=new THREE.Vector3(x0,y0,z+.5), b=new THREE.Vector3(x1,y1,z+.5), len=Math.max(.2,a.distanceTo(b));
  const m=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,len,5),oMat); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), b.clone().sub(a).normalize()); outline.add(m)}
 edge(gapL,yBot,gapR,yBot); edge(gapR,yBot,gapR,yTop); edge(gapR,yTop,gapL,yTop); edge(gapL,yTop,gapL,yBot);
 group.add(outline); outline.traverse(o=>{if(o.isMesh)finals.push({mesh:o,y:o.position.y,pylon:0})});
 return {z,gx,gy,gapW,gapH,yTop,yBot,gapL,gapR,floor,group,cables,outline,oMat,finals,done:0}
}
function applyGridRise(k){if(!S.grids)return; for(const g of S.grids){for(const f of g.finals){f.mesh.position.y=g.floor+(f.y-g.floor)*k} for(const c of g.cables){c.a.y=g.floor+(c.ya-g.floor)*k; c.b.y=g.floor+(c.yb-g.floor)*k}}}
function makeGrids(){clearGrids(); const learned=practice!=='grid'&&gridLearned(); const n=learned?3:1; const base=-12800; const list=[];
 for(let i=0;i<n;i++){const z=base-i*900, span=jetSpan(); const gapW=span*(1.30-i*.09); const gapH=Math.max(jetTall()+3.4,7.6)*(1-i*.06);
  const gx=vx(z)+(Math.random()*2-1)*(i?18:26); const floor=H(gx,z); const agl=(i===0?78:i===1?50:34)+(Math.random()*8-4);
  list.push(buildOneGrid(z,gx,floor+agl,gapW,gapH))}
 S.grids=list; S.gridRise=practice==='grid'?1:0; applyGridRise(S.gridRise); S._wingPrev=null}
function activateGrid(){if(S.gridOn)return; S.gridOn=1; makeGrids(); S.gridShot=2.7; msg('GRID ACTIVATED — TRAP'); radio('Grid activated. Trap.'); gridSiren()}
function wingSamples(){const half=jetSpan()/2, ys=[-.22,-.07,.07,.22];
 jet.position.copy(S.pos); jet.rotation.set(S.pitch,S.yaw,S.roll); jet.updateMatrixWorld(true);
 const loc=[];
 for(let x=-half;x<=half+0.01;x+=Math.max(.3,half/16)) for(const y of ys) loc.push([x,y,.15]);
 return loc.map(([x,y,z])=>{const v=new THREE.Vector3(x,y,z); return jet.localToWorld(v)})}
function gridHit(curr,prev){if(!S.grids||S.gridRise<0.98)return false; for(const g of S.grids){if(g.done)continue; for(const c of g.cables){for(let i=0;i<curr.length;i++){const p=curr[i], q=prev&&prev[i]||p; if(segDist(q,p,c.a,c.b)<=c.r)return true}}} return false}
function updGrid(dt,rdt){if(!S||S.dead||!S.gridOn||!S.grids){gridHumSet(false); return}
 if(S.gridRise<1){S.gridRise=Math.min(1,S.gridRise+rdt*.5); applyGridRise(S.gridRise)}
 const next=S.grids.filter(g=>!g.done).sort((a,b)=>b.z-a.z)[0];
 const dogfight=!!(S.bandit&&!S.bandit.dead);
 S.gridSafe=practice==='grid'||(!!(S.boomT>8)&&!dogfight&&!!next);
 if(next){const along=S.pos.z-next.z; const ad=Math.abs(along); gridHumSet(S.gridSafe&&ad<1800);
  next.oMat.opacity=(ad<1100&&ad>260)?(.45+.4*Math.abs(Math.sin(S.t*5))):ad<260?.4:.08;
  if(S.gridSafe&&ad<4200&&(!S._gridCall||S.t-S._gridCall>7)){S._gridCall=S.t; msg('GRID AHEAD'); radio('Grid ahead')}
  if(S.gridSafe&&ad<1400&&(S._sparkT=(S._sparkT||0)-rdt)<=0){S._sparkT=.55; const c=next.cables[(Math.random()*next.cables.length)|0]; if(c){const p=c.a.clone().lerp(c.b,Math.random()); spr(p,0xffe2a0,1.4,.18,null,{add:true,tex:glowTex,fog:false,must:1})}}
  const curr=wingSamples(); const prev=S._wingPrev;
  if(S.gridRise>0.98&&gridHit(curr,prev)){S._wingPrev=curr; return die('DEFENCE GRID','CABLE')}
  if(prev&&S.gridRise>0.98&&!next.done){for(let i=0;i<curr.length;i++){const z0=prev[i].z, z1=curr[i].z; if((z0-next.z)*(z1-next.z)<=0){
   const inside=curr.every(p=>p.x>next.gapL+0.2&&p.x<next.gapR-0.2&&p.y>next.yBot+0.2&&p.y<next.yTop-0.2);
   if(inside){next.done=1; const bonus=Math.round(900*(S.mult||1)*clamp((S.spd||160)/220,.55,1.55)*clamp((110-(S.agl||50))/70,.4,1.6)); S.score=(S.score||0)+bonus; S.gridSlow=1.15; nearWhoosh(); radio('Threaded'); msg('THREADED  +'+bonus); S.msgT=2.4; if(practice!=='grid')rememberGrid();
    if(S.grids.every(g=>g.done))S.gridOut=1.6}
   break}}}
  S._wingPrev=curr.map(p=>p.clone());
 } else gridHumSet(false);
 if(S.gridOut>0){S.gridOut-=rdt; if(S.gridOut<=0&&S.phase!=='done'){S.phase='done'; showEnd(true)}}}
function bigBoom(){S.boomT=0;S.shake=.9;bunker.visible=false;bulge.visible=false;nightKick(.2);bunkerBlast(BUNK); playBank('rumble',BUNK); S.quiet=0;ring.visible=dome.visible=true;ring.position.copy(BUNK).y+=3;dome.position.copy(BUNK);
 $('flash').style.transition='none';$('flash').style.background='#ffffff';$('flash').style.opacity=1;setTimeout(()=>{$('flash').style.transition='opacity 2.6s ease-out';$('flash').style.opacity=0},140);S.cineA=null;nukeStart();
 const K=2.6,o={must:1};
 spr(tmp.copy(BUNK).setY(BUNK.y+40),0xfff2d0,160*K,.8,null,{add:true,tex:glowTex,fog:false,grow:300*K,must:1});
 for(let i=0;i<36;i++)spr(tmp.copy(BUNK).add(new THREE.Vector3(rnd(30*K),5+Math.random()*30*K,rnd(30*K))),new THREE.Color().setHSL(.08+Math.random()*.05,1,.6),(70+Math.random()*45)*K,2+Math.random()*1.8,new THREE.Vector3(rnd(40*K),(50+Math.random()*100)*K*.8,rnd(40*K)),{add:true,grow:80*K,drag:.6,fog:false,c1:new THREE.Color(0x7a1e00),must:1});
/*col*/ for(let i=0;i<0;i++){const up=i<28;spr(tmp.copy(BUNK).add(new THREE.Vector3(rnd(25*K),Math.random()*20*K,rnd(25*K))),new THREE.Color().setHSL(.07,.12,.08+Math.random()*.07),(50+Math.random()*35)*K,12+Math.random()*7,new THREE.Vector3(rnd(up?12*K:35*K),(up?40+Math.random()*60:90+Math.random()*30)*K*.8,rnd(up?12*K:35*K)),{grow:(up?28:45)*K,o:.92,drag:.25,fadeIn:.6,must:1})}
 for(let i=0;i<(MOB?6:12);i++)spr(tmp.copy(BUNK).add(new THREE.Vector3(rnd(30),Math.random()*30,rnd(30))),0x9a8a72,60*K*.6,14+Math.random()*4,new THREE.Vector3(rnd(10),25+Math.random()*45,rnd(10)),{grow:34,o:.7,drag:.12,fadeIn:1,must:1});
 for(let i=0;i<48;i++){const a=i/48*6.28+rnd(.1),sp=(120+Math.random()*90)*K*.8;spr(tmp.copy(BUNK).add(new THREE.Vector3(Math.cos(a)*40,4,Math.sin(a)*40)),0x8a7a66,30*K,6+Math.random()*3,new THREE.Vector3(Math.cos(a)*sp,6+Math.random()*10,Math.sin(a)*sp),{grow:30*K,drag:.9,o:.75,fadeIn:.2,must:1})}
 for(let i=0;i<80;i++){const m=new THREE.Mesh(debG,debM);const sz=.8+Math.random()*3.4;m.scale.set(sz,sz*.7,sz);m.position.copy(BUNK).y+=5;m.castShadow=true;scene.add(m);debris.push({m,v:new THREE.Vector3(rnd(180),90+Math.random()*260,rnd(180)),r:new THREE.Vector3(Math.random()*5,Math.random()*5,0)})}
 for(let i=0;i<60;i++)spr(BUNK,0xffc080,4,2.5+Math.random()*2,new THREE.Vector3(rnd(200),90+Math.random()*240,rnd(200)),{add:true,tex:glowTex,g:40,fog:false,must:1});
 S.sec=[.5,1.1,1.7,2.4];S.phase='egress';S.egressLaunch=true;S.det=60;S.gridArm=1}
// ---------- loop ----------
let last=performance.now(),running=false,fpsA=[],slowT=0,lastR=0,looping=false,shadowN=0;
window.__fps=()=>{const a=fpsA.slice(-120);return a.length?1000/(a.reduce((x,y)=>x+y)/a.length):0};
window.__therm=()=>{const i=R.info||{}; const r=i.render||{}; const mem=i.memory||{}; const a=fpsA.slice(-90); const avg=a.length?a.reduce((x,y)=>x+y,0)/a.length:0; const seen=new Set(); let texB=0; scene.traverse(o=>{const list=[].concat(o.material||[]); list.forEach(mt=>{if(!mt)return; for(const k in mt){const t=mt[k]; if(t&&t.isTexture&&t.image&&t.image.width&&!seen.has(t)){seen.add(t); texB+=t.image.width*t.image.height*4}}})}); return {fps:avg?+(1000/avg).toFixed(1):0, frameMs:+avg.toFixed(2), calls:r.calls||0, tris:r.triangles||0, tex:mem.textures||0, texMB:+(texB/1048576).toFixed(1), geo:mem.geometries||0, pr:+R.getPixelRatio().toFixed(2), scale:renderScale, batt:batteryOn()?1:0, heap:performance.memory?performance.memory.usedJSHeapSize:0}};
function frameMode(){if(document.hidden)return 0; if(window.__frozen)return 0; if(DS_MODE==='game'){const end=$('end'); if(end&&!end.classList.contains('hide'))return 0; if(!running)return 30} if(batteryOn())return 30; if(PHONE||IPAD)return 45; return 60}
function wake(){if(looping||document.hidden)return; looping=true; requestAnimationFrame(step)}
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(AC)AC.suspend(); looping=false; return} last=performance.now(); lastR=0; if(AC)AC.resume(); wake()});
function applyRenderScale(){const pr=pickPR()*renderScale; if(Math.abs(pr-R.getPixelRatio())<0.03)return; R.setPixelRatio(pr); try{composer.setPixelRatio(pr)}catch(e){} resize()}
function step(now){try{const _n=performance.now(); if(window.__ftLast){const _dt=_n-window.__ftLast; window.__ft.n++; if(_dt>window.__ft.max)window.__ft.max=_dt; if(_dt>100){window.__ft.over100++; window.__ftLog.push({dt:+_dt.toFixed(1),t:_n,mark:window.__ftMark||''}); if(window.__ftLog.length>60)window.__ftLog.shift()}} window.__ftLast=_n;}catch(_e){}
 const mode=window.__freeze?60:frameMode();
 if(!mode){looping=false; if(AC&&AC.state==='running'&&(document.hidden||($('end')&&!$('end').classList.contains('hide'))))AC.suspend(); return}
 const minDt=1000/mode;
 const elapsed=lastR?now-lastR:minDt;
 if(elapsed<minDt-1.5){const wait=minDt-elapsed; if(wait>6)setTimeout(()=>requestAnimationFrame(step),Math.max(0,wait-4)); else requestAnimationFrame(step); return}
 const frameMs=Math.min(100,elapsed); lastR=now; last=now;
 const dt=Math.min(.05,frameMs/1000);
 if(window.__ft){const F=window.__ft; F.n++; if(frameMs>F.max)F.max=frameMs}
 if(!window.__freeze){try{if(running&&!S.dead&&S.phase!=='done')update(dt); else if(running&&S.dead)updParts(dt)}catch(e){}}
 fpsA.push(frameMs); if(fpsA.length>300)fpsA.shift();
 if(running&&!batteryOn()&&frameMs>26)slowT+=frameMs; else slowT=Math.max(0,slowT-frameMs*.25);
 if(slowT>280&&renderScale>0.7&&!window.__noAdapt){slowT=0; renderScale=Math.max(0.7,+(renderScale-0.1).toFixed(2)); applyRenderScale()}
 try{render(dt)}catch(e){}
 requestAnimationFrame(step)}
const _hugA=new THREE.Vector3(), _hugS=new THREE.Vector3();
function nearWhoosh(){if(!AC)return; if(playBank('nearmiss',S&&S.pos)){sfxLog('nearMiss',{bank:1}); return} sfxLog('nearMiss',{}); const t=AC.currentTime,n=AC.createBufferSource(); n.buffer=noiseBuf(.4); const f=AC.createBiquadFilter(); f.type='bandpass'; f.frequency.setValueAtTime(980,t); f.frequency.exponentialRampToValueAtTime(320,t+.32); f.Q.value=.8; const g=AC.createGain(); g.gain.setValueAtTime(.0008,t); g.gain.exponentialRampToValueAtTime(.16,t+.03); g.gain.exponentialRampToValueAtTime(.0008,t+.36); n.connect(f).connect(g).connect(AC.out); try{n.start(t); n.stop(t+.4)}catch(e){}}
function updHug(dt,rdt){
 if(S.score==null){S.score=0; S.mult=1; S.streak=0; S.bestStreak=0; S.spike=0; S.spikeArm=0; S.spikeCD=0; S.inBand=0; S.missFlash=0; S.missBonus=0; S.lastMiss=-20}
 if(takingOff()||S.cine||S.phase==='done'||S.dead){S.mult=lerp(S.mult||1,1,clamp(rdt*1.5,0,1)); return}
 if(S.safe||S.calm||S.gridSafe){S.spike=0; S.spikeArm=0; S.det=0; if(S.missile&&S.missile.spike)S.missile.lost=true}
 const agl=S.agl||0, spd=S.spd||0;
 const aglK=1-sstep(32,125,agl), spdK=sstep(150,235,spd);
 S.mult=lerp(S.mult||1, 1+4*aglK*spdK, clamp(rdt*1.4,0,1));
 S.score+=(Math.max(0,S.mult-1))*spd*dt*0.35;
 nose(); _hugA.copy(S.pos).addScaledVector(fwd,52); _hugS.set(fwd.z,0,-fwd.x); if(_hugS.lengthSq()<1e-4)_hugS.set(1,0,0); _hugS.normalize();
 const under=Math.min(S.pos.y-H(S.pos.x,S.pos.z), S.pos.y-H(_hugA.x,_hugA.z));
 const side=Math.min(S.pos.y-H(S.pos.x+_hugS.x*42,S.pos.z+_hugS.z*42), S.pos.y-H(S.pos.x-_hugS.x*42,S.pos.z-_hugS.z*42));
 const close=spd>165&&((under>6&&under<28)||(side>-12&&side<24));
 if(close&&!S.inBand){S.inBand=1; S.streak=(S.t-S.lastMiss<5)?(S.streak||0)+1:1; S.lastMiss=S.t; S.bestStreak=Math.max(S.bestStreak||0,S.streak); const bonus=Math.round(350*S.streak*S.mult); S.score+=bonus; S.missBonus=bonus; S.missFlash=1.5; S.shake=Math.max(S.shake||0,.16); nearWhoosh(); msg('NEAR MISS +'+bonus)}
 else if(!close)S.inBand=0;
 S.missFlash=Math.max(0,(S.missFlash||0)-rdt);
 if(S.safe||S.calm||S.gridSafe){S.spike=Math.max(0,(S.spike||0)-40*dt)} else if(agl>165){S.spike=Math.min(100,(S.spike||0)+(20+(agl-165)*.05)*dt); S.detT=(S.detT||0)+dt} else S.spike=Math.max(0,(S.spike||0)-(agl<95?48:16)*dt);
 S.det=S.spike; if((S.spikeCD||0)>0)S.spikeCD-=rdt;
 if(agl<95&&S.spikeArm>0){S.spikeArm=0; S.spike=Math.min(S.spike,28); S.det=S.spike; S._broke=1; if(S.missile&&S.missile.spike&&!S.missile.lost&&S.missile.p.distanceTo(S.pos)>650)S.missile.lost=true}
 if(!S.safe&&!S.calm&&!S.gridSafe&&S.spike>=100&&!(S.spikeArm>0)&&!S.missile&&(S.spikeCD||0)<=0){S.spikeArm=1.8; lockTone(); msg('SPIKED — SAM LOCK')}
 if(S.spikeArm>0){S.spikeArm-=rdt; if(S.spikeArm<=0){launchSAM(); if(S.missile)S.missile.spike=1; S.spike=42; S.det=S.spike; S.spikeArm=0; S.spikeCD=6}}
 if(S.spike>40&&S.spike<100&&!(S.spikeArm>0)&&(!S._spk||S.t-S._spk>.7)){S._spk=S.t; blip(640,.06,.1)}
}
let tankerMesh=null;
function ensureTanker(){if(tankerMesh)return tankerMesh; const g=new THREE.Group();
 const skin=new THREE.MeshStandardMaterial({color:0xa7b0b8,metalness:.52,roughness:.48,emissive:0x1a1e24,emissiveIntensity:.05,envMapIntensity:.85});
 const dark=new THREE.MeshStandardMaterial({color:0x5c636b,metalness:.4,roughness:.5});
 const body=new THREE.Mesh(new THREE.CylinderGeometry(2.35,2.35,46,28),skin); body.rotation.x=Math.PI/2;
 const nose=new THREE.Mesh(new THREE.ConeGeometry(2.35,8,28),skin); nose.rotation.x=-Math.PI/2; nose.position.z=-26;
 const wing=new THREE.Mesh(new THREE.BoxGeometry(42,.55,8),skin); wing.position.set(0,.2,-2);
 const tail=new THREE.Mesh(new THREE.BoxGeometry(14,.4,5),skin); tail.position.set(0,1.2,18);
 const fin=new THREE.Mesh(new THREE.BoxGeometry(.45,6.2,5),skin); fin.position.set(0,3.4,18);
 const stripe=new THREE.Mesh(new THREE.BoxGeometry(.2,1.1,40),dark); stripe.position.set(2.2,.2,0);
 const boom=new THREE.Mesh(new THREE.CylinderGeometry(.18,.12,16,8),dark); boom.rotation.x=Math.PI/2.4; boom.position.set(0,-2.2,28);
 const basket=new THREE.Mesh(new THREE.TorusGeometry(1.35,.16,8,18), new THREE.MeshStandardMaterial({color:0xe7ebef,metalness:.5,roughness:.35})); basket.name='basket'; basket.visible=false;
 g.add(body,nose,wing,tail,fin,stripe,boom,basket);
 const seamM=new THREE.MeshStandardMaterial({color:0x7a848e,metalness:.4,roughness:.62});
 const seams=new THREE.InstancedMesh(new THREE.BoxGeometry(.03,.018,34), seamM, 6);
 const seamQ=new THREE.Quaternion(), seamM4=new THREE.Matrix4(), seamP=new THREE.Vector3(), seamS=new THREE.Vector3(1,1,1);
 for(let i=0;i<6;i++){const a=-2.15+i*0.86; seamP.set(Math.cos(a)*2.38,Math.sin(a)*2.38,1); seamQ.setFromAxisAngle(new THREE.Vector3(0,0,1),a); seamM4.compose(seamP,seamQ,seamS); seams.setMatrixAt(i,seamM4)}
 g.add(seams);
 for(const z of [-10,6,16]){const band=new THREE.Mesh(new THREE.TorusGeometry(2.37,.028,6,28), seamM); band.position.z=z; g.add(band)}
 for(const x of [-14,-6,6,14]){const pod=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,4.2,12),dark); pod.rotation.x=Math.PI/2; pod.position.set(x,-1.15,-2); g.add(pod)}
 const lamp=(x,y,z,color)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(.28,8,8), new THREE.MeshBasicMaterial({color})); m.position.set(x,y,z); g.add(m)};
 lamp(-21,.3,-2,0xff4040); lamp(21,.3,-2,0x40ff68); lamp(0,4.2,20,0xfff2cc);
 const dir=new THREE.Group(); dir.name='director';
 for(const [n,x,y,z] of [['c',0,-2.6,20.5],['u',0,-1.15,20.5],['d',0,-4.05,20.5],['f',0,-2.6,18.6],['a',0,-2.6,22.4]]){const m=new THREE.Mesh(new THREE.SphereGeometry(1.15,10,8), new THREE.MeshBasicMaterial({color:0x2a1408,toneMapped:false,fog:false})); m.position.set(x,y,z); m.name=n; dir.add(m)}
 g.add(dir); g.userData.dir=dir;
 const drum=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,1.15,12), dark); drum.rotation.z=Math.PI/2; drum.position.set(0,-1.55,20); g.add(drum);
 g.scale.setScalar(2.6); g.frustumCulled=false; g.traverse(o=>{o.frustumCulled=false; const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[]; ms.forEach(m=>{if(m)m.fog=false})}); scene.add(g); g.visible=false; return tankerMesh=g}
let tankerRig=null, tankerHose=null;
const HOSE_N=MOB?16:22;
const _pod=new THREE.Vector3(), _h0=new THREE.Vector3(), _h1=new THREE.Vector3(), _ha=new THREE.Vector3(), _hb=new THREE.Vector3(), _sc=new THREE.Vector3();
const _hoseQ=new THREE.Quaternion(), _hoseUp=new THREE.Vector3(0,1,0), _hoseS=new THREE.Vector3(), _hoseM=new THREE.Matrix4();
const _probeTip=new THREE.Vector3();
function hideTankerRig(){ if(tankerRig)tankerRig.visible=false; if(tankerHose)tankerHose.visible=false }
function drogueGore(){
 const rings=[{z:.02,r:.46},{z:.28,r:.78},{z:.56,r:1.16},{z:.84,r:1.58},{z:1.08,r:1.96},{z:1.24,r:2.12}];
 const cols=5, half=Math.PI/20*1.42, pos=[], uv=[], idx=[];
 for(let i=0;i<rings.length;i++){
  for(let j=0;j<cols;j++){
   const t=j/(cols-1), ang=-half+t*half*2, edge=Math.sin(Math.min(t,1-t)*Math.PI);
   const r=rings[i].r+edge*.04*(rings[i].r/2.1);
   pos.push(Math.cos(ang)*r, Math.sin(ang)*r, rings[i].z); uv.push(t, i/(rings.length-1));
  }
 }
 for(let i=0;i<rings.length-1;i++)for(let j=0;j<cols-1;j++){const a=i*cols+j; idx.push(a,a+cols,a+1, a+1,a+cols,a+cols+1)}
 const g=new THREE.BufferGeometry();
 g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
 g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
 g.setIndex(idx); g.computeVertexNormals(); return g}
function hoseGeom(){
 const geo=new THREE.CylinderGeometry(.088,.088,1,16,8,true);
 const p=geo.attributes.position;
 for(let i=0;i<p.count;i++){const y=p.getY(i), ay=Math.abs(y); let k=1; if(ay>.4)k=1.14; else if(Math.abs(ay-.16)<.035)k=1.07; p.setX(i,p.getX(i)*k); p.setZ(i,p.getZ(i)*k)}
 geo.computeVertexNormals(); return geo}
function ensureTankerRig(){ if(tankerRig)return;
 tankerRig=new THREE.Group(); tankerRig.name='drogue'; tankerRig.frustumCulled=false;
 const metal=new THREE.MeshStandardMaterial({color:0xc5ccd2,metalness:.78,roughness:.3,envMapIntensity:.9});
 const cloth=new THREE.MeshStandardMaterial({color:0xe7e2d6,metalness:.02,roughness:.92,envMapIntensity:.35,transparent:true,opacity:.92,depthWrite:false,side:THREE.DoubleSide});
 const couplerM=new THREE.MeshStandardMaterial({color:0x16181b,metalness:.88,roughness:.32,envMapIntensity:1});
 const ribM=new THREE.MeshStandardMaterial({color:0x8d969e,metalness:.66,roughness:.4,envMapIntensity:.8});
 const gores=new THREE.InstancedMesh(drogueGore(), cloth, 20); gores.frustumCulled=false; gores.renderOrder=2;
 for(let i=0;i<20;i++){_hoseM.makeRotationZ(i*Math.PI*2/20); gores.setMatrixAt(i,_hoseM)}
 const coupler=new THREE.Mesh(new THREE.CylinderGeometry(.15,.2,1.08,28), couplerM); coupler.rotation.x=Math.PI/2; coupler.position.z=-.32;
 const lip=new THREE.Mesh(new THREE.TorusGeometry(.22,.028,8,32), metal); lip.position.z=.2;
 const collar=new THREE.Mesh(new THREE.TorusGeometry(.24,.032,8,32), couplerM); collar.position.z=-.84;
 const rim=new THREE.Mesh(new THREE.TorusGeometry(2.15,.028,8,64), metal); rim.position.z=1.24;
 tankerRig.add(coupler,lip,collar,rim,gores);
 const ribG=new THREE.InstancedMesh(new THREE.BoxGeometry(.022,1,.012), ribM, 20); ribG.frustumCulled=false;
 const z0=.24, r0=.36, z1=1.18, r1=2.04, dz=z1-z0, dr=r1-r0, ribLen=Math.hypot(dr,dz);
 for(let i=0;i<20;i++){const a=i*Math.PI*2/20; _h0.set(Math.cos(a)*(r0+r1)*.5, Math.sin(a)*(r0+r1)*.5, (z0+z1)*.5); _h1.set(Math.cos(a)*dr, Math.sin(a)*dr, dz).normalize(); _hoseQ.setFromUnitVectors(_hoseUp,_h1); _hoseM.compose(_h0,_hoseQ,_hoseS.set(1,ribLen,1)); ribG.setMatrixAt(i,_hoseM)}
 tankerRig.add(ribG);
 tankerRig.traverse(o=>{o.frustumCulled=false});
 scene.add(tankerRig);
 tankerHose=new THREE.InstancedMesh(hoseGeom(), new THREE.MeshStandardMaterial({color:0x241f1c,roughness:.86,metalness:.06,envMapIntensity:.35}), HOSE_N);
 tankerHose.frustumCulled=false; tankerHose.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(tankerHose);
 tankerRig.visible=false; tankerHose.visible=false }
function podPoint(){const yaw=tankerMesh.rotation.y, sc=2.6, lz=20, ly=-1.55;
 _pod.set(tankerMesh.position.x+Math.sin(yaw)*lz*sc, tankerMesh.position.y+ly*sc, tankerMesh.position.z+Math.cos(yaw)*lz*sc); return _pod}
function hoseAt(out, pod, basket, t, sag, wave){
 const calm=S&&S.tanker&&(S.tanker.lock==='hold'||S.tanker.lock==='arm'||(S.tanker.dist!=null&&S.tanker.dist<70));
 const s=calm?.18:1;
 const wob=Math.sin((S&&S.t||0)*.7+t*5.4)*(0.22+wave)*Math.sin(Math.PI*t)*s;
 const wob2=Math.cos((S&&S.t||0)*.5+t*3.1)*0.16*Math.sin(Math.PI*t)*s;
 out.set(pod.x+(basket.x-pod.x)*t+wob, pod.y+(basket.y-pod.y)*t-Math.sin(Math.PI*t)*sag, pod.z+(basket.z-pod.z)*t+wob2); return out}
function layHose(bx,by,bz,sag,wave){ensureTankerRig(); tankerHose.visible=true; tankerRig.visible=true;
 const pod=podPoint(); const basket=_h1.set(bx,by,bz);
 for(let i=0;i<HOSE_N;i++){hoseAt(_ha,pod,basket,i/HOSE_N,sag,wave); hoseAt(_hb,pod,basket,(i+1)/HOSE_N,sag,wave);
  _hoseS.subVectors(_hb,_ha); const len=Math.max(.08,_hoseS.length()); _hoseS.multiplyScalar(1/len);
  _hoseQ.setFromUnitVectors(_hoseUp,_hoseS); _ha.addScaledVector(_hoseS,len*.5); _sc.set(1,len,1); _hoseM.compose(_ha,_hoseQ,_sc); tankerHose.setMatrixAt(i,_hoseM)}
 tankerHose.instanceMatrix.needsUpdate=true;
 tankerRig.position.set(bx,by,bz); tankerRig.up.set(0,1,0); tankerRig.lookAt(pod.x,pod.y,pod.z);
 if(S&&S.tanker)S.tanker.hoseLen=pod.distanceTo(basket)}
function probeTipWorld(){_probeTip.set(.95,-.28,-9.05); jet.position.copy(S.pos); jet.rotation.set(S.pitch||0,S.yaw||0,S.roll||0); jet.updateMatrixWorld(true); return jet.localToWorld(_probeTip)}
function failFuel(){if(!S||S.fuelFail||S.fuelDone)return; S.fuelFail=1; S.score=Math.max(0,(S.score||0)-1500); if(S.calmLeft==null)S.calmLeft=4; S.descendCue=1; msg('TANKER BREAKING AWAY — DESCEND'); hideTankerRig()}
function breakTanker(why){if(!S||S.fuelFail||S.fuelDone)return; S.fuelFail=1; if(S.calmLeft==null)S.calmLeft=3; S.descendCue=1; if(S.tanker){S.tanker.lock=''; S.tanker.contact=0} msg(why||'TANKER BREAKING AWAY — DESCEND'); hideTankerRig()}
function lockClick(){if(!AC)return; sfxLog('lockclick'); blip(860,.05,.14); thud(AC.tone||AC.out,.22,150,24,.16)}
function lockClunk(){if(!AC)return; sfxLog('lockclunk'); thud(AC.out,.6,68,26,.32); thud(AC.out,.35,40,16,.48)}
function fuelRumble(){if(!AC||!S)return; if(S.t-(S._fuelSnd||-9)<1.2)return; S._fuelSnd=S.t; const t=AC.currentTime, dur=.72; const n=AC.createBufferSource(); n.buffer=noiseBuf(1); const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(80,t); f.frequency.linearRampToValueAtTime(55,t+dur); const g=AC.createGain(); g.gain.setValueAtTime(.0008,t); g.gain.linearRampToValueAtTime(.028,t+.14); g.gain.linearRampToValueAtTime(.016,t+dur-.2); g.gain.linearRampToValueAtTime(.0008,t+dur); n.connect(f).connect(g).connect(AC.out); n.start(t,0); n.stop(t+dur+.02)}
function fuelClunk(){if(!AC||!S)return; if(S.t-(S._clunk||-9)<.85)return; S._clunk=S.t; thud(AC.out,.32,44,26,.34)}
function setDirLights(mode){const g=tankerMesh&&tankerMesh.userData.dir; if(!g)return; const col={c:0x2a1408,u:0x2a1408,d:0x2a1408,f:0x2a1408,a:0x2a1408};
 if(mode==='HOLD')col.c=0x3dff78; else if(mode==='UP')col.u=0xffc24a; else if(mode==='DOWN')col.d=0xffc24a; else if(mode==='FWD')col.f=0xffc24a; else if(mode==='AFT')col.a=0xffc24a; else if(mode==='OFF')col.c=0xff5a3a;
 g.children.forEach(m=>{if(m.material&&m.material.color)m.material.color.setHex(col[m.name]||0x2a1408)})}
function hideFuelFx(){fuelGlow.visible=false; fuelMist.visible=false}
function tankerLearned(){try{if(localStorage.ds17j_tanker==='1')return true}catch(e){} try{if(/(?:^|; )ds17jt=1/.test(document.cookie))return true}catch(e){} return false}
function rememberTanker(){try{localStorage.ds17j_tanker='1'}catch(e){} try{document.cookie='ds17jt=1; Max-Age=31536000; Path=/; SameSite=Lax'}catch(e){}}
function forgetTanker(){try{localStorage.removeItem('ds17j_tanker')}catch(e){} try{document.cookie='ds17jt=; Max-Age=0; Path=/; SameSite=Lax'}catch(e){}}
function clearCombat(){if(!S)return; if(S.missile){try{mslAudioStop(S.missile)}catch(e){} S.missile=null; if(typeof msl!=='undefined'&&msl)msl.visible=false; if(typeof mslG!=='undefined'&&mslG)mslG.visible=false} if(S.bandit&&!S.bandit.dead){S.bandit=null; if(banditMesh)banditMesh.visible=false} S.spike=0; S.spikeArm=0; S.det=0; if(S.sites)S.sites.forEach(s=>{s.st='off'; s.trk=0; s.warned=0; s.warnT=0}); if(AC&&warnG)warnG.gain.value=0; if(AC&&trkG)trkG.gain.value=0}
function releaseContact(tk){if(!tk)return; tk.lock=''; tk.lockT=0; tk.outT=0; tk.flow=0; tk.contact=0; tk.miss=0; tk._leave=0; tk.why=''; tk.dir=''; tk._held=0; tk.swing=.35; tk.wave=0; tk.ox=0; tk.oy=0; tk.oz=0; tk.rate=0; tk._pd=null; tk._dot=null; tk._ring=null; tk.away=0; tk.cleared=0; tk.reelFrom=null}
function refreshCalm(rdt){if(!S||takingOff()){if(S)S.calm=''; return}
 const tk=S.tanker;
 const separated=!!(S.fuelDone&&tk&&(tk.dist!=null?tk.dist:tk.ship||0)>500&&(S.refuelSafe||0)<=0);
 const near=tk&&!separated&&((tk.ship||0)<2800||tk.contact||tk.lock==='hold'||tk.lock==='arm'||(tk.rejoin&&S.pos.z>TANKER_LEAVE_Z));
 const live=S.phase==='ingress'&&!S.cine&&tk&&tk.called&&!S.fuelFail&&near&&tankerMesh&&tankerMesh.visible;
 if(live)S.calmLeft=null;
 else if(tk&&tk.called&&S.calmLeft==null&&(S.fuelDone||S.fuelFail||S.phase==='ingress'))S.calmLeft=4;
 if(S.calmLeft!=null)S.calmLeft-=rdt||0;
 const tail=!live&&S.calmLeft!=null&&S.calmLeft>0;
 const on=!!(live||tail);
 S.calm=on?(S.tankerLesson?'light':'off'):'';
 if((S.refuelSafe||0)>0)S.calm=S.tankerLesson?'light':'off';
 if(S.calm)clearCombat();
 if(S.calm==='light'){if(S.farPress==null)S.farPress=48; if(!S._farSaid){S._farSaid=1; msg('BANDIT, FAR'); radio('Bandit, far')} S._farT=(S._farT||0)-(rdt||0); if(S._farT<=0){S._farT=5.5; if(AC)blip(420,.1,.035)} S.farPress-=rdt||0; if(S.farPress<=0){S.farPress=48; msg('BANDIT STILL FAR — NO LOCK')}} else if(!on)S.farPress=null}
function updTanker(dt,rdt){if(!S||takingOff()){hideTankerRig();return} if(S.phase!=='ingress'){hideTankerRig();return}
 if(S.tanker&&S.tanker.lock==='done'){const tk=S.tanker; if(S.t<(tk.hideAt||0)&&tankerMesh&&tankerMesh.visible){const u=clamp((S.t-(tk.fullAt||S.t))/1.45,0,1); const pod=podPoint(); const o=tk.reelFrom||{x:0,y:0,z:0}; const bx=pod.x+o.x*(1-u), by=pod.y+o.y*(1-u), bz=pod.z+o.z*(1-u); layHose(bx,by,bz,.3*(1-u),0); tk.basket={x:bx,y:by,z:bz}; if(u>0.55&&!tk.cleared){tk.cleared=1; msg('CLEARED'); S.msgT=1.6; fuelClunk()} hideFuelFx(); refreshCalm(0); return} if(!tk.away){tk.away=1; S.descendCue=1; msg('TANKER BREAKING AWAY'); S.msgT=2.2} releaseContact(tk); tk.fuel=0; if(tankerMesh)tankerMesh.visible=true}
 if(!S.tanker)S.tanker={z:TANKER_Z,fuel:0,fails:0,called:0,contact:0,t0:0,fast:0,shout:-10,spd:220,rejoin:0,lock:'',lockT:0};
 const tk=S.tanker;
 const playerSpd=Math.max(85, S.spd||(85+(S.thr||0)*195));
 let x=vx(tk.z), y=HIGH_Y;
 let yaw=Math.atan2(-(vx(tk.z-40)-x), 40);
 let fx=-Math.sin(yaw), fz=-Math.cos(yaw);
 let along=(S.pos.x-x)*fx+(S.pos.z-tk.z)*fz;
 const ship0=Math.hypot(S.pos.x-x,S.pos.y-y,S.pos.z-tk.z);
 const bPrev=tk.basket, nearB=!!(bPrev&&Math.hypot(S.pos.x-bPrev.x,S.pos.y-bPrev.y,S.pos.z-bPrev.z)<80);
 if((S.refuelSafe||0)>0&&S.fuelDone&&tk.lock!=='hold'&&tk.lock!=='arm'){tk.spd=playerSpd+55; tk.breakSide=Math.min(260,(tk.breakSide||0)+70*Math.max(dt,.016))}
 else if(tk.lock==='hold'||nearB)tk.spd=playerSpd;
 else if(along>40){tk.rejoin=1; tk.spd=playerSpd+55; if(!tk._ov||S.t-tk._ov>4){tk._ov=S.t; msg('OVERSHOOT, REJOIN')}}
 else if(tk.rejoin&&along<-220){tk.rejoin=0; tk.spd=playerSpd; if(!S.fuelDone)msg('TANKER AHEAD — JOIN UP')}
 else if(!tk.rejoin&&along<-350)tk.spd=Math.max(85, playerSpd-35);
 else if(!tk.rejoin&&along<-140)tk.spd=Math.max(85, playerSpd-10);
 else tk.spd=playerSpd;
 tk.z-=tk.spd*dt;
 x=vx(tk.z)+(tk.breakSide||0); y=HIGH_Y;
 yaw=Math.atan2(-(vx(tk.z-40)-vx(tk.z)), 40);
 fx=-Math.sin(yaw); fz=-Math.cos(yaw);
 ensureTanker(); tankerMesh.visible=true; tankerMesh.position.set(x,y,tk.z); tankerMesh.rotation.set(0,yaw,Math.sin(S.t*.55)*.02);
 const aftX=Math.sin(yaw), aftZ=Math.cos(yaw);
 const calmB=(tk.lock==='hold'||tk.lock==='arm'||(tk.dist!=null&&tk.dist<70));
 const wob=Math.sin(S.t*.55)*.7*(calmB?.12:1);
 const podAft=20*2.6, reel=24;
 const restx=x+aftX*(podAft+reel)+(-aftZ)*wob, restz=tk.z+aftZ*(podAft+reel)+aftX*wob, resty=y-1.55*2.6-2.4;
 const seated=tk.lock==='hold';
 const rightX=-aftZ, rightZ=aftX;
 let lx=0, ly=0, lz=0;
 if(seated){const p=probeTipWorld(); const iy=S.yaw||0, seat=.55; const dx=p.x+Math.sin(iy)*seat-restx, dy=p.y-resty, dz=p.z+Math.cos(iy)*seat-restz; lx=dx*aftX+dz*aftZ; ly=dx*rightX+dz*rightZ; lz=dy; const mag=Math.hypot(lx,ly,lz); if(mag>16){const s=16/mag; lx*=s; ly*=s; lz*=s} tk._held=1; tk.wave=tk.wave==null?1:Math.max(0,tk.wave-dt*1.3)}
 else { if(tk._held){tk._held=0; tk.swing=1.15} tk.wave=0 }
 tk.swing=Math.max(0,(tk.swing||0)-dt*.65);
 const pull=1-Math.exp(-(seated?14:6)*Math.max(dt,.016));
 if(tk.ox==null){tk.ox=0; tk.oy=0; tk.oz=0}
 tk.ox+=(lx-tk.ox)*pull; tk.oy+=(ly-tk.oy)*pull; tk.oz+=(lz-tk.oz)*pull;
 const sw=Math.sin(S.t*2.3)*(tk.swing||0)*2.2;
 const bx=restx+aftX*tk.ox+rightX*(tk.oy+sw), by=resty+tk.oz, bz=restz+aftZ*tk.ox+rightZ*(tk.oy+sw);
 layHose(bx,by,bz, seated?0.7:2.7, seated?(tk.wave||0):(tk.swing||0)*.35*(calmB?.2:1));
 tk.basket={x:bx,y:by,z:bz}; tk.yaw=yaw; tk.alt=y; tk.x=x; tk.y=y;
 if(tk.lock!=='done'){
  const pre=tankerScreen(); const tip=probeTipWorld();
  const pd0=Math.hypot(tip.x-bx,tip.y-by,tip.z-bz);
  const zone=!!(pre&&pre.cs&&pre.fp&&pre.sep<=pre.rad*2.15)||pd0<22||tk.lock==='hold';
  const grace=(S.refuelSafe||0)>2&&tk.lock!=='hold'&&tk.lock!=='arm';
  if(tk.lock==='hold'&&Math.hypot(inp.x,inp.y)>.88) tk._leave=(tk._leave||0)+Math.max(dt,.016); else tk._leave=Math.max(0,(tk._leave||0)-Math.max(dt,.016));
  const hard=tk.lock==='hold'?(tk._leave||0)>.7:Math.hypot(inp.x,inp.y)>.92;
  if(zone&&!hard&&!grace&&Math.hypot(S.pos.x-bx,S.pos.y-by,S.pos.z-bz)<120){
   const tx=S.pos.x+(bx-tip.x), ty=S.pos.y+(by-tip.y), tz=S.pos.z+(bz-tip.z);
   const k=1-Math.exp(-Math.max(dt,.016)/(tk.lock==='hold'?.7:1.25));
   let mx=tx-S.pos.x, my=ty-S.pos.y, mz=tz-S.pos.z; const ml=Math.hypot(mx,my,mz)||1; const step=Math.min(ml*k, tk.lock==='hold'?.55:.4);
   S.pos.x+=mx/ml*step; S.pos.y+=my/ml*step; S.pos.z+=mz/ml*step;
   S.roll*=1-k; S.pitch*=1-k;
   const dyaw=Math.atan2(Math.sin((yaw||0)-S.yaw),Math.cos((yaw||0)-S.yaw));
   S.yaw+=dyaw*k*.65; tk.spd=playerSpd;
  }
 }
 let dx=S.pos.x-bx, dy=S.pos.y-by, dz=S.pos.z-bz, dist=Math.hypot(dx,dy,dz);
 along=(S.pos.x-x)*fx+(S.pos.z-tk.z)*fz;
 const ship=Math.hypot(S.pos.x-x,S.pos.y-y,S.pos.z-tk.z);
 if(!tk.called){tk.called=1; tk.t0=S.t; tk.shout=S.t; if(!S.fuelDone){radio('Tanker ahead, join up'); msg('TANKER AHEAD — JOIN UP')}}
 else if(!S.fuelDone&&!tk.contact&&!tk.rejoin&&S.t-(tk.shout||-10)>6){tk.shout=S.t; msg('TANKER AHEAD — JOIN UP  '+(ship/1000).toFixed(1)+' KM')}
 const inst=tk._pd==null?0:(tk._pd-dist)/Math.max(dt,.016); tk._pd=dist;
 tk.rate=tk.rate==null?inst:tk.rate+(inst-tk.rate)*(1-Math.exp(-3.2*Math.max(dt,.016)));
 const closing=tk.rate;
 tk.cue=closing>8?'FAST':closing<-8?'SLOW':'STABLE';
 tk.dist=dist; tk.dy=dy; tk.closing=closing; tk.along=along; tk.ship=ship; tk.ahead=(bx-S.pos.x)*fx+(bz-S.pos.z)*fz;
 aimTankerCam();
 const view=tankerScreen(); tk.view=view;
 const tipNow=probeTipWorld(); const pd=Math.hypot(tipNow.x-bx,tipNow.y-by,tipNow.z-bz);
 const capture=!!(view&&view.cs&&view.fp&&view.sep<=view.rad*2.15)||pd<22;
 const relx=S.pos.x-bx, relz=S.pos.z-bz, fore=relx*aftX+relz*aftZ, side=relx*(-aftZ)+relz*aftX;
 let mode='HOLD';
 if(Math.abs(side)>Math.abs(dy)&&Math.abs(side)>Math.abs(fore)&&Math.abs(side)>8) mode=side>0?'RIGHT':'LEFT';
 else if(Math.abs(dy)>Math.abs(fore)&&Math.abs(dy)>6) mode=dy>0?'DOWN':'UP';
 else if(Math.abs(fore)>8) mode=fore>0?'FWD':'AFT';
 tk.dir=mode; tk.dy=dy; tk.fore=fore; tk.side=side;
 if(tk.lock==='hold'){
  setDirLights(pd<14&&mode==='HOLD'?'HOLD':(mode==='LEFT'||mode==='RIGHT'?'OFF':mode));
  const flown=dist>90||pd>24||(tk._leave||0)>1.1;
  const snug=pd<14;
  if(!flown){
    tk.outT=0; tk.contact=1; tk.flow=snug?1:0.5; tk.why=''; tk.fuel=Math.min(1,(tk.fuel||0)+(dt/13)*tk.flow); fuelRumble();
    fuelGlow.visible=true; fuelGlow.material.opacity=.05; fuelGlow.position.set(bx+(podPoint().x-bx)*.45, by+(podPoint().y-by)*.45, bz+(podPoint().z-bz)*.45); fuelGlow.scale.setScalar(1.15);
    fuelMist.visible=false;
    if(tk.fuel>=1){S.fuelDone=1; S.refuelSafe=8; S.calmLeft=8; tk.lock='done'; tk.fullAt=S.t; tk.hideAt=S.t+3.6; tk.flow=0; tk.breakSide=0; const _rp=podPoint(); tk.reelFrom={x:bx-_rp.x,y:by-_rp.y,z:bz-_rp.z}; if(practice!=='tanker')rememberTanker(); S.score=(S.score||0)+4000; fuelClunk(); S.shake=Math.max(S.shake,.06); hideFuelFx(); setDirLights('HOLD'); msg('TANK FULL'); S.msgT=2.4}
  } else {
    tk.flow=Math.max(0,(tk.flow||0)-dt*.5); tk.contact=1; hideFuelFx(); tk.outT=(tk.outT||0)+(rdt||dt);
    if(tk.outT>1&&flown){releaseContact(tk); fuelClunk(); S.shake=Math.max(S.shake,.06); setDirLights(''); msg('DISCONNECT')}
  }
 } else {
  hideFuelFx(); setDirLights(capture?mode:'');
  const near=capture&&dist<130;
  tk.why=near?'HOLD STEADY':'CLOSER';
  if(near){ tk.miss=0; tk.lockT=(tk.lockT||0)+(rdt||dt); tk.lock='arm'; if(tk.lockT>=.75){tk.lock='hold'; tk.contact=1; tk.outT=0; tk.wave=1; tk.why=''; fuelClunk(); S.shake=Math.max(S.shake,.04); msg('CONTACT'); S.msgT=1.6} }
  else { tk.miss=(tk.miss||0)+(rdt||dt); if(tk.miss>1) tk.lockT=Math.max(0,(tk.lockT||0)-(rdt||dt)*.35); if((tk.lockT||0)<=0) tk.lock=''; }
 }
 refreshCalm(0);
}
function tankerAiming(){const tk=S&&S.tanker; if(!(S&&!S.dead&&S.phase==='ingress'&&!S.fuelFail&&!S.cine&&tk&&tk.basket&&tankerMesh&&tankerMesh.visible))return false; if(tk.lock==='hold'||tk.lock==='arm'||tk.lock==='done')return true; const d=tk.dist!=null?tk.dist:1e9; if(S.fuelDone&&d>380)return false; return true}
function probePoint(){return probeTipWorld()}
function tankerScreen(){const tk=S&&S.tanker, b=tk&&tk.basket; if(!b)return null;
 const cs=scr(b); const yaw=tk.yaw||0, rx=Math.cos(yaw), rz=-Math.sin(yaw);
 const edge=scr({x:b.x+rx*2.15,y:b.y,z:b.z+rz*2.15});
 const viewW=W||innerWidth, viewH=Hh||innerHeight;
 let rad=cs&&edge?Math.hypot(edge.x-cs.x,edge.y-cs.y):42; rad=clamp(rad,26,Math.min(viewW,viewH)*.42);
 const fp=scr(probePoint());
 const sep=cs&&fp?Math.hypot(fp.x-cs.x,fp.y-cs.y):1e9;
 return {cs,fp,rad,sep,dpr,W:viewW,H:viewH}}
const _chasePts=[0,1,2,3,4,5].map(()=>new THREE.Vector3()), _chaseLook=new THREE.Vector3(), _chaseTry=new THREE.Vector3(), _chaseTmp=new THREE.Vector3();
function fillJetPts(){const span=(jet.userData&&jet.userData.span)||11, jh=(jet.userData&&jet.userData.jetH)||3.2;
 const loc=[[0,.35,-8],[0,.15,7],[-span*.5,.1,.4],[span*.5,.1,.4],[0,jh*.55,-1.2],[0,-1.15,1]];
 jet.position.copy(S.pos); jet.rotation.set(S.pitch||0,S.yaw||0,S.roll||0); jet.updateMatrixWorld(true);
 for(let i=0;i<6;i++){_chaseTmp.set(loc[i][0],loc[i][1],loc[i][2]); jet.localToWorld(_chaseTmp); _chasePts[i].copy(_chaseTmp)}}
function jetInFrame(centered){cam.updateMatrixWorld(true); let sx=0,n=0; for(let i=0;i<_chasePts.length;i++){_chaseTmp.copy(_chasePts[i]).project(cam); if(_chaseTmp.z>1||Math.abs(_chaseTmp.x)>.82||_chaseTmp.y>.40||_chaseTmp.y<-.86)return false; if(i!==2&&i!==3){sx+=_chaseTmp.x; n++}} return !centered||Math.abs(sx/Math.max(1,n))<.18}
function placeChaseCam(){if(!S)return; const span=(jet.userData&&jet.userData.span)||11, jh=(jet.userData&&jet.userData.jetH)||3.2, roll=Math.abs(S.roll||0);
 const vFov=cam.fov*Math.PI/180, aspect=Math.max(.42,cam.aspect||1), hFov=2*Math.atan(Math.tan(vFov*.5)*aspect);
 const halfW=span*.5*Math.abs(Math.cos(roll))+jh*Math.abs(Math.sin(roll))+1.8;
 const halfH=span*.5*Math.abs(Math.sin(roll))+jh*Math.abs(Math.cos(roll))+1.6;
 let dist=Math.max(22, halfW/(Math.tan(hFov*.5)*.70), halfH/(Math.tan(vFov*.5)*.36));
 const yaw=S.yaw||0, sx=Math.sin(yaw), cx=Math.cos(yaw); fillJetPts();
 let basket=null; const tk=S.tanker;
 if(tk&&tk.basket&&tankerMesh&&tankerMesh.visible&&!S.fuelDone&&S.phase==='ingress'&&!S.cine){const b=tk.basket,d=Math.hypot(b.x-S.pos.x,b.y-S.pos.y,b.z-S.pos.z); if(d<2400)basket=b}
 function seat(d,bias){cam.position.set(S.pos.x+sx*d,S.pos.y+d*.32,S.pos.z+cx*d); const lift=Math.tan(vFov*.16)*d; _chaseLook.set(S.pos.x-sx*5,S.pos.y+lift,S.pos.z-cx*5);
  if(basket&&bias>0){_chaseTry.set(basket.x,basket.y,basket.z); _chaseLook.lerp(_chaseTry,bias)} cam.up.set(0,1,0); cam.lookAt(_chaseLook)}
 seat(dist,0); for(let n=0;n<5&&!jetInFrame();n++){dist*=1.16; seat(dist,0)}
 if(basket){let lo=0,hi=.7,best=0; for(let i=0;i<7;i++){const mid=(lo+hi)*.5; seat(dist,mid); if(jetInFrame(true)){best=mid; lo=mid}else hi=mid} seat(dist,best)}}
function aimTankerCam(){placeChaseCam(); return true}
window.__jetBox=()=>{placeChaseCam(); cam.updateMatrixWorld(true); return _chasePts.map(p=>{const q=_chaseTmp.copy(p).project(cam); return {x:+q.x.toFixed(3),y:+q.y.toFixed(3)}})};
window.__tankerVis=()=>({vis:!!(tankerMesh&&tankerMesh.visible), far:+cam.far.toFixed(0), beacon:!!(tankerBeacon&&tankerBeacon.visible), fuelFail:!!(S&&S.fuelFail), fuelDone:!!(S&&S.fuelDone), z:tankerMesh?Math.round(tankerMesh.position.z):null});
function placeTankerBeacon(){const show=!!(S&&!takingOff()&&!S.fuelDone&&tankerMesh&&tankerMesh.visible); tankerBeacon.visible=show; if(!show)return;
 const dist=Math.max(1,cam.position.distanceTo(tankerMesh.position)); if(dist<1400){tankerBeacon.visible=false; return}
 const dir=_chaseTmp.copy(tankerMesh.position).sub(cam.position); const hold=Math.min(dist,10800);
 tankerBeacon.position.copy(cam.position).addScaledVector(dir.normalize(), hold);
 const px=dist>2500?42:28, world=hold*Math.tan((cam.fov*Math.PI/180)*.5)*(px/Math.max(320,Hh||800))*2;
 tankerBeacon.scale.set(world,world,1)}
function drawBasketArrow(p,cx,cy,col){const s=scr(p); const on=s&&s.x>30&&s.x<W-30&&s.y>30&&s.y<Hh-30;
 if(on){hx.fillStyle=col; hx.beginPath(); hx.moveTo(s.x,s.y-6); hx.lineTo(s.x-16,s.y-34); hx.lineTo(s.x+16,s.y-34); hx.closePath(); hx.fill(); return s}
 V.copy(p).applyMatrix4(cam.matrixWorldInverse); let dx=V.x,dy=-V.y; if(V.z>0){dx=V.x; dy=Math.abs(V.y)+Math.abs(V.x)*.2+1}
 const n=Math.hypot(dx,dy)||1; dx/=n; dy/=n; const k=Math.min((W/2-36)/Math.abs(dx||1e-3),(Hh/2-36)/Math.abs(dy||1e-3));
 const ax=cx+dx*k, ay=cy+dy*k; hx.fillStyle=col; hx.beginPath(); hx.moveTo(ax+dx*30,ay+dy*30); hx.lineTo(ax-dy*14,ay+dx*14); hx.lineTo(ax+dy*14,ay-dx*14); hx.closePath(); hx.fill(); return null}
function scrClamp(p){V.copy(p).project(cam); if(!isFinite(V.x)||!isFinite(V.y))return {x:W*.5,y:Hh*.5,off:true}; let x=V.x,y=V.y; if(V.z>1){x=-x; y=-y} const m=Math.max(Math.abs(x),Math.abs(y),1e-4); const lim=.9; const off=V.z>1||m>lim; if(off){x=x/m*lim; y=y/m*lim} return {x:(x*.5+.5)*(W||innerWidth), y:(-y*.5+.5)*(Hh||innerHeight), off}}
function easeScreen(slot,x,y){const tk=S&&S.tanker; if(!tk)return {x,y}; const now=performance.now()/1000; let s=tk[slot]; if(!s){s=tk[slot]={x,y,t:now}; return s} const dt=Math.min(.05,Math.max(0,now-(s.t||now))); s.t=now; const a=1-Math.exp(-dt/.1); s.x+=(x-s.x)*a; s.y+=(y-s.y)*a; return s}
function drawProbeDot(fp){if(!fp)return; hx.save(); hx.shadowBlur=0; hx.globalAlpha=1; hx.beginPath(); hx.arc(fp.x,fp.y,13,0,7); hx.fillStyle='rgba(0,0,0,.9)'; hx.fill(); hx.beginPath(); hx.arc(fp.x,fp.y,7,0,7); hx.fillStyle='#ffe14a'; hx.fill(); hx.lineWidth=2; hx.strokeStyle='#1a1204'; hx.stroke(); hx.restore()}
function drawTankerAim(cx,cy){const tk=S.tanker, b=tk.basket; const dist=tk.dist!=null?tk.dist:Math.hypot(b.x-S.pos.x,b.y-S.pos.y,b.z-S.pos.z);
 const view=tankerScreen()||tk.view;
 hx.shadowColor='rgba(0,0,0,.85)'; hx.shadowBlur=3; hx.lineWidth=2;
 const hot=tk.lock==='hold'||tk.lock==='done'||tk.lock==='arm';
 const col=hot?'rgba(130,240,160,1)':(view&&view.sep<=view.rad*2.1?'rgba(150,230,140,1)':'rgba(255,186,70,1)');
 if(tk.lock==='hold'||tk.lock==='done'||tk.contact)drawFuelGauge(cx,tk);
 const label=tk.lock==='done'?'TANK FULL':tk.lock==='hold'?'CONTACT':(tk.why||'CLOSER');
 if(label)txtFit(label,cx,Math.max(58,Math.min(72,Hh*.1)),Math.max(20,Math.round(Math.min(W,Hh)*.045)),'center',tk.lock==='hold'||tk.flow?'#d8ffe4':'#ffe1a8');
 if(dist>80&&label==='CLOSER')txtFit((dist/1000).toFixed(1)+' KM',cx,Math.max(108,Hh*.18),Math.max(16,Math.round(Math.min(W,Hh)*.038)),'center','#ffe7b8');
 hx.shadowBlur=0;
 const cs=view&&view.cs; const rad=view?view.rad:42;
 const ring=cs?easeScreen('_ring',cs.x,cs.y):null;
 const on=ring&&ring.x>18&&ring.x<W-18&&ring.y>18&&ring.y<Hh-18;
 if(on){hx.strokeStyle='rgba(0,0,0,.8)'; hx.lineWidth=8; hx.beginPath(); hx.arc(ring.x,ring.y,rad,0,7); hx.stroke(); hx.strokeStyle=col; hx.lineWidth=5; hx.beginPath(); hx.arc(ring.x,ring.y,rad,0,7); hx.stroke()}
 else drawBasketArrow(b,cx,cy,col);
 const raw=scrClamp(probePoint()); drawProbeDot(easeScreen('_dot',raw.x,raw.y));}
function update(rdt){
 if(S.to&&S.to.fade>0){S.to.fade-=rdt;if(S.to.fade<=0){S.to.fade=0;const f=$('tofade');if(f)f.classList.remove('on')}}
 if(takingOff()){updateTakeoff(rdt);mixFlightAudio(rdt);return}
 let target=1;if(S.phase==='bombfall')target=.45;if(S.bomb&&S.bomb.tti<1.8)target=.25;if(S.phase==='penetrate')target=.5;if(S.boomT>=0&&S.boomT<1.5)target=.5;if(S.teachT>0)target=.55;if((S.gridSlow||0)>0)target=Math.min(target,.32);
 S.cine=S.phase==='bombfall'||S.phase==='penetrate'||(S.boomT>=0&&S.boomT<8); S.safe=!!(S.cine||(S.graceHold||0)>0); if(!S.cine&&(S.graceHold||0)>0)S.graceHold-=rdt; if(S.phase==='ingress'&&!S.cine&&!takingOff()&&!S.fuelDone&&!S.fuelFail&&!S.tanker)S.tanker={z:TANKER_Z,fuel:0,fails:0,called:0,contact:0,t0:0,fast:0,shout:-10,spd:220,rejoin:0,ship:0,lock:'',lockT:0}; refreshCalm(rdt); S.gridSafe=!!(S.gridOn&&S.grids&&(practice==='grid'||(S.boomT>8&&!(S.bandit&&!S.bandit.dead)))&&S.grids.some(g=>!g.done)); S.ts=lerp(S.ts,target,clamp(rdt*6,0,1));const dt=rdt*S.ts;S.t+=rdt;
 const tkNear=S.tanker&&S.tanker.basket&&!S.fuelDone&&S.phase==='ingress'&&Math.hypot(S.pos.x-S.tanker.basket.x,S.pos.y-S.tanker.basket.y,S.pos.z-S.tanker.basket.z)<60;
 const sens=tkNear?(S.tanker.lock==='arm'||S.tanker.lock==='hold'?.18:.34):1;
 const tR=S.cine?0:S.brk>0?-S.brkDir*78*D2R:-inp.x*45*D2R*sens,tP=S.cine?0:-inp.y*30*D2R*sens;
 const released=!steer&&!(S.brk>0)&&!S.cine;
 const rk=tkNear?3.2:(released?50:8.5), pk=tkNear?3.2:(released?50:7.5);
 const rs=tkNear?(1-Math.exp(-5*rdt)):clamp(rdt*rk,0,1), ps=tkNear?(1-Math.exp(-5*rdt)):clamp(rdt*pk,0,1);
 S.roll+=(tR-S.roll)*rs;S.pitch+=(tP-S.pitch)*ps;S.yaw+=S.roll*.75*dt*((S.reattack&&S.pos.y>1100)?1.45:1);
 const spd=85+S.thr*195;fwd.set(-Math.sin(S.yaw)*Math.cos(S.pitch),Math.sin(S.pitch),-Math.cos(S.yaw)*Math.cos(S.pitch));S.pos.addScaledVector(fwd,spd*dt);S.pos.y=Math.min(S.pos.y,3600);
 if(S.descendCue&&(S.pos.y<980||S.pos.z<180))S.descendCue=0;
 S.gunCD=Math.max(0,S.gunCD-rdt);S.gunSnd=Math.max(0,S.gunSnd-rdt);if(gunDown&&!S.cine)fireCannon();
 if(window.__holdAgl!=null&&!S.dead){S.thr=1; S.pitch=0; S.roll=0; S.pos.y=groundY(S.pos.x,S.pos.z)+window.__holdAgl}
 {const gy=groundY(S.pos.x,S.pos.z), ny=groundY(S.pos.x+fwd.x*14,S.pos.z+fwd.z*14); const floor=Math.max(gy,ny); S.ground=floor; S.hAnalytic=H(S.pos.x,S.pos.z);
  if(S.cine)S.pos.y=Math.max(S.pos.y,floor+70);
  const agl=S.pos.y-floor; S.agl=agl; S.spd=spd;
  if((S.refuelSafe||0)>0)S.refuelSafe=Math.max(0,S.refuelSafe-rdt);
  if(agl<40&&(S.refuelSafe||0)>0)S.pos.y=Math.max(S.pos.y,floor+80);
  if(tankerMesh&&tankerMesh.visible&&!S.dead){const yawT=tankerMesh.rotation.y, dx=S.pos.x-tankerMesh.position.x, dz=S.pos.z-tankerMesh.position.z, along=dx*Math.sin(yawT)+dz*Math.cos(yawT), side=dx*Math.cos(yawT)-dz*Math.sin(yawT); const body=Math.abs(along)<62&&Math.abs(side)<14&&Math.abs(S.pos.y-tankerMesh.position.y)<10; if(body){ if((S.refuelSafe||0)>0||(S.tanker&&(S.tanker.lock==='hold'||S.tanker.lock==='done'||S.tanker.lock==='arm'))){S.pos.x+=Math.sin(yawT)*12; S.pos.z+=Math.cos(yawT)*12; S.pos.y-=3} else die('COLLIDED WITH TANKER','FUSELAGE') }}
  if(agl<1.6){ if(S.reattack&&S.pitch>-0.05){S.pos.y=Math.max(S.pos.y,floor+40); if(S.pitch<0.1)S.pitch=0.1; if(!S._climb||S.t-S._climb>2.4){S._climb=S.t; msg('CLIMB — TURN')}} else if(S.safe||(S.refuelSafe||0)>0){S.pos.y=floor+80; if(!S._pull||S.t-S._pull>2.5){S._pull=S.t; msg('PULL UP')}} else return die('TERRAIN','AGL '+Math.max(0,agl).toFixed(1)+' M · GROUND '+Math.round(floor)+' · HEIGHT FIELD '+Math.round(S.hAnalytic)) } }
 if(!S.dead&&bunker.visible&&!S.bomb&&(S.phase==='ingress'||S.phase==='release')&&S.fuelDone&&S.pos.z<BZ-700){if(!S.reattack){S.reattack=1; msg('RE-ATTACK'); S.msgT=2.6}}
 updHug(dt,rdt);
 if(lockDown&&!S.locked&&S.phase==='ingress'){if(canLock()){S.lockT=(S.lockT||0)+rdt; if(S.lockT>=0.4)grantLock()} else if(bDist()<350||bDist()>4500)S.lockT=0} else if(!S.locked) S.lockT=0;
 if(S.locked){const ld=bDist(); if(ld<280||ld>4800||S.phase==='egress'||S.phase==='done'||S.bomb){S.locked=false; S.lockT=0; if(S.phase==='release')S.phase='ingress'; msg('LOCK LOST')}}
 updIron(rdt);
 const b=S.bomb;if(b){b.age=(b.age||0)+rdt; if(!b.prev)b.prev=new THREE.Vector3(); b.prev.copy(b.p); const step=b.guided?rdt:dt; if(b.guided)guideBomb(b,step); else bombAccel(b.v,step);
  _bombNext.copy(b.p).addScaledVector(b.v,step); const hit=bombCast(b.prev,_bombNext); if(hit)b.p.copy(hit.p); else b.p.copy(_bombNext);
  bomb.position.copy(b.p); if(b.v.lengthSq()>1)bomb.lookAt(tmp.copy(b.p).add(b.v));
  const gy=groundY(b.p.x,b.p.z), drop=b.p.y-gy; b.tti=b.v.y<-1?Math.max(0,drop/-b.v.y):Math.max(0,drop/40);
  const near=Math.hypot(b.p.x-BUNK.x,b.p.z-BUNK.z);
  if(b.guided&&(near<36||(hit&&(hit.onBunk||hit.p.distanceTo(BUNK)<=BOMB_BLAST))))bombStrike(b.p);
  else if(b.guided&&b.age>20)bombStrike(BUNK);
  else if(!b.guided&&b.age>18)bombMiss(b.p);
  else if(hit&&!b.guided){if(hit.onBunk||hit.p.distanceTo(BUNK)<=BOMB_BLAST)bombStrike(hit.p);else bombMiss(hit.p)}
  else if(hit&&b.guided){b.p.copy(hit.p); b.p.y+=18; b.v.y=Math.max(55, Math.abs(b.v.y))}}
 if(S.phase==='penetrate'){S.penT+=rdt;const k=sstep(.5,1.6,S.penT);bulge.scale.set(46+k*8,.1+k*9,40+k*8);S.shake=Math.max(S.shake,k*.25);if(Math.random()<.3)spr(tmp.copy(BUNK).add(new THREE.Vector3(rnd(40),2,rnd(40))),0x8a7d6a,10,2,new THREE.Vector3(0,6,0),{grow:10,o:.6});if(S.penT>1.6)bigBoom()}
 if(S.boomT>=0){S.boomT+=dt;const t=S.boomT;dome.scale.set(60+t*900,(60+t*900)*.55,60+t*900);dome.material.opacity=Math.max(0,.2-t*.11);if(t>1.8)dome.visible=false;
  while(S.sec.length&&t>S.sec[0]){S.sec.shift();const bp=tmp.copy(BUNK).add(new THREE.Vector3(rnd(90),0,rnd(90)));fire(bp,1.1);if(!bunkerLayered()&&!heavy('sub01',.5,.85+Math.random()*.15))boomSfx(false,bp)}}
 updNuke(dt,rdt);
 for(const d of debris){if(d.v.lengthSq()===0)continue;d.v.y-=30*dt;d.m.position.addScaledVector(d.v,dt);d.m.rotation.x+=d.r.x*dt;d.m.rotation.y+=d.r.y*dt;const gy=H(d.m.position.x,d.m.position.z);if(d.m.position.y<gy){d.m.position.y=gy;d.v.set(0,0,0);if(Math.random()<.4)spr(d.m.position,0x7a6e60,8,2,null,{grow:8,o:.6})}else if(Math.random()<.15)spr(d.m.position,0x2a2622,4,1.5,null,{grow:5,o:.5})}
 if(S.egressLaunch&&S.boomT>7&&!S.missile){S.egressLaunch=false}
 if(S.gridArm&&S.boomT>2.4&&!S.gridOn)activateGrid();
 if((S.gridShot||0)>0)S.gridShot-=rdt; if((S.gridSlow||0)>0)S.gridSlow-=rdt;
 const th=updSites(dt);S.th=th; if(S._broke){S._broke=0; msg('LOCK BROKEN — TERRAIN')}
 if(!S.cine){S.beamT-=rdt;if(S.beamT<=0){S.beamT=.22;for(let i=0;i<SITES.length;i++){const s=S.sites[i];if(!s.warned||s.dead||s.st!=='track')continue;const P=SITES[i].p;spr(new THREE.Vector3(P.x,P.y+8,P.z),0xff6040,18,.32,null,{add:true,tex:glowTex,fog:false,grow:12,must:1});const dir=new THREE.Vector3(S.pos.x-P.x,S.pos.y-(P.y+12),S.pos.z-P.z).normalize().multiplyScalar(90);spr(new THREE.Vector3(P.x,P.y+12,P.z),0xffc080,7,.28,dir,{add:true,tex:glowTex,fog:false,must:1})}}}
 if(!S.cine&&!S.calm&&!S.gridSafe&&!reattackTurn()&&bunker.visible&&bDist()<6500){S.aaaT-=dt;if(S.aaaT<=0){S.aaaT=.09;for(const ox of[-60,55]){const o=tmp.copy(BUNK).add(new THREE.Vector3(ox,4,ox*.5));const aim=new THREE.Vector3().copy(S.pos).add(new THREE.Vector3(rnd(260),120+Math.random()*260,rnd(260))).sub(o).normalize().multiplyScalar(650);spr(o,0xffb050,2.6,2.2,aim,{add:true,tex:glowTex,fog:false,g:25})}}}
 const m=S.missile;if(m&&(S.calm||S.gridSafe)){try{mslAudioStop(m)}catch(e){} S.missile=null; msl.visible=false; mslG.visible=false} else if(m){m.life-=dt;if(!m.decoy&&!m.lost){if(los(tmp.copy(SITES[m.site].p).setY(SITES[m.site].p.y+12),S.pos))m.blind=0;else{m.blind+=dt;if(m.blind>2.2){m.lost=true;msg('MISSILE TERRAIN-MASKED')}}}
  let tgt;if(m.lost){tgt=tmp.copy(m.p).addScaledVector(m.v,1).setY(m.p.y-20)}else if(m.decoy){m.decoy.addScaledVector(m.decoyV,dt);m.decoyV.y-=10*dt;tgt=m.decoy;m.dt-=dt}else{tgt=tmp.copy(S.pos).addScaledVector(fwd,spd*.6);const dd=m.p.distanceTo(S.pos);if(dd<1900){m.cs=(m.cs||0)+dt*5.5;const sd=new THREE.Vector3(-m.v.z,0,m.v.x).normalize();tgt.addScaledVector(sd,Math.sin(m.cs)*dd*.09);tgt.y+=Math.cos(m.cs)*dd*.07}}
  const gentle=S.samShots<=1,sp=Math.min(gentle?300:420,m.v.length()+160*dt),dir=m.v.clone().normalize(),want=tgt.clone().sub(m.p).normalize();dir.lerp(want,clamp(dt*(m.p.distanceTo(S.pos)<900?(gentle?2.4:3.4):(gentle?1.5:2)),0,1)).normalize();m.v.copy(dir).multiplyScalar(sp);const r0=m.p.clone().sub(S.pos);m.p.addScaledVector(m.v,dt);{const r1=m.p.clone().sub(S.pos),dd=r1.clone().sub(r0),L=dd.lengthSq();const t=L>0?clamp(-r0.dot(dd)/L,0,1):1;m.cpa=r0.addScaledVector(dd,t).length()}
  msl.position.copy(m.p);msl.lookAt(tmp.copy(m.p).add(m.v));m.tr=(m.tr||0)+dt;const boost=m.life>17;{const dj=m.p.distanceTo(S.pos);mslG.visible=true;mslG.position.copy(m.p);mslG.scale.setScalar((boost?72:48)*(1+.12*Math.sin(S.t*40))*Math.max(1,dj/1800));}if(m.tr>(MOB?.05:.035)){m.tr=0;spr(m.p,boost?0xf2eee6:0xe0dbd2,boost?11:8,boost?11:8,new THREE.Vector3(rnd(2),rnd(2),rnd(2)),{grow:boost?8:6,o:.75,drag:.3,must:1})}spr(m.p,0xffd090,boost?7:3,.12,null,{add:true,tex:glowTex,fog:false});
  mslAudioUpd(m,dt);{const dj=m.p.distanceTo(S.pos);if(!m.ws&&dj<260&&(m.decoy||m.lost)){m.ws=1; if(!useSnd('pass',m.p)){whoosh();passBy(m.p)} S.shake=Math.max(S.shake,.25)}}
  if(!m.decoy&&!m.lost&&threatBehind(m.p)){m._sixT=(m._sixT||0)+dt; warnSix('SAM')}
  if(!m.decoy&&!m.lost&&Math.min(m.cpa??1e9,m.p.distanceTo(S.pos))<75){ if(S.safe){m.lost=true; msg('GRACE — SAM LOST')} else if(threatBehind(m.p)&&(m._sixT||0)<1.5){m.p.addScaledVector(fwd,-40)} else {mslAudioStop(m);S.missile=null;msl.visible=false;mslG.visible=false;S.sites[m.site].next=S.t+4;nightKick(.16);$('flash').style.transition='none';$('flash').style.background='#ffb070';$('flash').style.opacity=NIGHT_ON?.22:.85;setTimeout(()=>{$('flash').style.transition='opacity 1.4s';$('flash').style.opacity=0},NIGHT_ON?160:90);if(!useSnd('boom',S.pos)){src(SB.sub08,.8,AC.bigB,{pri:1,fadeIn:.008,tag:'heavy:sub08'});if(SB.hitsub)src(SB.hitsub,.85,AC.bigB,{pri:1,fadeIn:.008,tag:'heavy:hitsub'});if(AC){if(SB.impact)src(SB.impact,.9,AC.bigB,{pri:1,fadeIn:.008,tag:'heavy:impact'});else thud(AC.bigB,.9,55,22,1.6); }}S.shake=1;;S.hp--;if(S.hp>0){fire(tmp.copy(S.pos).addScaledVector(fwd,-30),.35);msg('HIT! AIRFRAME DAMAGED — ONE MORE HIT IS FATAL');S.dmgT=3;return}fire(S.pos,.9);return die('SAM', threatBehind(m.p)?'SIX O\'CLOCK':'')}}
  if(m.p.y<H(m.p.x,m.p.z)||m.life<=0||(m.decoy&&m.dt<=0)){const pd=m.p.distanceTo(S.pos);fire(m.p,m.decoy?.45:.25);if(m.decoy){spr(m.p,0xfff0d0,90,.35,null,{add:true,tex:glowTex,fog:false,grow:120,must:1});for(let k=0;k<30;k++)spr(m.p,0xffc080,3,1.4,new THREE.Vector3(rnd(160),rnd(160),rnd(160)),{add:true,tex:glowTex,g:20,fog:false,must:1});if(pd<1200){S.shake=Math.max(S.shake,.2+.5*(1-pd/1200));heavy('sub08',.45*(1-pd/1500),1.35)}}boomSfx(false,m.p);if(AC&&pd<4000){psrc('hitsub',.4,m.p,true,{ref:280,rate:.95,pri:1,fadeIn:.008,tag:'psrc:hitsub'});if(!psrc('impact',.4,m.p,true,{ref:250,rate:.9,pri:1,fadeIn:.008,tag:'psrc:impact'})){const pn=mkPan(true,150);setP0(pn,m.p);pn.connect(AC.out);thud(pn,.85,55,24,1.3);setTimeout(()=>{if(pn._hrtf){hrtfN=Math.max(0,hrtfN-1);pn._hrtf=0} try{pn.disconnect()}catch(e){}},1800)}}mslAudioStop(m);S.sites[m.site].next=S.t+2.5;S.missile=null;msl.visible=false;mslG.visible=false;if(!S.dead&&!m.def){S.defeated++;msg(m.lost?'MISSILE LOST — TERRAIN MASK':'MISSILE DEFEATED')}}}
 updRounds(rdt);
 S.brk=Math.max(0,S.brk-rdt);S.brkCD=Math.max(0,S.brkCD-rdt);S.ecm=Math.max(0,S.ecm-rdt);S.ecmCD=Math.max(0,S.ecmCD-rdt);S.teachT=Math.max(0,S.teachT-rdt);S.dmgT=Math.max(0,(S.dmgT||0)-rdt);
 S.exT=(S.exT||0)-rdt;if(!S.cine&&S.exT<=0){S.exT=MOB?.07:.045;const thr=S.thr,sz=1.5+thr*5,life=1.2+thr*2.2,op=.25+thr*.45;spr(tmp.copy(S.pos).addScaledVector(fwd,-8-thr*4),0x3a3732,sz,life,new THREE.Vector3(rnd(2+thr*3),1+thr*2,rnd(2+thr*3)),{grow:4+thr*10,o:op,drag:.4,must:thr>.55});if(thr>.75&&Math.random()<.4)spr(tmp.copy(S.pos).addScaledVector(fwd,-7),0xffa060,2+thr*2,.18,null,{add:true,tex:glowTex,fog:false})}
 if(S.hp<2){S.smT-=rdt;if(S.smT<=0){S.smT=MOB?.09:.05;spr(tmp.copy(S.pos).addScaledVector(fwd,-9),0x2a2724,4,3,new THREE.Vector3(rnd(4),2,rnd(4)),{grow:8,o:.75,must:1});if(Math.random()<.35)spr(tmp.copy(S.pos).addScaledVector(fwd,-8),0xff8a40,2.8,.28,null,{add:true,tex:glowTex,fog:false})}}
 if(!S.cine&&!S.calm&&!S.gridSafe&&!reattackTurn()&&bunker.visible&&bDist()<6500){S.aaaS-=rdt;if(S.aaaS<=0){S.aaaS=.7+Math.random()*.6;aaaBurst(tmp.copy(BUNK).add(new THREE.Vector3(Math.random()<.5?-60:55,4,0)).clone())}
  if(bDist()<4500){S.flakT-=rdt;if(S.flakT<=0){S.flakT=(MOB?1.6:1.2)+Math.random();const P=S.pos.clone().addScaledVector(fwd,150+Math.random()*350).add(new THREE.Vector3(rnd(220),40+Math.random()*160,rnd(220)));
   spr(P,0xfff0c0,30,.2,null,{add:true,tex:glowTex,fog:false,grow:80,must:1});for(let k=0;k<(MOB?4:7);k++)spr(P,0x1c1a18,14,3+Math.random()*2,new THREE.Vector3(rnd(14),rnd(10),rnd(14)),{grow:12,o:.85,drag:.6,must:1});flakBoom(P);const fd=P.distanceTo(S.pos);if(fd<260)S.shake=Math.max(S.shake,.5*(1-fd/260))}}}
 updParts(dt);S.flareCD=Math.max(0,S.flareCD-rdt);S.flareT=Math.max(0,(S.flareT||0)-rdt);if(S.msgT>0)S.msgT-=rdt;S.shake=Math.max(0,S.shake-rdt);radDish.rotation.y+=dt*.8;
 updBandit(rdt);
 updGrid(dt,rdt);
 if(S.phase==='egress'&&S.boomT>2&&S.pos.distanceTo(EXIT)<700){if(S.bandit&&!S.bandit.dead){if(!S._exHold){S._exHold=1;msg('BANDIT STILL UP — CANNOT EXFIL')}}else if(S.grids&&S.grids.some(g=>!g.done)){if(!S._exHold){S._exHold=1;msg('GRID STILL UP — THREAD THE GAP')}}else{S.phase='done';showEnd(true)}}
 if(S.pos.z<EXZ-900&&S.phase!=='egress'&&S.phase!=='done'&&!(S.reattack&&bunker.visible&&S.pos.y>1300&&S.pos.z>EXZ-3500))die('LEFT THE AO');
 if(S.phase==='ingress'&&!S.cine) updTanker(dt,rdt);
 if(NIGHT_ON){expPulse=Math.max(0,expPulse-rdt*.32); const nv=nvOn?1.35:1; R.toneMappingExposure=(nightBase||SCEN.exposure)*nv*(1+expPulse)*(MOB?.82/.88:1)} mixFlightAudio(rdt)}
function groundBurst(p){const q=p.clone(); q.y=Math.max(p.y, groundY(p.x,p.z)); fire(q,.45); boomSfx(false,q);
 for(let i=0;i<(MOB?8:14);i++)spr(q.clone(),0x9a8a72,16+Math.random()*22,1.6+Math.random()*1.4,new THREE.Vector3(rnd(14),6+Math.random()*16,rnd(14)),{grow:14,o:.82,drag:.25,fadeIn:.15,must:1});
 for(let i=0;i<10;i++)spr(q.clone(),0x5c564c,8+Math.random()*6,2.2,new THREE.Vector3(rnd(8),1+Math.random()*3,rnd(8)),{grow:6,o:.7,drag:.4,must:1})}
function bombCall(p){const dx=p.x-BUNK.x, dz=p.z-BUNK.z; if(Math.abs(dx)>80&&Math.abs(dx)>Math.abs(dz)*0.75)return 'MISS'; if(dz>40)return 'SHORT'; if(dz<-40)return 'LONG'; return 'MISS'}
function bombStrike(p){S.err=Math.hypot(p.x-BUNK.x,p.z-BUNK.z); S.bomb=null; bomb.visible=false; S.phase='penetrate'; S.penT=0; riser(false);
 if(!S.quiet)blip(90,.4,.4,'sine'); if(!S.quiet){if(bunkerLayered()){if(AC)thud(AC.out,.22,42,24,.3)}else{boomSfx(false,BUNK);heavy('sub08',.35,.9)}}
 bulge.position.copy(BUNK); bulge.visible=true; bulge.scale.set(46,.1,40);
 for(let i=0;i<22;i++)spr(BUNK,0x8f8270,16,3,new THREE.Vector3(rnd(22),18+Math.random()*35,rnd(22)),{grow:20,o:.85,must:1})}
function bombMiss(p){S.bomb=null; bomb.visible=false; S.bombSpent=0; S.locked=false; S.lockT=0; S.phase='ingress'; S.cine=false; S.cineA=null; S.quiet=0; S.reattack=1; groundBurst(p); S.msg='RE-ATTACK'; S.msgT=3.2}
const _pp=new THREE.Vector3(), _pv=new THREE.Vector3(), _pa=new THREE.Vector3();
function predictImpact(){if(!S||S.bomb||S.bombSpent||S.locked||S.dead||takingOff()||(S.phase!=='ingress'&&S.phase!=='release'))return null;
 _pp.copy(S.pos); _pp.y-=2; _pv.copy(fwd).multiplyScalar(Math.max(40,S.spd||0));
 for(let n=0;n<160;n++){_pa.copy(_pp); bombAccel(_pv,.08); _pp.addScaledVector(_pv,.08);
  if(_pp.y<H(_pp.x,_pp.z)+3){const hit=bombCast(_pa,_pp); return hit?hit.p:_pp.clone().setY(H(_pp.x,_pp.z))}}
 return null}
function release(){if(window.__ft)window.__ft.markRel();S.relHold=0;S._relT0=0; const guided=!!(S.locked&&S.phase==='release'); S.locked=false; S.lockT=0; S.phase='bombfall';
 const spd=Math.max(40,S.spd||(85+(S.thr||0)*195));
 S.bomb={p:S.pos.clone().add(new THREE.Vector3(0,-2,0)),v:fwd.clone().multiplyScalar(spd),tti:99,age:0,guided};bomb.visible=true;jet.visible=true;
 S.quiet=1; S.graceHold=8; S.safe=1; stopMood(true); riser(false); S.msg=guided?'GUIDED':'BOMB AWAY'; S.msgT=guided?2.4:1.4; paintRelease()}
function silenceScore(){stopMood(true); stopIntroMusic(); stopDeckAmbience(); try{stopBed()}catch(e){} stopWin(); riser(false); if(typeof endHandle!=='undefined'&&endHandle){try{endHandle.stop()}catch(e){} endHandle=null} try{if(JET){JET.stop(0.05); JET=null}}catch(e){} try{if(windBed){windBed.stop(); windBed=null}}catch(e){} try{if(AC&&AC.wind)stopLive(AC.wind.live)}catch(e){} try{if(AC&&AC.rumble)stopLive(AC.rumble.live)}catch(e){} try{gridHumSet(false)}catch(e){} if(!AC)return; const t=AC.currentTime; [AC.amb,AC.moodG,AC.mus,AC.introG,AC.wind&&AC.wind.g,AC.jet,AC.sub,AC.engB,AC.deckJetG,AC.deckRotorG,AC.rumble&&AC.rumble.g,eng&&eng.g,warnG,trkG,seekG].forEach(g=>{if(g&&g.gain){try{g.gain.cancelScheduledValues(t); g.gain.value=0}catch(e){}}})}
function showEnd(win){running=false;releaseControls();clearTimeout(endTimer);silenceScore();if(AC){const t=AC.currentTime;riser(false);AC.jet.gain.setTargetAtTime(0,t,.05);AC.amb.gain.setTargetAtTime(0,t,.05);try{stopBed()}catch(e){};eng.g.gain.setTargetAtTime(0,t,.05);warnG.gain.setTargetAtTime(0,t,.05);trkG.gain.setTargetAtTime(0,t,.05);AC.sub.gain.setTargetAtTime(0,t,.05);if(S.missile)mslAudioStop(S.missile);$('vig').style.opacity=0;$('teach').style.display='none';seekG.gain.setTargetAtTime(0,t,.05);
 }const prec=win?Math.round(clamp(100-S.err*5,0,100)):0,st=Math.round(clamp(100-S.detT/Math.max(1,S.t)*100-S.samShots*10,0,100)),tm=S.t;
 const stars=win?1+(prec>=80)+(st>=75&&tm<170):0;$('et').textContent=win?'MISSION COMPLETE // ESCAPED':'MISSION FAILED // KILLED BY: '+killText();$('es').textContent='★'.repeat(stars)+'☆'.repeat(3-stars);
 let hi=0,hs=0; try{hi=+localStorage.ds17e_hi||0; hs=+localStorage.ds17e_streak||0}catch(e){}
 const sc=Math.round(S.score||0), run=S.bestStreak||0; let fresh=false;
 if(sc>hi){hi=sc; fresh=true; try{localStorage.ds17e_hi=String(hi)}catch(e){}}
 if(run>hs){hs=run; try{localStorage.ds17e_streak=String(hs)}catch(e){}}
 $('etab').innerHTML=`<tr><td>PRECISION</td><td>${prec}%${win?` · CEP ${S.err.toFixed(1)} M`:''}</td></tr><tr><td>STEALTH</td><td>${st}%</td></tr><tr><td>TIME ON MISSION</td><td>${(tm/60|0)}:${String(tm%60|0).padStart(2,'0')}</td></tr><tr><td>SAMS DEFEATED</td><td>${S.defeated}</td></tr><tr><td>BANDIT</td><td>${S.bandit&&S.bandit.dead?'DESTROYED':S.bandit?'STILL UP':'—'} </td></tr><tr><td>SCORE</td><td>${sc}${fresh?' · HIGH':''}</td></tr><tr><td>BEST STREAK</td><td>${run} · RECORD ${hs}</td></tr><tr><td>HIGH SCORE</td><td>${hi}</td></tr><tr><td>FUEL</td><td>${S.fuelDone?'COMPLETE':S.fuelFail?'LOW':'—'}</td></tr><tr><td>GRID</td><td>${S.grids?S.grids.filter(g=>g.done).length+' / '+S.grids.length:'—'}</td></tr>${win?'':`<tr><td>KILLED BY</td><td>${killText()}</td></tr>`}`;
 $('end').classList.remove('hide')}
// ---------- render + HUD ----------
const hud=$('hud'),hx=hud.getContext('2d');let W=0,Hh=0,dpr=1;
function resize(){const vv=window.visualViewport; const scale=vv&&vv.scale?vv.scale:1; const w=(scale>1.02?innerWidth:(vv&&vv.width))||hud.clientWidth||innerWidth; const h=(scale>1.02?innerHeight:(vv&&vv.height))||hud.clientHeight||innerHeight; W=Math.max(2,w); Hh=Math.max(2,h); dpr=Math.min(devicePixelRatio||1,2); R.setSize(W,Hh,false); composer.setPixelRatio(PR*renderScale); composer.setSize(W,Hh); bloom.resolution.set(W/(MOB?4:2),Hh/(MOB?4:2)); hud.width=Math.round(W*dpr); hud.height=Math.round(Hh*dpr); cam.aspect=W/Hh; cam.updateProjectionMatrix()}
addEventListener('resize',resize);resize();
function render(){jet.position.copy(S.pos);sun.target.position.copy(S.pos);sun.position.copy(S.pos).addScaledVector(SUN,900);jet.rotation.set(S.pitch,S.yaw,S.roll);const tt=performance.now()/1000;jet.userData.core.material.color.setRGB(.12+S.thr*.25,.05+S.thr*.06,.02);jet.userData.sh.material.uniforms.t.value=tt;jet.userData.sh.material.uniforms.a.value=takingOff()?Math.min(1,.25+S.thr*1.1):.4+S.thr;
 if(CVN.sea&&CVN.sea.visible){CVN.sea.material.uniforms.uTime.value=tt; CVN.sea.material.uniforms.uSun.value.copy(SUN)}
 if(tgtGlow){const live=bunker.visible&&!takingOff(); tgtGlow.visible=tgtBeam.visible=live; if(live){const p=.6+.4*Math.sin(tt*2.4); tgtGlow.scale.setScalar((NIGHT_ON?40:28)+(NIGHT_ON?18:14)*p); tgtGlow.material.opacity=(NIGHT_ON?.45:.28)+(NIGHT_ON?.4:.35)*p; tgtBeam.material.opacity=.12+.2*p; tgtBeam.scale.y=.85+.15*p}}
 if(window.__stars&&window.__stars.visible) window.__stars.position.copy(cam.position); if(window.__starsBright&&window.__starsBright.visible) window.__starsBright.position.copy(cam.position);
 // Bomb-cam only after a short settle so first-frame compile can't hang on an empty view; jet stays visible in scene
 const useBombCam=S.cine&&S.bomb&&(S.bomb.age||0)>.35;
 if(takingOff()){cam.up.set(0,1,0);
  const u=S.phase==='cat'?clamp(S.to.shot/2.15,0,1):0;
  CVN._cam.set(lerp(S.pos.x-28,S.pos.x-6,u), lerp(S.pos.y+20,S.pos.y+9,u), lerp(S.pos.z+16,S.pos.z+30,u));
  CVN._look.set(lerp(S.pos.x-10,S.pos.x+2,u), lerp(S.pos.y+1.4,S.pos.y+1.2,u), lerp(S.pos.z-12,S.pos.z-24,u));
  if(S.phase==='signal'&&CVN.shooter){const k=sstep(4.15,5.35,S.to.sig||0); CVN.shooter.getWorldPosition(CVN._shW); const sh=CVN._shW;
   CVN._cam2.set(sh.x+5.2,sh.y+1.7,sh.z+2.2); CVN._look2.set(sh.x,sh.y+.85,sh.z-.4);
   cam.position.copy(CVN._cam2).lerp(CVN._cam,k); cam.lookAt(CVN._look2.lerp(CVN._look,k))}
  else if(S.phase==='deck'||S.phase==='cat'){cam.position.copy(CVN._cam); cam.lookAt(CVN._look)}
  else{const k=clamp((S.to.climb||0)/3.2,0,1);
   if(k>0.85)placeChaseCam(); else {const b=lerp(40,28,k),h=lerp(16,11,k);
    cam.position.set(S.pos.x+Math.sin(S.yaw)*b,S.pos.y+h,S.pos.z+Math.cos(S.yaw)*b); cam.up.set(0,1,0);
    cam.lookAt(S.pos.x-Math.sin(S.yaw)*6,S.pos.y+2.4,S.pos.z-Math.cos(S.yaw)*6)}}
  if(CVN.detail)CVN.detail.visible=(S.phase==='deck'||S.phase==='signal'||S.phase==='cat')&&cam.position.distanceTo(CVN._hub)<360;
  if((S.phase==='climb'||S.phase==='hand')&&(S.to.climb||0)>1.2)carrier.visible=false}
 else if(useBombCam){const b=S.bomb,dv=tmp.copy(b.v).normalize();if(dv.lengthSq()<.01)dv.set(0,-1,0);cam.position.copy(b.p).addScaledVector(dv,-18).y+=5;cam.lookAt(b.p);S.cineA=null}
 else if((S.gridShot||0)>0&&S.grids&&S.grids[0]){const G=S.grids[0], u=1-Math.min(1,S.gridShot/2.7); cam.position.set(G.gx+40, G.floor+55, G.z+720); cam.up.set(0,1,0); cam.lookAt(G.gx, G.floor+8+u*Math.max(20,G.gy-G.floor), G.z)}
 else if(S.cine&&!S.bomb){if(!S.cineA){const dh=new THREE.Vector3(cam.position.x-BUNK.x,0,cam.position.z-BUNK.z);if(dh.lengthSq()<.01)dh.set(0,0,1);dh.normalize();const nk=S.boomT>=0,a=BUNK.clone().addScaledVector(dh,nk?1900:780);a.y=nk?Math.max(BUNK.y+380,H(a.x,a.z)+200):Math.max(BUNK.y+170,H(a.x,a.z)+60);S.cineA=a}cam.position.copy(S.cineA);cam.lookAt(tmp.copy(BUNK).setY(BUNK.y+(S.boomT>=0?(NK?250+Math.min(950,NK.t*160):300):10)))}
 else if(!aimTankerCam()){cam.position.set(S.pos.x+Math.sin(S.yaw)*24,S.pos.y+6.5,S.pos.z+Math.cos(S.yaw)*24);cam.rotation.set(-.07,S.yaw,0)}
 if(S.shake>0){let a=S.cine?2.2:.25; if(S.tanker&&(S.tanker.lock==='hold'||S.tanker.lock==='arm'||(S.tanker.dist!=null&&S.tanker.dist<80)))a*=.12; cam.position.y+=Math.sin(tt*43)*S.shake*a;cam.position.x+=Math.sin(tt*31+1)*S.shake*a*.6}
 grade.u.uT.value=performance.now()/1000;
 const showPhoto=!takingOff()&&!NIGHT_ON;
 if(photoSky){photoSky.visible=showPhoto; if(showPhoto)photoSky.position.copy(cam.position)}
 sky.visible=!showPhoto; if(!showPhoto)sky.position.copy(cam.position);
 if(showPhoto&&!(SCEN.fogDen>0.00001)){if(!scene.fog)scene.fog=new THREE.FogExp2(HAZE_HEX,HAZE_DEN); scene.fog.color.set(HAZE_HEX); scene.fog.density=HAZE_DEN}
 else if(!showPhoto&&!NIGHT_ON&&!(SCEN.fogDen>0.00001))scene.fog=null;
 placeTankerBeacon();
 let far=16000; if(S&&tankerMesh&&tankerMesh.visible&&!S.fuelDone){const td=cam.position.distanceTo(tankerMesh.position); if(td>11000)far=Math.min(100000,td+6000)}
 if(Math.abs(cam.far-far)>400){cam.far=far; cam.updateProjectionMatrix()}
 if(sun.castShadow){sun.shadow.needsUpdate=(shadowN++%4)===0}
 if(window.__probeCam){placeProbeCam(); try{hx.setTransform(1,0,0,1,0,0); hx.clearRect(0,0,hud.width,hud.height)}catch(e){}}
 else if(cam.fov!==60){cam.fov=60; cam.updateProjectionMatrix()}
 if(useBloom)composer.render(); else R.render(scene,cam); if(!window.__probeCam)drawHUD()}
const G='rgba(182,220,174,.9)',GF='600 11px ui-monospace,"SF Mono",Menlo,monospace';
function txt(s,x,y,sz=11,al='center',c=G){hx.font=`600 ${sz}px ui-monospace,"SF Mono",Menlo,monospace`;hx.textAlign=al;hx.fillStyle=c;hx.fillText(s,x,y)}
function drawTakeoffHUD(){const cx=W/2;hx.shadowColor='rgba(0,0,0,.85)';hx.shadowBlur=2;
 let cue='HOLD THROTTLE FULL';
 if(S.phase==='deck')cue=S.to&&S.to.armed?'TAP TO LAUNCH':'HOLD THROTTLE FULL';
 else if(S.phase==='signal'){const t=S.to.sig||0; cue=t<1.7?'SHOOTER — RUN UP':t<2.7?'SHOOTER — SALUTE':t<4.15?'SHOOTER — LAUNCH':'CATAPULT'}
 else if(S.phase==='cat')cue='CATAPULT';
 else if(S.phase==='hand')cue='';
 else if(S.to&&!S.to.pulled)cue=S.to.settled?'SETTLE — PULL UP':'PULL UP';
 else cue='CLIMB OUT';
 if(cue)txt(cue,cx,Hh*.2,17,'center','rgba(236,224,196,.96)');
 txt(Math.round((S.spd||0)*1.94)+' KTS',cx,Hh*.2+26,12,'center',G);
 txt(S.phase==='deck'?'ON DECK':'ALT '+Math.round(S.pos.y)+' M',cx,Hh*.2+42,11,'center',G);
 if(S.msgT>0&&S.msg&&S.msg!==cue)txt(S.msg,cx,Hh*.2+64,12,'center','rgba(255,215,130,.95)');
 hx.shadowBlur=0}
function drawCine(){const cx=W/2;hx.fillStyle='rgba(0,0,0,.85)';hx.fillRect(0,0,W,Hh*.09);hx.fillRect(0,Hh*.91,W,Hh*.09);
 const guided=!!(S.bomb&&S.bomb.guided);
 const t=S.phase==='bombfall'?(guided?'GUIDED':((S.bomb&&(S.bomb.age||0)>.35)?'WPN CAM  //  GBU-PEN  TTI '+(S.bomb.tti.toFixed(1)):'BOMB AWAY  //  TTI '+(S.bomb?S.bomb.tti.toFixed(1):'0.0'))):S.phase==='penetrate'?'PENETRATING  '+Math.min(60,Math.round(S.penT*38))+' M  //  FUZE DELAY':'BDA  //  TARGET DESTROYED';
 txt(t,cx,Hh*.06,guided?22:12,'center',guided?'rgba(190,245,190,1)':'rgba(220,225,215,.9)');txt((S.gridShot>0)?'GRID ACTIVATED — TRAP':guided?'GUIDED':'EGRESS',cx,Hh*.16,18,'center',guided?'rgba(190,245,190,1)':(S.gridShot>0)?'rgba(255,220,150,1)':'rgba(255,214,150,.98)');txt('REC ●  '+S.t.toFixed(1),W-20-(innerWidth>0?0:0),Hh*.96,10,'right','rgba(255,120,100,.85)')}
function line(a,b,c,d){hx.beginPath();hx.moveTo(a,b);hx.lineTo(c,d);hx.stroke()}
function markTarget(cx,cy){const d=bDist(),pulse=.5+.5*Math.sin(performance.now()*.004),col=d<3000?'rgba(255,214,120,1)':'rgba(210,225,190,.95)';
 const s=scr(tmp.copy(BUNK).setY(BUNK.y+12));
 const on=s&&s.x>-20&&s.x<W+20&&s.y>-20&&s.y<Hh+20;
 if(on){const sz=16+5*pulse; hx.save(); hx.strokeStyle=col; hx.lineWidth=2; hx.globalAlpha=.55+.45*pulse;
  hx.beginPath(); hx.moveTo(s.x,s.y-sz); hx.lineTo(s.x+sz*.72,s.y); hx.lineTo(s.x,s.y+sz); hx.lineTo(s.x-sz*.72,s.y); hx.closePath(); hx.stroke();
  hx.lineWidth=1; hx.globalAlpha=1; txt('TGT',s.x,s.y-sz-6,12,'center',col); txt((d/1000).toFixed(1)+' KM',s.x,s.y+sz+14,13,'center',col); hx.restore(); return}
 V.copy(BUNK).applyMatrix4(cam.matrixWorldInverse); let dx=V.x,dy=-V.y; if(V.z>0){dx=V.x; dy=Math.abs(V.y)+Math.abs(V.x)*.2}
 const n=Math.hypot(dx,dy)||1; dx/=n; dy/=n; const k=Math.min((W/2-40)/Math.abs(dx||1e-3),(Hh/2-40)/Math.abs(dy||1e-3));
 const ax=cx+dx*k,ay=Hh/2+dy*k; hx.fillStyle=col; hx.beginPath(); hx.moveTo(ax+dx*18,ay+dy*18); hx.lineTo(ax-dy*9,ay+dx*9); hx.lineTo(ax+dy*9,ay-dx*9); hx.closePath(); hx.fill();
 txt('TGT '+(d/1000).toFixed(1),ax-dx*20,ay-dy*16,11,'center',col)}
function tagBox(p,label,c,sz=14){const s=scr(p);if(!s||s.x<0||s.x>W||s.y<0||s.y>Hh)return;hx.strokeStyle=c;const k=sz*.45;
 for(const [sx,sy] of[[-1,-1],[1,-1],[-1,1],[1,1]]){line(s.x+sx*sz,s.y+sy*sz,s.x+sx*(sz-k),s.y+sy*sz);line(s.x+sx*sz,s.y+sy*sz,s.x+sx*sz,s.y+sy*(sz-k))}
 txt(label,s.x,s.y-sz-5,10,'center',c);txt((S.pos.distanceTo(p)/1000).toFixed(1),s.x,s.y+sz+12,10,'center',c);hx.strokeStyle=G;return s}
function drawBanditHud(cx){const b=S.bandit; if(!b||b.dead)return; const bp=b.p, bs=scr(bp), bon=bs&&bs.x>8&&bs.x<W-8&&bs.y>8&&bs.y<Hh-8;
 txt('BANDIT, TWELVE O\'CLOCK',cx,86,15,'center','rgba(255,186,140,1)');
 if(bon){tagBox(bp,'BANDIT','rgba(255,170,120,1)',30); const tof=Math.max(.08,S.pos.distanceTo(bp)/1800); _lead.set(-Math.sin(b.yaw)*Math.cos(b.pitch||0),Math.sin(b.pitch||0),-Math.cos(b.yaw)*Math.cos(b.pitch||0)).multiplyScalar((b.spd||250)*tof).add(bp); const ls=scr(_lead); if(ls&&ls.x>4&&ls.x<W-4&&ls.y>4&&ls.y<Hh-4){hx.strokeStyle='rgba(255,230,170,1)'; hx.lineWidth=2; hx.strokeRect(ls.x-8,ls.y-8,16,16); hx.beginPath(); hx.moveTo(ls.x-16,ls.y); hx.lineTo(ls.x-8,ls.y); hx.moveTo(ls.x+8,ls.y); hx.lineTo(ls.x+16,ls.y); hx.moveTo(ls.x,ls.y-16); hx.lineTo(ls.x,ls.y-8); hx.stroke(); txt('LEAD',ls.x,ls.y-18,10,'center','rgba(255,230,170,1)'); hx.lineWidth=1; hx.strokeStyle=G}}
 else {V.copy(bp).applyMatrix4(cam.matrixWorldInverse); let dx=V.x,dy=-V.y; if(V.z>0){dx=V.x; dy=Math.abs(V.y)+Math.abs(V.x)*.2} const n=Math.hypot(dx,dy)||1; dx/=n; dy/=n; const k=Math.min((W/2-36)/Math.abs(dx||1e-3),(Hh/2-36)/Math.abs(dy||1e-3)), ax=cx+dx*k, ay=Hh/2+dy*k; hx.fillStyle='rgba(255,140,90,1)'; hx.beginPath(); hx.moveTo(ax+dx*22,ay+dy*22); hx.lineTo(ax-dy*11,ay+dx*11); hx.lineTo(ax+dy*11,ay-dx*11); hx.closePath(); hx.fill(); txt('BANDIT '+(S.pos.distanceTo(bp)/1000).toFixed(1),ax-dx*20,ay-dy*16,12,'center','rgba(255,186,140,1)')}
 if(b.state==='guns'||b.state==='setup'||b.state==='burst')txt('BANDIT GUNS — BREAK '+(b.breakSide||'LEFT'),cx,108,16,'center','rgba(255,176,120,.98)');
 if(b.state==='lock'||b.state==='missile')txt('MISSILE, MISSILE',cx,108,18,'center',(S.t*6|0)%2?'rgba(255,70,60,1)':'rgba(255,210,180,.95)')}
function gridHudOn(){if(!S||!S.gridSafe||!S.grids)return false; const g=S.grids.filter(x=>!x.done).sort((a,b)=>b.z-a.z)[0]; if(!g)return false; return Math.abs(S.pos.z-g.z)<5200}
function drawGridHud(cx,cy){const g=S.grids.filter(x=>!x.done).sort((a,b)=>b.z-a.z)[0]; if(!g)return;
 hx.shadowColor='rgba(0,0,0,.85)'; hx.shadowBlur=3;
 const gap={x:g.gx,y:g.gy,z:g.z}; const s=scr(gap);
 const on=s&&s.x>36&&s.x<W-36&&s.y>36&&s.y<Hh-36;
 txt('GRID AHEAD',cx,52,18,'center','rgba(255,236,190,1)');
 if(!on){V.copy(gap).applyMatrix4(cam.matrixWorldInverse); let dx=V.x,dy=-V.y; if(V.z>0){dx=V.x; dy=Math.abs(V.y)+Math.abs(V.x)*.2+1}
  const n=Math.hypot(dx,dy)||1; dx/=n; dy/=n; const k=Math.min((W/2-36)/Math.abs(dx||1e-3),(Hh/2-36)/Math.abs(dy||1e-3));
  const ax=cx+dx*k, ay=cy+dy*k; hx.fillStyle='rgba(255,214,120,1)'; hx.beginPath(); hx.moveTo(ax+dx*28,ay+dy*28); hx.lineTo(ax-dy*13,ay+dx*13); hx.lineTo(ax+dy*13,ay-dx*13); hx.closePath(); hx.fill()}
 else {hx.strokeStyle='rgba(255,236,190,.95)'; hx.lineWidth=2; hx.strokeRect(s.x-16,s.y-10,32,20)}
 hx.shadowBlur=0}
const _hud={};
function hudVis(key, live, hold=3.2){const now=performance.now()/1000; const s=_hud[key]||(_hud[key]={until:0}); if(live)s.until=now+hold; const left=s.until-now; if(left<=0)return 0; return live?1:clamp(left/.55,0,1)}
function calmLerp(key, target, rate){const now=performance.now()/1000; const s=_hud['L'+key]||(_hud['L'+key]={v:target,t:now}); const dt=Math.min(.08,Math.max(0,now-(s.t||now))); s.v+=(target-s.v)*(1-Math.exp(-(rate||4)*dt)); s.t=now; return s.v}
function txtFit(s,x,y,sz,al,c){const str=String(s); hx.font=`700 ${sz}px ui-monospace,"SF Mono",Menlo,monospace`; hx.textAlign=al||'center'; const w=Math.max(12,hx.measureText(str).width); const left=al==='right'?x-w:al==='left'?x:x-w/2; hx.fillStyle='rgba(6,10,16,.82)'; hx.fillRect(left-12,y-sz-6,w+24,sz+16); hx.lineWidth=4; hx.strokeStyle='rgba(0,0,0,.92)'; hx.strokeText(str,x,y); hx.fillStyle=c||'#f4f7ef'; hx.fillText(str,x,y)}
function aboveButtons(){return Math.max(96, Hh-214)}
function radarBox(){const rr=Math.min(34,Math.min(W,Hh)*.078); const rx=W-rr-14; return {rr,rx,left:rx-rr}}
function txtFitFree(s,y,sz,c){const rc=radarBox(); const maxW=Math.max(120,rc.left-22); let z=sz; const str=String(s); hx.font=`700 ${z}px ui-monospace,"SF Mono",Menlo,monospace`; while(z>12&&hx.measureText(str).width>maxW){z-=1; hx.font=`700 ${z}px ui-monospace,"SF Mono",Menlo,monospace`} const w=hx.measureText(str).width; const x=Math.max(14+w/2, Math.min((rc.left-8)/2, rc.left-10-w/2)); const y2=Math.max(y, z+58); txtFit(str,x,y2,z,'center',c)}
function instrumentAlpha(){const kcas=Math.round((S.spd||0)*1.94/5)*5; const aglN=S.agl||0; const step=aglN>800?50:10; const aglQ=Math.round(aglN/step)*step; if(_hud.kcas!==kcas){_hud.kcas=kcas; _hud.spdAt=performance.now()} const ph=(S.phase||'')+'|'+(S.reattack?1:0)+'|'+(S.fuelDone?1:0); if(_hud.ph!==ph){_hud.ph=ph; _hud.phAt=performance.now()} const live=aglN<200||performance.now()-(_hud.spdAt||0)<2000||performance.now()-(_hud.phAt||0)<3500||Math.abs(S.roll||0)>.5; return {a:hudVis('inst',live,2.2),kcas,aglN,aglQ}}
function drawFuelGauge(cx, tk){const shown=calmLerp('fuel', tk.fuel||0, 5); const lbs=Math.round(shown*6400/50)*50; const per=tk.flow?490:0; const short=Hh<W; const r=short?Math.max(22,Math.min(32,Math.min(W,Hh)*.075)):Math.max(26,Math.min(38,Math.min(W,Hh)*.085)); const panelW=(r+14)*2, panelH=r+78; const left=W-12-panelW, top=Hh-14-panelH; const gx=left+panelW/2, gy=top+r+18; hx.save(); hx.shadowBlur=0; hx.fillStyle='rgba(6,10,16,.46)'; hx.fillRect(left,top,panelW,panelH); hx.strokeStyle='rgba(244,247,239,.35)'; hx.lineWidth=1; hx.strokeRect(left+.5,top+.5,panelW-1,panelH-1); hx.strokeStyle='#f4f7ef'; hx.lineWidth=3; hx.beginPath(); hx.arc(gx,gy,r,Math.PI+.55,Math.PI*2-.55,false); hx.stroke(); const ang=(Math.PI+.55)+shown*((Math.PI*2-.55)-(Math.PI+.55)); hx.beginPath(); hx.moveTo(gx,gy); hx.lineTo(gx+Math.cos(ang)*(r-8),gy+Math.sin(ang)*(r-8)); hx.stroke(); hx.fillStyle='#f4f7ef'; hx.beginPath(); hx.arc(gx,gy,3.5,0,7); hx.fill(); const dir=tk.lock==='hold'||tk.flow?(tk.flow>0.2?'FLOW '+per+' LB/S':'FLOW'):(tk.lock==='done'?'FLOW 0':(tk.dir&&tk.dir!=='HOLD'?tk.dir:'FLOW 0')); const ls=short?13:15, ds=short?11:12; txtFit(lbs.toLocaleString()+' LB',gx,gy+r*.35+16,ls,'center','#f7f3e4'); txtFit(dir,gx,gy+r*.35+16+ls+6,ds,'center',tk.flow?'#c8f5d4':'#ffc9a4'); hx.restore()}
function drawReattack(cx){const km=(Math.round(bDist()/100)/10).toFixed(1)+' KM'; drawBasketArrow(BUNK,cx,Hh*.5,'#ffe1a8'); txtFit('RE-ATTACK  '+km,cx,Math.max(72,Hh*.14),Math.max(26,Math.round(Math.min(W,Hh)*.055)),'center','#ffe7b8')}
function dimControls(){if(!S)return; const warn=!!(S.missile&&!S.missile.decoy&&!S.missile.lost); const sam=!!(S.th&&S.th.anyTrk); const rel=dropCue()==='RELEASE'; const lk=!!(S.locked||(S.lockT||0)>0||canLock()); const gun=warn||sam||!!(S.bandit&&!S.bandit.dead); const map={flr:warn,brk:warn||sam,ecm:warn||sam,gun,lock:lk,rel}; for(const id of ['flr','brk','ecm','gun','lock','rel']){const el=$(id); if(!el)continue; const need=map[id]||el.classList.contains('hot')||el.classList.contains('warn'); el.style.opacity=need?'1':'.46'}}
function drawHUD(){hx.setTransform(dpr,0,0,dpr,0,0);hx.clearRect(0,0,W,Hh);if(!running&&!S.dead){document.body.classList.remove('tanking');document.body.classList.remove('gridding');return}if(S&&S.dead){document.body.classList.remove('tanking','gridding'); txtFit(S.cause||causeLine(S.dead),W/2,Hh*.4,Math.max(28,Math.round(Math.min(W,Hh)*.062)),'center','#ffd0c2'); return}paintRelease();if(S)dimControls();if(takingOff()){document.body.classList.remove('tanking');document.body.classList.remove('gridding');drawTakeoffHUD();return}if(S.cine){document.body.classList.remove('tanking');document.body.classList.remove('gridding');drawCine();return}const cx=W/2,cy=Hh*.5;if(tankerAiming()){document.body.classList.remove('gridding');document.body.classList.add('tanking');if($('thrl'))$('thrl').textContent='THROTTLE';drawTankerAim(cx,cy);return}document.body.classList.remove('tanking');if(gridHudOn()){document.body.classList.add('gridding');if($('thrl'))$('thrl').textContent='THROTTLE';drawGridHud(cx,cy);return}document.body.classList.remove('gridding');hx.strokeStyle=G;hx.lineWidth=1;hx.shadowColor='rgba(0,0,0,.9)';hx.shadowBlur=3;
 const inst=instrumentAlpha(); hx.save(); hx.globalAlpha=inst.a;
 const fp=scr(tmp.copy(S.pos).addScaledVector(fwd,1500))||{x:cx,y:cy};
 hx.beginPath();hx.arc(fp.x,fp.y,6,0,7);hx.stroke();line(fp.x-17,fp.y,fp.x-6,fp.y);line(fp.x+6,fp.y,fp.x+17,fp.y);line(fp.x,fp.y-6,fp.x,fp.y-12);
 // boresight cross
 line(cx-5,cy-cy*0+ -Math.tan(-.07)*0,cx+5,cy);
 const f=Hh/2/Math.tan(cam.fov*D2R/2);
 for(let a=-30;a<=30;a+=5){const y=cy-Math.tan(a*D2R+.07)*f;if(y<62||y>Hh-50)continue;const w=a===0?W*.25:a%10?18:44,gap=a===0?40:26;
  if(a<0)hx.setLineDash([4,4]);line(cx-gap-w,y,cx-gap,y);line(cx+gap,y,cx+gap+w,y);if(a&&a%10===0){line(cx-gap-w,y,cx-gap-w,y+(a>0?5:-5));line(cx+gap+w,y,cx+gap+w,y+(a>0?5:-5))}hx.setLineDash([]);
  if(a&&a%10===0){txt(Math.abs(a),cx-gap-w-12,y+4,10);txt(Math.abs(a),cx+gap+w+12,y+4,10)}}
 // bank scale
 for(const b of[-30,-20,-10,0,10,20,30]){const a=(b-90)*D2R,r=Hh*.36;line(cx+Math.cos(a)*r,cy+Hh*.08-Math.sin(a)*-r,cx+Math.cos(a)*(r+(b%30?4:7)),cy+Hh*.08-Math.sin(a)*-(r+(b%30?4:7)))}
 {const a=(-S.roll/D2R-90)*D2R*-1,r=Hh*.36-3;const a2=(S.roll/D2R*-1+90)*D2R;const px=cx+Math.cos(a2)*r,py=cy+Hh*.08+Math.sin(a2)*r;hx.beginPath();hx.moveTo(px,py);hx.lineTo(px-4,py+-(-6));hx.lineTo(px+4,py+6);hx.closePath();hx.stroke()}
 hx.restore();
 if(inst.a>0.04){hx.save(); hx.globalAlpha=inst.a; const sz=Math.max(22,Math.round(Math.min(W,Hh)*.058)); txtFit(inst.kcas+' KTS',16,Hh*.4,sz,'left','#f4f7ef'); txtFit(inst.aglQ+' M',W-16,Hh*.4,sz,'right',inst.aglN<180?'#ffd0c2':'#f4f7ef'); hx.restore()}
 const aDet=hudVis('det',(S.det||0)>25||!!(S.th&&S.th.anyTrk),2.2);
 if(aDet>0.04){hx.save(); hx.globalAlpha=aDet; txtFit('DETECT '+Math.round(S.det||0),cx,aboveButtons()-46,Math.max(15,Math.round(Math.min(W,Hh)*.034)),'center',(S.det||0)>60?'#ffb4a6':'#ffe1a8'); hx.restore()}
 const aScore=hudVis('score',(S.missFlash||0)>0,2.2);
 if(aScore>0.04){hx.save(); hx.globalAlpha=aScore; txtFit('×'+(S.mult||1).toFixed(1)+((S.streak||0)?('  '+S.streak):''),16,86,Math.max(18,Math.round(Math.min(W,Hh)*.046)),'left','#ffe1a8'); hx.restore()}
 const attack=(S.phase==='ingress'||S.phase==='release')&&bDist()<6000&&(facingBunker()||bDist()<4500)&&!reattackTurn();
 if(attack){const bw=W*.34,bh=Hh*.42;hx.strokeStyle='#ffe1a8'; hx.lineWidth=2; hx.globalAlpha=.85; for(const [sx,sy] of[[-1,-1],[1,-1],[-1,1],[1,1]]){line(cx+sx*bw,cy+sy*bh,cx+sx*(bw-18),cy+sy*bh);line(cx+sx*bw,cy+sy*bh,cx+sx*bw,cy+sy*(bh-18))} hx.globalAlpha=1; hx.strokeStyle=G}
 if(reattackTurn())drawReattack(cx);
 else if(bunker.visible){const aT=hudVis('tgt',attack||bDist()<4500,3.5); if(aT>0.04){hx.save(); hx.globalAlpha=aT; markTarget(cx,cy); hx.restore()}}
 SITES.forEach((st,i)=>{const ss=S.sites[i];if(ss.dead||(ss.st!=='track'&&!ss.warned))return;tagBox(tmp.copy(st.p).setY(st.p.y+6),ss.warned?st.n+' LOCK':st.n+' TRK','#ffb0a4',14)}); if(bDist()<4000&&(S.th&&S.th.anySrch))tagBox(tmp.copy(RADP).setY(RADP.y+27),'EW','#ffe1a8',12);
 if(S.missile)tagBox(S.missile.p,S.missile.decoy?'DECOY':'MSL','rgba(255,80,70,1)',14);
 drawBanditHud(cx);
 if(S.bomb){const s=scr(S.bomb.p);if(s)txt('WPN',s.x+12,s.y,9,'left')}
 else if(dropCue()==='RELEASE'&&!S.locked){const ip=predictImpact(); if(ip){const s=scr(ip); if(s){hx.strokeStyle='rgba(255,214,120,.95)'; hx.strokeRect(s.x-8,s.y-8,16,16); line(s.x,s.y-16,s.x,s.y-8); line(s.x,s.y+8,s.x,s.y+16); line(s.x-16,s.y,s.x-8,s.y); line(s.x+8,s.y,s.x+16,s.y); hx.strokeStyle=G; txt('CCIP',s.x,s.y-20,9)}}}
 if(S.phase==='egress')tagBox(EXIT,'EXFIL',G,12);
 let o='';const d=bDist(); const cue=dropCue();
 if(reattackTurn())o='RE-ATTACK';
 else if(S.phase==='release'&&S.locked)o='LOCKED';
 else if((S.lockT||0)>0)o='LOCKING';
 else if(cue==='TOO CLOSE'||cue==='OUT OF RANGE')o=cue;
 else if(cue==='RELEASE'&&!S.locked)o='RELEASE';
 else if(S.descendCue&&S.pos.y>980)o='DESCEND — VALLEY AHEAD';
 else if(attack)o='TGT '+(Math.round(d/100)/10).toFixed(1)+' KM';
 else if(S.phase==='bombfall')o=(S.bomb&&S.bomb.guided)?'GUIDED':'WPN AWAY';
 else if(S.phase==='penetrate')o='PENETRATING';
 else if(S.phase==='egress')o=S.boomT<2?'TARGET DESTROYED':(S.bandit&&!S.bandit.dead?'BANDIT':(S.gridOn&&S.grids&&S.grids.some(g=>!g.done)?'GRID AHEAD':'EXFIL'));
 const critical=o==='LOCKED'||o==='LOCKING'||o==='GUIDED'||o==='RELEASE'||o==='TOO CLOSE'||o==='OUT OF RANGE'||o==='RE-ATTACK'||o==='DESCEND — VALLEY AHEAD'||o==='WPN AWAY'||o==='PENETRATING';
 const aBan=critical?1:hudVis('ban',!!o&&performance.now()-(_hud.phAt||0)<3000,2.4);
 if(o&&aBan>0.04&&o!=='RE-ATTACK'){hx.save(); hx.globalAlpha=aBan; const sz=critical?Math.max(20,Math.round(Math.min(W,Hh)*.048)):Math.max(16,Math.round(Math.min(W,Hh)*.038)); const col=o==='LOCKED'||o==='GUIDED'?'#d8ffe4':o==='RELEASE'||o==='DESCEND — VALLEY AHEAD'?'#ffe1a8':'#f4f7ef'; txtFitFree(o,critical?Math.max(54,Math.min(64,Hh*.08)):58,sz,col); hx.restore()}
 if(S.tanker&&S.tanker.basket&&tankerMesh&&tankerMesh.visible&&!S.fuelDone){const b=S.tanker.basket, km=(Math.round(Math.hypot(S.pos.x-b.x,S.pos.y-b.y,S.pos.z-b.z)/100)/10).toFixed(1)+' KM'; const s=drawBasketArrow(b,cx,cy,'#ffe1a8'); if(s)txtFit(km,s.x,s.y-44,Math.max(16,Math.round(Math.min(W,Hh)*.038)),'center','#ffe7b8'); else txtFit('TANKER  '+km,cx,108,Math.max(18,Math.round(Math.min(W,Hh)*.042)),'center','#ffe7b8')}
 const thr=[];if(S.missile&&!S.missile.decoy&&!S.missile.lost)thr.push([S.missile.p,threatBehind(S.missile.p)?'SIX':'MSL',1]);if(S.bandit&&!S.bandit.dead&&threatBehind(S.bandit.p))thr.push([S.bandit.p,'SIX',1]);SITES.forEach((st,i)=>{if(S.sites[i].st==='track')thr.push([st.p,'SAM',0])});
 for(const [P,lab,isM] of thr){V.copy(P).applyMatrix4(cam.matrixWorldInverse);let dx=V.x,dy=-V.y;if(V.z>0){dx=V.x;dy=Math.abs(V.y)+Math.abs(V.x)*.2}const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;const r=Hh*.3,ax=cx+dx*r,ay=cy+dy*r;
  const c=isM?((S.t*6|0)%2?'rgba(255,70,60,1)':'rgba(255,200,180,1)'):'rgba(255,140,90,.95)';hx.fillStyle=c;hx.beginPath();hx.moveTo(ax+dx*16,ay+dy*16);hx.lineTo(ax-dy*8,ay+dx*8);hx.lineTo(ax+dy*8,ay-dx*8);hx.closePath();hx.fill();txt(lab,ax-dx*14,ay-dy*14+4,9,'center',c)}
 const clk=P=>{const rx=P.x-S.pos.x,rz=P.z-S.pos.z;let a=Math.atan2(-rx,-rz)-S.yaw;a=-a;let h=Math.round(((a/D2R%360)+360)%360/30)%12;return (h||12)+" O'CLOCK"};
 const bot=aboveButtons();
 const M=S.missile;if(M&&!M.decoy&&!M.lost){const md=M.p.distanceTo(S.pos),fw=flrWin(),bw=S.samShots<=1?1500:1100; const line=md<bw&&S.brkCD<=0&&md>220?'FLARE / BREAK':md<fw?'FLARE NOW':'MISSILE  '+clk(M.p); txtFitFree(line,bot,Math.max(16,Math.round(Math.min(W,Hh)*.04)),'#ffd0c8'); txtFitFree('MISSILE',Math.max(96,cy-Hh*.18),Math.max(18,Math.round(Math.min(W,Hh)*.042)),'#ffb0a4')}
 else if(lockSite()>=0&&!reattackTurn()){const li=lockSite(); txtFitFree(SITES[li].n+'  '+Math.max(0,1.75-S.sites[li].warnT).toFixed(1)+'s',bot,Math.max(16,Math.round(Math.min(W,Hh)*.038)),'#ffd0c8')}
 else if(S.th&&S.th.anyTrk&&!reattackTurn())txtFitFree('SAM TRACKING',bot,Math.max(16,Math.round(Math.min(W,Hh)*.038)),'#ffd0c8');
 else if(S.msgT>0&&S.msg!=='RE-ATTACK'&&!(S.fuelDone&&/TANKER AHEAD|JOIN UP|OVERSHOOT/.test(S.msg||''))){const big=/TANK FULL|CLEARED|DISCONNECT|CONTACT|CLIMB|SHORT|LONG|MISS|GUIDED/.test(S.msg||''); txtFitFree(S.msg,big?Math.min(Hh*.34,aboveButtons()):bot,big?Math.max(18,Math.round(Math.min(W,Hh)*.042)):Math.max(15,Math.round(Math.min(W,Hh)*.036)),/DISCONNECT|MISS|SHORT|LONG/.test(S.msg||'')?'#ffd0b0':'#f4f7ef')}
 else if((S.spike||0)>40||(S.spikeArm||0)>0)txt((S.spikeArm||0)>0?'SAM LOCK — DIVE':'SPIKED',cx,bot,15,'center',(S.t*5|0)%2?'rgba(255,90,70,1)':'rgba(255,190,140,.95)');
 else if(S.agl>400&&(S.det||0)>35&&S.phase!=='done'&&!S.fuelDone)txtFitFree('RADAR',bot,Math.max(16,Math.round(Math.min(W,Hh)*.036)),'#ffd0c2');
 paintRelease();
 let hudKey=(canLock()?1:0)+':'+(S.locked?1:0)+':'+cue+':'+(missileUp()?1:0)+':'+(S.ecmN|0)+':'+(S.ecm|0)+':'+(S.flares|0)+':'+(S.brkCD>0?1:0);
 if(hudKey!==window.__hudKey){window.__hudKey=hudKey;
 $('lock').classList.toggle('off',!canLock()&&!S.locked);$('lock').classList.toggle('hot',canLock()||!!S.locked);
 const gunEl=$('gun'); if(gunEl){const banditHot=!!(S.bandit&&!S.bandit.dead&&S.pos.distanceTo(S.bandit.p)<GUN_RANGE); gunEl.classList.toggle('hot',!!(S.missile&&!S.missile.lost)||lockSite()>=0||banditHot); gunEl.classList.toggle('off',!!(S.cine||S.dead))}}
 {const M=S.missile,act=M&&!M.decoy&&!M.lost,md=act?M.p.distanceTo(S.pos):9e9;
 // red vignette pulse, faster as missile closes
 const vg=$('vig');if(act){S.vph=(S.vph||0)+(1/60)*(1.5+10*clamp(1-md/5000,0,1));vg.style.opacity=(.25+.55*clamp(1-md/5000,0,1))*(.5+.5*Math.sin(S.vph*6.283))}else vg.style.opacity=S.dmgT>0?S.dmgT/3*.6:S.hp<2?.12:0;
 if(act){txt((md/1000).toFixed(1)+' KM',cx,cy-Hh*.2+22,16,'center','rgba(255,120,100,1)');const ttg=md/Math.max(50,M.v.length());txt('TTI '+ttg.toFixed(1)+' S',cx,cy-Hh*.2+38,11,'center','rgba(255,150,130,.95)')}
 const fw=flrWin(),bw=S.samShots<=1?1500:1100;const guns=!!(S.bandit&&!S.bandit.dead&&(S.bandit.state==='setup'||S.bandit.state==='burst'));$('flr').classList.toggle('hot',act&&md<fw);$('brk').classList.toggle('hot',(act&&md<bw&&md>220&&S.brkCD<=0)||(guns&&S.brkCD<=0));$('brk').classList.toggle('off',S.brkCD>0);$('ecm').classList.toggle('off',S.ecmCD>0||S.ecmN<=0);$('ecm').textContent=S.ecm>0?('JAMMING '+S.ecm.toFixed(0)):S.ecmCD>0?('WAIT '+S.ecmCD.toFixed(0)):('JAMS '+S.ecmN);
 const te=$('teach');if(S.teachT>0){te.style.display='block';te.innerHTML='MISSILE INBOUND — DEFEND!<br>Hold GUN and put the pipper on it · FLARE under '+(fw/1000).toFixed(1)+' KM · BREAK under '+(bw/1000).toFixed(1)+' KM · ECM while far'}else te.style.display='none';
 // RWR scope (top-right)
 const rb=radarBox(), rr=rb.rr, rx=rb.rx, ry=Math.max(rr+108, Hh*.24);hx.fillStyle='rgba(0,10,4,.45)';hx.beginPath();hx.arc(rx,ry,rr,0,7);hx.fill();hx.strokeStyle='rgba(182,220,174,.6)';hx.beginPath();hx.arc(rx,ry,rr,0,7);hx.stroke();hx.beginPath();hx.arc(rx,ry,rr*.5,0,7);hx.stroke();line(rx,ry-rr,rx,ry-rr+5);line(rx,ry+rr,rx,ry+rr-5);line(rx-rr,ry,rx-rr+5,ry);line(rx+rr,ry,rx+rr-5,ry);txt('RWR',rx,ry+rr+11,9,'center',G);hx.fillStyle=G;hx.fillRect(rx-1.5,ry-1.5,3,3);
 const brg=P=>{const dx=P.x-S.pos.x,dz=P.z-S.pos.z;const a=Math.atan2(dx,-dz)+S.yaw;return a};
 SITES.forEach((st,i)=>{const ss=S.sites[i];if(ss.st==='off')return;const a=brg(st.p),d=st.p.distanceTo(S.pos),r=rr*clamp(.35+.6*d/7500,.35,.92),x=rx+Math.sin(a)*r,y=ry-Math.cos(a)*r,trk=ss.st==='track';const c=trk?'rgba(255,80,70,1)':'rgba(255,190,120,.95)';txt('3',x,y+4,trk?12:10,'center',c);if(trk){hx.strokeStyle=c;hx.beginPath();hx.arc(x,y,7,0,7);hx.stroke()}});
 {const a=brg(RADP);txt('E',rx+Math.sin(a)*rr*.85,ry-Math.cos(a)*rr*.85+4,9,'center','rgba(255,200,120,.8)')}
 if(act){const a=brg(M.p),r=rr*clamp(.2+.75*md/7000,.2,.95),x=rx+Math.sin(a)*r,y=ry-Math.cos(a)*r,c=(S.t*8|0)%2?'rgba(255,60,50,1)':'rgba(255,220,200,1)';hx.strokeStyle=c;hx.lineWidth=2;hx.beginPath();hx.moveTo(x,y-7);hx.lineTo(x+7,y);hx.lineTo(x,y+7);hx.lineTo(x-7,y);hx.closePath();hx.stroke();txt('M',x,y+3,8,'center',c);line(rx,ry,x,y);hx.lineWidth=1}
 if(S.bandit&&!S.bandit.dead){const a=brg(S.bandit.p),d=S.bandit.p.distanceTo(S.pos),r=rr*clamp(.25+.7*d/4000,.25,.92),x=rx+Math.sin(a)*r,y=ry-Math.cos(a)*r;txt('F',x,y+3,11,'center','rgba(255,150,110,1)')}
 hx.strokeStyle=G;if(S.hp<2)txt('DMG',L-26,cy+68,10,'center','rgba(255,120,90,1)');
 // missile edge arrow with range (bigger, always for missile)
 if(act){V.copy(M.p).applyMatrix4(cam.matrixWorldInverse);const on=V.z<0&&Math.abs(V.x/-V.z)<1.2&&Math.abs(V.y/-V.z)<.7;if(!on){let dx=V.x,dy=-V.y;if(V.z>0)dy=Math.abs(dy)+Math.abs(dx)*.1+1;const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;const k=Math.min((W/2-30)/Math.abs(dx||1e-3),(Hh/2-30)/Math.abs(dy||1e-3)),ax=cx+dx*k,ay=Hh/2+dy*k,c=(S.t*6|0)%2?'rgba(255,60,50,1)':'rgba(255,200,180,1)';hx.fillStyle=c;hx.beginPath();hx.moveTo(ax+dx*22,ay+dy*22);hx.lineTo(ax-dy*13,ay+dx*13);hx.lineTo(ax+dy*13,ay-dx*13);hx.closePath();hx.fill();txt((V.z>0?'BEHIND ':'')+(md/1000).toFixed(1),ax-dx*16,ay-dy*16+4,10,'center',c)}}}
 $('flr').classList.toggle('warn',!!(S.missile&&!S.missile.decoy));$('flr').classList.toggle('off',S.flares<=0); if(S.flareCD<=0)$('flr').textContent=S.flares>0?('FLR '+S.flares):'NO FLARES'}
// ---------- briefing map ----------
function drawMap(){const c=$('map'),r=c.getBoundingClientRect(),w=Math.max(200,r.width|0),h=Math.max(80,r.height|0),k=Math.min(devicePixelRatio,2);c.width=w*k;c.height=h*k;const x=c.getContext('2d');x.scale(k,k);
 const z0=900,z1=-15900,X0=-1900,X1=1900;const tz=u=>z0+(z1-z0)*u,tx=v=>X1-(X1-X0)*v; const px=z=>(z-z0)/(z1-z0)*w,py=X=>(X1-X)/(X1-X0)*h;
 const im=x.createImageData(w,h);const st=Math.max(1,(w*h/60000)|0);
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){const Z=tz(i/w),XX=tx(j/h),e=H(XX,Z),ex=H(XX-15,Z+15);const sh=clamp(.55+(e-ex)*.012,0,1);let g=40+sh*120+e*.06;if(Math.floor(e/120)!==Math.floor(ex/120))g-=22;
  const n=hash(i,j)*10;im.data.set([g*.86+n,g*.92+n,g*.84+n,255],(j*w+i)*4)}
 x.putImageData(im,0,0);x.fillStyle='rgba(10,14,12,.25)';x.fillRect(0,0,w,h);
 x.strokeStyle='rgba(200,220,200,.12)';x.lineWidth=1;x.font='8px ui-monospace,Menlo,monospace';x.fillStyle='rgba(200,220,200,.45)';
 for(let Z=0;Z>=-16000;Z-=1000){const X=px(Z);x.beginPath();x.moveTo(X,0);x.lineTo(X,h);x.stroke();x.fillText(String(41+(-Z/1000|0)).padStart(2,'0'),X+2,9)}
 for(let XX=-1000;XX<=1000;XX+=1000){const Y=py(XX);x.beginPath();x.moveTo(0,Y);x.lineTo(w,Y);x.stroke();x.fillText(String(7+XX/1000).padStart(2,'0'),2,Y-2)}
 x.setLineDash([4,3]);x.strokeStyle='rgba(160,200,220,.7)';x.beginPath();for(let Z=300;Z>=EXZ;Z-=100){const a=px(Z),b=py(vx(Z));Z===300?x.moveTo(a,b):x.lineTo(a,b)}x.stroke();x.setLineDash([]);
 const mark=(P,col,lab,rr)=>{const a=px(P.z),b=py(P.x);x.strokeStyle=col;x.fillStyle=col;if(rr){x.setLineDash([3,3]);x.beginPath();x.arc(a,b,rr/(z0-z1)*w,0,7);x.stroke();x.setLineDash([])}x.strokeRect(a-5,b-5,10,10);x.fillText(lab,a+8,b-6)};
 SITES.forEach(st=>mark(st.p,'rgba(220,120,100,.95)',st.n,6000));mark(RADP,'rgba(220,170,100,.9)','EW 2140',0);
 {const a=px(BUNK.z),b=py(BUNK.x);x.strokeStyle='#e9e2c8';x.lineWidth=1.2;x.beginPath();x.moveTo(a-9,b);x.lineTo(a+9,b);x.moveTo(a,b-9);x.lineTo(a,b+9);x.stroke();x.strokeRect(a-6,b-6,12,12);x.fillStyle='#e9e2c8';x.fillText('TGT KESTREL',a+9,b+14)}
 x.fillStyle='rgba(160,200,220,.85)';x.fillText('IP',px(300)+3,py(vx(300))-4);x.fillText('EXFIL',px(EXZ)-26,py(vx(EXZ))-6);
 x.strokeStyle='rgba(200,220,200,.4)';x.strokeRect(.5,.5,w-1,h-1)}
const CHAT=['OVERLORD: VIPER ONE, OVERLORD. PACKAGE IS GO. PUSH WHEN READY.','VIPER 1: VIPER ONE COPIES. FENCE IN, MASTER ARM HOT.','OVERLORD: EW RADAR ACTIVE ON RIDGE 2140. STAY IN THE WEEDS.','OVERLORD: KESTREL CONFIRMED HOT. ONE SA-CLASS TEL NORTH OF TARGET.','VIPER 1: CONTACT THE BRIEF. PUSHING.'];
let chatT=null;function chat(){const el=$('chat');el.innerHTML='';let li=0,ci=0,cur=null;clearInterval(chatT);chatT=setInterval(()=>{if(li>=CHAT.length){clearInterval(chatT);return}if(!cur){cur=document.createElement('div');el.appendChild(cur)}cur.textContent=CHAT[li].slice(0,++ci)+'▍';if(ci>=CHAT[li].length){cur.textContent=CHAT[li];cur=null;ci=0;li++}if(el.children.length>4)el.removeChild(el.firstChild)},28)}
function clock(){const d=new Date();$('clk').textContent=String(d.getUTCHours()).padStart(2,'0')+String(d.getUTCMinutes()).padStart(2,'0')+'Z'}
// ---------- start / tutorial ----------
const TUT=[['1/3  FLIGHT CONTROL','Drag anywhere with one finger. Left/right banks and turns; up/down climbs or dives (30° limit). Release and the aircraft returns to level flight.'],
 ['2/3  EMCON','Stay below 150 m AGL. Above that the EW radar tracks you and the SAM site launches. Throttle: left slider.'],
 ['3/3  WEAPONS + DEFENCE','Hold LOCK with the bunker in the box until it says LOCKED, then press RELEASE. The bomb guides in. With no lock, RELEASE still drops a free-fall while the button says RELEASE. A SAM countdown: hold GUN on the battery, or press RELEASE to bomb it. Hold GUN on an inbound missile to splash it. You survive one hit.']];
let tutI=0;function showTut(){$('tt').textContent=TUT[tutI][0];$('tp').textContent=TUT[tutI][1];$('tn').textContent='TAP TO CONTINUE'}
$('brief').addEventListener('pointerdown',()=>{initAudio();briefMusic();$('snd').textContent='♪ SOUND ON'});
let practice='';
function startSortie(skip,kind){practice=kind||'';skipTakeoff=!!skip||!!kind;goFS();initAudio();stopBrief();heavy('sub08',.28,.8);prewarmGfx();$('brief').classList.add('hide');if(kind){try{localStorage.ds15_tut='1'}catch(e){}begin();return}if(localStorage.ds15_tut)begin();else{tutI=0;showTut();$('tut').classList.remove('hide')}}
$('go').addEventListener('pointerdown',e=>{e.stopPropagation();startSortie(false)});
if($('skipTO'))$('skipTO').addEventListener('pointerdown',e=>{e.stopPropagation();startSortie(true)});
if($('pracTank'))$('pracTank').addEventListener('pointerdown',e=>{e.stopPropagation();startSortie(true,'tanker')});
if($('resetTank'))$('resetTank').addEventListener('pointerdown',e=>{e.stopPropagation(); forgetTanker(); e.currentTarget.textContent='TANKER LESSON CLEARED'});
if($('pracFight'))$('pracFight').addEventListener('pointerdown',e=>{e.stopPropagation();startSortie(true,'fight')});
if($('pracGrid'))$('pracGrid').addEventListener('pointerdown',e=>{e.stopPropagation();startSortie(true,'grid')});
if($('launch'))$('launch').addEventListener('pointerdown',e=>{e.stopPropagation();launchCat()});
if(DS_MODE==='game'){let tap=null;
 document.addEventListener('pointerdown',e=>{if(!S||S.phase!=='deck'||!S.to||!S.to.armed||steerBlocked(e.target)){tap=null;return}tap={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId}},{capture:true});
 document.addEventListener('pointerup',e=>{if(!tap||tap.id!==e.pointerId)return;const t=tap;tap=null;if(S.phase!=='deck'||!S.to||!S.to.armed)return;if(performance.now()-t.t>380)return;if(Math.hypot(e.clientX-t.x,e.clientY-t.y)>18)return;launchCat()},{capture:true})}
$('tut').addEventListener('pointerdown',e=>{e.stopPropagation();tutI++;if(tutI>=3){localStorage.ds15_tut=1;$('tut').classList.add('hide');begin()}else showTut()});
let beginAt=0, beginBusy=null;
function requestBegin(){const now=performance.now(); if(beginBusy||now-beginAt<900)return beginBusy; beginAt=now; clearTimeout(endTimer); endTimer=0; initAudio(); stopWin(); beginBusy=begin().finally(()=>{beginBusy=null}); return beginBusy}
$('retry').addEventListener('pointerdown',e=>{e.stopPropagation();requestBegin()});if($('retry'))$('retry').addEventListener('click',e=>{e.stopPropagation();requestBegin()});
function goFS(){const d=document.documentElement,f=d.requestFullscreen||d.webkitRequestFullscreen;if(f&&!document.fullscreenElement&&!document.webkitFullscreenElement){try{const p=f.call(d,{navigationUI:'hide'});p&&p.catch&&p.catch(()=>{})}catch(e){}}try{screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape').catch(()=>{})}catch(e){}}
if(DS_MODE==='game')addEventListener('pointerdown',goFS,{once:true});
function resetTouch(){try{releaseSteer()}catch(e){} try{releaseControls()}catch(e){} try{if(window.__thrUp)window.__thrUp()}catch(e){}}
let lastFit={w:0,h:0,s:1};
function fitViewport(){const vv=window.visualViewport; const w=vv?vv.width:innerWidth, h=vv?vv.height:innerHeight, s=vv&&vv.scale?vv.scale:1;
 const changed=Math.abs(w-lastFit.w)>1||Math.abs(h-lastFit.h)>1||Math.abs(s-lastFit.s)>0.01; lastFit={w,h,s};
 if(s>1.01){try{scrollTo(0,0)}catch(e){}}
 if(!changed&&s<=1.01)return;
 resetTouch(); try{resize()}catch(e){} if(DS_MODE==='game'&&$('brief')&&!$('brief').classList.contains('hide')){try{drawMap()}catch(e){}}}
let fitT=0; function fitSoon(){clearTimeout(fitT); fitViewport(); fitT=setTimeout(fitViewport,180)}
function blockZoom(e){if(e.cancelable)e.preventDefault()}
['gesturestart','gesturechange','gestureend'].forEach(ev=>document.addEventListener(ev,blockZoom,{capture:true,passive:false}));
document.addEventListener('dblclick',blockZoom,{capture:true,passive:false});
if(DS_MODE==='game')document.addEventListener('touchmove',e=>{if(e.target&&e.target.closest&&e.target.closest('#brief,#tut,#end,#go,#retry,#setp,#pauseOv,#pauseCard,input,select,textarea,a,button.label'))return; e.preventDefault()},{passive:false});
let lastTap=0;
document.addEventListener('touchend',e=>{
  const now=performance.now(), prev=lastTap; lastTap=now; const dt=now-prev;
  const t=e.target; const typing=t&&t.closest&&t.closest('input,textarea,select');
  if(!typing&&prev&&dt<320&&e.cancelable)e.preventDefault();
},{capture:true,passive:false});
addEventListener('resize',fitSoon);
addEventListener('orientationchange',()=>{resetTouch(); fitSoon()});
if(window.visualViewport){visualViewport.addEventListener('resize',fitSoon); visualViewport.addEventListener('scroll',fitSoon)}
async function begin(){if(AC&&AC.state==='suspended')AC.resume(); reset(); S.tankerLesson=practice!=='tanker'&&tankerLearned(); jet.visible=true; if(practice==='tanker'){const p=meetPos(); S.phase='ingress'; S.pos.set(p.x,p.y,p.z); S.yaw=0; S.pitch=0; S.thr=.5; S.spd=160} else if(practice==='fight'){const z=BZ+900; S.phase='egress'; S.boomT=12; S.cine=false; S.safe=false; S.graceHold=0; S.pos.set(vx(z),groundY(vx(z),z)+140,z); S.yaw=0; S.pitch=0; S.thr=.7; S.spd=220; bunker.visible=false} else if(practice==='grid'){S.phase='egress'; S.boomT=20; S.cine=false; S.safe=false; S.graceHold=0; S.gridOn=1; bunker.visible=false; makeGrids(); const g0=S.grids[0]; const z=g0.z+2400; S.pos.set(vx(z), g0.gy, z); S.yaw=0; S.pitch=0; S.thr=.65; S.spd=200; S.bandit={dead:1,timer:30,impact:1,hp:0,p:new THREE.Vector3(0,-500,0),yaw:0,pitch:0,roll:0,state:'merge'}} const keep=musicRoll.prev; musicRoll={prev:keep}; const musicId=takingOff()?resolveMusic('intro'):resolveMusic('mood'); const musicKeys=(MUSIC_LAY[musicId]||[]).map(l=>l.k); const bunk=(sndChoice('bunker').layers||[]).map(l=>l.k); const nbK=nbKeys(); const sndK=[]; for(const s of SND){const c=sndChoice(s.id); if(c&&c.key)sndK.push(c.key)} if(AC){AC.resume(); const deckKeys=['deck_jet','deck_rotor','deck_clank','deck_steam','deck_call']; if(INTRO_TRACK)deckKeys.push(INTRO_TRACK); await Promise.all(['jet8','jet','ambient','aaaw','sub08',...deckKeys,...musicKeys,...bunk,...nbK,...sndK].map(k=>SB.get(k).catch(()=>null))); try{ if(SB.jet8) SB.jet8=mkSeamless(SB.jet8,.3); else if(SB.jet) SB.jet=mkSeamless(SB.jet,.3);}catch(e){} const fk=flareChoice().key; if(fk)SB.get(fk).catch(()=>{}); try{for(const s of SND){const c=sndChoice(s.id); if(c&&c.key)SB.get(c.key).catch(()=>{})}}catch(e){} prewarmAudio(); } prewarmGfx(); if(takingOff()){startDeckAmbience(); startIntroMusic()} else startMood(); running=true;last=performance.now();wake(); if(practice==='fight')spawnBandit()}
reset();
if(DS_MODE==='game'){clock();drawMap();chat();addEventListener('resize',()=>{if(!$('brief').classList.contains('hide'))drawMap()});wake()}


// ===== SOUND TESTER (same audio engine) =====
let testerPan='F', testerLoops={}, testerEngOn=false;
function panPoint(which){
  const d=520, w=which||testerPan||'F';
  const right=new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion);
  const ahead=new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(cam.quaternion);
  const p=cam.position.clone();
  if(w==='L') p.addScaledVector(right,-d);
  else if(w==='R') p.addScaledVector(right,d);
  else if(w==='B') p.addScaledVector(ahead,-d);
  else if(w==='A') p.addScaledVector(up,d*.65);
  else if(w==='C') p.addScaledVector(ahead,d*.25);
  else p.addScaledVector(ahead,d);
  return p;
}
function testerPos(){return panPoint(testerPan)}
let previewPans=[], moodPreviewNodes=[];
function dropPreviewPans(){const a=previewPans; previewPans=[]; for(const pn of a){ if(pn._hrtf){hrtfN=Math.max(0,hrtfN-1); pn._hrtf=0} try{pn.disconnect()}catch(e){} }}
function dropMoodPreview(){const a=moodPreviewNodes; moodPreviewNodes=[]; for(const n of a){try{n.disconnect()}catch(e){}} window.__moodBus=null}
function moodPreviewBus(){const g=AC.createGain(); g.gain.value=1; g.connect(AC.mg); moodPreviewNodes.push(g); window.__moodBus=g; return g}
function refreshPreviewPans(){ for(const pn of previewPans){ pn.panningModel=SURR.on&&pn._hrtf?'HRTF':'equalpower'; setP0(pn, panPoint(testerPan)); } }
function previewDest(){const pn=mkPan(true,640); pn.rolloffFactor=SURR.on?.35:.12; setP0(pn, panPoint(testerPan)); pn.connect(AC.out); previewPans.push(pn); return pn}
let surrTest={mode:null,pos:'F',pn:null,nodes:[],raf:0,timer:0,t0:0};
function stopSurrTest(){
  if(surrTest.raf) cancelAnimationFrame(surrTest.raf); surrTest.raf=0;
  clearTimeout(surrTest.timer); surrTest.timer=0;
  for(const n of surrTest.nodes){ try{n.stop()}catch(e){} }
  surrTest.nodes=[];
  if(surrTest.pn){ if(surrTest.pn._hrtf){hrtfN=Math.max(0,hrtfN-1); surrTest.pn._hrtf=0} try{surrTest.pn.disconnect()}catch(e){} surrTest.pn=null; }
  const g=$('stestGo'); if(g) g.classList.remove('on');
}
function surrHear(mode, pos){
  if(!AC) return;
  stopSurrTest();
  surrTest.mode=mode; if(pos) surrTest.pos=pos;
  const pn=mkPan(true,640); pn.rolloffFactor=.22; pn.connect(AC.out); surrTest.pn=pn;
  const g=AC.createGain(); g.gain.value=.2; g.connect(pn);
  const o=AC.createOscillator(); o.type='sine'; o.frequency.value=523; o.connect(g); o.start();
  const o2=AC.createOscillator(); o2.type='sine'; o2.frequency.value=784; const g2=AC.createGain(); g2.gain.value=.45; o2.connect(g2).connect(g); o2.start();
  surrTest.nodes.push(o,o2);
  const paint=()=>{document.querySelectorAll('#stest .btns button').forEach(b=>{const on=(b.id==='stestGo'&&surrTest.mode==='sweep')||(b.dataset.pan&&b.dataset.pan===testerPan); b.classList.toggle('on',!!on)})};
  if(mode==='sweep'){
    surrTest.t0=performance.now();
    const step=()=>{
      if(!surrTest.pn) return;
      const u=Math.min(1,(performance.now()-surrTest.t0)/4200);
      const a=-Math.PI/2 + (-Math.PI*1.5)*u;
      const d=520;
      const right=new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion);
      const ahead=new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion);
      const p=cam.position.clone().addScaledVector(right, Math.sin(a)*d).addScaledVector(ahead, Math.cos(a)*d);
      surrTest.pn.panningModel=SURR.on?'HRTF':'equalpower';
      setP0(surrTest.pn, p);
      if(u<1) surrTest.raf=requestAnimationFrame(step);
      else stopSurrTest();
    };
    step();
  } else {
    testerPan=surrTest.pos;
    surrTest.pn.panningModel=SURR.on?'HRTF':'equalpower';
    setP0(surrTest.pn, panPoint(testerPan));
    refreshPreviewPans();
    surrTest.timer=setTimeout(stopSurrTest, 1500);
  }
  paint();
  sfxLog('surrTest',{mode,pos:surrTest.pos,on:SURR.on?1:0,width:SURR.width});
}
function retriggerSurrTest(){ if(!AC) return; if(surrTest.mode==='sweep') surrHear('sweep'); else surrHear('fixed', surrTest.pos||testerPan); }

function paintFlareChoice(){const sel=document.querySelector('#pickList select[data-kind="flare"]'); if(sel) sel.value=flareChoice().id}
let playGen=0;
function stopPreview(){playGen++; stopSndPrev(); stopFlareVoices(); if(typeof musicPreview!=='undefined'&&musicPreview){try{musicPreview.stop()}catch(e){} musicPreview=null} stopTesterEngine(); try{stopBed()}catch(e){} try{riser(false)}catch(e){} try{stopWin()}catch(e){} dropPreviewPans(); dropMoodPreview()}
function playCurrentPositioned(sec, dest, gen){
  const key={gun:'aaaw',engine:'jet8',aaa:'aaaw',sam:'mlaunch',pass:'jet',boom:'impact',bombrelease:'subdrop',nuke:'nuke',bunker:'nuke',crash:'impact',overhead:'jet8',ambience:'ambient',bed:'ambient'}[sec];
  const loop=sec==='engine'||sec==='ambience'||sec==='bed';
  const go=()=>{
    if(sec==='radar'){const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain(); o.type='sine'; o.frequency.value=620; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(.22,t+.02); g.gain.exponentialRampToValueAtTime(.001,t+.28); o.connect(g).connect(dest); o.start(t); o.stop(t+.3); sndPrev.push({stop(){try{o.stop()}catch(e){}}}); sfxLog('sndPlay',{sec,id:'current'}); return}
    if(!key||!SB[key]) return;
    if(loop){const h=plainLoop(SB[key],.4,dest,{tag:'current:'+sec}); if(h)sndPrev.push(h)}
    else {const n=src(SB[key],.5,dest,{pri:1,fadeIn:.008,tag:'current:'+sec}); if(n&&n.stop)sndPrev.push(n)}
  };
  if(sec==='radar'){ if(gen===playGen) go() } else if(key) SB.get(key).then(()=>{ if(gen===playGen) go() });
}
function playChoice(kind, id){
  stopPreview(); const gen=++playGen; ensureAudioSync();
  if(kind==='flare'){
    const c=FLARE_OPTS.find(o=>o.id===id)||flareChoice();
    const dest=previewDest();
    const go=()=>{
      if(!c.key){ if(SB.flare_thump){const n=src(SB.flare_thump,.45,dest,{pri:1,fadeIn:.01,tag:'flare:current'}); if(n&&n.stop)sndPrev.push(n)} if(SB.flare_hiss){const n=src(SB.flare_hiss,.2,dest,{pri:1,fadeIn:.02,tag:'flare:hiss'}); if(n&&n.stop)sndPrev.push(n)} }
      else if(SB[c.key]){const n=src(SB[c.key],.45,dest,{pri:1,fadeIn:.01,tag:'flare:'+c.id}); if(n&&n.stop)sndPrev.push(n)}
    };
    const need=c.key?[c.key]:['flare_thump','flare_hiss'];
    Promise.all(need.map(k=>SB.get(k).catch(()=>null))).then(()=>{if(gen===playGen) go()});
    return;
  }
  if(kind==='intro'||kind==='ending'||kind==='mood'){
    let pid=id;
    if(pid==='random'){const opts=MUSIC_PRE[kind].map(x=>x[0]).filter(x=>x!=='current'&&x!=='random'); pid=opts[Math.floor(Math.random()*opts.length)]}
    if(pid==='current'){
      const curDest=previewDest();
      if(kind==='ending') SB.get(BRIEF_TRACK).then(b=>{if(gen!==playGen||!b)return; const n=src(b,.4,curDest,{loop:true,fadeIn:.05,tag:'ending:current'}); if(n&&n.stop)sndPrev.push(n)});
      else if(kind==='mood') SB.get('ambient').then(b=>{if(gen!==playGen||!b)return; const h=plainLoop(b,.35,curDest,{tag:'mood:current'}); if(h)sndPrev.push(h)});
      return;
    }
    const bus=kind==='mood'?moodPreviewBus():previewDest();
    const go=()=>{musicPreview=playLayers(pid, bus, musicLevel(kind))};
    const need=(MUSIC_LAY[pid]||[]).filter(l=>!SB[l.k]);
    if(!need.length){ if(gen===playGen) go() } else Promise.all(need.map(l=>SB.get(l.k))).then(()=>{if(gen===playGen) go()});
    return;
  }
  const sec=sndSec(kind); if(!sec) return;
  const c=sndList(sec).find(x=>x.id===id)||sndList(sec)[0];
  if(c&&c.layers){ playBunker(c, panPoint(testerPan)); return }
  const dest=previewDest();
  if(!c||c.id==='current'||!c.key){ playCurrentPositioned(kind, dest, gen); return }
  const go=()=>{ if(!SB[c.key]) return; if(sec.loop){const h=plainLoop(SB[c.key],.45,dest,{sec:kind,id:c.id,file:c.name}); if(h)sndPrev.push(h)} else playSndBuf(kind,c,dest) };
  if(SB[c.key]){ if(gen===playGen) go() } else SB.get(c.key).then(()=>{if(gen===playGen) go()});
}
function pickRow(label, kind, opts, getId, setId){
  const el=document.createElement('div'); el.className='pick'; el.dataset.kind=kind;
  el.innerHTML='<div class="nm"></div><select></select><button type="button" class="play">PLAY</button><button type="button" class="stop">STOP</button>';
  el.querySelector('.nm').textContent=label;
  const sel=el.querySelector('select'); sel.dataset.kind=kind;
  for(const o of opts){const op=document.createElement('option'); op.value=o.id; op.textContent=o.name||'Current'; sel.appendChild(op)}
  sel.value=getId();
  sel.addEventListener('change',()=>setId(sel.value));
  el.querySelector('.play').addEventListener('pointerdown',e=>{e.preventDefault(); e.stopPropagation(); playChoice(kind, sel.value)});
  el.querySelector('.stop').addEventListener('pointerdown',e=>{e.preventDefault(); e.stopPropagation(); stopPreview(); stopSurrTest()});
  return el;
}
const PICK_LABEL={flare:'Flare',gun:'Gun',engine:'Engine',aaa:'Cannon',sam:'SAM',pass:'Pass',boom:'Explosion',bombrelease:'Release',nuke:'Nuke',bunker:'Bunker',radar:'Radar',crash:'Crash',overhead:'Overhead',ambience:'Ambience',bed:'Bed',intro:'Intro',ending:'Ending',mood:'Mood'};
function buildCompactPicker(){
  const host=$('pickList'); if(!host) return;
  host.innerHTML='';
  host.appendChild(pickRow('Flare','flare',FLARE_OPTS.map(c=>({id:c.id,name:c.id==='current'?'Current':c.name})),()=>flareChoice().id,v=>{try{localStorage.ds15_flare=v}catch(e){}}));
  for(const sec of SND){
    const opts=sndList(sec).map(c=>({id:c.id,name:c.id==='current'?'Current':(c.name||c.id)}));
    host.appendChild(pickRow(PICK_LABEL[sec.id]||sec.id, sec.id, opts, ()=>sndChoice(sec.id).id, v=>rememberSnd(sec.id,v)));
  }
  for(const cat of ['intro','ending','mood']){
    const opts=MUSIC_PRE[cat].map(x=>({id:x[0],name:x[1]}));
    const el=pickRow(PICK_LABEL[cat], cat, opts, ()=>musicChoice(cat), v=>rememberMusic(cat,v));
    const lvl=document.createElement('div'); lvl.className='lvl';
    const range=document.createElement('input'); range.type='range'; range.min='0'; range.max='100'; range.value=String(Math.round(musicLevel(cat)*100)); range.id='ml_'+cat;
    const b=document.createElement('b'); b.textContent=range.value;
    lvl.append('Level ', range, b);
    range.addEventListener('input',()=>{try{localStorage['ds16_lv_'+cat]=range.value}catch(e){} b.textContent=range.value});
    el.appendChild(lvl);
    host.appendChild(el);
  }
}
function paintSnd(sec){const id=sndChoice(sec.id).id; document.querySelectorAll('#sndSecs details[data-sec="'+sec.id+'"] .frow').forEach(el=>{const on=el.dataset.id===id; el.classList.toggle('chosen',on); const b=el.querySelector('.choose'); if(b)b.textContent=on?'✓ Chosen':'✓ Choose'})}
function playCurrentSec(sec){sndBypass++; try{
  if(sec==='engine') startTesterEngine();
  else if(sec==='gun'){ if(SB.aaaw){ const s=src(SB.aaaw,.32,AC.out,{pri:1,fadeIn:.005,tag:'gun'}); if(s&&s.stop)sndPrev.push(s);} else thud(AC.out,.22,46,24,.18); }
  else if(sec==='aaa') aaaBurst(S.pos.clone());
  else if(sec==='sam') samRoar(500);
  else if(sec==='pass'){ whoosh(); passBy(S.pos.clone()); }
  else if(sec==='boom'){ for(const [k,v,tag] of [['sub08',.55,'boom:sub08'],['hitsub',.7,'heavy:hitsub'],['impact',.7,'heavy:impact']]){ if(!SB[k])continue; const s=src(SB[k],v,AC.bigB,{pri:1,fadeIn:.008,tag}); if(s&&s.stop)sndPrev.push(s); } }
  else if(sec==='bombrelease'||sec==='release'){ riser(true); heavy('sub08',.45,1.15); if(!heavy('subdrop',.8,1,true))thud(AC.out,.6,60,28,.8); blip(300,.2,.3); whoosh(); }
  else if(sec==='nuke') boomSfx(true);
  else if(sec==='bunker') boomSfx(true, testerPos());
  else if(sec==='radar') rwrLaunch(S.pos.clone(),false);
  else if(sec==='crash') crashSfx();
  else if(sec==='overhead'){ const Q=S.pos.clone().add(new THREE.Vector3(0,80,-20)); whoosh(); passBy(Q); if(SB.jet8)psrc('jet8',.55,Q,true,{ref:200,rate:1,fadeIn:.15,tag:'overhead'}); }
  else if(sec==='ambience'||sec==='bed') startBed();
}finally{ sndBypass--; }}
function buildSndSections(){const host=$('sndSecs'); if(!host)return; host.innerHTML='';
 for(const sec of SND){const det=document.createElement('details'); det.className='sndSec'; det.dataset.sec=sec.id; if(sec.id==='gun')det.open=true;
  const body=document.createElement('div'); body.className='body';
  const sum=document.createElement('summary'); sum.textContent=sec.title; det.appendChild(sum); det.appendChild(body);
  const groups=[]; if(sec.reals) groups.push({label:'Real explosions',list:sec.reals}); if(sec.mixes) groups.push({label:'Combined (nuclear)',list:sec.mixes}); groups.push({label:'',list:sec.cands}); if(sec.bounces) groups.push({label:'Your Logic bounces',list:sec.bounces});
  for(const g of groups){ if(g.label){const lab=document.createElement('div'); lab.className='sndGroup'; lab.textContent=g.label; body.appendChild(lab)}
  for(const c of g.list){const el=document.createElement('div'); el.className='frow'; el.dataset.id=c.id; el.dataset.sec=sec.id;
   const nm=c.id==='current'?(sec.notLogic?'Current (not Logic)':'Current'):c.name;
   const ds=c.id==='current'?sec.cur:(c.desc||'Logic original. One file, as recorded.');
   el.innerHTML=`<div class="meta"><div class="name"></div><div class="desc"></div></div><div class="acts"><button type="button" class="play" data-act="play">▶ PLAY</button><button type="button" class="stop" data-act="stop">■ STOP</button><button type="button" class="choose" data-act="choose">✓ Choose</button></div>`;
   el.querySelector('.name').textContent=nm; el.querySelector('.desc').textContent=ds;
   el.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{btn._pt={x:e.clientX,y:e.clientY,id:e.pointerId}; ensureAudioSync()},{passive:true});
    btn.addEventListener('pointerup',e=>{
     const p=btn._pt; btn._pt=null; if(!p||p.id!==e.pointerId)return;
     if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>18)return;
     e.preventDefault(); ensureAudioSync();
     if(btn.dataset.act==='play'){document.querySelectorAll('#sndSecs .frow').forEach(x=>x.classList.remove('playing')); el.classList.add('playing');
      const run=()=>{ if(sec.id==='bunker'&&c.layers){playBunker(c,testerPos()); return} if(c.id==='current') playCurrentSec(sec.id); else playSndBuf(sec.id,c); };
      if(c.layers) Promise.all(c.layers.map(l=>SB.get(l.k))).then(run);
      else if(c.key&&!SB[c.key]) SB.get(c.key).then(b=>{if(b)run()});
      else if(c.id==='current') Promise.all(['jet8','aaaw','sub08','impact','hitsub','subdrop','nuke','ambient','drone','jet'].map(k=>SB.get(k).catch(()=>null))).then(run);
      else run();
     }else if(btn.dataset.act==='stop'){stopSndPrev(); if(sec.id==='engine')stopTesterEngine(); if(sec.id==='bed'||sec.id==='ambience')stopBed(); el.classList.remove('playing')}
     else{const cur=sndChoice(sec.id).id; const next=(cur===c.id&&c.id!=='current')?'current':c.id; try{localStorage['ds15_snd_'+sec.id]=next}catch(err){} paintSnd(sec)}
    });
   });
   body.appendChild(el);
  }}
  host.appendChild(det); paintSnd(sec);
 }
}
function setupSoundTester(){
  document.body.classList.add('soundsMode');
  running=false; if(S){S.cine=false; S.pos.set(vx(300),H(vx(300),300)+120,300)}
  window.__sfxTest=1;
  buildCompactPicker();
  const hearPos=pos=>{ensureAudioSync(); surrHear('fixed', pos)};
  document.querySelectorAll('#stest [data-pan]').forEach(b=>{
    b.addEventListener('pointerdown', e=>{e.preventDefault(); e.stopPropagation(); hearPos(b.dataset.pan)});
  });
  const testGo=$('stestGo'); if(testGo) testGo.addEventListener('pointerdown', e=>{e.preventDefault(); e.stopPropagation(); ensureAudioSync(); surrHear('sweep')});
  function bindSmoothRange(el){if(!el||el._smooth)return; el._smooth=1; el.style.touchAction='none'; let pid=null;
    const setFrom=e=>{const r=el.getBoundingClientRect(); const t=Math.min(1,Math.max(0,(e.clientX-r.left)/Math.max(1,r.width))); const min=+el.min||0, max=+el.max||100; el.value=String(min+t*(max-min)); el.dispatchEvent(new Event('input',{bubbles:true}))};
    el.addEventListener('pointerdown', e=>{e.preventDefault(); e.stopPropagation(); pid=e.pointerId; try{el.setPointerCapture(pid)}catch(x){} setFrom(e)});
    el.addEventListener('pointermove', e=>{if(e.pointerId!==pid)return; e.preventDefault(); e.stopPropagation(); setFrom(e)});
    el.addEventListener('pointerup', e=>{if(e.pointerId===pid)pid=null});
    el.addEventListener('pointercancel', e=>{if(e.pointerId===pid)pid=null});
    el.addEventListener('touchmove', e=>{if(pid!=null)e.preventDefault()},{passive:false});
  }
  document.querySelectorAll('#vols input[type=range], #thrbox input[type=range], #setp input[type=range], #stest input[type=range], #pickList input[type=range]').forEach(bindSmoothRange);
  const ts=$('t_surr'); if(ts){ts.value=SURR.on?'1':'0'; ts.addEventListener('change',()=>{SURR.on=ts.value!=='0'; try{localStorage.ds16_surr=SURR.on?'1':'0'}catch(e){} applySurr(); ensureAudioSync(); retriggerSurrTest()})}
  const tw=$('t_width'); if(tw){tw.value=String(Math.round(SURR.width*100)); const lab=$('v_t_width'); if(lab)lab.textContent=tw.value; tw.addEventListener('input',()=>{SURR.width=Math.min(2,Math.max(0,+tw.value/100)); try{localStorage.ds16_width=SURR.width}catch(e){} if(lab)lab.textContent=tw.value; if(surrTest.pn&&surrTest.mode==='fixed') setP0(surrTest.pn, panPoint(surrTest.pos)); refreshPreviewPans()}); tw.addEventListener('pointerup',()=>{ensureAudioSync(); retriggerSurrTest()}); tw.addEventListener('pointercancel',()=>{ensureAudioSync(); retriggerSurrTest()})}
  const apply=$('applyGame');
  if(apply){apply.addEventListener('click',e=>{e.preventDefault(); document.querySelectorAll('#pickList select[data-kind]').forEach(sel=>{const k=sel.dataset.kind,v=sel.value; try{ if(k==='flare') localStorage.ds15_flare=v; else if(k==='intro'||k==='ending'||k==='mood') localStorage['ds16_'+k]=v; else rememberSnd(k,v) }catch(err){}}); location.assign('./index.html'+gameQuery())})}
  const bindVol=(id,fn)=>{const el=$(id); if(!el)return; el.addEventListener('input',()=>fn(+el.value/100)); fn(+el.value/100)};
  bindVol('t_master',v=>{if(AC?.mg)AC.mg.gain.setTargetAtTime(v,AC.currentTime,.05)});
  bindVol('t_mus',v=>{VOL.bed=v; VOL.mus=v; applyVol()});
  bindVol('t_fx',v=>{VOL.fx=v; applyVol()});
  bindVol('t_eng',v=>{VOL.eng=v; applyVol()});
  const thr=$('t_thr'); if(thr)thr.addEventListener('input',()=>{const v=+thr.value/100; S.thr=v; const lab=$('t_thrv'); if(lab)lab.textContent=Math.round(v*100)+'%'; if(JET&&AC){const pr=.72+v*.48; const nodes=JET.a?[JET.a]:[]; nodes.forEach(n=>{try{n.playbackRate.setTargetAtTime(pr,AC.currentTime,.15)}catch(e){}}); AC.jet.gain.setTargetAtTime(.1+v*.32,AC.currentTime,.15);}});
  const unlock=$('unlockBtn');
  if(unlock)unlock.addEventListener('pointerdown', async e=>{
    e.preventDefault(); ensureAudioSync();
    const st=$('unlock'); if(st){const p=st.querySelector('[data-st]')||document.createElement('div'); p.dataset.st=1; p.style.cssText='opacity:.7;margin-top:8px'; p.textContent='Loading sounds…'; if(!p.parentNode)st.appendChild(p)}
    try{ await preloadTesterSounds(); }catch(err){console.warn(err)}
    $('unlock')?.remove();
  }, {passive:false});
  function tick(){requestAnimationFrame(tick); if(AC&&S){try{updListener()}catch(e){}} if(AC){const an=AC._testMeter||AC.an; if(an){const a=new Uint8Array(an.fftSize); try{an.getByteTimeDomainData(a); let m=0; for(const v of a){const d=Math.abs(v-128); if(d>m)m=d} window.__sfxMeter=m/128}catch(e){}}}}
  window.__sfxMeter=0; window.__getMeter=()=>window.__sfxMeter; requestAnimationFrame(tick);
}
async function playLogicRaw(key){
  // A/B Logic original: decode sfx/logic/<key>.wav and play dry to destination
  if(!AC) return;
  try{
    const r=await fetch('sfx/logic/'+key+'.wav?v='+ASSET_V);
    if(!r.ok) throw 0;
    const a=await r.arrayBuffer();
    const buf=await AC.decodeAudioData(a.slice(0));
    if(testerLoops._logic){try{testerLoops._logic.stop()}catch(e){}}
    const s=AC.createBufferSource(); s.buffer=buf; const g=AC.createGain(); g.gain.value=.85;
    s.connect(g).connect(AC.destination); s.start();
    testerLoops._logic=s; s.onended=()=>{if(testerLoops._logic===s)testerLoops._logic=null};
  }catch(e){ console.warn('logic raw', key, e); }
}

function ensureAudioSync(){
  initAudio();
  if(AC && AC.state!=='running'){ try{ AC.resume(); }catch(e){} }
  if(AC && !AC._testMeter){ try{ const an=AC.createAnalyser(); an.fftSize=1024; AC.mg.connect(an); try{AC.bigB&&AC.bigB.connect(an)}catch(x){} AC._testMeter=an; }catch(e){} }
  // keep suspended contexts alive on iOS by scheduling a zero-gain blip in-gesture
  if(AC){try{const o=AC.createOscillator(),g=AC.createGain(); g.gain.value=0.0001; o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime+.01)}catch(e){}}
}
async function preloadTesterSounds(){
  if(!AC) initAudio();
  const keys=['jet8','jet','ambient','drone','mus_depth','mus_dream','mus_layers','mus_waves','aaaw','flak','flak2','sub01','sub08','subdrop','mlaunch','mmotor','msub','hitsub','impact','flare_thump','flare_hiss','flare_thunder','flare_soft','flare_deep','flare_sub','flare_body','nuke','riser',BRIEF_TRACK];
  await Promise.all(keys.map(k=>SB.get(k).catch(()=>null)));
}
let testerActiveId=null;
function playTesterRow(r, el){
  if(testerActiveId && testerActiveId!==r.id){ const prev={id:testerActiveId}; stopTesterRow(prev); }
  testerActiveId=r.id;
  document.querySelectorAll('#list .row').forEach(x=>x.classList.toggle('playing', x.dataset.id===r.id));
  const P=()=>testerPos();
  // A/B: Logic original plays dry file; In game uses engine chain
  if(el && el._ab==='logic'){
    const keyMap={engine:'jet8',bed_ambient:'ambient',bed_depth:'mus_depth',bed_dream:'mus_dream',bed_layers:'mus_layers',bed_waves:'mus_waves',wind:'ambient',aaa_near:'aaaw',aaa_far:'aaaw',flak:'flak',pass:'jet',overhead:'jet8',sam:'mlaunch',mmotor:'mmotor',hit:'impact',crash:'impact',terrain:'impact',flare:'flare_thump',ecm:'sweep',break:'sub01',rwr:'aaa',release:'subdrop',nuke:'nuke',dub:'brief'};
    playLogicRaw(keyMap[r.id]||r.id); return;
  }
  sndBypass++;
  try{
    if(r.id==='engine'){ startTesterEngine(); $('thrbox')?.classList.add('on'); }
    else if(r.id.startsWith('bed_')){ const map={bed_ambient:'ambient',bed_depth:'mus_depth',bed_dream:'mus_dream',bed_layers:'mus_layers',bed_waves:'mus_waves'}; BED=map[r.id]; startBed(); if(AC)AC.amb.gain.setTargetAtTime(.5,AC.currentTime,.05); }
    else if(r.id==='wind'){ if(AC){ AC.amb.gain.setTargetAtTime(.35,AC.currentTime,.05); if(AC.wind)AC.wind.g.gain.setTargetAtTime(.05,AC.currentTime,.05);} }
    else if(r.id==='aaa_near'){ const was=AC.voices; AC.voices=0; aaaBurst(P()); AC.voices=Math.min(AC.voices,was); }
    else if(r.id==='aaa_far'){ AC.voices=0; aaaBurst(S.pos.clone().add(new THREE.Vector3(0,-20,-4500))); }
    else if(r.id==='flak'){ AC.voices=0; flakBoom(P().add(new THREE.Vector3(0,40,0))); }
    else if(r.id==='pass'){ if(testerPan==='C')whoosh(); passBy(P()); }
    else if(r.id==='overhead'){ const Q=P(); if(testerPan==='C')whoosh(); passBy(Q); if(SB.jet8)psrc('jet8',.55,Q,true,{ref:200,rate:1.05,fadeIn:.15,tag:'overhead'}); }
    else if(r.id==='sam'){ const Q=P(); psrc('mlaunch',.85,Q,true,{ref:280,pri:1,fadeIn:.01,tag:'mlaunch'}); psrc('msub',.55,Q,true,{ref:400,pri:1,tag:'msub'}); rwrLaunch(Q,false); }
    else if(r.id==='mmotor'){ if(testerLoops.mm){mslAudioStop(testerLoops.mm); testerLoops.mm=null} const fake={p:P(),v:new THREE.Vector3(0,0,-200)}; mslAudioStart(fake); testerLoops.mm=fake; }
    else if(r.id==='hit'){ const Q=P(),pn=boomPan(Q,AC.out); if(SB.sub08)src(SB.sub08,.8,pn,{pri:1,fadeIn:.008,tag:'heavy:sub08'}); if(SB.hitsub)src(SB.hitsub,.85,pn,{pri:1,fadeIn:.008,tag:'heavy:hitsub'}); if(SB.impact)src(SB.impact,.9,pn,{pri:1,fadeIn:.008,tag:'heavy:impact'}); else thud(pn,.9,55,22,1.6); }
    else if(r.id==='crash'||r.id==='terrain'){ const Q=P(),pn=boomPan(Q,AC.out); if(SB.impact)src(SB.impact,.9,pn,{pri:1,fadeIn:.008,tag:'crash:impact'}); else if(SB.sub08)src(SB.sub08,.7,pn,{pri:1,fadeIn:.008,tag:'crash:sub08'}); else thud(pn,.8,48,22,1.2); }
    else if(r.id==='flare'){ flareSfx(); }
    else if(r.id==='ecm'){ for(let k=0;k<6;k++)blip(k%2?340:300,.12,.05); nburst(AC.out,.08,220,1.2); }
    else if(r.id==='break'){ thud(AC.out,.3,55,30,.5); nburst(AC.out,.12,200,.8); }
    else if(r.id==='rwr'){ rwrLaunch(P(),true); }
    else if(r.id==='release'){ const Q=P(); try{riser(true)}catch(e){}; if(SB.sub08)psrc('sub08',.45,Q,true,{ref:200,pri:1,tag:'sub08'}); if(SB.subdrop)psrc('subdrop',.7,Q,true,{ref:120,pri:1,tag:'subdrop'}); else thud(boomPan(Q,AC.out),.6,60,28,.8); blip(300,.2,.3); if(testerPan==='C')whoosh(); }
    else if(r.id==='nuke'){ boomSfx(true, P()); }
    else if(r.id==='dub'){ const b=SB[BRIEF_TRACK]; if(b){ stopWin(); winSrc=src(mkSeamless(b,.4),.5,AC.musB,{loop:true,tag:'dub02',fadeIn:.3}); } else { SB.get(BRIEF_TRACK).then(buf=>{ if(!buf||!AC)return; stopWin(); winSrc=src(mkSeamless(buf,.4),.5,AC.musB,{loop:true,tag:'dub02',fadeIn:.3}); }); } }
  }catch(err){ console.warn('playTesterRow', r.id, err); }
  finally{ sndBypass--; }
}
function stopTesterRow(r){
  const id=r.id||testerActiveId;
  try{ if(testerLoops._logic){try{testerLoops._logic.stop()}catch(e){} testerLoops._logic=null} 
    if(id==='engine'){ stopTesterEngine(); $('thrbox')?.classList.remove('on'); }
    else if(id && id.startsWith('bed_')){ stopBed(); if(AC)AC.amb.gain.setTargetAtTime(0,AC.currentTime,.15); }
    else if(id==='wind'){ if(AC){ AC.amb.gain.setTargetAtTime(0,AC.currentTime,.15); if(AC.wind)AC.wind.g.gain.setTargetAtTime(0,AC.currentTime,.15);} }
    else if(id==='mmotor'){ if(testerLoops.mm){mslAudioStop(testerLoops.mm); testerLoops.mm=null} }
    else if(id==='dub'){ stopWin(); }
    else if(id==='release'){ try{riser(false)}catch(e){} }
  }catch(err){ console.warn('stopTesterRow', id, err); }
  if(testerActiveId===id) testerActiveId=null;
  document.querySelectorAll('#list .row').forEach(x=>{ if(x.dataset.id===id) x.classList.remove('playing'); });
}
function startTesterEngine(){ ensureAudioSync(); if(!JET){ if(!(SB.jet8||SB.jet)) return; startJet(); stopBed(); if(AC)AC.amb.gain.setTargetAtTime(0,AC.currentTime,.05); } testerEngOn=true; if(AC){ AC.jet.gain.setTargetAtTime(.1+S.thr*.32,AC.currentTime,.08); AC.sub.gain.setTargetAtTime(.05+S.thr*.12,AC.currentTime,.08);} $('thrbox')?.classList.add('on'); }
function stopTesterEngine(){ testerEngOn=false; if(AC){ AC.jet.gain.setTargetAtTime(0,AC.currentTime,.15); AC.sub.gain.setTargetAtTime(0,AC.currentTime,.15);} }


const SCEN_PRESETS=[
  {id:'s15',name:'s15 Default',desc:'Clear natural sky, real snowline — the shipping look.',
   scen:{turbidity:2.6,rayleigh:.95,mie:.0025,mieG:.78,sunEl:21,sunAz:.62,sunInt:4.5,hemi:1.15,exposure:.88,env:.75,fogDen:0,snowAlt0:490,snowAlt1:700,snowAmt:1,warmth:0,clouds:0}},
  {id:'morning',name:'Clear Morning',desc:'Crisper air, higher sun, cooler light — still no haze.',
   scen:{turbidity:1.8,rayleigh:1.05,mie:.002,mieG:.76,sunEl:34,sunAz:.55,sunInt:5.0,hemi:1.25,exposure:.92,env:.8,fogDen:0,snowAlt0:500,snowAlt1:720,snowAmt:1,warmth:0.05,clouds:0}},
  {id:'golden',name:'Golden Hour',desc:'Low warm sun, soft contrast, subtle colour warmth.',
   scen:{turbidity:3.2,rayleigh:.85,mie:.0032,mieG:.8,sunEl:9,sunAz:.85,sunInt:3.8,hemi:1.05,exposure:.95,env:.7,fogDen:0,snowAlt0:480,snowAlt1:690,snowAmt:1,warmth:0.45,clouds:0.08}},
  {id:'haze',name:'Light Haze',desc:'Very light atmospheric haze only — not the heavy s12 fog.',
   scen:{turbidity:3.4,rayleigh:1.15,mie:.0035,mieG:.82,sunEl:24,sunAz:.62,sunInt:4.2,hemi:1.2,exposure:.86,env:.72,fogDen:0.000055,snowAlt0:500,snowAlt1:710,snowAmt:1,warmth:0.08,clouds:0.12}},
  {id:'overcast',name:'Overcast',desc:'Soft grey sky, muted sun, gentle cloud cover.',
   scen:{turbidity:6.5,rayleigh:1.4,mie:.004,mieG:.7,sunEl:28,sunAz:.5,sunInt:2.4,hemi:1.35,exposure:.78,env:.55,fogDen:0.00003,snowAlt0:510,snowAlt1:730,snowAmt:1,warmth:0,clouds:0.55}},
  {id:'fresh',name:'Fresh Snow',desc:'Heavier snow cover lower on the slopes; still natural, not plastic.',
   scen:{turbidity:2.4,rayleigh:.9,mie:.0024,mieG:.78,sunEl:20,sunAz:.62,sunInt:4.4,hemi:1.15,exposure:.9,env:.75,fogDen:0,snowAlt0:380,snowAlt1:620,snowAmt:1.15,warmth:0,clouds:0}},
  {id:'bare',name:'Bare Rock',desc:'Higher snowline — more rock faces showing on the peaks.',
   scen:{turbidity:2.7,rayleigh:.95,mie:.0026,mieG:.78,sunEl:22,sunAz:.62,sunInt:4.6,hemi:1.15,exposure:.88,env:.75,fogDen:0,snowAlt0:620,snowAlt1:860,snowAmt:0.7,warmth:0.05,clouds:0}},
  {id:'dusk',name:'Dusk',desc:'Sun nearly down, cooler shadows, quiet evening light.',
   scen:{turbidity:3.8,rayleigh:1.2,mie:.004,mieG:.84,sunEl:4,sunAz:1.05,sunInt:2.6,hemi:.95,exposure:.82,env:.6,fogDen:0.00002,snowAlt0:490,snowAlt1:700,snowAmt:1,warmth:0.25,clouds:0.18}},
];
let scenActiveId='s15';
function setupSceneryTester(){
  document.body.classList.add('sceneryMode');
  running=false; if(S){S.dead=null; S.missile=null; S.phase='ingress'}
  const sel=$('nightSel'); if(sel){sel.innerHTML=NIGHT.map(n=>'<option value="'+n.id+'">'+n.name+'</option>').join(''); sel.value='current';
    const mark=()=>{document.querySelectorAll('#nightBox .choose').forEach(b=>{b.textContent=sel.value==='current'?'✓ Day kept':'✓ '+sel.options[sel.selectedIndex].text})};
    const show=id=>{const wrap=$('previewWrap'); if(wrap)wrap.classList.add('on'); try{parkScenCruise(); setNight(id); startScenLive()}catch(err){console.warn(err)} const lab=$('previewLabel'); if(lab)lab.textContent='LIVE · '+(NIGHT.find(n=>n.id===id)?.name||id); if(wrap)wrap.scrollIntoView({block:'nearest'})};
    sel.addEventListener('change',()=>{mark(); show(sel.value)}); mark();
    $('nightPrev')?.addEventListener('pointerdown',e=>{e.preventDefault(); show(sel.value)});
    $('nightStop')?.addEventListener('pointerdown',e=>{e.preventDefault(); setNight('current'); const lab=$('previewLabel'); if(lab)lab.textContent='LIVE · Day'});
    $('nightChoose')?.addEventListener('pointerdown',e=>{e.preventDefault(); nightId=sel.value; mark(); show(sel.value)});
    const apply=$('nightApply'); if(apply){apply.addEventListener('click',e=>{e.preventDefault(); const id=sel.value||'current'; const nv=nvOn?'1':'0'; try{ if(id==='current')localStorage.removeItem('ds16_night'); else localStorage.ds16_night=id; localStorage.ds16_nv=nv }catch(err){} location.assign('./index.html'+gameQuery())})}
    $('nightNV')?.addEventListener('pointerdown',e=>{e.preventDefault(); toggleNV()});
  }
  const list=$('list'); if(!list)return;
  list.innerHTML='';
  // Still-first gallery — never empty even if WebGL fails on iPhone
  for(const p of SCEN_PRESETS){
    const el=document.createElement('div'); el.className='row'+(p.id==='s15'?' on':''); el.dataset.id=p.id;
    el.innerHTML=`<img class="still" alt="${p.name}" src="stills/${p.id}.jpg?v=${ASSET_V}" loading="lazy" onerror="this.style.opacity=.25;this.alt='still missing'"/>
      <div class="name">${p.name}</div><div class="desc">${p.desc}</div>
      <div class="acts"><button type="button" class="live" data-act="live">VIEW LIVE</button><button type="button" class="pick" data-act="pick">PICK THIS</button></div>`;
    el.addEventListener('click',e=>{
      const btn=e.target.closest('button'); if(!btn)return;
      e.preventDefault(); e.stopPropagation();
      if(btn.dataset.act==='live'){
        const wrap=$('previewWrap'); if(wrap)wrap.classList.add('on');
        try{ parkScenCruise(); applyScenPreset(p.id); startScenLive(); }catch(err){ console.warn('live',err); }
      }
      if(btn.dataset.act==='pick'){ pickScenPreset(p.id); }
    });
    list.appendChild(el);
  }
  try{
    const raw=JSON.parse(localStorage.ds15_scen_pick||'null');
    if(raw?.id && SCEN_PRESETS.some(p=>p.id===raw.id)){ showPicked(raw); }
  }catch(e){}
  // Do NOT auto-start WebGL live preview — stills are the reliable gallery on iOS
}
let _scenLive=0;
function startScenLive(){
  if(_scenLive) return; _scenLive=1;
  function fit(){const w=$('previewWrap'); if(!w)return; const r=w.getBoundingClientRect(); if(r.width<2)return; R.setSize(r.width,r.height,false); cam.aspect=r.width/Math.max(1,r.height); cam.updateProjectionMatrix()}
  fit(); addEventListener('resize',fit); if(window.visualViewport)visualViewport.addEventListener('resize',fit);
  function frame(){ if(!_scenLive)return; requestAnimationFrame(frame); try{ parkScenCruise(true); if(jet){jet.visible=true; jet.position.copy(S.pos); jet.rotation.set(S.pitch,S.yaw,S.roll)} if(msl)msl.visible=false; if(mslG)mslG.visible=false; sky.position.copy(cam.position); if(window.__stars&&window.__stars.visible)window.__stars.position.copy(cam.position); if(window.__starsBright&&window.__starsBright.visible)window.__starsBright.position.copy(cam.position); if(NIGHT_ON){expPulse=Math.max(0,expPulse-0.016); R.toneMappingExposure=(nightBase||SCEN.exposure)*(nvOn?1.35:1)*(1+expPulse)} if(useBloom&&composer)composer.render(); else R.render(scene,cam);}catch(e){} }
  requestAnimationFrame(frame);
}
function parkScenCruise(keepCam){
  // Fixed cruise: behind jet, looking down the target valley with snowy peaks in frame
  const z=-3200, x=vx(z)+40;
  const ground=H(x,z);
  S.pos.set(x, ground+320, z);
  S.yaw=0; S.pitch=-0.06; S.roll=0; S.thr=.7; S.spd=85+S.thr*195;
  const fwd=new THREE.Vector3(-Math.sin(S.yaw)*Math.cos(S.pitch),Math.sin(S.pitch),-Math.cos(S.yaw)*Math.cos(S.pitch));
  cam.position.copy(S.pos).addScaledVector(fwd,-70).add(new THREE.Vector3(0,18,0));
  cam.up.set(0,1,0);
  // look past the jet toward distant high terrain / bunker direction
  const aim=S.pos.clone().addScaledVector(fwd,900); aim.y=Math.max(aim.y, H(aim.x,aim.z)+180);
  cam.lookAt(aim);
}
function applyScenPreset(id){
  const p=SCEN_PRESETS.find(x=>x.id===id)||SCEN_PRESETS[0];
  scenActiveId=p.id;
  Object.assign(SCEN, SCEN_DEFAULT, p.scen);
  applyScen();
  document.querySelectorAll('#list .row').forEach(r=>r.classList.toggle('on',r.dataset.id===p.id));
  const lab=$('previewLabel'); if(lab)lab.textContent='LIVE · '+p.name;
}
function pickScenPreset(id){
  applyScenPreset(id);
  const p=SCEN_PRESETS.find(x=>x.id===id)||SCEN_PRESETS[0];
  const payload={v:'s15',id:p.id,name:p.name,t:Date.now(),SCEN:{...SCEN}};
  localStorage.ds15_scen_pick=JSON.stringify(payload);
  localStorage.ds15_scen=JSON.stringify({v:'s15',t:payload.t,SCEN:payload.SCEN,preset:p.id,name:p.name});
  showPicked(payload);
}
function showPicked(payload){
  const el=$('picked'); if(!el)return;
  el.textContent='PICKED: '+payload.name+' ('+payload.id+')';
  el.classList.add('on');
}
const NIGHT=[
 {id:'current',name:'Day — current',scen:null},
 {id:'n1',name:'Moon ridge',scen:{turbidity:2.2,rayleigh:.55,mie:.0014,mieG:.8,sunEl:11,sunAz:1.35,sunInt:1.15,hemi:.95,exposure:.72,env:.22,fogDen:.000012,snowAlt0:430,snowAlt1:640,snowAmt:1.05,warmth:-.15,clouds:0}},
 {id:'n2',name:'Star field',scen:{turbidity:1.5,rayleigh:.45,mie:.0007,mieG:.72,sunEl:3,sunAz:.3,sunInt:.7,hemi:1.05,exposure:.66,env:.12,fogDen:0,snowAlt0:520,snowAlt1:760,snowAmt:.85,warmth:-.2,clouds:0}},
 {id:'n3',name:'Overcast black',scen:{turbidity:10,rayleigh:1.6,mie:.01,mieG:.55,sunEl:32,sunAz:.5,sunInt:.55,hemi:1.25,exposure:.62,env:.12,fogDen:.00022,snowAlt0:560,snowAlt1:820,snowAmt:.4,warmth:0,clouds:.7}},
 {id:'n4',name:'Moon valley',scen:{turbidity:2.6,rayleigh:.7,mie:.0018,mieG:.84,sunEl:7,sunAz:2.1,sunInt:1.7,hemi:.85,exposure:.8,env:.2,fogDen:.00004,snowAlt0:500,snowAlt1:720,snowAmt:.7,warmth:.15,clouds:0}},
 {id:'n5',name:'Target glow',scen:{turbidity:1.8,rayleigh:.25,mie:.0008,mieG:.75,sunEl:-8,sunAz:.8,sunInt:.12,hemi:.3,exposure:.48,env:.06,fogDen:.000015,snowAlt0:540,snowAlt1:800,snowAmt:.6,warmth:.05,clouds:0}},
 {id:'n6',name:'Storm black',scen:{turbidity:12,rayleigh:.8,mie:.014,mieG:.5,sunEl:6,sunAz:.15,sunInt:.35,hemi:1.05,exposure:.58,env:.08,fogDen:.00055,snowAlt0:480,snowAlt1:700,snowAmt:.5,warmth:-.05,clouds:.85}}
];
const NIGHT_LOOK={
 n1:{hemi:0x8eaeef,ground:0x1a2840,sun:0xd5e4ff,fog:0x1a2744,stars:0,bunk:0,moon:1.15},
 n2:{hemi:0x8aa0e8,ground:0x101828,sun:0x99aadd,fog:0x0c1424,stars:1,dense:1,starSize:2.4,bright:6.2,bunk:0,moon:.55},
 n3:{hemi:0xa3aaa4,ground:0x4a524c,sun:0xb7beb8,fog:0x8d968f,stars:0,bunk:0,moon:.45},
 n4:{hemi:0xf0e2c4,ground:0x3a3428,sun:0xffe2b0,fog:0x6a5840,stars:0,bunk:6,moon:1.85},
 n5:{hemi:0x243448,ground:0x141820,sun:0x6688aa,fog:0x121820,stars:1,bright:3.4,bunk:4,bunkColor:0xff7a18,moon:.18,glow:1},
 n6:{hemi:0x6d7a62,ground:0x2c3328,sun:0x8a947c,fog:0x4d5a48,stars:0,bunk:0,moon:.28}
};
let bunkLight=null;
function starTex(){if(starTex.t)return starTex.t; const c=document.createElement('canvas'); c.width=c.height=32; const x=c.getContext('2d'); const grd=x.createRadialGradient(16,16,0,16,16,16); grd.addColorStop(0,'rgba(255,255,255,1)'); grd.addColorStop(.35,'rgba(255,255,255,.9)'); grd.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=grd; x.fillRect(0,0,32,32); const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return starTex.t=t}
function starShell(n, size, e0, e1){const pos=new Float32Array(n*3); for(let i=0;i<n;i++){const e=e0+Math.random()*(e1-e0), th=Math.random()*6.283, r=2600, ce=Math.cos(e); pos[i*3]=Math.cos(th)*ce*r; pos[i*3+1]=Math.sin(e)*r; pos[i*3+2]=Math.sin(th)*ce*r} const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3)); const p=new THREE.Points(g,new THREE.PointsMaterial({map:starTex(),color:0xffffff,size,sizeAttenuation:false,transparent:true,opacity:1,depthWrite:false,depthTest:false,fog:false,alphaTest:.05})); p.renderOrder=30; p.frustumCulled=false; p.visible=false; scene.add(p); return p}
function ensureStars(){if(window.__stars)return; window.__stars=starShell(640,2.3,0.05,0.62); window.__starsBright=starShell(80,6,0.08,0.48); const cv=document.createElement('canvas'); cv.width=cv.height=128; const gx=cv.getContext('2d'); const grd=gx.createRadialGradient(64,64,0,64,64,64); grd.addColorStop(0,'rgba(255,186,80,1)'); grd.addColorStop(.28,'rgba(255,110,30,.7)'); grd.addColorStop(1,'rgba(255,70,0,0)'); gx.fillStyle=grd; gx.fillRect(0,0,128,128); const tex=new THREE.CanvasTexture(cv); const mat=new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}); const s=new THREE.Sprite(mat); s.scale.set(2800,1600,1); s.position.copy(BUNK); s.position.y+=1300; s.visible=false; scene.add(s); window.__tgtGlowNight=s}
function paintNightLook(id){const L=NIGHT_LOOK[id]; if(window.__tgtGlowNight)window.__tgtGlowNight.visible=!!(L&&L.glow); const hideStars=()=>{if(window.__stars)window.__stars.visible=false; if(window.__starsBright)window.__starsBright.visible=false}; if(!L){hemiL.color.set(0xb8c8dc); hemiL.groundColor.set(0x5a5040); sun.color.set(0xfff0dc); if(scene.fog)scene.fog.color.set(0xa7b2bd); hideStars(); if(bunkLight)bunkLight.visible=false; return} hemiL.color.set(L.hemi); hemiL.groundColor.set(L.ground); sun.color.set(L.sun); if(L.moon!=null)sun.intensity=L.moon; if(scene.fog&&L.fog)scene.fog.color.set(L.fog); if(window.__stars){window.__stars.visible=!!(L.stars&&L.dense); window.__stars.material.size=L.starSize||2.3} if(window.__starsBright){window.__starsBright.visible=!!L.stars; window.__starsBright.material.size=L.bright||5} if(bunkLight){bunkLight.visible=!!L.bunk; bunkLight.intensity=L.bunk||0; bunkLight.color.set(L.bunkColor||0xffe6c4); bunkLight.distance=L.bunk?14000:520}}
function setNight(id){const p=NIGHT.find(x=>x.id===id)||NIGHT[0]; nightId=p.id; if(!p.scen){NIGHT_ON=false; nvOn=false; Object.assign(SCEN,SCEN_DEFAULT); applyScen(); paintNightLook(null); document.body.classList.remove('night'); const g=$('nvg'); if(g)g.classList.remove('on'); const b=$('nv'); if(b)b.classList.remove('on'); return} NIGHT_ON=true; Object.assign(SCEN,SCEN_DEFAULT,p.scen); nightBase=SCEN.exposure; applyScen(); ensureStars(); if(!bunkLight){bunkLight=new THREE.PointLight(0xffb060,0,14000); bunkLight.position.copy(BUNK); bunkLight.position.y+=40; scene.add(bunkLight)} paintNightLook(p.id); document.body.classList.add('night')}
function bootNight(){let id='', nv=''; try{const q=new URLSearchParams(location.search); if(q.has('night')){id=q.get('night')||''; if(!id||id==='current')localStorage.removeItem('ds16_night'); else localStorage.ds16_night=id} else id=localStorage.ds16_night||''; if(q.has('nv')){nv=q.get('nv')||'0'; localStorage.ds16_nv=nv} else nv=localStorage.ds16_nv||'0'}catch(e){} if(id&&id!=='current'&&NIGHT.some(n=>n.id===id))setNight(id); if(nv==='1'&&NIGHT_ON)toggleNV()}
if(DS_MODE==='game'){bootNight(); if($('nv'))$('nv').addEventListener('pointerdown',e=>{e.stopPropagation(); toggleNV()})}


// Frame-time / longtask instrumentation (game freezes)
window.__ftLog=[]; window.__longTasks=[]; window.__ftMark='';
try{ const _po=new PerformanceObserver((list)=>{ for(const e of list.getEntries()){ window.__longTasks.push({d:e.duration,n:e.name,t:e.startTime}); if(window.__longTasks.length>80)window.__longTasks.shift(); }}); _po.observe({entryTypes:['longtask']}); }catch(e){}
window.__ft={max:0,relMax:0,n:0,over100:0, mark(m){window.__ftMark=m}, snap(){return {max:this.max,over100:this.over100,n:this.n,top:[...window.__ftLog].sort((a,b)=>b.dt-a.dt).slice(0,8), lt:window.__longTasks.slice(-8)}}};

window.__S=()=>S;window.__brk=doBreak;window.__flr=fireFlares;window.__ecm=doECM;window.__begin=begin;window.__inp=inp;window.__aaa=P=>aaaBurst(P||BUNK.clone());window.__flak=P=>flakBoom(P||BUNK.clone().add(new THREE.Vector3(0,80,0)));window.__whoosh=whoosh;window.__passBy=P=>passBy(P||S.pos.clone());window.__sam=d=>samRoar(d||800);window.__rwr=P=>rwrLaunch(P||BUNK.clone(),false);window.__boom=b=>boomSfx(!!b);window.__crash=()=>crashSfx();window.__die=w=>die(w||'TEST CRASH');window.__thud=()=>thud(AC.out,.5,48,20,1);window.__nburst=()=>nburst(AC.out,.3,220,.5);window.__BUNK=()=>BUNK;window.__showBunker=v=>{if(v==null)return bunker.visible; bunker.visible=!!v; return bunker.visible};window.__release=release;window.__H=H;window.__setThr=setThr;window.__AC=()=>AC;window.__ft={max:0,relMax:0,n:0,markRel(){this._r=performance.now()}};window.__sfx=()=>window.__sfxLog.slice();window.__clearSfx=()=>{window.__sfxLog=[]};window.__flareId=()=>flareChoice().id;window.__flarePlay=id=>{ensureAudioSync(); const c=FLARE_OPTS.find(o=>o.id===id)||flareChoice(); const go=()=>startFlare(c); if(c.key&&!SB[c.key])return SB.get(c.key).then(b=>b&&go()); if(!c.key)return Promise.all(['flare_thump','flare_hiss'].map(k=>SB.get(k).catch(()=>null))).then(go); return Promise.resolve(go())};
window.__aaaVoices=()=>aaaShots.length;
window.__boomVoices=()=>boomShots.length;
window.__sndId=sec=>sndChoice(sec).id;
window.__surrPn=()=>surrTest.pn; window.__testerPan=()=>testerPan; window.__previewN=()=>sndPrev.length;
window.__SITES=SITES;window.__gunDown=v=>{gunDown=!!v};window.__fireCannon=()=>fireCannon();window.__updRounds=updRounds;window.__updSites=updSites;window.__dropIron=i=>dropIron(i);window.__updIron=updIron;window.__intro=()=>!!introS;window.__gunRounds=()=>rounds.length;window.__launchSAM=i=>launchSAM(i);
window.__sndSecs=()=>SND.map(s=>s.id);
window.__sndFire=async sec=>{ensureAudioSync(); const c=sndChoice(sec); if(c.key) await SB.get(c.key); const P=S.pos.clone();
 if(sec==='engine'){ if(JET){try{JET.stop()}catch(e){} JET=null} startJet(); }
 else if(sec==='bed'||sec==='ambience') startBed();
 else if(sec==='aaa') aaaBurst(P);
 else if(sec==='sam') samRoar(400);
 else if(sec==='pass') passBy(P);
 else if(sec==='boom'){ if(!useSnd('boom',P)) boomSfx(false); }
 else if(sec==='bombrelease'||sec==='release'){ if(!useSnd('bombrelease',P)){riser(true)} }
 else if(sec==='nuke') boomSfx(true);
 else if(sec==='radar') rwrLaunch(P,false);
 else if(sec==='crash') crashSfx();
 else if(sec==='overhead') useSnd('overhead',P);
 return sndChoice(sec).id};

// mode boot (after all lets)
function paintMusic(cat){const id=musicChoice(cat); document.querySelectorAll('#musicBox [data-cat="'+cat+'"] .frow').forEach(el=>{const on=el.dataset.id===id; el.classList.toggle('chosen',on); const b=el.querySelector('.choose'); if(b)b.textContent=on?'✓ Chosen':'✓ Choose'})}
function applySurr(){const mode=SURR.on?'HRTF':'equalpower'; if(!AC)return; if(AC.rotorPan)AC.rotorPan.panningModel=mode; if(AC.jetIdlePan)AC.jetIdlePan.panningModel=mode}
function bindGameMusic(){
 for(const cat of ['intro','ending','mood']){
  const sel=$('s_'+cat); if(sel&&!sel.dataset.filled){sel.dataset.filled='1'; sel.innerHTML=MUSIC_PRE[cat].map(x=>'<option value="'+x[0]+'">'+x[1]+'</option>').join(''); sel.addEventListener('change',()=>{rememberMusic(cat,sel.value); if(cat==='mood'&&S&&!takingOff()){stopMood(true); startMood()} if(cat==='intro'&&S&&takingOff()){stopIntroMusic(); startIntroMusic()}})}
  if(sel)sel.value=musicChoice(cat);
  const lv=$('s_lv_'+cat); const lab=$('v_lv_'+cat); if(lv){lv.value=Math.round(musicLevel(cat)*100); if(lab)lab.textContent=lv.value; if(!lv.dataset.bound){lv.dataset.bound='1'; lv.addEventListener('input',()=>{try{localStorage['ds16_lv_'+cat]=lv.value}catch(e){} if(lab)lab.textContent=lv.value})}}
 }
 const ss=$('s_surr'); if(ss){ss.value=SURR.on?'1':'0'; if(!ss.dataset.bound){ss.dataset.bound='1'; ss.addEventListener('change',()=>{SURR.on=ss.value!=='0'; try{localStorage.ds16_surr=SURR.on?'1':'0'}catch(e){} applySurr()})}}
 const sw=$('s_width'); const wl=$('v_width'); if(sw){sw.value=Math.round(SURR.width*100); if(wl)wl.textContent=sw.value; if(!sw.dataset.bound){sw.dataset.bound='1'; sw.addEventListener('input',()=>{SURR.width=Math.min(2,Math.max(0,+sw.value/100)); try{localStorage.ds16_width=SURR.width}catch(e){} if(wl)wl.textContent=sw.value})}}
 document.querySelectorAll('#setp input[type=range]').forEach(el=>{if(el._smooth)return; el._smooth=1; el.style.touchAction='none'; let pid=null; const setFrom=e=>{const r=el.getBoundingClientRect(); const t=Math.min(1,Math.max(0,(e.clientX-r.left)/Math.max(1,r.width))); const min=+el.min||0, max=+el.max||100; el.value=String(min+t*(max-min)); el.dispatchEvent(new Event('input',{bubbles:true}))}; el.addEventListener('pointerdown',e=>{e.preventDefault(); e.stopPropagation(); pid=e.pointerId; try{el.setPointerCapture(pid)}catch(x){} setFrom(e)}); el.addEventListener('pointermove',e=>{if(e.pointerId!==pid)return; e.preventDefault(); setFrom(e)}); el.addEventListener('pointerup',e=>{if(e.pointerId===pid)pid=null}); el.addEventListener('pointercancel',e=>{if(e.pointerId===pid)pid=null}); el.addEventListener('touchmove',e=>{if(pid!=null)e.preventDefault()},{passive:false})});
}
let musicPreview=null;
function buildMusicPicker(){const host=$('musicBox'); if(!host){bindGameMusic(); return}
 host.innerHTML='';
 for(const cat of ['intro','ending','mood']){
  const sec=document.createElement('section'); sec.dataset.cat=cat;
  const h=document.createElement('h2'); h.textContent=cat==='intro'?'INTRO — take-off':cat==='ending'?'ENDING — mission complete':'MOOD — valley bed'; sec.appendChild(h);
  const range=document.createElement('input'); range.type='range'; range.min='0'; range.max='100'; range.value=String(Math.round(musicLevel(cat)*100)); range.id='ml_'+cat; sec.appendChild(range);
  range.addEventListener('input',()=>{try{localStorage['ds16_lv_'+cat]=range.value}catch(e){}});
  for(const [id,name,desc] of MUSIC_PRE[cat]){
   const el=document.createElement('div'); el.className='frow'; el.dataset.id=id;
   el.innerHTML='<div class="meta"><div class="name"></div><div class="desc"></div></div><div class="acts"><button type="button" class="play" data-act="play">▶ PLAY</button><button type="button" class="stop" data-act="stop">■ STOP</button><button type="button" class="choose" data-act="choose">✓ Choose</button></div>';
   el.querySelector('.name').textContent=name; el.querySelector('.desc').textContent=desc;
   el.querySelectorAll('button').forEach(btn=>btn.addEventListener('pointerdown',e=>{e.preventDefault(); e.stopPropagation(); ensureAudioSync();
    if(btn.dataset.act==='play'){if(musicPreview){musicPreview.stop(); musicPreview=null} const pid=id==='random'?resolveMusic(cat):id; const go=()=>{if(pid==='current'||pid==='off'||!MUSIC_LAY[pid])return; musicPreview=playLayers(pid,AC.out,musicLevel(cat))}; const need=(MUSIC_LAY[pid]||[]).filter(l=>!SB[l.k]); if(!need.length)go(); else Promise.all(need.map(l=>SB.get(l.k))).then(go); sec.querySelectorAll('.frow').forEach(x=>x.classList.remove('playing')); el.classList.add('playing')}
    else if(btn.dataset.act==='stop'){if(musicPreview){musicPreview.stop(); musicPreview=null} el.classList.remove('playing')}
    else{rememberMusic(cat,id); paintMusic(cat); if(cat==='mood'){stopMood(true); if(id!=='off'&&id!=='current')startMood()}}
   }));
   sec.appendChild(el);
  }
  host.appendChild(sec); paintMusic(cat);
 }
 const ts=$('t_surr'); if(ts){ts.value=SURR.on?'1':'0'; ts.addEventListener('change',()=>{SURR.on=ts.value!=='0'; try{localStorage.ds16_surr=SURR.on?'1':'0'}catch(e){} applySurr()})}
 const tw=$('t_width'); if(tw){tw.value=String(Math.round(SURR.width*100)); const lab=$('v_t_width'); if(lab)lab.textContent=tw.value; tw.addEventListener('input',()=>{SURR.width=Math.min(2,Math.max(0,+tw.value/100)); try{localStorage.ds16_width=SURR.width}catch(e){} if(lab)lab.textContent=tw.value})}
 document.querySelectorAll('#musicBox input[type=range]').forEach(el=>{if(el._smooth)return; el._smooth=1; el.style.touchAction='none'; let pid=null; const setFrom=e=>{const r=el.getBoundingClientRect(); const t=Math.min(1,Math.max(0,(e.clientX-r.left)/Math.max(1,r.width))); const min=+el.min||0, max=+el.max||100; el.value=String(min+t*(max-min)); el.dispatchEvent(new Event('input',{bubbles:true}))}; el.addEventListener('pointerdown',e=>{e.preventDefault(); e.stopPropagation(); pid=e.pointerId; try{el.setPointerCapture(pid)}catch(x){} setFrom(e)}); el.addEventListener('pointermove',e=>{if(e.pointerId!==pid)return; e.preventDefault(); setFrom(e)}); el.addEventListener('pointerup',e=>{if(e.pointerId===pid)pid=null}); el.addEventListener('pointercancel',e=>{if(e.pointerId===pid)pid=null}); el.addEventListener('touchmove',e=>{if(pid!=null)e.preventDefault()},{passive:false})});
 bindGameMusic();
}
const NB_LABEL={gun:'GUN — your cannon',bunker:'BUNKER — the strike',flare:'FLARE',sam:'SAM LAUNCH',pass:'MISSILE PASS',boom:'IMPACTS — kills and blasts, not the bunker',crash:'CRASH — your jet',aaa:'AAA — valley guns',engine:'ENGINE',deck:'DECK — take-off only',nearmiss:'NEAR MISS',wind:'WIND — low flying',warn:'WARNING — RWR',rumble:'RUMBLE TAIL',flyby:'BANDIT FLYBY'};
function stopBankPreview(){stopPreview(); if(JET){try{JET.stop()}catch(e){} JET=null} try{stopDeckAmbience()}catch(e){}}
function previewCurrentBank(cat){const P=panPoint(testerPan); if(cat==='gun')gunSnd(); else if(cat==='bunker')bunkerBlast(P); else if(cat==='flare')flareSfx(); else if(cat==='sam')samRoar(600); else if(cat==='pass')passBy(P); else if(cat==='boom')boomSfx(false,P); else if(cat==='crash')crashSfx(); else if(cat==='aaa')aaaBurst(P); else if(cat==='engine')startJet(); else if(cat==='deck'){const was=S&&S.phase; if(S)S.phase='deck'; startDeckAmbience(); if(S)S.phase=was} else if(cat==='nearmiss')nearWhoosh(); else if(cat==='warn')lockTone()}
async function previewBank(cat){stopBankPreview(); ensureAudioSync(); const spec=nbSpec(cat); if(!spec){previewCurrentBank(cat); return} await Promise.all((spec.layers||[]).map(l=>SB.get(l.k).catch(()=>null))); playBank(cat, panPoint(testerPan))}
function setupBank(){document.body.classList.add('soundsMode'); running=false; const host=$('bankList'); if(!host)return; host.innerHTML='';
 for(const cat of Object.keys(NB)){const row=document.createElement('div'); row.className='pick'; row.innerHTML='<div class="nm"></div><select></select><button type="button" class="play">PLAY</button><button type="button" class="stop">STOP</button><div class="desc"></div>'; row.querySelector('.nm').textContent=NB_LABEL[cat]||cat; const sel=row.querySelector('select'); sel.dataset.cat=cat; for(const o of NB[cat]){const op=document.createElement('option'); op.value=o.id; op.textContent=o.name; sel.appendChild(op)} sel.value=nbChoice(cat); const desc=row.querySelector('.desc'); const paint=()=>{const o=NB[cat].find(x=>x.id===sel.value); desc.textContent=o&&o.desc?o.desc:''; desc.style.display=desc.textContent?'block':'none'}; sel.addEventListener('change',()=>{rememberNb(cat,sel.value); paint()}); paint(); row.querySelector('.play').addEventListener('pointerdown',e=>{e.preventDefault(); previewBank(cat)}); row.querySelector('.stop').addEventListener('pointerdown',e=>{e.preventDefault(); stopBankPreview()}); host.appendChild(row)}
 const lv=$('nbLv'); if(lv){lv.value=String(Math.round(nbLevel()*100)); const b=$('nbLvN'); if(b)b.textContent=lv.value; lv.addEventListener('input',()=>{NB_MEM.lv=lv.value; try{localStorage.ds17_nb_lv=lv.value}catch(e){} if(b)b.textContent=lv.value})}
 document.querySelectorAll('#bankPan [data-pan]').forEach(btn=>btn.addEventListener('pointerdown',e=>{e.preventDefault(); testerPan=btn.dataset.pan; document.querySelectorAll('#bankPan [data-pan]').forEach(x=>x.classList.toggle('on',x===btn)); refreshPreviewPans()}));
 const apply=$('bankApply'); if(apply){apply.addEventListener('click',e=>{e.preventDefault(); host.querySelectorAll('select').forEach(sel=>rememberNb(sel.dataset.cat, sel.value)); location.assign('./index.html'+gameQuery())})}
 const unlock=$('unlockBtn'); if(unlock)unlock.addEventListener('pointerdown',e=>{e.preventDefault(); ensureAudioSync(); const u=$('unlock'); if(u)u.remove()});
 window.__nb=()=>{const o={lv:Math.round(nbLevel()*100)}; for(const c of Object.keys(NB))o[c]=nbChoice(c); return o};
}
if(DS_MODE==='sounds')setupSoundTester();
else if(DS_MODE==='bank')setupBank();
else if($('s_intro'))bindGameMusic();
else if(DS_MODE==='scenery')setupSceneryTester();
document.querySelectorAll('[data-togame]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault(); location.assign('./index.html')}));
