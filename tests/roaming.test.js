import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/lib/game/simulation.js';
import { advanceDelivery, createDeliveryState, hitDeliveryTargets, finishDelivery } from '../src/lib/game/delivery.js';

test('endless solo shuffles all four phrases, rotates destinations and bounds long-run entities', () => {
  const sim = new Simulation({ solo: true, settings: { mode: 'delivery' }, random: () => .5 });
  sim.setInput(0, { x: 0, z: 0, cruise: true, boost: true });
  const kinds = new Set(); let maxTargets = 0, maxReleases = 0;
  for (let i = 0; i < 60 * 360; i++) {
    sim.tick();
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
  assert.ok(sim.state.delivery.encounterSerial >= 18);
  assert.equal(sim.state.players[0].hp, 5);
});

test('sorter requires three distinct swept hits and releases one letter per drawer', () => {
  const d = createDeliveryState(true);
  const players = [{id:0,active:true,hp:5,x:0,y:4,z:0}];
  d.bag = ['sorter'];
  advanceDelivery(d, { time:5, dt:0, players, callbacks:{random:()=>.5} });
  const target = d.targets[0];
  for (let i=0;i<3;i++) {
    const time = 6 + i;
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
   advanceDelivery(d,{time:d.nextEncounter,dt:0,players,callbacks:{random:()=>.25}});
   kinds.push(d.targets[0].kind);
   for(const t of d.targets){assert.ok(!ids.has(t.id));ids.add(t.id)}
  }
  assert.equal(new Set(kinds).size,4);
 }
});

test('solo encounter plazas clear the rendered collision kit along the approach', () => {
 const sim = new Simulation({solo:true,settings:{mode:'delivery'},random:()=>.5});
 while(sim.state.time<6)sim.tick();
 const d=sim.state.delivery;
 assert.ok(d.clearings.length>0);
 for(const obstacle of sim.state.obstacles){
  const distance=sim.state.time*14-obstacle.z;
  assert.ok(!d.clearings.some(zone=>distance>=zone.start&&distance<=zone.end));
 }
});
