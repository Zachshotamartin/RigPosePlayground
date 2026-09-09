import { JOINTS, CHAINS, createRig, applyPose, restPose } from "./rig.js";
import { skinWeights } from "./kinematics.js";

export function createMannequin(ctx) {
  const { THREE: T, root } = ctx,
    rig = createRig(),
    surfaces = [],
    markers = [],
    skins = [];
  root.add(rig.root);
  applyPose(rig, restPose());
  const cream = new T.MeshStandardMaterial({
    color: 0xd8dccd,
    roughness: 0.63,
    metalness: 0.03,
  });
  const dark = new T.MeshStandardMaterial({ color: 0x20382e, roughness: 0.55 });
  const accent = new T.MeshStandardMaterial({
    color: 0xd99976,
    roughness: 0.4,
  });
  const sphere = new T.SphereGeometry(1, 24, 16);
  function mesh(geometry, material, position, scale, parent = root, id) {
    const m = new T.Mesh(geometry, material);
    m.position.set(...position);
    if (scale) m.scale.set(...scale);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    if (id) {
      m.userData.joint = id;
      surfaces.push(m);
    }
    return m;
  }
  const ball = (id, material, position, scale) =>
    mesh(sphere, material, position, scale, rig.joints[id], id);
  const cylinder = (id, material, position, scale) =>
    mesh(
      new T.CylinderGeometry(1, 1, 1, 28),
      material,
      position,
      scale,
      rig.joints[id],
      id,
    );
  mesh(new T.CylinderGeometry(2.95, 3.05, 0.14, 80), dark, [0, -0.2, 0]);
  const ring = mesh(
    new T.TorusGeometry(2.72, 0.012, 6, 100),
    accent,
    [0, -0.12, 0],
  );
  ring.rotation.x = Math.PI / 2;
  ball("pelvis", dark, [0, 0, 0], [0.61, 0.32, 0.38]);
  ball("spine", dark, [0, -0.12, 0], [0.44, 0.29, 0.28]);
  cylinder("spine", cream, [0, 0.18, 0], [0.46, 0.38, 0.29]);
  ball("chest", dark, [0, -0.025, 0], [0.48, 0.18, 0.3]);
  mesh(
    new T.CylinderGeometry(0.69, 0.47, 0.66, 32),
    cream,
    [0, 0.28, 0],
    [1, 1, 0.64],
    rig.joints.chest,
    "chest",
  );
  cylinder("neck", dark, [0, 0.07, 0], [0.2, 0.2, 0.2]);
  ball("head", cream, [0, 0.18, 0], [0.37, 0.45, 0.35]);
  ball("head", dark, [0, 0.22, 0.22], [0.28, 0.1, 0.245]);
  [-0.125, 0.125].forEach((x) =>
    ball("head", accent, [x, 0.23, 0.432], [0.032, 0.032, 0.026]),
  );
  // Badge and seams stay attached to the upper chest when it bends or turns.
  const badge = mesh(
    new T.TorusGeometry(0.13, 0.012, 6, 36),
    accent,
    [0, 0.34, 0.397],
    null,
    rig.joints.chest,
    "chest",
  );
  badge.scale.y = 0.78;
  for (const side of ["left", "right"]) {
    const sign = side === "left" ? -1 : 1;
    const clavicle = rig.joints[`${side}Clavicle`],
      shoulder = rig.joints[`${side}Shoulder`];
    const bar = mesh(
      new T.CylinderGeometry(0.13, 0.13, Math.hypot(0.46, 0.06), 18),
      dark,
      [sign * 0.23, 0.03, 0],
      null,
      clavicle,
      `${side}Clavicle`,
    );
    bar.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      shoulder.position.clone().normalize(),
    );
    ball(`${side}Shoulder`, accent, [0, 0, 0], [0.205, 0.205, 0.205]);
    ball(`${side}Hip`, dark, [0, 0, 0], [0.24, 0.24, 0.24]);
    ball(`${side}Elbow`, dark, [0, 0, 0], [0.155, 0.155, 0.155]);
    ball(`${side}Knee`, dark, [0, 0, 0], [0.185, 0.185, 0.185]);
    ball(`${side}Wrist`, dark, [0, -0.1, 0], [0.16, 0.24, 0.13]);
    cylinder(`${side}Wrist`, accent, [0, 0.04, 0], [0.145, 0.11, 0.145]);
    ball(`${side}Ankle`, dark, [0, -0.07, 0.015], [0.215, 0.13, 0.235]);
    cylinder(`${side}Ankle`, accent, [0, 0.06, 0], [0.17, 0.11, 0.17]);
    ball(`${side}Toe`, cream, [0, -0.035, 0.135], [0.215, 0.11, 0.23]);
  }
  rig.root.updateWorldMatrix(true, true);
  for (const chain of CHAINS) {
    const total = chain.lengths[0] + chain.lengths[1],
      rows = 36,
      sides = 18,
      positions = [],
      indices = [],
      weights = [],
      colors = [],
      triangles = [];
    const origin = rig.joints[chain.ids[0]].getWorldPosition(new T.Vector3());
    const boneIndices = chain.ids
      .slice(0, 2)
      .map((id) => JOINTS.findIndex((j) => j.id === id));
    for (let row = 0; row <= rows; row++)
      for (let side = 0; side <= sides; side++) {
        const t = row / rows,
          angle = (side / sides) * Math.PI * 2,
          r =
            chain.radius *
            (0.68 + 0.32 * Math.sin(Math.PI * (0.12 + t * 0.75)));
        positions.push(
          origin.x + Math.cos(angle) * r,
          origin.y - t * total,
          origin.z + Math.sin(angle) * r,
        );
        weights.push(1, 0, 0, 0);
        indices.push(...boneIndices, 0, 0);
        colors.push(1, 1, 1);
        if (row < rows && side < sides) {
          const k = row * (sides + 1) + side;
          triangles.push(
            k,
            k + sides + 1,
            k + 1,
            k + 1,
            k + sides + 1,
            k + sides + 2,
          );
        }
      }
    const geometry = new T.BufferGeometry();
    for (const [name, data, size] of [
      ["position", positions, 3],
      ["skinWeight", weights, 4],
      ["color", colors, 3],
    ])
      geometry.setAttribute(name, new T.Float32BufferAttribute(data, size));
    geometry.setAttribute("skinIndex", new T.Uint16BufferAttribute(indices, 4));
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    const skin = new T.SkinnedMesh(geometry, cream.clone());
    skin.frustumCulled = false;
    skin.castShadow = true;
    skin.userData.joint = chain.ids[0];
    root.add(skin);
    skin.bind(rig.skeleton, new T.Matrix4());
    skins.push({ skin, chain, rows, sides, joint: chain.lengths[0] / total });
    surfaces.push(skin);
  }
  const jointGeometry = new T.SphereGeometry(0.07, 16, 12);
  for (const { id } of JOINTS) {
    const m = mesh(
      jointGeometry,
      new T.MeshBasicMaterial({
        color: 0xd6b784,
        depthTest: false,
        transparent: true,
        opacity: 0.9,
      }),
      [0, 0, 0],
      null,
      root,
    );
    m.renderOrder = 20;
    m.userData.joint = id;
    markers.push(m);
  }
  const lines = new T.LineSegments(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({
      color: 0xf1c88e,
      depthTest: false,
      transparent: true,
      opacity: 0.6,
    }),
  );
  lines.renderOrder = 18;
  root.add(lines);
  const segments = JOINTS.filter((j) => j.parent),
    linePositions = new Float32Array(segments.length * 6);
  lines.geometry.setAttribute(
    "position",
    new T.BufferAttribute(linePositions, 3),
  );
  function update(pose, selected, showBones = true) {
    applyPose(rig, pose);
    rig.skeleton.update();
    for (const { skin } of skins) skin.boundingSphere = null;
    for (const marker of markers) {
      marker.position.copy(
        rig.joints[marker.userData.joint].getWorldPosition(new T.Vector3()),
      );
      marker.scale.setScalar(marker.userData.joint === selected ? 1.45 : 1);
      marker.material.color.set(
        marker.userData.joint === selected ? 0xffe3ab : 0xd6b784,
      );
    }
    segments.forEach((spec, i) => {
      rig.joints[spec.parent]
        .getWorldPosition(new T.Vector3())
        .toArray(linePositions, i * 6);
      rig.joints[spec.id]
        .getWorldPosition(new T.Vector3())
        .toArray(linePositions, i * 6 + 3);
    });
    lines.geometry.attributes.position.needsUpdate = true;
    lines.geometry.computeBoundingSphere();
    lines.visible = showBones;
    root.updateWorldMatrix(true, true);
  }
  function setWeights(blend, visible) {
    for (const { skin, rows, sides, joint } of skins) {
      const weights = skin.geometry.attributes.skinWeight,
        colors = skin.geometry.attributes.color;
      for (let i = 0; i < weights.count; i++) {
        const w = skinWeights(Math.floor(i / (sides + 1)) / rows, joint, blend);
        weights.setXYZW(i, ...w, 0, 0);
        const c = new T.Color(0xe89f71).lerp(new T.Color(0x78b9bb), w[1]);
        colors.setXYZ(i, c.r, c.g, c.b);
      }
      weights.needsUpdate = true;
      colors.needsUpdate = true;
      skin.material.vertexColors = visible;
      skin.material.color.set(visible ? 0xffffff : 0xd8dccd);
      skin.material.needsUpdate = true;
    }
  }
  setWeights(0.24, false);
  return {
    rig,
    surfaces,
    markers,
    update,
    setWeights,
    dispose() {
      rig.skeleton.dispose();
    },
  };
}
