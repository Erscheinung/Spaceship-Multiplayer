import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.GRAPHICS_URL || 'http://127.0.0.1:5191';
const out=process.env.ORB_CAPTURES || '/tmp/neon-orb-captures';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=metal']});
const reports=[];
try {
 for(const config of [{name:'desktop',width:1440,height:900,preset:'day'},{name:'portrait',width:393,height:705,preset:'night'}]) {
  const page=await browser.newPage({viewport:{width:config.width,height:config.height},hasTouch:config.name==='portrait',isMobile:config.name==='portrait'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/.test(m.text()))errors.push(m.text())});
  await page.route('**/src/lib/game/Engine.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\n;const originalStart=Engine.prototype.start; Engine.prototype.start=function(...args){window.flightEngine=this;const result=originalStart.apply(this,args);if(this.sim)this.sim.random=()=>.5;return result};\n'})});
  await page.goto(base);await page.waitForFunction(()=>!document.querySelector('button.practice')?.disabled);
  await page.locator('#lighting-preset').selectOption(config.preset);await page.locator('button.practice').click();
  await page.waitForFunction(()=>window.flightEngine?.state?.time>1);
  await page.evaluate(()=>{window.frameIntervals=[];let last=performance.now();function sample(t){window.frameIntervals.push(t-last);last=t;window.frameSampler=requestAnimationFrame(sample)}window.frameSampler=requestAnimationFrame(sample)});
  const seenKinds=new Set(), orbIds=new Set(), bulletIds=new Set();let maxRocks=0,maxBullets=0,captured=false;
  for(let i=0;i<180;i++) {
   const state=await page.evaluate(i=>{const e=window.flightEngine,s=e.state,p=s.players[0];e.touch.x=Math.max(-.4,Math.min(.4,-p.x*.2));e.actions.boost=i>=120&&i<150;const missing=s.obstacles.filter(o=>{const mesh=e.objects.get('t'+o.id);return !mesh || !mesh.visible || mesh.scale.lengthSq()<.01}).map(o=>o.id);return {missing,time:s.time,score:s.score,rocks:s.rocks.map(r=>r.id),bullets:s.bullets.map(b=>b.id),kinds:s.delivery?.targets.map(t=>t.kind)??[],obstacles:s.obstacles.map(o=>o.id),over:s.over}},i);
   if(state.missing.length)throw Error('Obstacle meshes disappeared: '+state.missing.join(','));
   state.rocks.forEach(id=>orbIds.add(id));state.bullets.forEach(id=>bulletIds.add(id));state.kinds.forEach(k=>seenKinds.add(k));maxRocks=Math.max(maxRocks,state.rocks.length);maxBullets=Math.max(maxBullets,state.bullets.length);
   if(!captured&&state.rocks.length&&state.bullets.length){await page.screenshot({path:`${out}/orb-combat-${config.name}.png`});captured=true}
   if(i===150)await page.screenshot({path:`${out}/orb-boost-${config.name}.png`});
   await page.waitForTimeout(100);
  }
  const final=await page.evaluate(()=>{cancelAnimationFrame(window.frameSampler);const e=window.flightEngine;const frames=window.frameIntervals.sort((a,b)=>a-b);return{time:e.state.time,score:e.state.score,over:e.state.over,median:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],samples:frames.length,textures:e.world.renderer.info.memory.textures,geometries:e.world.renderer.info.memory.geometries}});
  await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor();const frozen=await page.evaluate(()=>window.flightEngine.state.time);await page.waitForTimeout(350);if(await page.evaluate(()=>window.flightEngine.state.time)!==frozen)throw Error('Pause advanced simulation');await page.getByRole('button',{name:'RESUME FLIGHT'}).click();
  const layout=await page.evaluate(()=>{const a=document.querySelector('.delivery-status').getBoundingClientRect();const controls=['.touch-pad','.flight-actions'].map(s=>document.querySelector(s)?.getBoundingClientRect()).filter(Boolean);return{overflow:document.documentElement.scrollWidth>innerWidth,overlap:controls.some(b=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y)}});
  reports.push({config,orbCount:orbIds.size,shotCount:bulletIds.size,maxRocks,maxBullets,seenKinds:[...seenKinds],captured,final,layout,errors});
  if(errors.length||layout.overflow||layout.overlap||final.over)throw Error(JSON.stringify(reports.at(-1)));
  if(!process.env.ORB_BASELINE&&(!orbIds.size||bulletIds.size<15||!captured||final.score<=0))throw Error('Courier combat missing or too sparse');
  await page.close();
 }
 await writeFile(`${out}/report.json`,JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
} finally {await browser.close()}
