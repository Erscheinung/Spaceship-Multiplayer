import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const out=process.env.ROAMING_CAPTURES || '/tmp/roaming-captures'; await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=metal']});
const reports=[];
for(const config of [{name:'desktop',width:1440,height:900,preset:'day'},{name:'phone',width:393,height:705,preset:'night'},{name:'landscape',width:844,height:390,preset:'golden'}]) {
 const page=await browser.newPage({viewport:config,hasTouch:config.name!=='desktop',isMobile:config.name!=='desktop'}); const errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.log(e.message)}); page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/.test(m.text()))errors.push(m.text())});
 await page.route('**/src/lib/game/Engine.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
;const originalStart=Engine.prototype.start; Engine.prototype.start=function(...args){window.eng=this;return originalStart.apply(this,args)}`})});
 await page.goto(process.env.GRAPHICS_URL || 'http://127.0.0.1:5189'); await page.locator('button.practice').waitFor(); await page.waitForFunction(()=>!document.querySelector('button.practice').disabled);
 await page.locator('#lighting-preset').selectOption(config.preset==='golden'?'golden':config.preset);
 await page.locator('button.practice').click();await page.waitForFunction(()=>window.eng?.state?.time>1);
 await page.keyboard.press('Escape'); await page.waitForTimeout(200);
 const pause=await page.evaluate(()=>window.eng.state.time);await page.waitForTimeout(300);if(await page.evaluate(()=>window.eng.state.time)!==pause)throw Error('Pause advanced');
 await page.getByRole('button',{name:'RESUME FLIGHT'}).click();
 const kinds=[];
 for(const kind of ['moth','parcel','crab','sorter']) {
  await page.evaluate(async kind=>{const {advanceDelivery}=await import('/src/lib/game/delivery.js'); const e=window.eng; const s=e.state; const d=s.delivery;d.targets=[];d.bag=[kind];d.nextEncounter=s.time; advanceDelivery(d,{time:s.time,dt:0,players:s.players,callbacks:{random:()=>.5}}); s.players[0].cooldown=999; },kind);
  await page.waitForFunction(()=>{const s=window.eng.state;const t=s.delivery.targets[0];return t && s.players[0].z-t.z < 45});await page.screenshot({path:`${out}/${config.name}-${kind}.png`});kinds.push(kind);
 }
 for (let district=0;district<3;district++) {
  await page.evaluate(district=>{const e=window.eng,s=e.state,d=s.delivery,p=s.players[0];d.district=district;d.rack[0].letters=1;d.recovered++;d.restored=false;d.destination={id:'test-destination',x:p.x,y:p.y,z:p.z-50,routeDistance:s.time*14-p.z+50,spawnedAt:s.time,deliveredAt:null,failedAt:null};},district);
  await page.waitForTimeout(450);
  if(!await page.evaluate(()=>window.eng.state.delivery.restored))throw Error('Delivery did not restore');
  await page.screenshot({path:`${out}/${config.name}-destination-${district}.png`});
 }
 await page.keyboard.press('Escape');await page.waitForTimeout(150);
 if(await page.locator('.postcard-book figure').count()!==3)throw Error('Postcard book missing');
 await page.screenshot({path:`${out}/${config.name}-postcards.png`});
 await page.getByRole('button',{name:'RESUME FLIGHT'}).click();
 // Real flight and frame pacing under boost, with normal engine input only.
 const sample=await page.evaluate(async()=>{const e=window.eng;e.actions.boost=true;const intervals=[];let last=performance.now();await new Promise(resolve=>{function frame(now){intervals.push(now-last);last=now;if(intervals.length>=300)resolve();else requestAnimationFrame(frame)}requestAnimationFrame(frame)});e.actions.boost=false;intervals.sort((a,b)=>a-b);return {median:intervals[150],p95:intervals[285],render:e.world.renderer.info.render,metrics:e.deliveryVisuals.metrics(),time:e.state.time,over:e.state.over}});
 const paired=await page.evaluate(async()=>{
  const e=window.eng,s=e.state,p=s.players[0],d=s.delivery;e.setPaused(true);
  d.targets=[{id:'benchmark-sorter',kind:'sorter',x:p.x,y:p.y+1,z:p.z-40,routeDistance:s.time*14-p.z+40,drawers:1,completedAt:null}];
  d.destination={x:0,y:3,z:p.z-50,routeDistance:s.time*14-p.z+50,deliveredAt:s.time-2};d.restored=true;
  e.draw(0);const metrics=e.deliveryVisuals.metrics();const result={};
  for(const enabled of [false,true]) {
   const times=[];
   for(let i=0;i<160;i++) {
    await new Promise(requestAnimationFrame);e.deliveryVisuals.root.visible=enabled;
    const start=performance.now();e.world.render(s.time,p,0);if(i>=40)times.push(performance.now()-start);
   }
   times.sort((a,b)=>a-b);result[enabled?'encounters':'layerHidden']={median:times[60],p95:times[114]};
  }
  e.setPaused(false);return {...result,metrics};
 });
 const layout=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{x:r.x,y:r.y,right:r.right,bottom:r.bottom}:null};const a=box('.delivery-status');const controls=['.touch-pad','.flight-actions'].map(box).filter(Boolean); return {overflow:document.documentElement.scrollWidth>innerWidth,guide:a,controls,overlap:controls.some(b=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y)}});
 if(errors.length||layout.overflow||layout.overlap||sample.over)throw Error(JSON.stringify({config,errors,layout,sample}));
 await page.reload(); await page.waitForFunction(()=>!document.querySelector('button.practice')?.disabled);
 await page.locator('button.practice').click(); await page.waitForFunction(()=>window.eng?.state?.time>1);
 await page.keyboard.press('Escape'); await page.locator('.postcard-book').waitFor();
 if(await page.locator('.postcard-book figure').count()!==3)throw Error('Reload lost postcards');
 const panelBounds=await page.locator('.pause-panel').boundingBox();
 if(panelBounds.y<0 || panelBounds.y+panelBounds.height>config.height)throw Error('Pause panel out of viewport');
 reports.push({config,kinds,sample,paired,layout,postcardsPersist:true,panelBounds,errors});await page.close();
}
await writeFile('/tmp/roaming-visual-report.json',JSON.stringify(reports,null,2));await browser.close();
