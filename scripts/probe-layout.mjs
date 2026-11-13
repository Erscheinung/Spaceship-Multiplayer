import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=metal']});
try{
 const page=await browser.newPage({viewport:{width:393,height:705},hasTouch:true,isMobile:true});
 await page.goto(process.env.GRAPHICS_URL || 'http://127.0.0.1:5189');await page.waitForFunction(()=>!document.querySelector('button.practice')?.disabled);await page.locator('button.practice').click();
 for(const [width,height] of [[320,568],[667,375],[320,480]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(600);
  const result=await page.evaluate(()=>{const selectors=['.brand','.header-right','.pilot-card','.run-stats','.pause-button','.flight-instruments','.delivery-status','.touch-pad','.flight-actions'];const boxes=selectors.map(selector=>{const r=document.querySelector(selector)?.getBoundingClientRect();return {selector,x:r.x,y:r.y,right:r.right,bottom:r.bottom}});const overlaps=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(a.x<b.right-.5&&a.right>b.x+.5&&a.y<b.bottom-.5&&a.bottom>b.y+.5)overlaps.push([a.selector,b.selector])}return{boxes,overlaps,overflow:document.documentElement.scrollWidth>innerWidth}});
  await page.screenshot({path:`/tmp/roaming-captures/layout-${width}x${height}.png`});
  console.log(JSON.stringify({width,height,...result}));if(result.overlaps.length||result.overflow)throw Error('Layout violation');
 }
}finally{await browser.close()}
