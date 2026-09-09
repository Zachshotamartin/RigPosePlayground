import { Bone, Euler, Quaternion, Skeleton, Vector3 } from "three";
import { LIMBS, POSES, solveFABRIK } from "./kinematics.js";

const degrees = 180 / Math.PI;
const joint = (id, label, parent, offset) => ({ id, label, parent, offset });
// Ordered parents first. Offsets are the rest skeleton and never change while posing.
export const JOINTS = [
  joint("pelvis", "Pelvis / whole body", null, [0, 2.33, 0]),
  joint("spine", "Lower spine", "pelvis", [0, 0.38, 0]),
  joint("chest", "Chest / upper spine", "spine", [0, 0.45, 0]),
  joint("neck", "Neck", "chest", [0, 0.66, 0]),
  joint("head", "Head", "neck", [0, 0.2, 0]),
  ...["left", "right"].flatMap((side) => {
    const sign = side === "left" ? -1 : 1,
      title = side === "left" ? "Left" : "Right";
    return [
      joint(`${side}Clavicle`, `${title} collarbone`, "chest", [
        sign * 0.26,
        0.4,
        0,
      ]),
      joint(`${side}Shoulder`, `${title} shoulder`, `${side}Clavicle`, [
        sign * 0.46,
        0.06,
        0,
      ]),
      joint(`${side}Elbow`, `${title} elbow`, `${side}Shoulder`, [0, -1.02, 0]),
      joint(
        `${side}Wrist`,
        `${title} wrist / hand`,
        `${side}Elbow`,
        [0, -0.95, 0],
      ),
      joint(`${side}Hip`, `${title} hip`, "pelvis", [sign * 0.38, 0, 0]),
      joint(`${side}Knee`, `${title} knee`, `${side}Hip`, [0, -1.1, 0]),
      joint(
        `${side}Ankle`,
        `${title} ankle / foot`,
        `${side}Knee`,
        [0, -1.08, 0],
      ),
      joint(`${side}Toe`, `${title} toes`, `${side}Ankle`, [0, -0.035, 0.22]),
    ];
  }),
];
export const CHAINS = LIMBS.map((limb) => {
  const side = limb.id.startsWith("left") ? "left" : "right",
    leg = limb.id.endsWith("Leg");
  return {
    ...limb,
    ids: leg
      ? [`${side}Hip`, `${side}Knee`, `${side}Ankle`]
      : [`${side}Shoulder`, `${side}Elbow`, `${side}Wrist`],
  };
});
export function restPose() {
  return {
    position: [0, 2.33, 0],
    rotations: Object.fromEntries(JOINTS.map((j) => [j.id, [0, 0, 0]])),
  };
}
export function createRig() {
  const joints = Object.fromEntries(
    JOINTS.map((spec) => {
      const bone = new Bone();
      bone.name = `rig-joint-${spec.id}`;
      bone.position.fromArray(spec.offset);
      bone.userData.joint = spec.id;
      return [spec.id, bone];
    }),
  );
  for (const spec of JOINTS)
    if (spec.parent) joints[spec.parent].add(joints[spec.id]);
  joints.pelvis.updateMatrixWorld(true);
  return {
    joints,
    root: joints.pelvis,
    skeleton: new Skeleton(JOINTS.map((j) => joints[j.id])),
  };
}
export function applyPose(rig, pose) {
  rig.root.position.fromArray(pose.position);
  for (const { id } of JOINTS)
    rig.joints[id].rotation.set(
      ...pose.rotations[id].map((n) => n / degrees),
      "XYZ",
    );
  rig.root.updateWorldMatrix(true, true);
}
export function jointPosition(rig, id) {
  return rig.joints[id].getWorldPosition(new Vector3()).toArray();
}
function recordRotation(pose, id, q) {
  pose.rotations[id] = new Euler()
    .setFromQuaternion(q, "XYZ")
    .toArray()
    .slice(0, 3)
    .map((n) => n * degrees);
}
/** Only the two upstream rotations change. Rest offsets and downstream hand/foot rotations stay intact. */
export function moveEffector(rig, source, id, target) {
  const chain = CHAINS.find((c) => c.ids[2] === id);
  if (!chain)
    throw new Error("Move targets are available at the hands and feet.");
  const pose = structuredClone(source);
  applyPose(rig, pose);
  const points = chain.ids.map((id) => jointPosition(rig, id));
  const axis = new Vector3(...points[2])
    .sub(new Vector3(...points[0]))
    .normalize();
  const radial = new Vector3(...points[1]).sub(new Vector3(...points[0]));
  radial.addScaledVector(axis, -radial.dot(axis));
  let pole = points[1];
  if (radial.lengthSq() < 1e-5) {
    const hint = new Vector3(...chain.pole).sub(new Vector3(...chain.root));
    hint.applyQuaternion(
      rig.joints[chain.ids[0]].parent.getWorldQuaternion(new Quaternion()),
    );
    pole = hint.add(new Vector3(...points[0])).toArray();
  }
  const solved = solveFABRIK(points, target, { pole });
  for (let i = 0; i < 2; i++) {
    const bone = rig.joints[chain.ids[i]],
      direction = new Vector3(...solved.joints[i + 1])
        .sub(new Vector3(...solved.joints[i]))
        .normalize();
    const world = new Quaternion().setFromUnitVectors(
      new Vector3(0, -1, 0),
      direction,
    );
    const local = bone.parent
      .getWorldQuaternion(new Quaternion())
      .invert()
      .multiply(world);
    recordRotation(pose, chain.ids[i], local);
    applyPose(rig, pose);
  }
  return { pose, error: solved.error };
}
export function presetPose(rig, name) {
  let pose = restPose();
  for (const chain of CHAINS)
    pose = moveEffector(
      rig,
      pose,
      chain.ids[2],
      (POSES[name] || POSES["Ready stance"])[chain.id],
    ).pose;
  applyPose(rig, pose);
  return pose;
}
export function validatePose(pose) {
  const vector = (v) =>
    Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  if (!vector(pose?.position) || pose.position.some((n) => Math.abs(n) > 10))
    throw new Error("Invalid body position.");
  for (const { id } of JOINTS)
    if (
      !vector(pose.rotations?.[id]) ||
      pose.rotations[id].some((n) => Math.abs(n) > 180.001)
    )
      throw new Error(`Invalid ${id} rotation.`);
  return structuredClone(pose);
}
export function sampleRigPose(
  frames,
  time,
  { loop = true, duration = 4 } = {},
) {
  if (
    !frames.length ||
    !Number.isFinite(time) ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    throw new Error("Provide poses and a finite timeline.");
  const sorted = [...frames].sort((a, b) => a.time - b.time);
  let t = loop
    ? ((time % duration) + duration) % duration
    : Math.max(0, Math.min(duration, time));
  let a = sorted[0],
    b = sorted.at(-1),
    ta = a.time,
    tb = b.time;
  const segment = sorted.findIndex(
    (f, i) => i < sorted.length - 1 && t >= f.time && t <= sorted[i + 1].time,
  );
  if (segment >= 0) {
    a = sorted[segment];
    b = sorted[segment + 1];
    ta = a.time;
    tb = b.time;
  } else if (loop && sorted.length > 1) {
    a = sorted.at(-1);
    b = sorted[0];
    ta = a.time;
    tb = b.time + duration;
    if (t < ta) t += duration;
  } else {
    a = b = t < sorted[0].time ? sorted[0] : sorted.at(-1);
    ta = tb = a.time;
  }
  const u = tb === ta ? 0 : Math.max(0, Math.min(1, (t - ta) / (tb - ta))),
    s = u * u * (3 - 2 * u);
  const pose = {
    position: a.pose.position.map((n, i) => n + (b.pose.position[i] - n) * s),
    rotations: {},
  };
  for (const { id } of JOINTS) {
    const q = (r) =>
      new Quaternion().setFromEuler(
        new Euler(...r.map((n) => n / degrees), "XYZ"),
      );
    recordRotation(
      pose,
      id,
      q(a.pose.rotations[id]).slerp(q(b.pose.rotations[id]), s),
    );
  }
  return pose;
}
export function importSequence(data, rig) {
  if (
    ![1, 2].includes(data.version) ||
    !Array.isArray(data.keyframes) ||
    !data.keyframes.length ||
    data.keyframes.length > 100
  )
    throw new Error("Use an exported sequence with 1–100 keyframes.");
  if (
    data.blend !== undefined &&
    (!Number.isFinite(data.blend) || data.blend < 0.04 || data.blend > 0.65)
  )
    throw new Error("Invalid blend width.");
  const times = new Set();
  const keyframes = data.keyframes.map((frame) => {
    if (
      !Number.isFinite(frame.time) ||
      frame.time < 0 ||
      frame.time > 4 ||
      times.has(frame.time)
    )
      throw new Error("Use unique keyframe times between 0 and 4 seconds.");
    times.add(frame.time);
    if (data.version === 2)
      return { time: frame.time, pose: validatePose(frame.pose) };
    let pose = restPose();
    for (const chain of CHAINS) {
      const target = frame.targets?.[chain.id];
      if (
        !Array.isArray(target) ||
        target.length !== 3 ||
        !target.every((n) => Number.isFinite(n) && Math.abs(n) <= 10)
      )
        throw new Error("Invalid limb target.");
      pose = moveEffector(rig, pose, chain.ids[2], target).pose;
    }
    return { time: frame.time, pose };
  });
  return {
    keyframes: keyframes.sort((a, b) => a.time - b.time),
    blend: data.blend,
  };
}
