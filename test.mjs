import { chromium } from 'playwright';
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--autoplay-policy=no-user-gesture-required']});
const p=await b.newPage({viewport:{width:844,height:390},deviceScaleFactor:1,hasTouch:true});
const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await p.goto('http://localhost:8099/index.html');await p.waitForTimeout(1500);
await p.screenshot({path:'shots/0-title.png'});
await p.click('#go');await p.waitForTimeout(300);await p.screenshot({path:'shots/1-tutorial.png'});
for(let i=0;i<3;i++){await p.click('#tut');await p.waitForTimeout(150)}
// autopilot: follow valley centre at ~70m, head to bunker then exit
await p.evaluate(()=>{const vx=z=>Math.sin(z/1500)*380+Math.sin(z/570+1)*90;setInterval(()=>{const S=__S();if(!S)return;
 const tz=S.pos.z-900, tx=(S.phase==='ingress'||S.phase==='release')&&S.pos.z>-10000?(S.pos.z<-7000?vx(-10000)+40:vx(tz)):vx(tz);
 const want=Math.atan2(-(tx-S.pos.x),-(tz-S.pos.z)); let e=want-S.yaw; e=Math.atan2(Math.sin(e),Math.cos(e));
 __inp.x=Math.max(-1,Math.min(1,-e*3)); const ta=S.phase==='egress'?60:70; __inp.y=Math.max(-1,Math.min(1,(S.agl-ta)/40));},50)});
const t0=Date.now();let shot2=false,shot3=false,state;
while(Date.now()-t0<240000){await p.waitForTimeout(250);state=await p.evaluate(()=>{const S=__S();return{ph:S.phase,d:S.dead,z:S.pos.z|0,agl:S.agl|0,fps:__fps(),lock:!document.getElementById('lock').classList.contains('off'),boom:S.boomT,m:!!S.missile,t:S.t}});
 if(!shot2&&state.z<-3000){shot2=true;await p.screenshot({path:'shots/2-valley.png'});console.log('fps',state.fps)}
 if(state.lock&&state.ph==='ingress'){await p.dispatchEvent('#lock','pointerdown');console.log('locked',state.z);await p.screenshot({path:'shots/3-lock.png'})}
 if(state.ph==='release'){await p.dispatchEvent('#rel','pointerdown');await p.waitForTimeout(700);await p.evaluate(()=>dispatchEvent(new PointerEvent('pointerup')))}
 if(!shot3&&state.boom>0.35){shot3=true;await p.screenshot({path:'shots/4-explosion.png'})}
 if(state.m){await p.dispatchEvent('#flr','pointerdown')}
 if(state.d||state.ph==='done')break;}
console.log(JSON.stringify(state));await p.waitForTimeout(800);await p.screenshot({path:'shots/5-score.png'});
console.log('errors',errs);await b.close();
