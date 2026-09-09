import {solveFABRIK,skinWeights,samplePose,LIMBS,POSES} from './kinematics.js';
export {solveFABRIK,skinWeights,samplePose} from './kinematics.js';
export const metadata={id:'rig-pose-playground',title:'Rig & Pose Playground',description:'Pose a skinned mannequin, shape the influence around its joints, and build a looping keyframe performance.',technique:'FABRIK inverse kinematics · linear blend skinning · keyframe interpolation',instructions:['Drag the four colored hand and foot targets. Orbit by dragging empty space.','Select a limb to move its target with the position controls.','Show skin weights and change the blend width to inspect deformation.','Save poses along the four-second timeline, then play or export the sequence.'],limitations:['A fixed torso and four two-bone limbs; no full-body balance or anatomical joint limits.','Linear blend skinning can lose volume at tight bends.','The IK target may be outside a limb’s reach; bones retain their lengths.']};
export function createExperiment(ctx){
  const {THREE:T,root,ui,controls}=ctx;
  const V=(a)=>new T.Vector3(...a), down=new T.Vector3(0,-1,0);
  let targets=structuredClone(POSES['Ready stance']),selected='rightArm',blend=.24,showWeights=false,showBones=true,playing=false,time=0;
  let keyframes=[{time:0,targets:structuredClone(POSES['Ready stance'])},{time:1,targets:structuredClone(POSES['Vault salute'])},{time:2,targets:structuredClone(POSES['Balance reach'])},{time:3,targets:structuredClone(POSES.Wave)}],undo=[];
  const bodyMat=new T.MeshStandardMaterial({color:0xd8dccd,roughness:.63,metalness:.03}),accent=new T.MeshStandardMaterial({color:0xd99976,roughness:.4}),dark=new T.MeshStandardMaterial({color:0x20382e,roughness:.55});
  const boneMat=new T.LineBasicMaterial({color:0xffc98b,depthTest:false,transparent:true,opacity:.95});
  function mesh(geometry,material,position,parent=root){const m=new T.Mesh(geometry,material);m.position.set(...position);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const stage=mesh(new T.CylinderGeometry(2.95,3.05,.14,80),dark,[0,-.2,0]);
  const ring=new T.Mesh(new T.TorusGeometry(2.72,.012,6,100),accent);ring.rotation.x=Math.PI/2;ring.position.y=-.12;root.add(ring);
  const torso=mesh(new T.CylinderGeometry(.72,.48,1.35,32),bodyMat,[0,3.03,0]);torso.scale.z=.6;
  const pelvis=mesh(new T.SphereGeometry(.61,28,18),dark,[0,2.36,0]);pelvis.scale.set(1,.54,.63);
  mesh(new T.CylinderGeometry(.23,.26,.2,24),dark,[0,3.83,0]);
  const head=mesh(new T.SphereGeometry(.43,36,24),bodyMat,[0,4.2,0]);head.scale.set(.86,1.05,.82);
  const visor=mesh(new T.SphereGeometry(.35,30,18),dark,[0,4.24,.18]);visor.scale.set(.8,.28,.7);
  [-.13,.13].forEach(x=>mesh(new T.SphereGeometry(.035,12,8),accent,[x,4.25,.414]));
  const chestPoint=(x,y)=>{const radius=.48+.24*(y-2.355)/1.35;return new T.Vector3(x,y,.6*Math.sqrt(Math.max(0,radius*radius-x*x))+.012);};
  for(const x of [-.4,.4]){const path=new T.CatmullRomCurve3(Array.from({length:12},(_,i)=>chestPoint(x,2.67+i/11*.68)));root.add(new T.Mesh(new T.TubeGeometry(path,24,.016,7,false),accent));}
  const badge=new T.CatmullRomCurve3(Array.from({length:33},(_,i)=>chestPoint(.17*Math.cos(i/32*Math.PI*2),3.28+.13*Math.sin(i/32*Math.PI*2))));root.add(new T.Mesh(new T.TubeGeometry(badge,40,.01,6,false),accent));
  const rigs=[],handles=[];
  function makeSkin(spec){
    const total=spec.lengths[0]+spec.lengths[1],joint=spec.lengths[0]/total,rows=36,sides=16,p=[],n=[],idx=[],weights=[],indices=[],colors=[];
    for(let row=0;row<=rows;row++){const t=row/rows,r=spec.radius*(.68+.32*Math.sin(Math.PI*(.12+t*.75)));const w=skinWeights(t,joint,blend);
      for(let j=0;j<=sides;j++){const a=j/sides*Math.PI*2;p.push(Math.cos(a)*r,-t*total,Math.sin(a)*r);n.push(Math.cos(a),0,Math.sin(a));weights.push(w[0],w[1],0,0);indices.push(0,1,0,0);const c=new T.Color(0xe89f71).lerp(new T.Color(0x78b9bb),w[1]);colors.push(c.r,c.g,c.b);if(row<rows&&j<sides){const k=row*(sides+1)+j;idx.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}}
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(n,3));geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));geometry.setIndex(idx);geometry.computeBoundingSphere();
    const group=new T.Group();group.position.copy(V(spec.root));root.add(group);
    const material=bodyMat.clone(),skin=new T.SkinnedMesh(geometry,material);skin.castShadow=true;skin.frustumCulled=false;group.add(skin);
    const b0=new T.Bone(),b1=new T.Bone(),b2=new T.Bone();b1.position.y=-spec.lengths[0];b2.position.y=-spec.lengths[1];b0.add(b1);b1.add(b2);skin.add(b0);skin.bind(new T.Skeleton([b0,b1,b2]));
    const isLeg=spec.id.includes('Leg');
    const end=mesh(new T.SphereGeometry(isLeg?.24:.21,24,16),dark,[0,isLeg?-.15:-.05,isLeg?.11:0],b2);end.scale.set(isLeg?1:.8,isLeg?.55:1,isLeg?1.8:.65);
    const cuff=mesh(new T.CylinderGeometry(spec.radius*.82,spec.radius*.82,.13,20),accent,[0,.06,0],b2);
    const line=new T.Line(new T.BufferGeometry().setFromPoints([V(spec.root),V(spec.root),V(spec.root)]),boneMat);line.renderOrder=8;root.add(line);
    const handle=mesh(new T.SphereGeometry(.14,20,14),new T.MeshStandardMaterial({color:isLeg?0x9dc8bb:0xe1a783,emissive:isLeg?0x294d41:0x483024,roughness:.35,depthTest:false}),targets[spec.id]);handle.renderOrder=9;handle.userData.limb=spec.id;handles.push(handle);
    const axis=new T.Vector3(spec.root[0]<0?-.12:.12,-1,.1).normalize(),mid=V(spec.root).addScaledVector(axis,spec.lengths[0]),tip=mid.clone().add(new T.Vector3(0,-spec.lengths[1],0));
    return {spec,group,skin,b0,b1,b2,line,handle,rows,sides,total,joint,joints:[spec.root,mid.toArray(),tip.toArray()]};
  }
  LIMBS.forEach(spec=>rigs.push(makeSkin(spec)));
  function updateRig(){let maxError=0;for(const r of rigs){const solved=solveFABRIK(r.joints,targets[r.spec.id],{pole:r.spec.pole});r.joints=solved.joints;maxError=Math.max(maxError,solved.error);
    const q0=new T.Quaternion().setFromUnitVectors(down,V(r.joints[1]).sub(V(r.joints[0])).normalize());
    const q1=new T.Quaternion().setFromUnitVectors(down,V(r.joints[2]).sub(V(r.joints[1])).normalize());r.b0.quaternion.copy(q0);r.b1.quaternion.copy(q0.clone().invert().multiply(q1));
    r.handle.position.copy(V(targets[r.spec.id]));r.handle.scale.setScalar(r.spec.id===selected?1.25:1);r.line.geometry.setFromPoints(r.joints.map(V));r.line.visible=showBones;
    if(r.skin.material.vertexColors!==showWeights){r.skin.material.vertexColors=showWeights;r.skin.material.color.set(showWeights?0xffffff:0xd8dccd);r.skin.material.needsUpdate=true;}
  }root.updateMatrixWorld(true);ctx.invalidate();return maxError;}
  function updateWeights(){for(const r of rigs){const weights=r.skin.geometry.attributes.skinWeight,colors=r.skin.geometry.attributes.color;for(let i=0;i<weights.count;i++){const t=Math.floor(i/(r.sides+1))/r.rows,w=skinWeights(t,r.joint,blend);weights.setXYZW(i,...w,0,0);const c=new T.Color(0xe89f71).lerp(new T.Color(0x78b9bb),w[1]);colors.setXYZ(i,c.r,c.g,c.b);}weights.needsUpdate=true;colors.needsUpdate=true;}updateRig();}
  function pushUndo(){undo.push({targets:structuredClone(targets),keyframes:structuredClone(keyframes),time});if(undo.length>30)undo.shift();}
  function syncRange(input,value){input.value=value;const output=input.closest('label')?.querySelector('output');if(output)output.value=Number(value).toFixed(2);}
  function refreshFields(){targetSelect.value=selected;for(let i=0;i<3;i++)syncRange(fields[i],targets[selected][i]);if(play)play.textContent=playing?'Pause timeline':'Play timeline';}
  function status(){const error=updateRig();if(play)play.textContent=playing?'Pause timeline':'Play timeline';ctx.setStatus(`${keyframes.length} saved keyframes · ${rigs.length*2} bones · ${error>.04?'Target beyond reach; bone lengths preserved.':'Targets solved without stretching bones.'}`);}
  ui.section('Pose the mannequin');
  ui.select('Pose preset',Object.keys(POSES),'Ready stance',name=>{pushUndo();playing=false;targets=structuredClone(POSES[name]);refreshFields();status();});
  const targetSelect=ui.select('Selected target',LIMBS.map(r=>({label:r.label,value:r.id})),selected,value=>{selected=value;refreshFields();status();});
  const fields=['Horizontal','Height','Depth'].map((label,i)=>ui.range(label,{min:i===1?.15:-3,max:i===1?5.55:3,step:.01,value:targets[selected][i],onChange:value=>{playing=false;targets[selected][i]=value;status();}}));
  ui.toggle('Show bones',true,value=>{showBones=value;updateRig();});
  ui.section('Skin influence');
  ui.toggle('Show skin weights',false,value=>{showWeights=value;updateRig();});
  const blendControl=ui.range('Joint blend width',{min:.04,max:.65,step:.01,value:blend,onChange:value=>{blend=value;updateWeights();}});
  ui.note('Warm color follows the upper bone. Cool color follows the lower bone. The transition changes the actual vertex weights.');
  ui.section('Four-second timeline');
  const timeline=ui.range('Playhead (seconds)',{min:0,max:4,step:.01,value:time,onChange:value=>{playing=false;time=value;targets=samplePose(keyframes,time,{loop:false});refreshFields();status();}});
  ui.button('Save keyframe here',()=>{pushUndo();keyframes=keyframes.filter(k=>Math.abs(k.time-time)>.04);keyframes.push({time,targets:structuredClone(targets)});keyframes.sort((a,b)=>a.time-b.time);status();},{primary:true});
  ui.button('Delete nearest keyframe',()=>{if(keyframes.length<=1){ctx.setStatus('Keep at least one pose.');return;}pushUndo();let nearest=0;keyframes.forEach((k,i)=>{if(Math.abs(k.time-time)<Math.abs(keyframes[nearest].time-time))nearest=i;});keyframes.splice(nearest,1);status();});
  const play=ui.button('Play timeline',()=>{playing=!playing;play.textContent=playing?'Pause timeline':'Play timeline';ctx.invalidate();});
  ui.button('Undo pose edit',()=>{const previous=undo.pop();if(previous){({targets,keyframes,time}=previous);playing=false;timeline.value=time;refreshFields();status();}});
  ui.button('Export poses JSON',()=>ctx.download('mannequin-poses.json',JSON.stringify({version:1,duration:4,blend,keyframes},null,2),'application/json'));
  ui.file('Import poses JSON',async file=>{try{const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.keyframes)||!data.keyframes.length||data.keyframes.length>100)throw new Error('Use an exported pose file with 1–100 keyframes.');for(const f of data.keyframes){samplePose([f],0);for(const limb of LIMBS)if(!f.targets[limb.id]||f.targets[limb.id].some(v=>Math.abs(v)>10))throw new Error('Invalid limb target.');if(f.time<0||f.time>4)throw new Error('Keyframe time must be between 0 and 4 seconds.');}if(data.blend!==undefined&&(!Number.isFinite(data.blend)||data.blend<.04||data.blend>.65))throw new Error('Invalid skin blend width.');pushUndo();keyframes=structuredClone(data.keyframes);blend=data.blend??blend;syncRange(blendControl,blend);updateWeights();time=0;targets=samplePose(keyframes,0);playing=false;syncRange(timeline,0);refreshFields();status();}catch(error){ctx.setStatus(`Import failed: ${error.message}`);}},{accept:'.json'});
  ui.note('Four starter poses form a real loop. Scrub, modify a hand or foot, then save at the playhead to replace or add a pose.');
  const ray=new T.Raycaster(),plane=new T.Plane(),hit=new T.Vector3();let drag=null;
  ctx.listen(ctx.canvas,'pointerdown',event=>{ray.setFromCamera(ctx.pointer(event),ctx.camera);const found=ray.intersectObjects(handles)[0];if(!found)return;event.preventDefault();pushUndo();selected=found.object.userData.limb;playing=false;drag=event.pointerId;plane.setFromNormalAndCoplanarPoint(ctx.camera.getWorldDirection(new T.Vector3()),found.object.position);controls.enabled=false;ctx.canvas.setPointerCapture(event.pointerId);refreshFields();},{capture:true});
  ctx.listen(ctx.canvas,'pointermove',event=>{if(drag!==event.pointerId)return;ray.setFromCamera(ctx.pointer(event),ctx.camera);if(ray.ray.intersectPlane(plane,hit)){targets[selected]=[Math.max(-3,Math.min(3,hit.x)),Math.max(.15,Math.min(5.55,hit.y)),Math.max(-3,Math.min(3,hit.z))];refreshFields();status();}});
  const release=event=>{if(drag!==event.pointerId)return;drag=null;controls.enabled=true;if(ctx.canvas.hasPointerCapture(event.pointerId))ctx.canvas.releasePointerCapture(event.pointerId);};
  ctx.listen(ctx.canvas,'pointerup',release);ctx.listen(ctx.canvas,'pointercancel',release);
  ctx.onFrame(dt=>{if(!playing)return;time=(time+dt)%4;targets=samplePose(keyframes,time);syncRange(timeline,time);refreshFields();updateRig();});
  status();ctx.fit(root);ctx.camera.position.set(7,5.2,9);controls.target.set(0,2.35,0);controls.update();ctx.invalidate();
  return {dispose(){controls.enabled=true;}};
}
