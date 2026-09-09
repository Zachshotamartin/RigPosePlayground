import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Euler } from "three";
import {
  JOINTS,
  CHAINS,
  createRig,
  restPose,
  applyPose,
  jointPosition,
  moveEffector,
  presetPose,
  sampleRigPose,
  validatePose,
  importSequence,
} from "../src/rig.js";
import { POSES } from "../src/kinematics.js";
const distance = (a, b) => Math.hypot(...a.map((n, i) => n - b[i]));
test("all 21 joints rotate independently, carry descendants, and retain every rest bone length", () => {
  const rig = createRig();
  assert.equal(JOINTS.length, 21);
  for (const joint of JOINTS)
    for (let axis = 0; axis < 3; axis++) {
      const pose = restPose();
      pose.rotations[joint.id][axis] = 37;
      applyPose(rig, pose);
      assert.ok(
        Math.abs(
          rig.joints[joint.id].rotation.toArray()[axis] - (37 * Math.PI) / 180,
        ) < 1e-8,
      );
      for (const spec of JOINTS.filter((j) => j.parent))
        assert.ok(
          Math.abs(
            distance(
              jointPosition(rig, spec.id),
              jointPosition(rig, spec.parent),
            ) - Math.hypot(...spec.offset),
          ) < 1e-8,
          `${joint.id} ${spec.id}`,
        );
    }
  applyPose(rig, restPose());
  const hand = jointPosition(rig, "leftWrist"),
    foot = jointPosition(rig, "leftAnkle");
  const pose = restPose();
  pose.rotations.chest[1] = 50;
  applyPose(rig, pose);
  assert.ok(distance(hand, jointPosition(rig, "leftWrist")) > 0.3);
  assert.ok(distance(foot, jointPosition(rig, "leftAnkle")) < 1e-8);
});
test("IK works under a rotated torso and root without stretching or changing the wrist pose", () => {
  const rig = createRig();
  let pose = presetPose(rig, "Ready stance");
  pose.rotations.pelvis = [15, 25, 12];
  pose.rotations.chest = [12, 20, -15];
  pose.rotations.leftWrist = [20, 10, 5];
  applyPose(rig, pose);
  for (const chain of CHAINS) {
    const target = jointPosition(rig, chain.ids[2]).map(
      (n, i) => n + [0.12, 0.16, 0.05][i],
    );
    const moved = moveEffector(rig, pose, chain.ids[2], target);
    pose = moved.pose;
    assert.ok(moved.error < 0.001);
    assert.ok(distance(jointPosition(rig, chain.ids[2]), target) < 0.001);
    for (let i = 0; i < 2; i++)
      assert.ok(
        Math.abs(
          distance(
            jointPosition(rig, chain.ids[i]),
            jointPosition(rig, chain.ids[i + 1]),
          ) - chain.lengths[i],
        ) < 1e-8,
      );
  }
  assert.deepEqual(pose.rotations.leftWrist, [20, 10, 5]);
  assert.deepEqual(pose.rotations.pelvis, [15, 25, 12]);
  const result = moveEffector(rig, pose, "leftWrist", [100, 100, 100]);
  assert.ok(result.error > 100);
  assert.ok(
    distance(
      jointPosition(rig, "leftShoulder"),
      jointPosition(rig, "leftWrist"),
    ) <= 1.970001,
  );
});
test("full-body timeline interpolates orientations across the shortest rotation and retains sources", () => {
  const a = restPose(),
    b = restPose();
  a.rotations.head = [0, 0, 170];
  b.rotations.head = [0, 0, -170];
  b.position = [1, 2.8, 0.5];
  const frames = [
      { time: 0, pose: a },
      { time: 2, pose: b },
    ],
    copy = structuredClone(frames);
  const middle = sampleRigPose(frames, 1);
  assert.ok(Math.abs(Math.abs(middle.rotations.head[2]) - 180) < 1e-6);
  assert.deepEqual(middle.position, [0.5, 2.565, 0.25]);
  assert.deepEqual(frames, copy);
  assert.deepEqual(sampleRigPose(frames, 4).position, a.position);
  const end = sampleRigPose(frames, 3.999),
    start = sampleRigPose(frames, 0);
  assert.ok(distance(end.position, start.position) < 1e-5);
  validatePose(middle);
});
test("v2 exports retain every joint, v1 targets migrate, malformed sequences are rejected", () => {
  const rig = createRig(),
    pose = presetPose(rig, "Wave");
  pose.rotations.neck = [5, 25, 10];
  const data = { version: 2, blend: 0.4, keyframes: [{ time: 1, pose }] };
  assert.deepEqual(importSequence(data, rig), {
    blend: 0.4,
    keyframes: data.keyframes,
  });
  const old = importSequence(
    { version: 1, keyframes: [{ time: 0, targets: POSES["Ready stance"] }] },
    rig,
  );
  assert.equal(Object.keys(old.keyframes[0].pose.rotations).length, 21);
  for (const invalid of [
    { ...data, blend: NaN },
    {
      ...data,
      keyframes: [{ time: 0, pose: { position: [0, 0, 0], rotations: {} } }],
    },
    { ...data, keyframes: [...data.keyframes, ...data.keyframes] },
  ])
    assert.throws(() => importSequence(invalid, rig));
});
