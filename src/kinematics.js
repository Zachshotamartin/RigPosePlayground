const add = (a,b) => a.map((v,i)=>v+b[i]);
const sub = (a,b) => a.map((v,i)=>v-b[i]);
const scale = (a,s) => a.map(v=>v*s);
const length = a => Math.hypot(...a);
const unit = (a,fallback=[0,-1,0]) => length(a)>1e-10 ? scale(a,1/length(a)) : fallback.slice();
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const point = p => Array.isArray(p) && p.length===3 && p.every(Number.isFinite);

/** Position-based FABRIK; fixed root, exact segment lengths, optional elbow pole. */
export function solveFABRIK(joints,target,{iterations=32,tolerance=1e-5,pole}={}) {
  if(!Array.isArray(joints)||joints.length<2||!joints.every(point)||!point(target)) throw new TypeError('Finite 3D joints and target are required.');
  if(!Number.isInteger(iterations)||iterations<1||iterations>256) throw new RangeError('Use 1–256 iterations.');
  const p=joints.map(v=>v.slice()),root=p[0].slice(), lengths=p.slice(1).map((v,i)=>length(sub(v,p[i])));
  if(lengths.some(v=>v<=0)) throw new RangeError('Bones must have positive lengths.');
  const reach=lengths.reduce((a,b)=>a+b,0);
  if(length(sub(target,root))>=reach-1e-8){const direction=unit(sub(target,root));for(let i=1;i<p.length;i++)p[i]=add(p[i-1],scale(direction,lengths[i-1]));}
  else for(let pass=0;pass<iterations;pass++){
    p[p.length-1]=target.slice();
    for(let i=p.length-2;i>=0;i--)p[i]=add(p[i+1],scale(unit(sub(p[i],p[i+1])),lengths[i]));
    p[0]=root.slice();
    for(let i=1;i<p.length;i++)p[i]=add(p[i-1],scale(unit(sub(p[i],p[i-1])),lengths[i-1]));
    if(length(sub(p.at(-1),target))<tolerance)break;
  }
  // For a two-bone limb, select the bend plane without changing endpoint or lengths.
  if(pole&&point(pole)&&p.length===3){
    const axis=unit(sub(p[2],root)), elbow=sub(p[1],root),along=dot(elbow,axis);
    const radial=length(sub(elbow,scale(axis,along))),toward=sub(pole,root);
    const side=sub(toward,scale(axis,dot(toward,axis)));
    if(length(side)>1e-8)p[1]=add(add(root,scale(axis,along)),scale(unit(side),radial));
  }
  return {joints:p,error:length(sub(p.at(-1),target)),reachable:length(sub(target,root))<=reach, lengths};
}

/** Linear-blend skinning weights across the elbow/knee. Sum is exactly one. */
export function skinWeights(t,joint=.5,blend=.18){
  if(![t,joint,blend].every(Number.isFinite)||blend<=0)throw new RangeError('Finite coordinates and positive blend width required.');
  let w=Math.min(1,Math.max(0,(t-joint+blend/2)/blend));w=w*w*(3-2*w);
  return [1-w,w];
}

export function samplePose(frames,time,{duration=4,loop=true}={}){
  if(!Array.isArray(frames)||!frames.length||!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0)throw new TypeError('Provide keyframes, finite time, and positive duration.');
  const sorted=frames.map(f=>({time:Number(f.time),targets:structuredClone(f.targets)})).sort((a,b)=>a.time-b.time);
  for(const frame of sorted)if(!Number.isFinite(frame.time)||!frame.targets||!Object.values(frame.targets).every(point))throw new TypeError('Malformed keyframe.');
  const t=loop ? ((time%duration)+duration)%duration : Math.min(duration,Math.max(0,time));
  let a=sorted[0],b=sorted.at(-1),ta=a.time,tb=b.time;
  for(let i=0;i<sorted.length-1;i++)if(t>=sorted[i].time&&t<=sorted[i+1].time){a=sorted[i];b=sorted[i+1];ta=a.time;tb=b.time;break;}
  if(loop&&(t<sorted[0].time||t>sorted.at(-1).time)){a=sorted.at(-1);b=sorted[0];ta=a.time;tb=b.time+duration;}
  else if(t<sorted[0].time){a=b=sorted[0];ta=tb=a.time;}
  else if(t>sorted.at(-1).time){a=b=sorted.at(-1);ta=tb=a.time;}
  const adjusted=loop&&t<ta?t+duration:t,u=tb===ta?0:Math.min(1,Math.max(0,(adjusted-ta)/(tb-ta))),s=u*u*(3-2*u);
  return Object.fromEntries(Object.keys(a.targets).map(key=>[key,a.targets[key].map((v,i)=>v+((b.targets[key]||a.targets[key])[i]-v)*s)]));
}

export const LIMBS = [
  {id:'leftArm',label:'Left hand',root:[-0.72,3.62,0],lengths:[1.02,.95],pole:[-2,3.4,.9],radius:.17},
  {id:'rightArm',label:'Right hand',root:[.72,3.62,0],lengths:[1.02,.95],pole:[2,3.4,.9],radius:.17},
  {id:'leftLeg',label:'Left foot',root:[-.38,2.33,0],lengths:[1.1,1.08],pole:[-.38,1.1,1.7],radius:.22},
  {id:'rightLeg',label:'Right foot',root:[.38,2.33,0],lengths:[1.1,1.08],pole:[.38,1.1,1.7],radius:.22},
];
export const POSES = {
  'Ready stance':{leftArm:[-1.35,2.15,.28],rightArm:[1.35,2.15,.28],leftLeg:[-.65,.18,.17],rightLeg:[.65,.18,.17]},
  'Vault salute':{leftArm:[-1.2,5.25,.05],rightArm:[1.2,5.25,.05],leftLeg:[-.4,.17,0],rightLeg:[.4,.17,0]},
  'Balance reach':{leftArm:[-2.52,3.4,.4],rightArm:[2.4,3.95,.2],leftLeg:[-.55,.18,.12],rightLeg:[1.55,1.1,-.3]},
  'Wave':{leftArm:[-1.25,2.2,.2],rightArm:[1.45,4.75,.6],leftLeg:[-.62,.18,.15],rightLeg:[.62,.18,.15]},
};
