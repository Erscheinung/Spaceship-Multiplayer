import test from 'node:test';
import assert from 'node:assert/strict';
import { cityObstacles } from '../src/lib/game/course.js';
import { Simulation } from '../src/lib/game/simulation.js';
import { advanceDelivery, createDeliveryState, hitDeliveryTargets, finishDelivery } from '../src/lib/game/delivery.js';

test('endless solo shuffles all four phrases, rotates destinations and bounds long-run entities', () => {
  const sim = new Simulation({ solo: true, settings: { mode: 'delivery' }, random: () => .5 });
  sim.setInput(0, { x: 0, z: 0, cruise: true, boost: true, turbo: true });
  const kinds = new Set(), kindCounts = new Map(); let maxTargets = 0, maxReleases = 0, previousSerial = 0, lastEncounter = 0, maxGap = 0;
  for (let i = 0; i < 60 * 360; i++) {
    sim.tick();
    if(sim.state.delivery.encounterSerial !== previousSerial){
      previousSerial = sim.state.delivery.encounterSerial;
      maxGap = Math.max(maxGap, sim.state.time-lastEncounter);lastEncounter=sim.state.time;
      const kind=sim.state.delivery.targets.at(-1)?.kind;kindCounts.set(kind,(kindCounts.get(kind)??0)+1);
    }
    sim.state.delivery.targets.forEach(target => {
      kinds.add(target.kind);
      assert.ok(Number.isFinite(target.x + target.y + target.z));
      assert.ok(Math.abs(target.x) <= 12 && target.y >= 1.5 && target.y <= 24);
    });
    maxTargets = Math.max(maxTargets, sim.state.delivery.targets.length);
    maxReleases = Math.max(maxReleases, sim.state.delivery.releases.length);
  }
  assert.deepEqual([...kinds].sort(), ['crab', 'moth', 'parcel', 'sorter']);
  assert.equal(sim.state.over, false);
  assert.ok(maxTargets <= 8 && maxReleases <= 16, `${maxTargets}/${maxReleases}`);
  assert.ok(sim.state.delivery.encounterSerial >= 12);
  assert.ok([...kindCounts.values()].every(count=>count>=3));
  assert.ok(maxGap < 50, `Encounter gap ${maxGap}s`);
  assert.equal(sim.state.players[0].hp, 5);
});

function spawnNextRoaming(delivery, players) {
 const serial=delivery.encounterSerial;
 let time=delivery.nextEncounter;
 for(let attempt=0;attempt<100&&delivery.encounterSerial===serial;attempt++) {
  players.forEach(p=>{p.z=-25*time});
  advanceDelivery(delivery,{time,dt:0,players,callbacks:{random:()=>.25}});
  if(delivery.encounterSerial!==serial)return time;
  time=Math.max(time+.25,delivery.nextEncounter);
 }
 assert.fail('A roaming encounter never found a clear approach during forward flight');
}

test('sorter requires three distinct swept hits and releases one letter per drawer', () => {
  const d = createDeliveryState(true);
  const players = [{id:0,active:true,hp:5,x:0,y:4,z:0}];
  d.bag = ['sorter'];
  const spawnedAt=spawnNextRoaming(d,players);
  const target = d.targets[0];
  for (let i=0;i<3;i++) {
    const time = spawnedAt + 1 + i;
    const motion = advanceDelivery(d, {time,dt:1,players});
    const bullet = {id:i,x:target.x,y:target.y,z:target.z-10,life:1};
    hitDeliveryTargets(d,{bullets:[bullet],bulletStarts:new Map([[i,{...bullet,z:target.z+10}]]),targetStarts:motion.targetStarts,time});
    assert.equal(target.drawers, i+1);
  }
  assert.equal(target.stage,'stamped');
  assert.equal(d.releases.length,3);
  assert.equal(finishDelivery(d,{time:120}),false);
});

test('every shuffled cycle has unique IDs and all four kinds before repeats', () => {
 const d=createDeliveryState(true), players=[{id:0,active:true,hp:5,x:0,y:4,z:0}]; const ids=new Set();
 for(let cycle=0;cycle<4;cycle++) {
  const kinds=[];
  for(let i=0;i<4;i++) {
   d.targets=[];
   spawnNextRoaming(d,players);
   kinds.push(d.targets[0].kind);
   for(const t of d.targets){assert.ok(!ids.has(t.id));ids.add(t.id)}
  }
  assert.equal(new Set(kinds).size,4);
 }
});

test('encounters never delete or relocate the deterministic road obstacle kit', () => {
 const sim = new Simulation({solo:true,settings:{mode:'delivery'},random:()=>.5});
 sim.setInput(0,{x:0,z:0,cruise:true,boost:true});
 let sawEncounter = false;
 for(let i=0;i<60*40;i++) {
  const expected = cityObstacles(sim.state.time+1/60, sim.state.players.filter(p=>p.active&&p.hp>0));
  sim.tick();
  assert.deepEqual(sim.state.obstacles, expected);
  if(sim.state.delivery.targets.length)sawEncounter=true;
 }
 assert.ok(sawEncounter);
});
