const DS_MODE=(window.__DS_MODE)||(/sounds\.html/.test(location.pathname)?'sounds':/scenery\.html/.test(location.pathname)?'scenery':'game');
window.__DS_MODE=DS_MODE;

import * as THREE from 'three';
import {Sky} from './vendor/jsm/objects/Sky.js';
import {EffectComposer} from './vendor/jsm/postprocessing/EffectComposer.js';
import {Pass,FullScreenQuad} from './vendor/jsm/postprocessing/Pass.js';
import {RenderPass} from './vendor/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from './vendor/jsm/postprocessing/OutputPass.js';
const $=id=>document.getElementById(id);
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
const SAMP=new THREE.Vector3(vx(-10900)+330,0,-10900); SAMP.y=H(SAMP.x,SAMP.z);
const MOB=matchMedia('(pointer:coarse)').matches||/iPhone|iPad|Android/.test(navigator.userAgent);
const SITES=[[-3700,-340,'SA-X 1'],[-7300,370,'SA-X 2'],[-10900,330,'SA-X 3']].map(([z,o,n])=>{const p=new THREE.Vector3(vx(z)+o,0,z);p.y=H(p.x,p.z);return{p,n}});
function los(a,b){for(let i=1;i<14;i++){const k=i/14,x=a.x+(b.x-a.x)*k,y=a.y+(b.y-a.y)*k,z=a.z+(b.z-a.z)*k;if(y<H(x,z)+4)return false}return true}
const RADP=new THREE.Vector3(vx(-5200)-700,0,-5200); RADP.y=H(RADP.x,RADP.z);
const EXZ=-15200, EXIT=new THREE.Vector3(vx(EXZ),0,EXZ); EXIT.y=H(EXIT.x,EXIT.z)+80;
// ---------- renderer ----------
const gl=$('gl'), R=new THREE.WebGLRenderer({canvas:gl,antialias:true,powerPreference:'high-performance'});
let PR=Math.min(devicePixelRatio,MOB?1.25:1.75); R.setPixelRatio(PR);
R.toneMapping=THREE.ACESFilmicToneMapping; R.toneMappingExposure=.88; R.shadowMap.enabled=!MOB; R.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene(); scene.fog=null;
const cam=new THREE.PerspectiveCamera(60,1,1,16000); cam.rotation.order='YXZ';
const SCEN={turbidity:2.6,rayleigh:.95,mie:.0025,mieG:.78,sunEl:21,sunAz:.62,sunInt:4.5,hemi:1.15,exposure:.88,env:.75,fogDen:0,fogFar:14000,snowAlt0:490,snowAlt1:700,snowAmt:1,warmth:0,clouds:0};
const SCEN_DEFAULT={...SCEN};
const SUN=new THREE.Vector3().setFromSphericalCoords(1,(90-SCEN.sunEl)*D2R,SCEN.sunAz);
const sky=new Sky(); sky.scale.setScalar(14000); const su=sky.material.uniforms;
su.turbidity.value=SCEN.turbidity; su.rayleigh.value=SCEN.rayleigh; su.mieCoefficient.value=SCEN.mie; su.mieDirectionalG.value=SCEN.mieG; su.sunPosition.value.copy(SUN);
let hemiL=new THREE.HemisphereLight(0xb8c8dc,0x5a5040,SCEN.hemi); scene.add(hemiL);
const sun=new THREE.DirectionalLight(0xfff0dc,SCEN.sunInt); sun.position.copy(SUN).multiplyScalar(1000); scene.add(sun); scene.add(sun.target);
scene.add(sky);
let envPM=null;
function rebuildEnv(){const es=new THREE.Scene(); const s2=new Sky(); s2.scale.setScalar(1000); Object.assign(s2.material.uniforms.sunPosition.value,SUN); for(const k of['turbidity','rayleigh','mieCoefficient','mieDirectionalG'])s2.material.uniforms[k].value=su[k].value; es.add(s2);
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
sun.castShadow=!MOB; sun.shadow.mapSize.set(1024,1024); {const c=sun.shadow.camera;c.left=c.bottom=-140;c.right=c.top=140;c.near=10;c.far=2000;} sun.shadow.bias=-.0004; sun.shadow.normalBias=.6;
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
{const g=new THREE.PlaneGeometry(6400,17600,160,440); g.rotateX(-Math.PI/2); g.translate(0,0,-7400);
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
const tmesh=new THREE.Mesh(g,tm);tmesh.receiveShadow=true;scene.add(tmesh);}
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
 const g=new THREE.LatheGeometry(prof,7); const N=MOB?1000:2800, m=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({color:0x1f2a1b,roughness:.97}),N), M=new THREE.Matrix4(), q=new THREE.Quaternion(), e=new THREE.Euler(), C=new THREE.Color();
 let k=0; for(let i=0;i<N*4&&k<N;i++){const z=1000-Math.random()*17000, x=vx(z)+rnd(700), y=H(x,z); if(y>260||y<4||Math.hypot(x-BUNK.x,z-BUNK.z)<230||fbm(x*.004,z*.004)<.45)continue;
  const s=.7+Math.random()*.9; q.setFromEuler(e.set(rnd(.05),Math.random()*6,rnd(.05))); M.compose(new THREE.Vector3(x,y-.5,z),q,new THREE.Vector3(s,s*(.85+Math.random()*.5),s)); m.setMatrixAt(k,M); m.setColorAt(k,C.setHSL(.25+rnd(.05),.18+Math.random()*.1,.55+Math.random()*.45)); k++} m.count=k; m.castShadow=true; scene.add(m);
 const bg=new THREE.DodecahedronGeometry(1,0), bm=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x8a847c,roughness:1,map:(()=>{const t=new THREE.TextureLoader().load('tex/rocky_terrain_02_diff.jpg');t.colorSpace=THREE.SRGBColorSpace;return t})(),normalMap:new THREE.TextureLoader().load('tex/rocky_terrain_02_nor_gl.jpg')}),MOB?260:1100); k=0;bm.castShadow=!MOB;bm.receiveShadow=true;
 for(let i=0;i<(MOB?260:1100);i++){const z=1000-Math.random()*17000, x=vx(z)+rnd(500), y=H(x,z); const s=1+Math.random()*4; q.setFromEuler(e.set(Math.random()*3,Math.random()*3,0)); M.compose(new THREE.Vector3(x,y-s*.3,z),q,new THREE.Vector3(s,s*(.45+Math.random()*.35),s*(.9+Math.random()*.6))); bm.setMatrixAt(k++,M)} scene.add(bm);}
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
// SAM site and EW radar
const sam=new THREE.Group(); sam.position.copy(SAMP); scene.add(sam);
{truck(sam,0,0,.6,true);truck(sam,14,8,-.4);const rv=new THREE.Mesh(new THREE.TorusGeometry(10,1.2,6,24),earth);rv.rotation.x=Math.PI/2;rv.scale.z=.8;sam.add(rv);}
for(const st of SITES.slice(0,2)){const g=new THREE.Group();g.position.copy(st.p);scene.add(g);truck(g,0,0,1.2,true);truck(g,12,-6,.2);const rv=new THREE.Mesh(new THREE.TorusGeometry(9,1.1,6,24),earth);rv.rotation.x=Math.PI/2;rv.scale.z=.8;g.add(rv);g.traverse(o=>{if(o.isMesh)o.castShadow=true})}
const bulge=new THREE.Mesh(new THREE.SphereGeometry(1,24,10,0,Math.PI*2,0,Math.PI/2),earth);bulge.visible=false;scene.add(bulge);
const radar=new THREE.Group(); radar.position.copy(RADP); scene.add(radar);
{box(1.4,22,1.4,steel,0,11,0,radar);const d=new THREE.Mesh(new THREE.SphereGeometry(9,20,12),new THREE.MeshStandardMaterial({color:0xd8d8d4,roughness:.6}));d.position.y=27;radar.add(d);box(10,4,8,concrete,8,2,6,radar);}
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
 for(const [x,c] of[[-5.55,0xff2a20],[5.55,0x30ff50]]){const l=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:c,blending:THREE.AdditiveBlending,depthWrite:false}));l.scale.setScalar(.6);l.position.set(x,-.15,2.7);jet.add(l)}}
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
 for(const c of[...jet.children])if(c.isMesh&&c!==jet.userData.sh&&c!==jet.userData.core)c.visible=false;
 for(const c of jet.children)if(c.isGroup)c.visible=false;
 jet.userData.core.visible=false;jet.add(wrap);window.__glb='ok';
},undefined,e=>{window.__glb='fail';console.warn('glb',e)})).catch(e=>{window.__glb='fail'});
// ---------- particles ----------
const parts=[],_pool=[];
function _mkSpr(add,tex){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:tex||smokeTex,color:0xffffff,transparent:true,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending,fog:true,rotation:0}));m.visible=false;scene.add(m);return m}
function spr(pos,color,size,life,vel,o={}){if(parts.length>(MOB?260:750)&&!o.must)return null;
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
const msl=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,3.6,8),new THREE.MeshStandardMaterial({color:0xd8d8d0,roughness:.6}));msl.geometry.rotateX(Math.PI/2);msl.visible=false;scene.add(msl);msl.scale.setScalar(2.2);const mslG=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,color:0xffd8a0,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,fog:false}));mslG.visible=false;scene.add(mslG);
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
let useBloom=true;
// ---------- audio (unchanged from s0) ----------
let AC=null,trkG=null,eng=null,lockBuf=null,warnG=null,seekG=null,tone=null;
const _nb={};function noiseBuf(sec){if(_nb[sec])return _nb[sec];const n=AC.sampleRate*sec|0,b=AC.createBuffer(1,n,AC.sampleRate),d=b.getChannelData(0);for(let i=0;i<n;i++)d[i]=Math.random()*2-1;return _nb[sec]=b}
function mkSeamless(buf,xf=.35){if(!buf||buf.__seam)return buf;const n=buf.length,sr=buf.sampleRate,w=Math.min(sr*xf|0,n>>2);if(w<64){buf.__seam=1;return buf}const out=AC.createBuffer(buf.numberOfChannels,Math.max(w*4,n-w),sr);
 for(let c=0;c<buf.numberOfChannels;c++){const i=buf.getChannelData(c),o=out.getChannelData(c),L=out.length;o.set(i.subarray(0,Math.min(L,i.length)));
  for(let k=0;k<w;k++){const f=k/w;o[k]=i[k]*f+i[n-w+k]*(1-f)}}
 out.__seam=1;return out}
function startSmoothLoop(buf,vol,dest,opt={}){if(!AC||!buf)return null;buf=mkSeamless(buf,opt.xf||.4);const tag=opt.tag||'loop',rate=opt.rate||1;const dur=Math.max(.05,buf.duration),off=Math.random()*dur*.45;
 const a=src(buf,vol*.72,dest,{loop:true,fadeIn:opt.fadeIn||.8,tag,rate,off});
 const b=src(buf,vol*.55,dest,{loop:true,fadeIn:opt.fadeIn||.8,tag:tag+'_b',rate:rate*(opt.detune||1.003),off:(off+dur*.5)%dur});
 const drift=()=>{if(!AC||AC.state==='closed')return;if(window.__frozen){setTimeout(drift,900);return}const tt=AC.currentTime;try{a.playbackRate.setTargetAtTime(rate*(1+Math.sin(tt*.07)*.006),tt,.5);b.playbackRate.setTargetAtTime(rate*(opt.detune||1.003)*(1+Math.sin(tt*.05+.8)*.005),tt,.5)}catch(e){}setTimeout(drift,900)};drift();
 return {a,b,g:a.g,playbackRate:a.playbackRate,stop(){try{a.stop()}catch(e){}try{b.stop()}catch(e){}}}}
function initAudio(){if(AC){AC.resume();return}const ACC=window.AudioContext||window.webkitAudioContext;try{AC=new ACC({latencyHint:'playback'})}catch(e){AC=new ACC()}AC.voices=0;
 const mg=AC.createGain();mg.gain.value=.8;mg.connect(AC.destination);AC.mg=mg;const out=AC.createDynamicsCompressor();out.threshold.value=-14;out.knee.value=8;out.ratio.value=12;out.attack.value=.006;out.release.value=.3;out.connect(mg);
 AC.bigB=AC.createGain();const bl=AC.createDynamicsCompressor();bl.threshold.value=-4;bl.knee.value=2;bl.ratio.value=20;bl.attack.value=.002;bl.release.value=.4;const bg=AC.createGain();bg.gain.value=.9;AC.bigB.connect(bl).connect(bg).connect(AC.destination);
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
  const nb=mkSeamless(noiseBuf(8),.5);const n=AC.createBufferSource();n.buffer=nb;n.loop=true;n.playbackRate.value=.97;const nf=AC.createBiquadFilter();nf.type='lowpass';nf.frequency.value=90;const ng=AC.createGain();ng.gain.value=1.4;n.connect(nf).connect(ng).connect(AC.sub);n.start(0,Math.random()*4)}
 AC.dk=AC.createGain();AC.dk.connect(out);AC.mus=AC.createGain();AC.mus.gain.value=1;AC.mus.connect(AC.musB).connect(AC.dk);AC.amb=AC.createGain();AC.amb.gain.value=0;AC.amb.connect(AC.bedB);
 // ambience sub drone
 {const nb=mkSeamless(noiseBuf(10),.5);const n=AC.createBufferSource();n.buffer=nb;n.loop=true;n.playbackRate.value=.48;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=70;const g=AC.createGain();g.gain.value=.75;const o=AC.createOscillator();o.frequency.value=46;const og=AC.createGain();og.gain.value=.05;o.connect(og).connect(AC.amb);o.start();n.connect(f).connect(g).connect(AC.amb);n.start(0,Math.random()*5)}

 AC.jet=AC.createGain();AC.jet.gain.value=0;AC.jlp=AC.createBiquadFilter();AC.jlp.type='lowpass';AC.jlp.frequency.value=2500;AC.jlp.Q.value=.5;AC.jet.connect(AC.jlp).connect(AC.engB).connect(AC.dk);
 {const wb=mkSeamless(noiseBuf(12),.6);const w=AC.createBufferSource();w.buffer=wb;w.loop=true;w.playbackRate.value=.92;const bp=AC.createBiquadFilter();bp.type='bandpass';bp.Q.value=.55;bp.frequency.value=480;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1300;
  const g=AC.createGain();g.gain.value=0;w.connect(bp).connect(lp).connect(g).connect(AC.mus);w.start(0,Math.random()*6);AC.wind={g,bp}}
 SB.load();prewarmAudio();
 warnG=AC.createGain();warnG.gain.value=0;tone=AC.createOscillator();tone.type='triangle';tone.frequency.value=880;const tf=AC.createGain();tf.gain.value=.07;tone.connect(tf).connect(warnG).connect(AC.tone);tone.start();
 trkG=AC.createGain();trkG.gain.value=0;{const o=AC.createOscillator();o.type='sine';o.frequency.value=440;o.connect(trkG).connect(AC.tone);o.start()}
 seekG=AC.createGain();seekG.gain.value=0;const so=AC.createOscillator();so.type='sine';so.frequency.value=520;so.connect(seekG).connect(AC.tone);so.start();seekG.o=so;
}
// Briefing music: swap this ONE reference to change the entry track (sfx/<name>.mp3 + optional .ogg)
const BRIEF_TRACK='brief';
const ASSET_V='14';
const SB={b:{},load(){for(const k of[BRIEF_TRACK,'nuke','sub01','sub08','jet','ambient','riser','jet8','drone','flak','flak2','impact','mlaunch','mmotor','sweep','subdrop','aaaw','msub','hitsub','mus_depth','mus_dream','mus_layers','mus_waves','flare_thump','flare_hiss'])this.get(k)},
 get(k){if(this.b[k])return this.b[k];const tryf=ext=>fetch('sfx/'+k+'.'+ext+'?v='+ASSET_V).then(r=>{if(!r.ok)throw 0;return r.arrayBuffer()}).then(a=>new Promise((res,rej)=>AC.decodeAudioData(a.slice(0),res,rej)));
  return this.b[k]=tryf('mp3').catch(()=>tryf('ogg')).then(b=>(this[k]=b)).catch(()=>null)}};
window.__sfxLog=[];function sfxLog(name,extra={}){try{window.__sfxLog.push(Object.assign({t:AC?AC.currentTime:0,name},extra));if(window.__sfxLog.length>400)window.__sfxLog.shift()}catch(e){}}
function src(buf,vol,dest,opt={}){const s=AC.createBufferSource();s.buffer=buf;s.loop=!!opt.loop;s.playbackRate.value=opt.rate||1;const g=AC.createGain(),t0=opt.when||AC.currentTime;const cap=!opt.loop&&!opt.pri&&AC.voices>=12;if(cap)vol=0;const fi=opt.fadeIn!=null?opt.fadeIn:(opt.pri?.08:.05);g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(vol,t0+Math.max(.05,fi));sfxLog(opt.tag||'buf',{vol,rate:opt.rate||1,fadeIn:fi,pri:!!opt.pri});if(!opt.loop){AC.voices++;s.onended=()=>{AC.voices--;try{g.disconnect()}catch(e){}}}if(cap)s.stop(t0+.03);
 let n=s.connect(g);if(opt.pan!=null&&AC.createStereoPanner){const p=AC.createStereoPanner();p.pan.value=opt.pan;n=n.connect(p)}n.connect(dest||AC.out);s.start(t0,opt.off||0);s.g=g;return s}
function psrc(k,vol,P,hrtf,o={}){if(!AC||!SB[k])return null;o.tag=o.tag||('psrc:'+k);const pn=mkPan(hrtf,o.ref||150);setP0(pn,P);pn.connect(AC.out);const s=src(SB[k],vol,pn,o);const e=s.onended;s.onended=()=>{e&&e();try{pn.disconnect()}catch(x){}};return s}
window.__aud=()=>({st:AC&&AC.state,loaded:Object.keys(SB).filter(k=>SB[k]&&SB[k].duration),jet:!!JET,brief:!!briefSrc,riser:!!riserS,jg:AC&&AC.jet&&+AC.jet.gain.value.toFixed(3),amb:AC&&AC.amb&&+AC.amb.gain.value.toFixed(3),rate:JET&&+((JET.a||JET).playbackRate.value).toFixed(3),musdb:+(20*Math.log10(musRMS()+1e-9)).toFixed(1),dk:AC&&+AC.dk.gain.value.toFixed(2),flyCD:+flyCD.toFixed(1)});
// ---- 3D audio: HRTF for few key sources, equal-power for the rest ----
function mkPan(hrtf,ref=120){const p=AC.createPanner();p.panningModel=hrtf?'HRTF':'equalpower';p.distanceModel='inverse';p.refDistance=ref;p.rolloffFactor=1;p.maxDistance=12000;return p}
function setP(p,v){const t=AC.currentTime;if(p.positionX){p.positionX.setTargetAtTime(v.x,t,.03);p.positionY.setTargetAtTime(v.y,t,.03);p.positionZ.setTargetAtTime(v.z,t,.03)}else p.setPosition(v.x,v.y,v.z)}
function setP0(p,v){if(p.positionX){p.positionX.value=v.x;p.positionY.value=v.y;p.positionZ.value=v.z}else p.setPosition(v.x,v.y,v.z)}
function updListener(){if(!AC)return;const L=AC.listener,c=cam.position,f=new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion),u=new THREE.Vector3(0,1,0).applyQuaternion(cam.quaternion),t=AC.currentTime;
 if(L.positionX){L.positionX.setTargetAtTime(c.x,t,.02);L.positionY.setTargetAtTime(c.y,t,.02);L.positionZ.setTargetAtTime(c.z,t,.02);L.forwardX.setTargetAtTime(f.x,t,.02);L.forwardY.setTargetAtTime(f.y,t,.02);L.forwardZ.setTargetAtTime(f.z,t,.02);L.upX.setTargetAtTime(u.x,t,.02);L.upY.setTargetAtTime(u.y,t,.02);L.upZ.setTargetAtTime(u.z,t,.02)}else{L.setPosition(c.x,c.y,c.z);L.setOrientation(f.x,f.y,f.z,u.x,u.y,u.z)}}
// deep thud: sine sweep + 2nd/3rd harmonic so phones hear it
function thud(dest,v,f0=70,f1=32,dur=.35,t=AC.currentTime){f0=Math.min(f0,55);for(const [m,a] of[[1,1],[2,.25],[3,.08]]){const o=AC.createOscillator(),g=AC.createGain();o.frequency.setValueAtTime(f0*m,t);o.frequency.exponentialRampToValueAtTime(f1*m,t+dur*.85);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v*a,t+.08);g.gain.exponentialRampToValueAtTime(.0008,t+dur);o.connect(g).connect(dest);o.start(t);o.stop(t+dur+.02)}sfxLog('thud',{v,f0,dur,fadeIn:.08})}
function nburst(dest,v,lp,dur,t=AC.currentTime,bp){lp=Math.min(lp,220);const n=AC.createBufferSource();n.buffer=noiseBuf(1.5);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(lp,t);f.frequency.exponentialRampToValueAtTime(Math.max(40,lp*.2),t+dur);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.12);g.gain.exponentialRampToValueAtTime(.0008,t+dur);n.connect(f).connect(g).connect(dest);n.start(t,Math.random());n.stop(t+dur+.02);sfxLog('nburst',{v,lp,dur,fadeIn:.12})}
let hrtfN=0;
// AAA cannon burst at world pos: heavy thud + crack per round, HRTF positioned
function aaaBurst(P,rounds=5){if(!AC||AC.voices>10)return;const d=P.distanceTo(S.pos),pn=mkPan(true,220);hrtfN++;setP0(pn,P);const g=AC.createGain();g.gain.value=1;pn.connect(g).connect(AC.out);const t=AC.currentTime+d/343*.28;AC.voices++;
 const near=clamp(1-d/9000,.15,1), rate=.58+Math.random()*.08;sfxLog('aaaBurst',{d:+d.toFixed(0),near:+near.toFixed(2)});
 // ONLY cannon aaaw — never old aaa.mp3; synth fallback is slow dark thud only (no nburst crack)
 if(SB.aaaw){const s=src(SB.aaaw,.6+near*.35,pn,{when:t,rate,pri:1,fadeIn:.35,tag:'aaaw'});AC.voices--;s.onended=null}
 else thud(pn,.9*near,42,18,1.6,t);
 if(d>2000&&SB.aaaw){const s2=src(SB.aaaw,.22*near,pn,{when:t+.4,rate:rate*.8,pri:1,fadeIn:.5,tag:'aaaw_far'});AC.voices--;s2.onended=null}
 setTimeout(()=>{AC.voices--;hrtfN--;try{g.disconnect()}catch(e){}},(t-AC.currentTime+4.5)*1000)}
// flak shell: deep boom at burst point
function flakBoom(P){if(!AC||AC.voices>10)return;const pn=mkPan(hrtfN<4,90);hrtfN++;setP0(pn,P);const g=AC.createGain();g.gain.value=1;pn.connect(g).connect(AC.out);AC.voices++;const t=AC.currentTime+.02;
 const fk=Math.random()<.5?'flak':'flak2';sfxLog('flakBoom',{fk});
 if(SB[fk]){const s=src(SB[fk],.6,pn,{when:t,rate:.65+Math.random()*.1,pri:1,fadeIn:.28,tag:fk});AC.voices--;s.onended=null}
 else thud(pn,.85,45,20,1.2,t);
 const d=P.distanceTo(S.pos);if(d<300)heavy('sub01',.3*(1-d/300),1.1);setTimeout(()=>{AC.voices--;hrtfN--;try{g.disconnect()}catch(e){}},2500)}
// missile motor: roar loop + low rumble, HRTF, filter/pitch from Doppler
function mslAudioStart(m){if(!AC)return;const pn=mkPan(true,160);setP0(pn,m.p);const g=AC.createGain();g.gain.value=0;g.gain.linearRampToValueAtTime(1,AC.currentTime+.15);pn.connect(g).connect(AC.out);
 const n=AC.createBufferSource();n.buffer=SB.mmotor||noiseBuf(4);n.loop=true;const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=220;lp.Q.value=.7;const ng=AC.createGain();ng.gain.setValueAtTime(0,AC.currentTime);ng.gain.linearRampToValueAtTime(SB.mmotor?1.1:.7,AC.currentTime+.2);n.connect(lp).connect(ng).connect(pn);n.start();sfxLog('mmotor',{lp:220,fadeIn:.2});
 const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=48;const of=AC.createBiquadFilter();of.type='lowpass';of.frequency.value=220;const og=AC.createGain();og.gain.value=.35;o.connect(of).connect(og).connect(pn);o.start();
 m.au={pn,g,n,lp,o}}
function mslAudioUpd(m,dt){const a=m.au;if(!a)return;const t=AC.currentTime;setP(a.pn,m.p);const rel=m.p.clone().sub(S.pos),d=rel.length(),vr=-m.v.dot(rel)/(d||1)+S.spd*fwd.dot(rel)/(d||1);
 const dop=clamp(343/(343-clamp(vr,-300,300)*.5),.6,1.9);const boost=m.life>17;a.lp.frequency.setTargetAtTime(clamp((boost?2200:1300)*dop,300,5000),t,.05);a.o.frequency.setTargetAtTime(48*dop,t,.05);a.n.playbackRate.setTargetAtTime(dop,t,.05);a.g.gain.setTargetAtTime(boost?1:.65,t,.2)}
function mslAudioStop(m){const a=m&&m.au;if(!a)return;m.au=null;const t=AC.currentTime;a.g.gain.cancelScheduledValues(t);a.g.gain.setTargetAtTime(0,t,.15);setTimeout(()=>{try{a.n.stop();a.o.stop();a.g.disconnect()}catch(e){}},900)}
function heavy(k,v,rate=1,pri){if(!AC||!SB[k])return false;src(SB[k],v,pri?AC.bigB:AC.out,{rate,pri,fadeIn:pri?.08:.05,tag:'heavy:'+k});return true}
function duck(depth,hold,rec){if(!AC)return;const t=AC.currentTime,g=AC.dk.gain;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(depth,t+.03);g.setValueAtTime(depth,t+hold);g.linearRampToValueAtTime(1,t+hold+rec)}
const BED_OPTS=['ambient','mus_depth','mus_dream','mus_layers','mus_waves','off'];
let BED=localStorage.ds14_bed||'ambient';if(!BED_OPTS.includes(BED))BED='ambient';
let bedS=null,droneS=null;
const VOL=Object.assign({eng:.7,mus:.7,bed:.85,fx:.85},JSON.parse(localStorage.ds_vol||'{}'));
function applyVol(){[['eng','s_eng','v_eng'],['mus','s_mus','v_mus'],['bed','s_bedvol','v_bed'],['fx','s_fx','v_fx']].forEach(([k,id,vid])=>{const el=$(id),v=$(vid);if(el)el.value=Math.round((VOL[k]??.7)*100);if(v)v.textContent=Math.round((VOL[k]??.7)*100)});if(!AC)return;const t=AC.currentTime;AC.engB.gain.setTargetAtTime(VOL.eng*1.4,t,.05);AC.musB.gain.setTargetAtTime(VOL.mus*1.4,t,.05);if(AC.bedB)AC.bedB.gain.setTargetAtTime((VOL.bed??.85)*1.8,t,.05);AC.fxB.gain.setTargetAtTime(VOL.fx/.85,t,.05)}
[['eng','s_eng'],['mus','s_mus'],['bed','s_bedvol'],['fx','s_fx']].forEach(([k,id])=>{const el=$(id);if(el)el.addEventListener('input',e=>{VOL[k]=e.target.value/100;localStorage.ds_vol=JSON.stringify(VOL);applyVol()})});
window.__frozen=false;let freezeWhy=null;
function setFrozen(on,why){window.__frozen=!!on;freezeWhy=on?why:null;
 if(on&&why==='user'){$('pauseOv').classList.add('on');$('pauseb').textContent='▶';if(AC&&AC.state==='running')AC.suspend().catch(()=>{})}
 else if(!on){$('pauseOv').classList.remove('on');$('pauseb').textContent='⏸';if(AC&&AC.state==='suspended')AC.resume().catch(()=>{})}
 else if(on&&why==='settings'){$('pauseOv').classList.remove('on')}}
function openSettings(){initAudio();$('setp').classList.add('on');if(running)setFrozen(true,'settings')}
function closeSettings(){$('setp').classList.remove('on');if(freezeWhy==='settings')setFrozen(false)}
for(const ev of['pointerdown','pointermove','pointerup','touchstart','touchmove'])for(const id of['setp','setb','pauseb','pauseOv']){const el=$(id);if(!el)continue;el.addEventListener(ev,e=>{e.stopPropagation();if(ev==='touchmove'&&(id==='setb'||id==='pauseb'))e.preventDefault()},{passive:false})}
$('setb').addEventListener('pointerdown',e=>{e.stopPropagation();if($('setp').classList.contains('on'))closeSettings();else openSettings()});
if($('setx'))$('setx').addEventListener('pointerdown',e=>{e.stopPropagation();closeSettings()});
if($('pauseb'))$('pauseb').addEventListener('pointerdown',e=>{e.stopPropagation();initAudio();if(!running)return;if(freezeWhy==='user')setFrozen(false);else{closeSettings();setFrozen(true,'user')}});
if($('resume'))$('resume').addEventListener('pointerdown',e=>{e.stopPropagation();setFrozen(false)});
[['s_eng','eng'],['s_mus','mus'],['s_bedvol','bed'],['s_fx','fx']].forEach(([id])=>{const el=$(id);if(!el)return;el.addEventListener('pointerdown',e=>{try{el.setPointerCapture(e.pointerId)}catch(x){}e.stopPropagation()});el.addEventListener('touchmove',e=>e.stopPropagation(),{passive:false})});
applyVol();$('s_bed').value=BED;$('s_bed').addEventListener('change',e=>{initAudio();setBed(e.target.value)});
function musRMS(){if(!AC||!AC.an)return 0;const a=new Float32Array(AC.an.fftSize);AC.an.getFloatTimeDomainData(a);let s=0;for(const v of a)s+=v*v;return Math.sqrt(s/a.length)}
let JET=null,briefSrc=null,briefT=null,riserS=null,flyCD=0,ambS=null;
async function prewarmAudio(){if(!AC||AC._pw)return;AC._pw=1;
 for(const sec of[1.2,1.5,4,7])noiseBuf(sec);
 // wait for all SB decodes so release/SAM never hitch on first decode settle
 const keys=[BRIEF_TRACK,'nuke','sub01','sub08','jet','ambient','riser','jet8','drone','flak','flak2','impact','mlaunch','mmotor','sweep','subdrop','aaaw','msub','hitsub','mus_depth','mus_dream','mus_layers','mus_waves','flare_thump','flare_hiss'];
 await Promise.all(keys.map(k=>SB.get(k)));
 const mute=AC.createGain();mute.gain.value=0;mute.connect(AC.destination);
 const oldOut=AC.out,oldBig=AC.bigB;AC.out=mute;AC.bigB=mute;
 try{whoosh();thud(mute,.01,80,40,.2);nburst(mute,.01,400,.2);if(SB.subdrop)src(SB.subdrop,.001,mute,{pri:1});if(SB.sub08)src(SB.sub08,.001,mute,{pri:1});if(SB.riser)src(SB.riser,.001,mute,{pri:1})}catch(e){}
 AC.out=oldOut;AC.bigB=oldBig;AC._pwDone=1;
}
function prewarmGfx(){if(window.__pwG)return;window.__pwG=1;
 // seed particle pool + force first sprite shader compile
 for(let i=0;i<40;i++)_pool.push(_mkSpr(i&1,i&1?glowTex:smokeTex));
 bomb.visible=true;msl.visible=true;mslG.visible=true;ring.visible=true;dome.visible=true;bulge.visible=true;
 const hide=[bomb,msl,mslG,ring,dome,bulge];
 // compile from chase cam AND a bomb-cam-like angle so iPhone never first-compiles mid-release
 try{R.compile(scene,cam);composer.render()}catch(e){try{R.render(scene,cam)}catch(e2){}}
 {const _cp=cam.position.clone(),_cq=cam.quaternion.clone();
  cam.position.set(BUNK.x,BUNK.y+120,BUNK.z+40);cam.lookAt(BUNK);
  try{R.compile(scene,cam);composer.render()}catch(e){}
  cam.position.copy(_cp);cam.quaternion.copy(_cq)}
 hide.forEach(o=>o.visible=false);
 // pre-build nuke sprites once (materials/geometry) then tear down
 try{nukeStart();if(NK){NK.all.forEach(x=>scene.remove(x));NK=null}}catch(e){}
 // one more compile pass with pool sprites briefly visible
 for(let i=0;i<8;i++){const m=_pool[i];if(!m)break;m.visible=true;m.position.set(0,-9999,0)}
 try{R.compile(scene,cam);composer.render()}catch(e){}
 for(let i=0;i<8;i++){const m=_pool[i];if(m)m.visible=false}
}
function stopBed(){if(bedS){try{bedS.stop()}catch(e){}bedS=null}if(droneS){try{droneS.stop()}catch(e){}droneS=null}}
function startBed(){if(!AC)return;stopBed();
 if(BED==='off'){AC.amb.gain.setTargetAtTime(0,AC.currentTime,.3);return}
 const k=BED==='ambient'?'ambient':BED;const buf=SB[k]||SB.ambient;if(!buf)return;
 const vol=BED==='ambient'?1.05:BED==='mus_dream'?.7:BED==='mus_layers'?.65:.55;
 bedS=startSmoothLoop(buf,vol,AC.amb,{tag:'bed:'+BED,xf:.45,detune:1.002,fadeIn:1.2});
 if(BED==='ambient'&&SB.drone)droneS=startSmoothLoop(SB.drone,.32,AC.amb,{tag:'drone',xf:.5,detune:.998,fadeIn:1.4});
 else if(BED!=='off'&&SB.drone)droneS=startSmoothLoop(SB.drone,.12,AC.amb,{tag:'drone',xf:.5,detune:.998,fadeIn:1.4});
}
function setBed(id){if(!BED_OPTS.includes(id))return;BED=id;localStorage.ds14_bed=id;const sel=$('s_bed');if(sel)sel.value=id;if(JET||ambS)startBed()}
function startJet(){if(JET||!(SB.jet8||SB.jet))return;
 if(SB.jet8){JET=startSmoothLoop(SB.jet8,1.15,AC.jet,{tag:'jet',xf:.4,detune:1.0025,fadeIn:.9})}
 else{JET=startSmoothLoop(SB.jet,1,AC.jet,{tag:'jet',xf:.4,detune:1.002,fadeIn:.9})}
 startBed();ambS=bedS}
function briefMusic(){if(!AC)return;const go=()=>{if(!$('brief')||$('brief').classList.contains('hide'))return;if(SB.ambient&&!briefSrc){briefSrc=src(mkSeamless(SB.ambient,.45),0,AC.mus,{loop:true,off:Math.random()*2,tag:'brief'});briefSrc.g.gain.cancelScheduledValues(AC.currentTime);briefSrc.g.gain.setValueAtTime(0,AC.currentTime);briefSrc.g.gain.linearRampToValueAtTime(.16,AC.currentTime+2)}};
 if(briefT)return;briefT=1;SB.get('ambient').then(()=>go())}
let winSrc=null;function stopBrief(){briefT=1;if(briefSrc){const b=briefSrc;b.g.gain.setTargetAtTime(0,AC.currentTime,.4);setTimeout(()=>{try{b.stop()}catch(e){}},2500);briefSrc=null}stopWin()}
function stopWin(){if(winSrc&&AC){const w=winSrc;w.g.gain.cancelScheduledValues(AC.currentTime);w.g.gain.setTargetAtTime(0,AC.currentTime,.3);setTimeout(()=>{try{w.stop()}catch(e){}},2000);winSrc=null}}
function riser(on){if(!AC)return;const t=AC.currentTime;if(on&&!riserS&&SB.riser){riserS=src(SB.riser,.001,AC.mus,{rate:.92});riserS.g.gain.exponentialRampToValueAtTime(.38,t+5);riserS.playbackRate.linearRampToValueAtTime(1.12,t+6)}
 if(!on&&riserS){riserS.g.gain.cancelScheduledValues(t);riserS.g.gain.setTargetAtTime(0,t,.08);const r=riserS;setTimeout(()=>{try{r.stop()}catch(e){}},800);riserS=null}}
function play(buf,vol=.5){if(!AC||!buf)return;src(buf,vol,AC.out)}
function blip(f,d=.08,v=.15,type='sine'){if(!AC)return;sfxLog('blip',{f,d,v});const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();o.type='sine';o.frequency.value=Math.min(f,600);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v*.45,t+.025);g.gain.exponentialRampToValueAtTime(.0005,t+d+.05);o.connect(g).connect(AC.tone);o.start(t);o.stop(t+d+.08)}
function boomSfx(big){if(!AC)return;sfxLog('boomSfx',{big:!!big});if(big&&heavy('nuke',1,1,true)){duck(.35,2,6);return}const t=AC.currentTime,n=AC.createBufferSource();n.buffer=noiseBuf(big?4:1.5);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(big?900:180,t);f.frequency.exponentialRampToValueAtTime(60,t+(big?3.5:1.6));
 const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(big?1.2:.45,t+(big?.05:.18));g.gain.exponentialRampToValueAtTime(.001,t+(big?4:1.8));n.connect(f).connect(g).connect(AC.out);n.start();
 if(big){const r=AC.createBufferSource();r.buffer=noiseBuf(7);const rf=AC.createBiquadFilter();rf.type='lowpass';rf.frequency.value=140;const rg=AC.createGain();rg.gain.setValueAtTime(.001,t);rg.gain.linearRampToValueAtTime(1.1,t+.35);rg.gain.exponentialRampToValueAtTime(.001,t+7);r.connect(rf).connect(rg).connect(AC.out);r.start();
  const o3=AC.createOscillator();o3.frequency.setValueAtTime(40,t);o3.frequency.exponentialRampToValueAtTime(18,t+4);const g3=AC.createGain();g3.gain.setValueAtTime(1,t);g3.gain.exponentialRampToValueAtTime(.001,t+4.5);o3.connect(g3).connect(AC.out);o3.start();o3.stop(t+4.6);
  const o=AC.createOscillator();o.frequency.setValueAtTime(70,t);o.frequency.exponentialRampToValueAtTime(25,t+2.5);const og=AC.createGain();og.gain.setValueAtTime(.9,t);og.gain.exponentialRampToValueAtTime(.001,t+3);o.connect(og).connect(AC.out);o.start();o.stop(t+3)}}
function whoosh(){if(!AC)return;sfxLog('whoosh',{});const t=AC.currentTime,n=AC.createBufferSource();n.buffer=noiseBuf(1.2);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(280,t);f.frequency.exponentialRampToValueAtTime(120,t+1.1);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.4,t+.35);g.gain.exponentialRampToValueAtTime(.001,t+1.4);n.connect(f).connect(g).connect(AC.out);n.start();thud(AC.out,.4,48,22,1.2)}
function passBy(P){if(!AC)return;sfxLog('passBy',{});const pn=mkPan(true,80);setP0(pn,P);pn.connect(AC.out);const t=AC.currentTime,n=AC.createBufferSource();n.buffer=noiseBuf(1.5);n.playbackRate.setValueAtTime(.85,t);n.playbackRate.exponentialRampToValueAtTime(.55,t+1.2);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(320,t);f.frequency.exponentialRampToValueAtTime(100,t+1.2);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.7,t+.25);g.gain.exponentialRampToValueAtTime(.001,t+1.5);n.connect(f).connect(g).connect(pn);n.start();n.stop(t+1.6);thud(pn,.55,45,20,1.3);if(SB.subdrop)psrc('subdrop',.3,P,true,{ref:80,rate:.85,pri:1,fadeIn:.2,tag:'subdrop'})}
// ---------- state ----------
let S;
function reset(){if(S&&S.missile&&AC)mslAudioStop(S.missile);S={phase:'ingress',pos:new THREE.Vector3(vx(300),70,300),yaw:0,pitch:0,roll:0,thr:.7,det:0,detT:0,t:0,ts:1,locked:false,relHold:0,bomb:null,boomT:-1,penT:0,flares:8,missile:null,cine:false,cineA:null,aaaT:0,srchT:0,sites:SITES.map(()=>({st:'off',trk:0,shots:0})),samShots:0,err:0,dead:null,shake:0,msg:'',msgT:0,flareCD:0,egressLaunch:false,sec:[],hp:2,brk:0,brkCD:0,brkDir:1,ecm:0,ecmCD:0,ecmN:2,defeated:0,flakT:2,aaaS:0,teachT:0,smT:0};
 if(S&&S.missile)mslAudioStop(S.missile);mslG.visible=bomb.visible=msl.visible=ring.visible=dome.visible=bulge.visible=false;debris.forEach(d=>scene.remove(d.m));debris.length=0;parts.forEach(p=>scene.remove(p.m));parts.length=0;bunker.visible=true;$('end').classList.add('hide');setThr(.7)}
// ---------- input ----------
let steer=null;const inp={x:0,y:0};
gl.addEventListener('pointerdown',e=>{if(steer)return;e.preventDefault();try{gl.setPointerCapture(e.pointerId)}catch(x){}steer={id:e.pointerId,x:e.clientX,y:e.clientY}});
gl.addEventListener('pointermove',e=>{if(!steer||e.pointerId!==steer.id)return;e.preventDefault();const r=Math.min(innerWidth,innerHeight)*.22;inp.x=clamp((e.clientX-steer.x)/r,-1,1);inp.y=clamp((e.clientY-steer.y)/r,-1,1)},{passive:false});
const endSteer=e=>{if(steer&&e.pointerId===steer.id){try{gl.releasePointerCapture(e.pointerId)}catch(x){}steer=null;inp.x=inp.y=0}};gl.addEventListener('pointerup',endSteer);gl.addEventListener('pointercancel',endSteer);addEventListener('pointerup',endSteer);addEventListener('pointercancel',endSteer);
document.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});document.addEventListener('gesturestart',e=>e.preventDefault());
function setThr(v){S&&(S.thr=v);$('thrk').style.bottom=(3+v*(130-12))+'px';const kcas=Math.round((85+v*195)*1.94);$('thrl').innerHTML='THROTTLE<br><span style="opacity:.85">'+kcas+' KTS</span>';if(S&&!S._thrHint&&v>.05&&v<.95){S._thrHint=1;msg('THROTTLE — SLIDE FOR SPEED')}}
{const t=$('thr');let id=null;const f=e=>{const r=t.getBoundingClientRect();setThr(clamp(1-(e.clientY-r.top-3)/(r.height-6),0,1))};
 t.addEventListener('pointerdown',e=>{e.stopPropagation();id=e.pointerId;t.setPointerCapture(id);f(e)});t.addEventListener('pointermove',e=>{if(e.pointerId===id)f(e)});t.addEventListener('pointerup',()=>id=null)}
let relDown=false;
$('lock').addEventListener('pointerdown',e=>{e.stopPropagation();tryLock()});$('rel').addEventListener('pointerdown',e=>{e.stopPropagation();relDown=true});addEventListener('pointerup',()=>relDown=false);
$('flr').addEventListener('pointerdown',e=>{e.stopPropagation();fireFlares()});$('brk').addEventListener('pointerdown',e=>{e.stopPropagation();doBreak()});$('ecm').addEventListener('pointerdown',e=>{e.stopPropagation();doECM()});
addEventListener('keydown',e=>{if(e.key==='l')tryLock();if(e.key==='f')fireFlares();if(e.key==='b')doBreak();if(e.key==='e')doECM();if(e.key===' ')relDown=true});addEventListener('keyup',e=>{if(e.key===' ')relDown=false});
// ---------- gameplay ----------
const V=new THREE.Vector3(),fwd=new THREE.Vector3(),tmp=new THREE.Vector3();
function scr(p){V.copy(p).project(cam);if(V.z>1)return null;return{x:(V.x*.5+.5)*innerWidth,y:(-V.y*.5+.5)*innerHeight}}
function inBox(){const s=scr(BUNK);if(!s)return 0;const bw=innerWidth*.16,bh=innerHeight*.2,cx=innerWidth/2,cy=innerHeight*.5;const dx=Math.abs(s.x-cx)/bw,dy=Math.abs(s.y-cy)/bh;return dx<1&&dy<1?1-Math.max(dx,dy):0}
const bDist=()=>S.pos.distanceTo(BUNK);
function canLock(){return S.phase==='ingress'&&bDist()<4500&&bDist()>500&&inBox()>0}
function tryLock(){if(!canLock())return;S.locked=true;S.phase='release';blip(560,.18,.07);setTimeout(()=>blip(740,.22,.06),120)}
const flrWin=()=>S.samShots<=1?3200:2600;
function defeat(m,why){if(m.def)return;m.def=1;S.defeated++;msg(why)}
function doBreak(){if(S.dead||S.cine||S.brkCD>0||S.phase==='done')return;S.brkCD=3.5;S.brk=1.3;const m=S.missile;let dir=1;if(m){const rx=m.p.x-S.pos.x,rz=m.p.z-S.pos.z;const side=(-Math.cos(S.yaw))*rx-(-Math.sin(S.yaw))*rz;dir=side>0?1:-1}S.brkDir=dir;if(AC){thud(AC.out,.3,55,30,.5);nburst(AC.out,.12,600,.8)}
 if(m&&!m.decoy&&!m.lost){const d=m.p.distanceTo(S.pos),w=S.samShots<=1?1500:1100;if(d<w&&d>220){m.lost=true;m.over=1;defeat(m,'BREAK! MISSILE OVERSHOOT')}else msg(d>=w?'BREAK TOO EARLY — WAIT <'+(w/1000).toFixed(1)+' KM':'TOO LATE')}}
function doECM(){if(S.dead||S.ecmCD>0||S.ecmN<=0||S.phase==='done')return;S.ecmN--;S.ecmCD=12;S.ecm=4;if(AC){for(let k=0;k<6;k++)blip(k%2?340:300,.12,.05);nburst(AC.out,.08,900,1.2)}
 const m=S.missile;if(m&&!m.decoy&&!m.lost){const d=m.p.distanceTo(S.pos);if(d>1600){m.lost=true;defeat(m,'ECM — MISSILE SEEKER JAMMED')}else msg('ECM ON — TOO CLOSE TO JAM, FLARE/BREAK')}else msg('ECM JAMMING — RADARS BLINDED 4 S')}
function fireFlares(){if(S.flares<=0||S.flareCD>0||S.dead||S.phase==='done')return;S.flares--;S.flareCD=1;
 for(let i=0;i<8;i++){const v=new THREE.Vector3(rnd(22),-8-Math.random()*18,rnd(22)).add(fwd.clone().multiplyScalar(-42));spr(S.pos,0xffe8b0,6,3.4,v,{g:7,fog:false,add:true,tex:glowTex,must:1,grow:4});spr(S.pos,0xc8c4bc,4,5.5,v.clone().multiplyScalar(.55),{grow:14,o:.55,drag:.25,must:1,fadeIn:.08,c1:new THREE.Color(0x6a6660)});spr(S.pos,0x9a968e,3,7,v.clone().multiplyScalar(.35),{grow:18,o:.4,drag:.35,must:1,fadeIn:.15})}
 flareSfx();
 const m=S.missile;if(m&&!m.decoy){const d=m.p.distanceTo(S.pos);if(d<flrWin()){m.decoy=S.pos.clone();m.decoyV=fwd.clone().multiplyScalar(-30);m.dt=1.3;defeat(m,'MISSILE DECOYED')}else msg('FLARE EARLY — WAIT FOR <'+(flrWin()/1000).toFixed(1)+' KM')}}
function msg(t){S.msg=t;S.msgT=2}
function flareSfx(){if(!AC)return;sfxLog('flareSfx',{});const t=AC.currentTime;
 const P=tmp.copy(S.pos).addScaledVector(fwd,-18);const pn=mkPan(true,90);setP0(pn,P);pn.connect(AC.out);
 if(SB.flare_thump){src(SB.flare_thump,.95,pn,{pri:1,fadeIn:.03,rate:.9+Math.random()*.08,tag:'flare_thump'});src(SB.flare_thump,.55,AC.bigB,{pri:1,fadeIn:.04,rate:.75,tag:'flare_thump_sub'})}
 else{thud(pn,.85,70,28,.5,t);thud(AC.bigB,.5,48,22,.7,t)}
 if(SB.flare_hiss){src(SB.flare_hiss,.7,pn,{pri:1,fadeIn:.1,rate:.95+Math.random()*.1,tag:'flare_hiss'});src(SB.flare_hiss,.35,AC.out,{pri:1,fadeIn:.14,rate:1.05,tag:'flare_hiss_b'})}
 else{const n=AC.createBufferSource();n.buffer=noiseBuf(3);const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(900,t);f.frequency.exponentialRampToValueAtTime(280,t+2.2);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.35,t+.12);g.gain.exponentialRampToValueAtTime(.001,t+2.4);n.connect(f).connect(g).connect(pn);n.start(t,Math.random());n.stop(t+2.6)}
 nburst(pn,.2,200,1.6,t+.05);
 setTimeout(()=>{try{pn.disconnect()}catch(e){}},3200)}
function launchSAM(i){if(S.missile||S.samShots>=7||S.cine)return;if(i==null){let bd=1e9;SITES.forEach((st,k)=>{const d=st.p.distanceTo(S.pos);if(d<bd){bd=d;i=k}});if(bd>9000)return}
 const P=SITES[i].p;S.samShots++;S.missile={p:P.clone().add(new THREE.Vector3(0,8,0)),v:new THREE.Vector3(0,90,0),life:20,decoy:null,site:i,blind:0,lost:false};msl.visible=true;mslAudioStart(S.missile);if(S.samShots===1&&!localStorage.ds14_def){localStorage.ds14_def=1;S.teachT=5}const sal=S.sites[i].shots>1;msg((sal?'SECOND LAUNCH — ':'LAUNCH LAUNCH — ')+SITES[i].n);S.lastLaunch=S.t;samRoar(P.distanceTo(S.pos));rwrLaunch(P,sal);
 for(let k=0;k<(MOB?16:28);k++){const a=Math.random()*6.283,sp=20+Math.random()*45;spr(tmp.copy(P).setY(P.y+3),k%3?0xcfc8bc:0xe8e2d8,14,6+Math.random()*5,new THREE.Vector3(Math.cos(a)*sp,4+Math.random()*12,Math.sin(a)*sp),{grow:16,o:.75,drag:.5,fadeIn:.15,must:1})}
 spr(tmp.copy(P).setY(P.y+6),0xffd8a0,70,.5,null,{add:true,tex:glowTex,fog:false,grow:60,must:1});for(let k=0;k<6;k++)spr(P,0xffa050,10,.6,new THREE.Vector3(rnd(30),20+Math.random()*30,rnd(30)),{add:true,fog:false,must:1})}
function samRoar(d){if(!AC)return;sfxLog('samRoar',{d:+d.toFixed(0)});const t=AC.currentTime,v=.45*clamp(1-d/9000,0.08,1),n=AC.createBufferSource();n.buffer=noiseBuf(4);const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.setValueAtTime(280,t);lp.frequency.exponentialRampToValueAtTime(120,t+3.5);const g=AC.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.25);g.gain.setTargetAtTime(v*.5,t+.5,.7);g.gain.setTargetAtTime(0,t+2,.9);n.connect(lp).connect(g).connect(AC.out);n.start(t);n.stop(t+4);if(SB.sub08)src(SB.sub08,.35*clamp(1-d/9000,.2,1),AC.out,{rate:1.3,fadeIn:.15,tag:'heavy:sub08'});if(S.missile){psrc('mlaunch',.85,S.missile.p,true,{ref:400,pri:1,fadeIn:.2,tag:'mlaunch'});psrc('msub',.65,S.missile.p,true,{ref:500,pri:1,fadeIn:.25,tag:'msub'})}else heavy('msub',.5*clamp(1-d/9000,.25,1),1,true)}
function rwrLaunch(P,sal){if(!AC)return;sfxLog('rwrLaunch',{});const t=AC.currentTime;for(let k=0;k<8;k++){const o=AC.createOscillator(),g=AC.createGain();o.type='sine';o.frequency.value=k%2?520:400;g.gain.setValueAtTime(0,t+k*.09);g.gain.linearRampToValueAtTime(.028,t+k*.09+.03);g.gain.linearRampToValueAtTime(0,t+k*.09+.1);o.connect(g).connect(AC.tone);o.start(t+k*.09);o.stop(t+k*.09+.12)}
 try{if(false){const rx=P.x-S.pos.x,rz=P.z-S.pos.z;let a=Math.atan2(-rx,-rz)-S.yaw;let c=Math.round(((-a/(Math.PI*2))*12%12+12)%12)||12;const u=new SpeechSynthesisUtterance((sal?'Second missile, ':'Missile launch, ')+c+' o clock');u.rate=1.2;u.pitch=.75;u.volume=Math.min(1,VOL.fx+.2);speechSynthesis.cancel();speechSynthesis.speak(u)}}catch(e){}}
function updSites(dt){let anyTrk=false,anySrch=false;if(S.cine||S.phase==='done'){return {anyTrk,anySrch}}
 SITES.forEach((st,i)=>{const s=S.sites[i],d=st.p.distanceTo(S.pos);if(d>7500){if(s.st!=='off'&&s.trk>0)s.trk=0;s.st='off';return}
  if(s.st==='off'){s.st='search';msg(st.n+' SEARCH RADAR ACTIVE')}
  const vis=d<6000&&los(tmp.copy(st.p).setY(st.p.y+12),S.pos);const was=s.trk>.25;
  s.trk=vis&&!(S.ecm>0)?s.trk+dt:Math.max(0,s.trk-dt*1.5);s.st=s.trk>.25?'track':'search';if(was&&s.trk<=.25)msg(st.n+' LOCK BROKEN');
  if(s.st==='track')anyTrk=true;else anySrch=true;
  if(s.trk>2.4&&!S.missile&&s.shots<(i>0?2:1)&&S.t>(s.next||0)&&S.phase!=='bombfall'){s.shots++;launchSAM(i)}});
 return {anyTrk,anySrch}}
function die(why){if(S.dead)return;S.dead=why;boomSfx(false);fire(S.pos,.35);jet.visible=false;setTimeout(()=>showEnd(false),1800)}
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
function bigBoom(){S.boomT=0;S.shake=.9;bunker.visible=false;bulge.visible=false;boomSfx(true);ring.visible=dome.visible=true;ring.position.copy(BUNK).y+=3;dome.position.copy(BUNK);
 $('flash').style.transition='none';$('flash').style.background='#ffffff';$('flash').style.opacity=1;setTimeout(()=>{$('flash').style.transition='opacity 2.6s ease-out';$('flash').style.opacity=0},140);S.cineA=null;nukeStart();
 const K=2.6,o={must:1};
 spr(tmp.copy(BUNK).setY(BUNK.y+40),0xfff2d0,160*K,.8,null,{add:true,tex:glowTex,fog:false,grow:300*K,must:1});
 for(let i=0;i<36;i++)spr(tmp.copy(BUNK).add(new THREE.Vector3(rnd(30*K),5+Math.random()*30*K,rnd(30*K))),new THREE.Color().setHSL(.08+Math.random()*.05,1,.6),(70+Math.random()*45)*K,2+Math.random()*1.8,new THREE.Vector3(rnd(40*K),(50+Math.random()*100)*K*.8,rnd(40*K)),{add:true,grow:80*K,drag:.6,fog:false,c1:new THREE.Color(0x7a1e00),must:1});
/*col*/ for(let i=0;i<0;i++){const up=i<28;spr(tmp.copy(BUNK).add(new THREE.Vector3(rnd(25*K),Math.random()*20*K,rnd(25*K))),new THREE.Color().setHSL(.07,.12,.08+Math.random()*.07),(50+Math.random()*35)*K,12+Math.random()*7,new THREE.Vector3(rnd(up?12*K:35*K),(up?40+Math.random()*60:90+Math.random()*30)*K*.8,rnd(up?12*K:35*K)),{grow:(up?28:45)*K,o:.92,drag:.25,fadeIn:.6,must:1})}
 for(let i=0;i<(MOB?6:12);i++)spr(tmp.copy(BUNK).add(new THREE.Vector3(rnd(30),Math.random()*30,rnd(30))),0x9a8a72,60*K*.6,14+Math.random()*4,new THREE.Vector3(rnd(10),25+Math.random()*45,rnd(10)),{grow:34,o:.7,drag:.12,fadeIn:1,must:1});
 for(let i=0;i<48;i++){const a=i/48*6.28+rnd(.1),sp=(120+Math.random()*90)*K*.8;spr(tmp.copy(BUNK).add(new THREE.Vector3(Math.cos(a)*40,4,Math.sin(a)*40)),0x8a7a66,30*K,6+Math.random()*3,new THREE.Vector3(Math.cos(a)*sp,6+Math.random()*10,Math.sin(a)*sp),{grow:30*K,drag:.9,o:.75,fadeIn:.2,must:1})}
 for(let i=0;i<80;i++){const m=new THREE.Mesh(debG,debM);const sz=.8+Math.random()*3.4;m.scale.set(sz,sz*.7,sz);m.position.copy(BUNK).y+=5;m.castShadow=true;scene.add(m);debris.push({m,v:new THREE.Vector3(rnd(180),90+Math.random()*260,rnd(180)),r:new THREE.Vector3(Math.random()*5,Math.random()*5,0)})}
 for(let i=0;i<60;i++)spr(BUNK,0xffc080,4,2.5+Math.random()*2,new THREE.Vector3(rnd(200),90+Math.random()*240,rnd(200)),{add:true,tex:glowTex,g:40,fog:false,must:1});
 S.sec=[.5,1.1,1.7,2.4];S.phase='egress';S.egressLaunch=true;S.det=60}
// ---------- loop ----------
let last=performance.now(),running=false,fpsA=[],slowT=0;
window.__fps=()=>{const a=fpsA.slice(-120);return a.length?1000/(a.reduce((x,y)=>x+y)/a.length):0};
let lastR=0;document.addEventListener('visibilitychange',()=>{if(!AC)return;if(document.hidden)AC.suspend();else{last=performance.now();AC.resume()}});
function step(now){requestAnimationFrame(step);if(document.hidden)return;const frameMs=now-last;if(window.__ft){const F=window.__ft;F.n++;if(frameMs>F.max)F.max=frameMs;if(F._r&&now-F._r<2500&&frameMs>F.relMax)F.relMax=frameMs}let dt=Math.min(.05,(now-last)/1000);last=now;
 if(running&&!window.__frozen&&!S.dead&&S.phase!=='done')update(dt);else if(running&&!window.__frozen&&S.dead)updParts(dt);
 if(MOB&&now-lastR<1000/34)return;lastR=now;fpsA.push(dt*1000);if(fpsA.length>300)fpsA.shift();
 if(running&&dt>(MOB?1/26:1/45))slowT+=dt;else slowT=Math.max(0,slowT-dt*.5);if(slowT>3&&!window.__noAdapt){slowT=0;if(useBloom){useBloom=false;bloom.enabled=false}else if(sun.castShadow){sun.castShadow=false;scene.traverse(o=>{if(o.material)o.material.needsUpdate=true})}else if(PR>1){PR=Math.max(1,PR-.25);R.setPixelRatio(PR);resize()}}
 render(dt)}
function update(rdt){
 let target=1;if(S.phase==='bombfall')target=.45;if(S.bomb&&S.bomb.tti<1.8)target=.25;if(S.phase==='penetrate')target=.5;if(S.boomT>=0&&S.boomT<1.5)target=.5;if(S.teachT>0)target=.55;
 S.cine=S.phase==='bombfall'||S.phase==='penetrate'||(S.boomT>=0&&S.boomT<8);S.ts=lerp(S.ts,target,clamp(rdt*6,0,1));const dt=rdt*S.ts;S.t+=rdt;
 const tR=S.cine?0:S.brk>0?-S.brkDir*78*D2R:-inp.x*45*D2R,tP=S.cine?0:-inp.y*30*D2R;S.roll+=(tR-S.roll)*clamp(rdt*8.5,0,1);S.pitch+=(tP-S.pitch)*clamp(rdt*7.5,0,1);S.yaw+=S.roll*.75*dt;
 const spd=85+S.thr*195;fwd.set(-Math.sin(S.yaw)*Math.cos(S.pitch),Math.sin(S.pitch),-Math.cos(S.yaw)*Math.cos(S.pitch));S.pos.addScaledVector(fwd,spd*dt);S.pos.y=Math.min(S.pos.y,2500);
 if(S.cine)S.pos.y=Math.max(S.pos.y,H(S.pos.x,S.pos.z)+60);const agl=S.pos.y-H(S.pos.x,S.pos.z);S.agl=agl;S.spd=spd;if(agl<2)return die('TERRAIN IMPACT');
 if(S.cine){}else if(agl>150){S.det=Math.min(100,S.det+(20+(agl-150)*.08)*dt);S.detT+=dt}else S.det=Math.max(0,S.det-12*dt);
 if(S.det>=100&&!S.missile){launchSAM();S.det=75}
 if(S.phase==='release'){if(bDist()<350||!scr(BUNK)){S.locked=false;S.phase='ingress';msg('LOCK LOST — REATTACK')}
  if(relDown&&bDist()<3000&&S.missile&&!S.missile.decoy){if(S.msgT<=0)msg('DEFEAT MISSILE FIRST')}else if(relDown&&bDist()<3000){if(!S._relT0)S._relT0=performance.now();S.relHold=(performance.now()-S._relT0)/1000;if(S.relHold>=.5)release()}else{S._relT0=0;S.relHold=Math.max(0,S.relHold-rdt*2)}}else{S._relT0=0;S.relHold=0}
 const b=S.bomb;if(b){b.age=(b.age||0)+rdt;const to=tmp.copy(b.aim).sub(b.p),d=to.length()||1;b.s=Math.min(420,b.s+120*dt);b.v.lerp(to.normalize().multiplyScalar(b.s),clamp(dt*1.4,0,1));b.v.y-=3*dt;b.p.addScaledVector(b.v,dt);b.tti=d/Math.max(.1,b.v.length());
  bomb.position.copy(b.p);bomb.lookAt(tmp.copy(b.p).add(b.v));
  // failsafe: never stay stuck on weapon cam / bombfall forever
  if(b.age>14){S.bomb=null;bomb.visible=false;S.phase='penetrate';S.penT=1.5}
  else if(d<6||b.p.y<b.aim.y){S.bomb=null;bomb.visible=false;S.phase='penetrate';S.penT=0;riser(false);blip(90,.4,.4,'sine');boomSfx(false);heavy('sub08',.35,.9);bulge.position.copy(BUNK);bulge.visible=true;bulge.scale.set(46,.1,40);
   for(let i=0;i<22;i++)spr(BUNK,0x8f8270,16,3,new THREE.Vector3(rnd(22),18+Math.random()*35,rnd(22)),{grow:20,o:.85,must:1})}}
 if(S.phase==='penetrate'){S.penT+=rdt;const k=sstep(.5,1.6,S.penT);bulge.scale.set(46+k*8,.1+k*9,40+k*8);S.shake=Math.max(S.shake,k*.25);if(Math.random()<.3)spr(tmp.copy(BUNK).add(new THREE.Vector3(rnd(40),2,rnd(40))),0x8a7d6a,10,2,new THREE.Vector3(0,6,0),{grow:10,o:.6});if(S.penT>1.6)bigBoom()}
 if(S.boomT>=0){S.boomT+=dt;const t=S.boomT;dome.scale.set(60+t*900,(60+t*900)*.55,60+t*900);dome.material.opacity=Math.max(0,.2-t*.11);if(t>1.8)dome.visible=false;
  while(S.sec.length&&t>S.sec[0]){S.sec.shift();fire(tmp.copy(BUNK).add(new THREE.Vector3(rnd(90),0,rnd(90))),1.1);if(!heavy('sub01',.5,.85+Math.random()*.15))boomSfx(false)}}
 updNuke(dt,rdt);
 for(const d of debris){if(d.v.lengthSq()===0)continue;d.v.y-=30*dt;d.m.position.addScaledVector(d.v,dt);d.m.rotation.x+=d.r.x*dt;d.m.rotation.y+=d.r.y*dt;const gy=H(d.m.position.x,d.m.position.z);if(d.m.position.y<gy){d.m.position.y=gy;d.v.set(0,0,0);if(Math.random()<.4)spr(d.m.position,0x7a6e60,8,2,null,{grow:8,o:.6})}else if(Math.random()<.15)spr(d.m.position,0x2a2622,4,1.5,null,{grow:5,o:.5})}
 if(S.egressLaunch&&S.boomT>7&&!S.missile){S.egressLaunch=false;S.sites[2].shots=0}
 const th=updSites(dt);S.th=th;
 if(!S.cine&&bunker.visible&&bDist()<6500){S.aaaT-=dt;if(S.aaaT<=0){S.aaaT=.09;for(const ox of[-60,55]){const o=tmp.copy(BUNK).add(new THREE.Vector3(ox,4,ox*.5));const aim=new THREE.Vector3().copy(S.pos).add(new THREE.Vector3(rnd(260),120+Math.random()*260,rnd(260))).sub(o).normalize().multiplyScalar(650);spr(o,0xffb050,2.6,2.2,aim,{add:true,tex:glowTex,fog:false,g:25})}}}
 const m=S.missile;if(m){m.life-=dt;if(!m.decoy&&!m.lost){if(los(tmp.copy(SITES[m.site].p).setY(SITES[m.site].p.y+12),S.pos))m.blind=0;else{m.blind+=dt;if(m.blind>2.2){m.lost=true;msg('MISSILE TERRAIN-MASKED')}}}
  let tgt;if(m.lost){tgt=tmp.copy(m.p).addScaledVector(m.v,1).setY(m.p.y-20)}else if(m.decoy){m.decoy.addScaledVector(m.decoyV,dt);m.decoyV.y-=10*dt;tgt=m.decoy;m.dt-=dt}else{tgt=tmp.copy(S.pos).addScaledVector(fwd,spd*.6);const dd=m.p.distanceTo(S.pos);if(dd<1900){m.cs=(m.cs||0)+dt*5.5;const sd=new THREE.Vector3(-m.v.z,0,m.v.x).normalize();tgt.addScaledVector(sd,Math.sin(m.cs)*dd*.09);tgt.y+=Math.cos(m.cs)*dd*.07}}
  const gentle=S.samShots<=1,sp=Math.min(gentle?300:420,m.v.length()+160*dt),dir=m.v.clone().normalize(),want=tgt.clone().sub(m.p).normalize();dir.lerp(want,clamp(dt*(m.p.distanceTo(S.pos)<900?(gentle?2.4:3.4):(gentle?1.5:2)),0,1)).normalize();m.v.copy(dir).multiplyScalar(sp);const r0=m.p.clone().sub(S.pos);m.p.addScaledVector(m.v,dt);{const r1=m.p.clone().sub(S.pos),dd=r1.clone().sub(r0),L=dd.lengthSq();const t=L>0?clamp(-r0.dot(dd)/L,0,1):1;m.cpa=r0.addScaledVector(dd,t).length()}
  msl.position.copy(m.p);msl.lookAt(tmp.copy(m.p).add(m.v));m.tr=(m.tr||0)+dt;const boost=m.life>17;{const dj=m.p.distanceTo(S.pos);mslG.visible=true;mslG.position.copy(m.p);mslG.scale.setScalar((boost?60:38)*(1+.15*Math.sin(S.t*40))*Math.max(1,dj/1500));}if(m.tr>(MOB?.05:.035)){m.tr=0;spr(m.p,boost?0xf2eee6:0xe0dbd2,boost?11:8,boost?11:8,new THREE.Vector3(rnd(2),rnd(2),rnd(2)),{grow:boost?8:6,o:.75,drag:.3,must:1})}spr(m.p,0xffd090,boost?7:3,.12,null,{add:true,tex:glowTex,fog:false});
  mslAudioUpd(m,dt);{const dj=m.p.distanceTo(S.pos);if(!m.ws&&dj<260&&(m.decoy||m.lost)){m.ws=1;whoosh();passBy(m.p);S.shake=Math.max(S.shake,.25)}}
  if(!m.decoy&&!m.lost&&Math.min(m.cpa??1e9,m.p.distanceTo(S.pos))<75){mslAudioStop(m);S.missile=null;msl.visible=false;mslG.visible=false;S.sites[m.site].next=S.t+4;$('flash').style.transition='none';$('flash').style.background='#ffb070';$('flash').style.opacity=.85;setTimeout(()=>{$('flash').style.transition='opacity 1.2s';$('flash').style.opacity=0},90);src(SB.sub08,.4,AC.bigB,{rate:1.1,pri:1,fadeIn:.18,tag:'heavy:sub08'});if(SB.hitsub)src(SB.hitsub,.45,AC.bigB,{pri:1,fadeIn:.2,tag:'heavy:hitsub'});S.shake=1;if(AC){if(SB.impact)src(SB.impact,.4,AC.bigB,{pri:1,fadeIn:.22,tag:'heavy:impact'});else thud(AC.bigB,.7,50,22,1.5)};S.hp--;if(S.hp>0){fire(tmp.copy(S.pos).addScaledVector(fwd,-30),.35);msg('HIT! AIRFRAME DAMAGED — ONE MORE HIT IS FATAL');S.dmgT=3;return}fire(S.pos,.9);return die('SHOT DOWN — SAM HIT')}
  if(m.p.y<H(m.p.x,m.p.z)||m.life<=0||(m.decoy&&m.dt<=0)){const pd=m.p.distanceTo(S.pos);fire(m.p,m.decoy?.45:.25);if(m.decoy){spr(m.p,0xfff0d0,90,.35,null,{add:true,tex:glowTex,fog:false,grow:120,must:1});for(let k=0;k<30;k++)spr(m.p,0xffc080,3,1.4,new THREE.Vector3(rnd(160),rnd(160),rnd(160)),{add:true,tex:glowTex,g:20,fog:false,must:1});if(pd<1200){S.shake=Math.max(S.shake,.2+.5*(1-pd/1200));heavy('sub08',.45*(1-pd/1500),1.35)}}boomSfx(false);if(AC&&pd<4000){psrc('hitsub',.4,m.p,false,{ref:280,rate:.95,pri:1,fadeIn:.2,tag:'psrc:hitsub'});if(!psrc('impact',.4,m.p,false,{ref:250,rate:.9,pri:1,fadeIn:.22,tag:'psrc:impact'})){const pn=mkPan(false,150);setP0(pn,m.p);pn.connect(AC.out);thud(pn,.85,55,24,1.3)}}mslAudioStop(m);S.sites[m.site].next=S.t+2.5;S.missile=null;msl.visible=false;mslG.visible=false;if(!S.dead&&!m.def){S.defeated++;msg(m.lost?'MISSILE LOST — TERRAIN MASK':'MISSILE DEFEATED')}}}
 S.brk=Math.max(0,S.brk-rdt);S.brkCD=Math.max(0,S.brkCD-rdt);S.ecm=Math.max(0,S.ecm-rdt);S.ecmCD=Math.max(0,S.ecmCD-rdt);S.teachT=Math.max(0,S.teachT-rdt);S.dmgT=Math.max(0,(S.dmgT||0)-rdt);
 S.exT=(S.exT||0)-rdt;if(!S.cine&&S.exT<=0){S.exT=MOB?.07:.045;const thr=S.thr,sz=1.5+thr*5,life=1.2+thr*2.2,op=.25+thr*.45;spr(tmp.copy(S.pos).addScaledVector(fwd,-8-thr*4),0x3a3732,sz,life,new THREE.Vector3(rnd(2+thr*3),1+thr*2,rnd(2+thr*3)),{grow:4+thr*10,o:op,drag:.4,must:thr>.55});if(thr>.75&&Math.random()<.4)spr(tmp.copy(S.pos).addScaledVector(fwd,-7),0xffa060,2+thr*2,.18,null,{add:true,tex:glowTex,fog:false})}
 if(S.hp<2){S.smT-=rdt;if(S.smT<=0){S.smT=MOB?.09:.05;spr(tmp.copy(S.pos).addScaledVector(fwd,-9),0x2a2724,4,3,new THREE.Vector3(rnd(4),2,rnd(4)),{grow:8,o:.75,must:1});if(Math.random()<.35)spr(tmp.copy(S.pos).addScaledVector(fwd,-8),0xff8a40,2.8,.28,null,{add:true,tex:glowTex,fog:false})}}
 if(!S.cine&&bunker.visible&&bDist()<6500){S.aaaS-=rdt;if(S.aaaS<=0){S.aaaS=.7+Math.random()*.6;aaaBurst(tmp.copy(BUNK).add(new THREE.Vector3(Math.random()<.5?-60:55,4,0)).clone())}
  if(bDist()<4500){S.flakT-=rdt;if(S.flakT<=0){S.flakT=(MOB?1.6:1.2)+Math.random();const P=S.pos.clone().addScaledVector(fwd,150+Math.random()*350).add(new THREE.Vector3(rnd(220),40+Math.random()*160,rnd(220)));
   spr(P,0xfff0c0,30,.2,null,{add:true,tex:glowTex,fog:false,grow:80,must:1});for(let k=0;k<(MOB?4:7);k++)spr(P,0x1c1a18,14,3+Math.random()*2,new THREE.Vector3(rnd(14),rnd(10),rnd(14)),{grow:12,o:.85,drag:.6,must:1});flakBoom(P);const fd=P.distanceTo(S.pos);if(fd<260)S.shake=Math.max(S.shake,.5*(1-fd/260))}}}
 updParts(dt);S.flareCD=Math.max(0,S.flareCD-rdt);if(S.msgT>0)S.msgT-=rdt;S.shake=Math.max(0,S.shake-rdt);radDish.rotation.y+=dt*.8;
 if(S.phase==='egress'&&S.boomT>2&&S.pos.distanceTo(EXIT)<700){S.phase='done';showEnd(true)}
 if(S.pos.z<EXZ-900&&S.phase!=='egress'&&S.phase!=='done')die('LEFT THE AO');
 if(AC&&eng){const tt=AC.currentTime;
  startJet();flyCD=Math.max(0,flyCD-rdt);const warnA=S.missile&&!S.missile.decoy&&!S.missile.lost;
  if(JET){const pr=.72+S.thr*.48;const nodes=JET.a?[JET.a,JET.b]:[JET];nodes.forEach((n,i)=>{try{n.playbackRate.setTargetAtTime(pr*(i?1.002:1),tt,.35)}catch(e){}});AC.jet.gain.setTargetAtTime((S.cine?.08:.1+S.thr*.32)*(warnA?.6:1),tt,.35);AC.jlp.frequency.setTargetAtTime(S.cine?800:1800+S.thr*4200,tt,.35)}AC.sub.gain.setTargetAtTime(S.cine?.03:.05+S.thr*.12,tt,.35);AC.subO&&AC.subO.forEach((o,k)=>o.frequency.setTargetAtTime((36+S.thr*14)*(k+1),tt,.4));updListener();
  AC.wind.g.gain.setTargetAtTime(S.cine?.004:.014+S.thr*.008+Math.min(1,Math.abs(S.roll))*.008,tt,.6);AC.wind.bp.frequency.setTargetAtTime(380+S.thr*420,tt,.6);
  const tense=S.th&&(S.th.anyTrk||S.th.anySrch);AC.mus.gain.setTargetAtTime(warnA?.45:1,tt,.15);AC.amb.gain.setTargetAtTime(BED==='off'?0:(S.cine?.1:(warnA?.22:tense?.48:.4)),tt,1.2);

  const warn=S.missile&&!S.missile.decoy&&!S.missile.lost;trkG.gain.setTargetAtTime(!warn&&S.th&&S.th.anyTrk?.022:0,tt,.03);S.srchT-=rdt;if(S.th&&S.th.anySrch&&!S.th.anyTrk&&S.srchT<=0){S.srchT=1.3;blip(380,.09,.03,'sine')}
  {const md=warn?S.missile.p.distanceTo(S.pos):9e3,rate=warn?4+18*clamp(1-md/6000,0,1):8;S.wph=(S.wph||0)+rdt*rate;warnG.gain.setTargetAtTime(warn?((S.wph|0)%2?1:0):0,tt,.008);tone.frequency.setTargetAtTime(warn?((S.wph|0)%2?620:760+180*clamp(1-md/4000,0,1)):760,tt,.01)}
  const seek=S.phase==='ingress'&&bDist()<4500&&inBox()>0;seekG.gain.setTargetAtTime(seek?((S.t*5|0)%2?.022:0):S.phase==='release'?.016:0,tt,.015);seekG.o.frequency.setTargetAtTime(S.phase==='release'?700:520,tt,.02)}}
function release(){if(window.__ft)window.__ft.markRel();S.relHold=0;S._relT0=0;S.locked=false;S.phase='bombfall';
 const q=inBox();S.err=(1-q)*14+Math.random()*2;const a=Math.random()*6.28;
 S.bomb={p:S.pos.clone().add(new THREE.Vector3(0,-2,0)),v:fwd.clone().multiplyScalar(Math.max(120,S.spd)),s:Math.max(120,S.spd),aim:BUNK.clone().add(new THREE.Vector3(Math.cos(a)*S.err,0,Math.sin(a)*S.err)),tti:99,age:0};bomb.visible=true;jet.visible=true;
 riser(true);heavy('sub08',.45,1.15);if(AC&&!heavy('subdrop',.8,1,true))thud(AC.out,.6,60,28,.8);blip(300,.2,.3,'triangle');whoosh()}
function showEnd(win){running=false;if(AC){const t=AC.currentTime;riser(false);AC.jet.gain.setTargetAtTime(0,t,.5);AC.amb.gain.setTargetAtTime(0,t,.5);try{stopBed()}catch(e){};eng.g.gain.setTargetAtTime(0,t,.3);warnG.gain.setTargetAtTime(0,t,.05);trkG.gain.setTargetAtTime(0,t,.05);AC.sub.gain.setTargetAtTime(0,t,.3);if(S.missile)mslAudioStop(S.missile);$('vig').style.opacity=0;$('teach').style.display='none';seekG.gain.setTargetAtTime(0,t,.05);
 if(win)setTimeout(()=>SB.get(BRIEF_TRACK).then(b=>{if(!b||running)return;stopWin();winSrc=src(b,0,AC.musB,{loop:true});winSrc.g.gain.cancelScheduledValues(AC.currentTime);winSrc.g.gain.setValueAtTime(0,AC.currentTime);winSrc.g.gain.linearRampToValueAtTime(.5,AC.currentTime+1.5)}),900)}const prec=win?Math.round(clamp(100-S.err*5,0,100)):0,st=Math.round(clamp(100-S.detT/Math.max(1,S.t)*100-S.samShots*10,0,100)),tm=S.t;
 const stars=win?1+(prec>=80)+(st>=75&&tm<170):0;$('et').textContent=win?'MISSION COMPLETE // TARGET DESTROYED':'MISSION FAILED // '+S.dead;$('es').textContent='★'.repeat(stars)+'☆'.repeat(3-stars);
 $('etab').innerHTML=`<tr><td>PRECISION</td><td>${prec}%${win?` · CEP ${S.err.toFixed(1)} M`:''}</td></tr><tr><td>STEALTH</td><td>${st}%</td></tr><tr><td>TIME ON MISSION</td><td>${(tm/60|0)}:${String(tm%60|0).padStart(2,'0')}</td></tr><tr><td>SAMS DEFEATED</td><td>${S.defeated}</td></tr>`;
 $('end').classList.remove('hide')}
// ---------- render + HUD ----------
const hud=$('hud'),hx=hud.getContext('2d');let W=0,Hh=0,dpr=1;
function resize(){W=innerWidth;Hh=innerHeight;dpr=Math.min(devicePixelRatio,2);R.setSize(W,Hh,false);composer.setPixelRatio(PR);composer.setSize(W,Hh);bloom.resolution.set(W/(MOB?4:2),Hh/(MOB?4:2));hud.width=W*dpr;hud.height=Hh*dpr;cam.aspect=W/Hh;cam.updateProjectionMatrix()}
addEventListener('resize',resize);resize();
function render(){jet.position.copy(S.pos);sun.target.position.copy(S.pos);sun.position.copy(S.pos).addScaledVector(SUN,900);jet.rotation.set(S.pitch,S.yaw,S.roll);const tt=performance.now()/1000;jet.userData.core.material.color.setRGB(.12+S.thr*.25,.05+S.thr*.06,.02);jet.userData.sh.material.uniforms.t.value=tt;jet.userData.sh.material.uniforms.a.value=.4+S.thr;
 // Bomb-cam only after a short settle so first-frame compile can't hang on an empty view; jet stays visible in scene
 const useBombCam=S.cine&&S.bomb&&(S.bomb.age||0)>.35;
 if(useBombCam){const b=S.bomb,dv=tmp.copy(b.v).normalize();if(dv.lengthSq()<.01)dv.set(0,-1,0);cam.position.copy(b.p).addScaledVector(dv,-18).y+=5;cam.lookAt(b.p);S.cineA=null}
 else if(S.cine&&!S.bomb){if(!S.cineA){const dh=new THREE.Vector3(cam.position.x-BUNK.x,0,cam.position.z-BUNK.z);if(dh.lengthSq()<.01)dh.set(0,0,1);dh.normalize();const nk=S.boomT>=0,a=BUNK.clone().addScaledVector(dh,nk?1900:780);a.y=nk?Math.max(BUNK.y+380,H(a.x,a.z)+200):Math.max(BUNK.y+170,H(a.x,a.z)+60);S.cineA=a}cam.position.copy(S.cineA);cam.lookAt(tmp.copy(BUNK).setY(BUNK.y+(S.boomT>=0?(NK?250+Math.min(950,NK.t*160):300):10)))}
 else{cam.position.set(S.pos.x+Math.sin(S.yaw)*24,S.pos.y+6.5,S.pos.z+Math.cos(S.yaw)*24);cam.rotation.set(-.07,S.yaw,0)}
 if(S.shake>0){const a=S.cine?2.2:.25;cam.position.y+=Math.sin(tt*43)*S.shake*a;cam.position.x+=Math.sin(tt*31+1)*S.shake*a*.6}
 sky.position.copy(cam.position);grade.u.uT.value=performance.now()/1000;composer.render();drawHUD()}
const G='rgba(182,220,174,.9)',GF='600 11px ui-monospace,"SF Mono",Menlo,monospace';
function txt(s,x,y,sz=11,al='center',c=G){hx.font=`600 ${sz}px ui-monospace,"SF Mono",Menlo,monospace`;hx.textAlign=al;hx.fillStyle=c;hx.fillText(s,x,y)}
function drawCine(){const cx=W/2;hx.fillStyle='rgba(0,0,0,.85)';hx.fillRect(0,0,W,Hh*.09);hx.fillRect(0,Hh*.91,W,Hh*.09);
 const t=S.phase==='bombfall'?((S.bomb&&(S.bomb.age||0)>.35)?'WPN CAM  //  GBU-PEN  TTI '+(S.bomb.tti.toFixed(1)):'RELEASED  //  TTI '+(S.bomb?S.bomb.tti.toFixed(1):'0.0')):S.phase==='penetrate'?'PENETRATING  '+Math.min(60,Math.round(S.penT*38))+' M  //  FUZE DELAY':'BDA  //  TARGET DESTROYED';
 txt(t,cx,Hh*.06,12,'center','rgba(220,225,215,.9)');txt('REC ●  '+S.t.toFixed(1),W-20-(innerWidth>0?0:0),Hh*.96,10,'right','rgba(255,120,100,.85)')}
function line(a,b,c,d){hx.beginPath();hx.moveTo(a,b);hx.lineTo(c,d);hx.stroke()}
function tagBox(p,label,c,sz=14){const s=scr(p);if(!s||s.x<0||s.x>W||s.y<0||s.y>Hh)return;hx.strokeStyle=c;const k=sz*.45;
 for(const [sx,sy] of[[-1,-1],[1,-1],[-1,1],[1,1]]){line(s.x+sx*sz,s.y+sy*sz,s.x+sx*(sz-k),s.y+sy*sz);line(s.x+sx*sz,s.y+sy*sz,s.x+sx*sz,s.y+sy*(sz-k))}
 txt(label,s.x,s.y-sz-5,10,'center',c);txt((S.pos.distanceTo(p)/1000).toFixed(1),s.x,s.y+sz+12,10,'center',c);hx.strokeStyle=G;return s}
function drawHUD(){hx.setTransform(dpr,0,0,dpr,0,0);hx.clearRect(0,0,W,Hh);if(!running&&!S.dead)return;if(S.cine){drawCine();return}const cx=W/2,cy=Hh*.5;hx.strokeStyle=G;hx.lineWidth=1;hx.shadowColor='rgba(0,0,0,.9)';hx.shadowBlur=3;
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
 // heading tape
 const hdg=((-S.yaw/D2R)%360+360)%360;line(cx-110,26,cx+110,26);
 for(let d=-25;d<=25;d+=5){const v=Math.round(hdg/5)*5+d,x=cx+(v-hdg)*4.2;if(x<cx-110||x>cx+110)continue;line(x,26,x,v%10?30:33);if(v%10===0)txt(String((((v%360)+360)%360)/10|0).padStart(2,'0'),x,44,10)}
 hx.strokeRect(cx-16,8,32,14);txt(String(Math.round(hdg)).padStart(3,'0'),cx,19,10);line(cx,22,cx,26);
 // speed & altitude
 const L=cx-W*.3,Rr=cx+W*.3;hx.strokeRect(L-52,cy-9,52,18);txt(Math.round(S.spd*1.94),L-6,cy+4,12,'right');txt('KCAS',L-26,cy-14,9);txt('M '+(S.spd/340).toFixed(2),L-26,cy+24,9);
 const ac=S.agl>150?'rgba(255,110,90,.95)':G;hx.strokeStyle=ac;hx.strokeRect(Rr,cy-9,56,18);txt(Math.round(S.agl||0)+'R',Rr+50,cy+4,12,'right',ac);txt('AGL',Rr+28,cy-14,9,'center',ac);txt(Math.round(S.pos.y*3.28)+' FT',Rr+28,cy+24,9,'center',ac);hx.strokeStyle=G;
 txt('THR '+Math.round(S.thr*100)+'%  '+Math.round(S.spd*1.94)+' KTS',L-26,cy+40,9);txt('FLR '+S.flares,L-26,cy+54,9);
 // EMCON / radar detection
 const mx=Rr-4,my=cy+48,dc=S.det>60?'rgba(255,110,90,.95)':S.det>25?'rgba(255,210,110,.95)':G;txt('DETECT',mx+30,my-4,9,'center',dc);hx.strokeStyle=dc;hx.strokeRect(mx,my,64,6);hx.fillStyle=dc;hx.fillRect(mx+1,my+1,62*S.det/100,4);hx.strokeStyle=G;txt('<150R',mx+30,my+17,9,'center',dc);
 const showBox=S.phase==='ingress'||S.phase==='release';if(showBox&&bDist()<6000){const bw=W*.16,bh=Hh*.2;hx.globalAlpha=.6;for(const [sx,sy] of[[-1,-1],[1,-1],[-1,1],[1,1]]){line(cx+sx*bw,cy+sy*bh,cx+sx*(bw-14),cy+sy*bh);line(cx+sx*bw,cy+sy*bh,cx+sx*bw,cy+sy*(bh-14))}hx.globalAlpha=1}
 if(bunker.visible){const lk=S.phase==='release';const s=tagBox(BUNK,lk?'TGT LOCK':'TGT',G,lk?11:15);
  if(s&&lk){line(s.x,s.y-16,s.x+16,s.y);line(s.x+16,s.y,s.x,s.y+16);line(s.x,s.y+16,s.x-16,s.y);line(s.x-16,s.y,s.x,s.y-16);line(fp.x,fp.y,s.x,s.y)}}
 SITES.forEach((st,i)=>{const ss=S.sites[i];if(ss.st!=='off')tagBox(tmp.copy(st.p).setY(st.p.y+6),ss.st==='track'?st.n+' TRK':st.n,ss.st==='track'?'rgba(255,80,70,1)':'rgba(255,170,110,.9)',9)});tagBox(tmp.copy(RADP).setY(RADP.y+27),'EW','rgba(255,190,110,.95)',9);
 if(S.missile)tagBox(S.missile.p,S.missile.decoy?'DECOY':'MSL','rgba(255,80,70,1)',8);
 if(S.bomb){const s=scr(S.bomb.p);if(s)txt('WPN',s.x+12,s.y,9,'left')}
 if(S.phase==='egress')tagBox(EXIT,'EXFIL',G,12);
 let o='';const d=bDist();
 if(S.phase==='ingress')o=d<4500&&inBox()>0?'LOCK TARGET':d<4500?'TGT INTO BOX':'FLY TO BUNKER  '+(d/1000).toFixed(1)+' KM';
 else if(S.phase==='release')o=d<3000?'HOLD RELEASE':'IN RANGE  '+((d-3000)/1000).toFixed(1)+' KM';
 else if(S.phase==='bombfall')o='WPN AWAY  TTI '+(S.bomb?S.bomb.tti.toFixed(1):'0.0');
 else if(S.phase==='penetrate')o='PENETRATING  '+Math.min(60,Math.round(S.penT*38))+' M';
 else if(S.phase==='egress')o=S.boomT<2?'TARGET DESTROYED':'EGRESS  EXFIL '+(S.pos.distanceTo(EXIT)/1000).toFixed(1)+' KM';
 txt(o,cx,70,14);
 const thr=[];if(S.missile&&!S.missile.decoy&&!S.missile.lost)thr.push([S.missile.p,'MSL',1]);SITES.forEach((st,i)=>{if(S.sites[i].st==='track')thr.push([st.p,'SAM',0])});
 for(const [P,lab,isM] of thr){V.copy(P).applyMatrix4(cam.matrixWorldInverse);let dx=V.x,dy=-V.y;if(V.z>0){dx=V.x;dy=Math.abs(V.y)+Math.abs(V.x)*.2}const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;const r=Hh*.3,ax=cx+dx*r,ay=cy+dy*r;
  const c=isM?((S.t*6|0)%2?'rgba(255,70,60,1)':'rgba(255,200,180,1)'):'rgba(255,140,90,.95)';hx.fillStyle=c;hx.beginPath();hx.moveTo(ax+dx*16,ay+dy*16);hx.lineTo(ax-dy*8,ay+dx*8);hx.lineTo(ax+dy*8,ay-dx*8);hx.closePath();hx.fill();txt(lab,ax-dx*14,ay-dy*14+4,9,'center',c)}
 const clk=P=>{const rx=P.x-S.pos.x,rz=P.z-S.pos.z;let a=Math.atan2(-rx,-rz)-S.yaw;a=-a;let h=Math.round(((a/D2R%360)+360)%360/30)%12;return (h||12)+" O'CLOCK"};
 const M=S.missile;if(M&&!M.decoy&&!M.lost){const md=M.p.distanceTo(S.pos),fw=flrWin(),bw=S.samShots<=1?1500:1100;txt(md<bw&&S.brkCD<=0&&md>220?((S.t*6|0)%2?'▶▶ FLARE / BREAK NOW ◀◀':'   FLARE / BREAK NOW   '):md<fw?((S.t*5|0)%2?'▶▶ FLARE NOW ◀◀':'   FLARE NOW   '):'MISSILE  '+clk(M.p)+'  —  FLARE IN '+((md-fw)/1000).toFixed(1)+' KM · ECM NOW',cx,Hh-30,md<fw?17:13,'center','rgba(255,90,80,1)');txt('MISSILE',cx,cy-Hh*.2,18,'center',(S.t*4|0)%2?'rgba(255,70,60,1)':'rgba(255,70,60,.25)')}
 else if(S.th&&S.th.anyTrk)txt('SAM TRACKING — DROP BEHIND RIDGE / BREAK LOS',cx,Hh-30,12,'center','rgba(255,140,90,1)');
 else if(S.msgT>0)txt(S.msg,cx,Hh-30,12,'center','rgba(255,215,130,.95)');
 else if(S.agl>150&&S.phase!=='done')txt('ALT — RADAR EXPOSURE',cx,Hh-30,12,'center','rgba(255,110,90,.95)');
 $('lock').classList.toggle('off',!canLock());$('lock').classList.toggle('hot',canLock());
 const rOn=S.phase==='release'&&d<3000;$('rel').classList.toggle('off',!rOn);$('rel').classList.toggle('hot',rOn);$('relf').style.width=(S.relHold/.5*100)+'%';
 {const M=S.missile,act=M&&!M.decoy&&!M.lost,md=act?M.p.distanceTo(S.pos):9e9;
 // red vignette pulse, faster as missile closes
 const vg=$('vig');if(act){S.vph=(S.vph||0)+(1/60)*(1.5+10*clamp(1-md/5000,0,1));vg.style.opacity=(.25+.55*clamp(1-md/5000,0,1))*(.5+.5*Math.sin(S.vph*6.283))}else vg.style.opacity=S.dmgT>0?S.dmgT/3*.6:S.hp<2?.12:0;
 if(act){txt((md/1000).toFixed(1)+' KM',cx,cy-Hh*.2+22,16,'center','rgba(255,120,100,1)');const ttg=md/Math.max(50,M.v.length());txt('TTI '+ttg.toFixed(1)+' S',cx,cy-Hh*.2+38,11,'center','rgba(255,150,130,.95)')}
 const fw=flrWin(),bw=S.samShots<=1?1500:1100;$('flr').classList.toggle('hot',act&&md<fw);$('brk').classList.toggle('hot',act&&md<bw&&md>220&&S.brkCD<=0);$('brk').classList.toggle('off',S.brkCD>0);$('ecm').classList.toggle('off',S.ecmCD>0||S.ecmN<=0);$('ecm').textContent=S.ecm>0?'JAM '+S.ecm.toFixed(0):S.ecmCD>0?'ECM '+S.ecmCD.toFixed(0):'ECM ×'+S.ecmN;
 const te=$('teach');if(S.teachT>0){te.style.display='block';te.innerHTML='MISSILE INBOUND — DEFEND!<br>FLARE when range &lt; '+(fw/1000).toFixed(1)+' KM · or BREAK when &lt; '+(bw/1000).toFixed(1)+' KM · ECM jams it while far'}else te.style.display='none';
 // RWR scope (top-right)
 const rr=Math.min(46,Hh*.12),rx=W-rr-18,ry=Hh*.14+rr*.4+12;hx.fillStyle='rgba(0,10,4,.45)';hx.beginPath();hx.arc(rx,ry,rr,0,7);hx.fill();hx.strokeStyle='rgba(182,220,174,.6)';hx.beginPath();hx.arc(rx,ry,rr,0,7);hx.stroke();hx.beginPath();hx.arc(rx,ry,rr*.5,0,7);hx.stroke();line(rx,ry-rr,rx,ry-rr+5);line(rx,ry+rr,rx,ry+rr-5);line(rx-rr,ry,rx-rr+5,ry);line(rx+rr,ry,rx+rr-5,ry);txt('RWR',rx,ry+rr+11,9,'center',G);hx.fillStyle=G;hx.fillRect(rx-1.5,ry-1.5,3,3);
 const brg=P=>{const dx=P.x-S.pos.x,dz=P.z-S.pos.z;const a=Math.atan2(dx,-dz)+S.yaw;return a};
 SITES.forEach((st,i)=>{const ss=S.sites[i];if(ss.st==='off')return;const a=brg(st.p),d=st.p.distanceTo(S.pos),r=rr*clamp(.35+.6*d/7500,.35,.92),x=rx+Math.sin(a)*r,y=ry-Math.cos(a)*r,trk=ss.st==='track';const c=trk?'rgba(255,80,70,1)':'rgba(255,190,120,.95)';txt('3',x,y+4,trk?12:10,'center',c);if(trk){hx.strokeStyle=c;hx.beginPath();hx.arc(x,y,7,0,7);hx.stroke()}});
 {const a=brg(RADP);txt('E',rx+Math.sin(a)*rr*.85,ry-Math.cos(a)*rr*.85+4,9,'center','rgba(255,200,120,.8)')}
 if(act){const a=brg(M.p),r=rr*clamp(.2+.75*md/7000,.2,.95),x=rx+Math.sin(a)*r,y=ry-Math.cos(a)*r,c=(S.t*8|0)%2?'rgba(255,60,50,1)':'rgba(255,220,200,1)';hx.strokeStyle=c;hx.lineWidth=2;hx.beginPath();hx.moveTo(x,y-7);hx.lineTo(x+7,y);hx.lineTo(x,y+7);hx.lineTo(x-7,y);hx.closePath();hx.stroke();txt('M',x,y+3,8,'center',c);line(rx,ry,x,y);hx.lineWidth=1}
 hx.strokeStyle=G;if(S.hp<2)txt('DMG',L-26,cy+68,10,'center','rgba(255,120,90,1)');
 // missile edge arrow with range (bigger, always for missile)
 if(act){V.copy(M.p).applyMatrix4(cam.matrixWorldInverse);const on=V.z<0&&Math.abs(V.x/-V.z)<1.2&&Math.abs(V.y/-V.z)<.7;if(!on){let dx=V.x,dy=-V.y;if(V.z>0)dy=Math.abs(dy)+Math.abs(dx)*.1+1;const n=Math.hypot(dx,dy)||1;dx/=n;dy/=n;const k=Math.min((W/2-30)/Math.abs(dx||1e-3),(Hh/2-30)/Math.abs(dy||1e-3)),ax=cx+dx*k,ay=Hh/2+dy*k,c=(S.t*6|0)%2?'rgba(255,60,50,1)':'rgba(255,200,180,1)';hx.fillStyle=c;hx.beginPath();hx.moveTo(ax+dx*22,ay+dy*22);hx.lineTo(ax-dy*13,ay+dx*13);hx.lineTo(ax+dy*13,ay-dx*13);hx.closePath();hx.fill();txt((V.z>0?'BEHIND ':'')+(md/1000).toFixed(1),ax-dx*16,ay-dy*16+4,10,'center',c)}}}
 $('flr').classList.toggle('warn',!!(S.missile&&!S.missile.decoy));$('flr').classList.toggle('off',S.flares<=0)}
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
 ['3/3  WEAPONS + DEFENCE','Place the target in the HUD box, tap LOCK, hold RELEASE. Missile inbound: tap ECM while it is far (> 1.6 km), FLARE when the HUD says FLARE NOW, or BREAK in the last ~1 km to make it overshoot. You survive one hit.']];
let tutI=0;function showTut(){$('tt').textContent=TUT[tutI][0];$('tp').textContent=TUT[tutI][1];$('tn').textContent='TAP TO CONTINUE'}
$('brief').addEventListener('pointerdown',()=>{initAudio();briefMusic();$('snd').textContent='♪ SOUND ON'});
$('go').addEventListener('pointerdown',e=>{e.stopPropagation();goFS();initAudio();stopBrief();heavy('sub08',.28,.8);prewarmGfx();$('brief').classList.add('hide');if(localStorage.ds14_tut)begin();else{tutI=0;showTut();$('tut').classList.remove('hide')}});
$('tut').addEventListener('pointerdown',e=>{e.stopPropagation();tutI++;if(tutI>=3){localStorage.ds14_tut=1;$('tut').classList.add('hide');begin()}else showTut()});
$('retry').addEventListener('pointerdown',e=>{e.stopPropagation();initAudio();stopWin();begin()});
function goFS(){const d=document.documentElement,f=d.requestFullscreen||d.webkitRequestFullscreen;if(f&&!document.fullscreenElement&&!document.webkitFullscreenElement){try{const p=f.call(d,{navigationUI:'hide'});p&&p.catch&&p.catch(()=>{})}catch(e){}}try{screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape').catch(()=>{})}catch(e){}}
addEventListener('pointerdown',goFS,{once:true});
document.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});document.addEventListener('gesturestart',e=>e.preventDefault());addEventListener('resize',()=>scrollTo(0,0));
async function begin(){reset();jet.visible=true;if(AC){AC.resume();await prewarmAudio()}prewarmGfx();running=true;last=performance.now()}
reset();
if(DS_MODE==='game'){clock();drawMap();chat();addEventListener('resize',()=>{if(!$('brief').classList.contains('hide'))drawMap()});requestAnimationFrame(step)}


// ===== SOUND TESTER (same audio engine) =====
let testerPan='C', testerLoops={}, testerEngOn=false;
function testerPos(){const d=420;const o={L:[-d,0,-40],R:[d,0,-40],C:[0,20,-80],B:[0,10,d]}[testerPan]||[0,20,-80];return S.pos.clone().add(new THREE.Vector3(...o))}
function setupSoundTester(){
  document.body.classList.add('soundsMode');
  // keep world light for HRTF listener; park jet
  running=false; S.cine=false; S.pos.set(vx(300),H(vx(300),300)+120,300);
  const list=$('list'); if(!list)return;
  const rows=[
    {id:'engine',name:'ENGINE',desc:'Jet engine loop in flight (s8 character). Use throttle slider.',loop:1,play:()=>startTesterEngine(),stop:()=>stopTesterEngine()},
    {id:'bed_ambient',name:'MUSIC BED — Iron Veil',desc:'Default music bed under gameplay.',loop:1,play:()=>{BED='ambient';startBed()},stop:()=>stopBed()},
    {id:'bed_depth',name:'MUSIC BED — Subsonic Depth',desc:'Optional bed (toned down).',loop:1,play:()=>{BED='mus_depth';startBed()},stop:()=>stopBed()},
    {id:'bed_dream',name:'MUSIC BED — Dream Space',desc:'Optional bed.',loop:1,play:()=>{BED='mus_dream';startBed()},stop:()=>stopBed()},
    {id:'bed_layers',name:'MUSIC BED — Propulsion Layers',desc:'Optional bed.',loop:1,play:()=>{BED='mus_layers';startBed()},stop:()=>stopBed()},
    {id:'bed_waves',name:'MUSIC BED — Warm Waves',desc:'Optional bed (toned down).',loop:1,play:()=>{BED='mus_waves';startBed()},stop:()=>stopBed()},
    {id:'wind',name:'AMBIENCE / WIND',desc:'Wind/ambience layer under the bed (moves with throttle/bank in game).',loop:1,play:()=>{if(!AC)return;AC.amb.gain.setTargetAtTime(.45,AC.currentTime,.2);if(AC.wind)AC.wind.g.gain.setTargetAtTime(.04,AC.currentTime,.2)},stop:()=>{if(!AC)return;AC.amb.gain.setTargetAtTime(0,AC.currentTime,.3);if(AC.wind)AC.wind.g.gain.setTargetAtTime(0,AC.currentTime,.3)}},
    {id:'aaa_near',name:'ENEMY CANNON (AAA) NEAR',desc:'AAA bursts when close to the bunker guns.',play:()=>{const P=testerPos();aaaBurst(P)}},
    {id:'aaa_far',name:'ENEMY CANNON (AAA) FAR',desc:'Distant AAA thunder.',play:()=>{const P=S.pos.clone().add(new THREE.Vector3(0,-20,-4500));aaaBurst(P)}},
    {id:'flak',name:'FLAK',desc:'Flak shell burst near the jet.',play:()=>flakBoom(testerPos().add(new THREE.Vector3(0,40,0)))},
    {id:'pass',name:'NEAR-MISS / BULLET PASS',desc:'Close pass rumble (whoosh + pass-by).',play:()=>{whoosh();passBy(testerPos())}},
    {id:'overhead',name:'OVERHEAD JET PASS',desc:'Layered whoosh/pass-by spatial flyby (the pass sounds you liked).',play:()=>{const P=S.pos.clone().add(new THREE.Vector3(0,80,-20));whoosh();passBy(P);if(SB.jet8)psrc('jet8',.55,P,true,{ref:200,rate:1.05,fadeIn:.15,tag:'overhead'})}},
    {id:'sam',name:'SAM LAUNCH',desc:'Enemy SAM leave-rail roar + RWR.',play:()=>{samRoar(600);rwrLaunch(testerPos(),false)}},
    {id:'mmotor',name:'MISSILE MOTOR',desc:'Looping missile motor while a SAM tracks you.',loop:1,play:()=>{if(!AC)return;if(testerLoops.mm)return;const P=testerPos();const fake={p:P,v:new THREE.Vector3(0,0,-200)};mslAudioStart(fake);testerLoops.mm=fake},stop:()=>{if(testerLoops.mm){mslAudioStop(testerLoops.mm);testerLoops.mm=null}}},
    {id:'hit',name:'MISSILE HIT ON JET',desc:'Airframe hit: sub + hitsub + impact.',play:()=>{if(SB.sub08)src(SB.sub08,.4,AC.bigB,{rate:1.1,pri:1,fadeIn:.18,tag:'heavy:sub08'});if(SB.hitsub)src(SB.hitsub,.45,AC.bigB,{pri:1,fadeIn:.2,tag:'heavy:hitsub'});if(SB.impact)src(SB.impact,.4,AC.bigB,{pri:1,fadeIn:.22,tag:'heavy:impact'});else thud(AC.bigB,.7,50,22,1.5)}},
    {id:'flare',name:'PLAYER FLARE',desc:'Pyrotechnic flare: bass thump + fiery hiss.',play:()=>flareSfx()},
    {id:'ecm',name:'ECM',desc:'ECM jammer chirps + noise.',play:()=>{for(let k=0;k<6;k++)blip(k%2?340:300,.12,.05);nburst(AC.out,.08,220,1.2)}},
    {id:'break',name:'BREAK',desc:'Hard break turn thump.',play:()=>{thud(AC.out,.3,55,30,.5);nburst(AC.out,.12,200,.8)}},
    {id:'rwr',name:'RWR WARNING TONES',desc:'Launch warning tones on the RWR bus.',play:()=>rwrLaunch(testerPos(),true)},
    {id:'release',name:'BOMB RELEASE',desc:'Pickle: riser/subdrop/whoosh on release.',play:()=>{if(typeof riser==='function')try{riser(true)}catch(e){};heavy('sub08',.45,1.15);if(!heavy('subdrop',.8,1,true))thud(AC.out,.6,60,28,.8);blip(300,.2,.3);whoosh()}},
    {id:'nuke',name:'BUNKER EXPLOSION / NUKE',desc:'Penetrator detonation boom.',play:()=>boomSfx(true)},
    {id:'dub',name:'MISSION COMPLETE — Dub 02',desc:'Deep Space Dub 02 victory / debrief loop (brief track).',loop:1,play:()=>{SB.get(BRIEF_TRACK).then(b=>{if(!b||!AC)return;stopWin();winSrc=src(mkSeamless(b,.4),0,AC.musB,{loop:true,tag:'dub02'});winSrc.g.gain.setValueAtTime(0,AC.currentTime);winSrc.g.gain.linearRampToValueAtTime(.5,AC.currentTime+1)})},stop:()=>stopWin()},
  ];
  list.innerHTML='';
  for(const r of rows){
    const el=document.createElement('div');el.className='row';el.dataset.id=r.id;
    el.innerHTML=`<div class="meta"><div class="name">${r.name}</div><div class="desc">${r.desc}</div></div><div class="acts"><button type="button" data-act="play">▶ Play</button>${r.loop?'<label class="loop"><input type="checkbox" data-loop/> Loop</label><button type="button" data-act="stop">■ Stop</button>':'<button type="button" data-act="stop">■ Stop</button>'}</div>`;
    el.addEventListener('click',e=>{
      const btn=e.target.closest('button'); if(!btn)return;
      initAudio(); AC.resume();
      if(btn.dataset.act==='play'){ r.play(); if(r.id==='engine')$('thrbox')?.classList.add('on'); }
      if(btn.dataset.act==='stop'){ r.stop?.(); if(r.id==='engine')$('thrbox')?.classList.remove('on'); }
    });
    list.appendChild(el);
  }
  document.querySelectorAll('#pan button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#pan button').forEach(x=>x.classList.remove('on'));b.classList.add('on');testerPan=b.dataset.pan}));
  const bindVol=(id,fn)=>{const el=$(id);if(!el)return;el.addEventListener('input',()=>fn(+el.value/100));fn(+el.value/100)};
  bindVol('t_master',v=>{if(AC?.mg)AC.mg.gain.setTargetAtTime(v,AC.currentTime,.05)});
  bindVol('t_mus',v=>{VOL.bed=v;VOL.mus=v;applyVol()});
  bindVol('t_fx',v=>{VOL.fx=v;applyVol()});
  bindVol('t_eng',v=>{VOL.eng=v;applyVol()});
  const thr=$('t_thr'); if(thr)thr.addEventListener('input',()=>{const v=+thr.value/100; S.thr=v; $('t_thrv').textContent=Math.round(v*100)+'%'; if(JET&&AC){const pr=.72+v*.48; const nodes=JET.a?[JET.a,JET.b]:[JET]; nodes.forEach((n,i)=>{try{n.playbackRate.setTargetAtTime(pr*(i?1.002:1),AC.currentTime,.15)}catch(e){}}); AC.jet.gain.setTargetAtTime(.1+v*.32,AC.currentTime,.15); AC.jlp.frequency.setTargetAtTime(1800+v*4200,AC.currentTime,.15); AC.sub.gain.setTargetAtTime(.05+v*.12,AC.currentTime,.15)}});
  const unlock=$('unlockBtn'); if(unlock)unlock.addEventListener('pointerdown',async()=>{initAudio();try{await AC.resume()}catch(e){} SB.load(); startJet(); stopTesterEngine(); $('unlock')?.remove();});
  // listener follow
  function tick(){requestAnimationFrame(tick); if(AC&&S){try{updListener()}catch(e){}} }
  requestAnimationFrame(tick);
}
function startTesterEngine(){initAudio(); if(!JET)startJet(); testerEngOn=true; if(AC){AC.jet.gain.setTargetAtTime(.1+S.thr*.32,AC.currentTime,.1); AC.sub.gain.setTargetAtTime(.05+S.thr*.12,AC.currentTime,.1)} $('thrbox')?.classList.add('on')}
function stopTesterEngine(){testerEngOn=false; if(AC){AC.jet.gain.setTargetAtTime(0,AC.currentTime,.2); AC.sub.gain.setTargetAtTime(0,AC.currentTime,.2)} }

// ===== SCENERY TESTER (preset gallery, fixed cruise view, no orbit/sliders) =====
const SCEN_PRESETS=[
  {id:'s14',name:'s14 Default',desc:'Clear natural sky, real snowline — the shipping look.',
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
let scenActiveId='s14';
function setupSceneryTester(){
  document.body.classList.add('sceneryMode');
  running=false; S.dead=null; S.missile=null; S.phase='ingress';
  // Fixed representative cruise view: behind the jet, valley + snowy peaks ahead
  parkScenCruise();
  const list=$('list'); if(!list)return;
  list.innerHTML='';
  for(const p of SCEN_PRESETS){
    const el=document.createElement('div'); el.className='row'+(p.id==='s14'?' on':''); el.dataset.id=p.id;
    el.innerHTML=`<div class="name">${p.name}</div><div class="desc">${p.desc}</div><div class="acts"><button type="button" class="live" data-act="live">VIEW LIVE</button><button type="button" class="pick" data-act="pick">PICK THIS</button></div>`;
    el.addEventListener('click',e=>{
      const btn=e.target.closest('button'); if(!btn)return;
      if(btn.dataset.act==='live'){ applyScenPreset(p.id); }
      if(btn.dataset.act==='pick'){ pickScenPreset(p.id); }
    });
    list.appendChild(el);
  }
  // restore prior pick if any
  try{
    const raw=JSON.parse(localStorage.ds14_scen_pick||'null');
    if(raw?.id && SCEN_PRESETS.some(p=>p.id===raw.id)){ showPicked(raw); applyScenPreset(raw.id); }
    else applyScenPreset('s14');
  }catch(e){ applyScenPreset('s14'); }
  // resize gl to preview wrap
  function fit(){const w=$('previewWrap'); if(!w)return; const r=w.getBoundingClientRect(); R.setSize(r.width,r.height,false); cam.aspect=r.width/Math.max(1,r.height); cam.updateProjectionMatrix()}
  fit(); addEventListener('resize',fit); if(window.visualViewport)visualViewport.addEventListener('resize',fit);
  function frame(){requestAnimationFrame(frame); parkScenCruise(true); if(jet)jet.visible=true; if(msl)msl.visible=false; if(mslG)mslG.visible=false;
    // keep jet oriented with camera path
    if(jet){jet.position.copy(S.pos); jet.rotation.set(S.pitch,S.yaw,S.roll)}
    if(useBloom&&composer)composer.render(); else R.render(scene,cam)}
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
  const payload={v:'s14',id:p.id,name:p.name,t:Date.now(),SCEN:{...SCEN}};
  localStorage.ds14_scen_pick=JSON.stringify(payload);
  localStorage.ds14_scen=JSON.stringify({v:'s14',t:payload.t,SCEN:payload.SCEN,preset:p.id,name:p.name});
  showPicked(payload);
}
function showPicked(payload){
  const el=$('picked'); if(!el)return;
  el.textContent='PICKED: '+payload.name+' ('+payload.id+')';
  el.classList.add('on');
}

window.__S=()=>S;window.__brk=doBreak;window.__flr=fireFlares;window.__ecm=doECM;window.__begin=begin;window.__inp=inp;window.__aaa=P=>aaaBurst(P||BUNK.clone());window.__flak=P=>flakBoom(P||BUNK.clone().add(new THREE.Vector3(0,80,0)));window.__whoosh=whoosh;window.__passBy=P=>passBy(P||S.pos.clone());window.__sam=d=>samRoar(d||800);window.__rwr=P=>rwrLaunch(P||BUNK.clone(),false);window.__boom=b=>boomSfx(!!b);window.__thud=()=>thud(AC.out,.5,48,20,1);window.__nburst=()=>nburst(AC.out,.3,220,.5);window.__BUNK=()=>BUNK;window.__release=release;window.__H=H;window.__setThr=setThr;window.__AC=()=>AC;window.__ft={max:0,relMax:0,n:0,markRel(){this._r=performance.now()}};window.__sfx=()=>window.__sfxLog.slice();window.__clearSfx=()=>{window.__sfxLog=[]};

// mode boot (after all lets)
if(DS_MODE==='sounds')setupSoundTester();
else if(DS_MODE==='scenery')setupSceneryTester();
