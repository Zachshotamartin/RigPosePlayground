import test from 'node:test';
import assert from 'node:assert/strict';
import {solveFABRIK,skinWeights,samplePose} from '../src/kinematics.js';
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('FABRIK reaches target while preserving both bone lengths and fixed root',()=>{
  const original=[[0,0,0],[.3,-.954,0],[0,-1.908,0]],copy=structuredClone(original);
  const solved=solveFABRIK(original,[1.1,-1,.3],{pole:[0,0,2]});
  assert.ok(solved.error<1e-4);assert.deepEqual(solved.joints[0],original[0]);assert.deepEqual(original,copy);
  for(let i=0;i<2;i++)assert.ok(Math.abs(distance(solved.joints[i],solved.joints[i+1])-solved.lengths[i])<1e-6);
  assert.ok(solved.joints[1][2]>0);
});
test('unreachable target extends to reach instead of stretching bones',()=>{
  const solved=solveFABRIK([[0,0,0],[0,-1,0],[0,-2,0]],[10,0,0]);
  assert.equal(solved.reachable,false);assert.deepEqual(solved.joints,[[0,0,0],[1,0,0],[2,0,0]]);
});
test('skin weights normalized, bounded, and blend at joint',()=>{
  for(let i=0;i<=100;i++){const w=skinWeights(i/100);assert.ok(w.every(v=>v>=0&&v<=1));assert.ok(Math.abs(w[0]+w[1]-1)<1e-12);}
  assert.deepEqual(skinWeights(.5),[.5,.5]);assert.deepEqual(skinWeights(0),[1,0]);assert.deepEqual(skinWeights(1),[0,1]);
});
test('keyframe playback interpolates and wraps continuously without mutating poses',()=>{
  const frames=[{time:0,targets:{hand:[0,0,0]}},{time:2,targets:{hand:[2,1,0]}}],copy=structuredClone(frames);
  assert.deepEqual(samplePose(frames,1).hand,[1,.5,0]);assert.deepEqual(samplePose(frames,3).hand,[1,.5,0]);
  assert.deepEqual(samplePose(frames,4).hand,[0,0,0]);assert.deepEqual(frames,copy);
});
test('malformed skeletons fail clearly',()=>{assert.throws(()=>solveFABRIK([[0,0,0],[0,0,0]],[1,0,0]));assert.throws(()=>samplePose([],1));});
