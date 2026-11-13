import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, STEP } from '../src/lib/game/simulation.js';

const courier = difficulty => new Simulation({solo:true,settings:{mode:'delivery',difficulty:difficulty??'normal'},random:()=>.5});

test('default courier keeps firing and spawning bounded orbs throughout encounters', () => {
 const sim=courier();const shots=new Set(),orbs=new Set();let maxOrbs=0,maxShots=0;
 sim.setInput(0,{x:0,z:0,cruise:true});
 for(let i=0;i<60*120;i++) {
  sim.tick();
  for(const shot of sim.state.bullets){shots.add(shot.id);assert.ok(shot.vz<0);assert.ok(Number.isFinite(shot.x+shot.y+shot.z));}
  sim.state.rocks.forEach(orb=>orbs.add(orb.id));
  maxOrbs=Math.max(maxOrbs,sim.state.rocks.length);maxShots=Math.max(maxShots,sim.state.bullets.length);
 }
 assert.ok(shots.size>200,`Only ${shots.size} shots`);
 assert.ok(orbs.size>30,`Only ${orbs.size} orbs`);
 assert.ok(maxOrbs<=60 && maxShots<200,`${maxOrbs} orbs/${maxShots} shots`);
 assert.equal(sim.state.over,false);assert.equal(sim.state.players[0].hp,5);
});

test('a courier laser kills an orb, scores once and creates an upgrade', () => {
 const sim=courier();sim.random=()=>.1;sim.spawnClock=Infinity;sim.state.delivery.nextEncounter=Infinity;
 sim.state.players.forEach(p=>p.cooldown=10);
 sim.state.rocks=[{id:100,x:0,y:24,z:0,r:1,hp:1,speed:0}];
 sim.state.bullets=[{id:101,x:0,y:24,z:1,vx:0,vy:0,vz:-120,life:1}];
 sim.tick();assert.equal(sim.state.rocks.length,0);assert.equal(sim.state.score,100);assert.equal(sim.state.pickups.length,1);
 sim.tick();assert.equal(sim.state.score,100);
});

test('assistance favors a visible open courier target over a nearby off-center orb', () => {
 const sim=courier();sim.spawnClock=Infinity;const s=sim.state,p=s.players[0];p.x=0;p.y=24;p.z=8;p.cooldown=0;
 s.delivery.nextEncounter=Infinity;
 s.delivery.targets=[{id:'aim-moth',kind:'moth',x:0,y:24,z:-30,r:2.45,hp:1,baseX:0,baseY:24,routeDistance:30,spawnedAt:-2,swoop:1,completedAt:null}];
 s.rocks=[{id:200,x:8,y:24,z:-10,r:1,hp:100,speed:0}];sim.tick();
 assert.ok(s.bullets.length>0);assert.ok(Math.abs(s.bullets[0].vx)<10,`Shot acquired the off-center orb (${s.bullets[0].vx})`);
});

test('Brutal lasers stay straight even when an orb is within assisted range', () => {
 const sim=courier('brutal');sim.spawnClock=Infinity;sim.state.delivery.nextEncounter=Infinity;
 const p=sim.state.players[0];p.x=0;p.y=24;p.z=8;p.cooldown=0;
 sim.state.rocks=[{id:300,x:6,y:24,z:-20,r:1,hp:100,speed:0}];sim.tick(STEP);
 assert.ok(sim.state.bullets.length>0);assert.equal(sim.state.bullets[0].vx,0);assert.equal(sim.state.bullets[0].vy,0);assert.ok(sim.state.bullets[0].vz<0);
});

test('swept lasers cannot damage a distant orb with an omitted optional altitude', () => {
 const sim=new Simulation({solo:true});sim.spawnClock=Infinity;const p=sim.state.players[0];p.cooldown=10;
 sim.state.rocks=[{id:400,x:0,z:-10,r:1,hp:10,speed:0}];
 sim.state.bullets=[{id:401,owner:0,x:0,y:0,z:5,vx:0,vy:0,vz:-46,life:2}];
 sim.tick();assert.equal(sim.state.rocks[0].hp,10);assert.equal(sim.state.bullets.length,1);
});
