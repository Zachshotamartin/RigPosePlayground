import { POSES } from "./kinematics.js";
import {
  JOINTS,
  CHAINS,
  presetPose,
  jointPosition,
  moveEffector,
  sampleRigPose,
  importSequence,
} from "./rig.js";
import { createMannequin } from "./mannequin.js";
import { createJointControls } from "./jointControls.js";
export { solveFABRIK, skinWeights, samplePose } from "./kinematics.js";
export const metadata = {
  id: "rig-pose-playground",
  title: "Rig & Pose Playground",
  description:
    "Pose 21 connected body joints, move hands and feet with inverse kinematics, and animate the full figure.",
  technique:
    "Hierarchical joint rotations · FABRIK inverse kinematics · linear blend skinning · quaternion interpolation",
  instructions: [
    "Click any joint or body part to select it. Drag the colored rotation rings, or use its X, Y, and Z rotation sliders.",
    "Hands and feet also have Move target (IK): drag an arrow to move the target while the two limb bones keep their lengths.",
    "Pose the pelvis, spine, chest, neck, head, collarbones, shoulders, elbows, wrists, hips, knees, ankles, and toes. Parent rotations carry their children.",
    "Save whole-body poses along the four-second timeline, then play or export the sequence. Escape cancels a drag; Undo reverses a completed edit.",
  ],
  limitations: [
    "No automatic balance, collision avoidance, or anatomical joint limits. Fingers are represented by mitten-shaped hands, not individual finger bones.",
    "Linear blend skinning can lose volume at tight bends.",
    "An IK target beyond reach stops at the limb’s full length.",
  ],
};
export function createExperiment(ctx) {
  const { ui } = ctx,
    model = createMannequin(ctx),
    rig = model.rig;
  let pose = presetPose(rig, "Ready stance"),
    selected = "rightWrist",
    mode = "translate",
    blend = 0.24,
    showWeights = false,
    showBones = true,
    playing = false,
    time = 0,
    error = 0;
  let keyframes = Object.keys(POSES).map((name, time) => ({
      time,
      pose: presetPose(rig, name),
    })),
    undo = [],
    editStart = null,
    jointControls;
  const isEffector = (id) => CHAINS.some((c) => c.ids[2] === id);
  const snapshot = () => structuredClone({ pose, keyframes, time, blend });
  const begin = () => {
    playing = false;
    editStart ??= snapshot();
  };
  function commit() {
    if (editStart && JSON.stringify(editStart) !== JSON.stringify(snapshot())) {
      undo.push(editStart);
      if (undo.length > 40) undo.shift();
    }
    editStart = null;
  }
  function restore(value) {
    ({ pose, keyframes, time, blend } = structuredClone(value));
    playing = false;
    error = 0;
    model.setWeights(blend, showWeights);
    refresh();
  }
  const cancel = () => {
    const previous = editStart;
    editStart = null;
    if (previous) restore(previous);
  };
  function edit(action) {
    commit();
    begin();
    action();
    commit();
    refresh();
  }
  function syncRange(input, value) {
    input.value = value;
    input.closest("label").querySelector("output").value = Number(
      value.toFixed(2),
    );
  }
  function historyInput(input) {
    for (const type of ["pointerdown", "keydown", "input"])
      ctx.listen(input, type, begin, { capture: true });
    for (const type of ["change", "pointerup", "keyup", "blur"])
      ctx.listen(input, type, commit);
  }
  function show(input, visible) {
    input.closest("label").hidden = !visible;
    input.closest("label").style.display = visible ? "" : "none";
  }
  function refresh(announce = true) {
    model.update(pose, selected, showBones);
    selection.value = selected;
    modeControl.value = mode;
    const canMove = isEffector(selected) || selected === "pelvis";
    modeControl.querySelector('option[value="translate"]').disabled = !canMove;
    modeControl.querySelector('option[value="translate"]').textContent =
      selected === "pelvis" ? "Move whole body" : "Move target (IK)";
    const position =
      selected === "pelvis" ? pose.position : jointPosition(rig, selected);
    for (let i = 0; i < 3; i++) {
      syncRange(rotations[i], pose.rotations[selected][i]);
      show(rotations[i], mode === "rotate");
      syncRange(positions[i], position[i]);
      show(positions[i], mode === "translate");
    }
    syncRange(timeline, time);
    syncRange(blendControl, blend);
    play.textContent = playing ? "Pause timeline" : "Play timeline";
    jointControls?.sync(selected, mode);
    ctx.canvas.dataset.selectedJoint = selected;
    if (announce)
      ctx.setStatus(
        `${JOINTS.find((j) => j.id === selected).label} selected · 21 joints · ${keyframes.length} saved keyframes${error > 0.04 ? " · Target beyond reach; bone lengths preserved." : ""}`,
      );
    ctx.invalidate();
  }
  function select(id) {
    commit();
    selected = id;
    mode = isEffector(id) ? "translate" : "rotate";
    playing = false;
    error = 0;
    refresh();
  }
  function move(target) {
    target = target.map((n, i) =>
      Math.max(i === 1 ? -0.2 : -4, Math.min(i === 1 ? 6 : 4, n)),
    );
    if (selected === "pelvis") pose.position = target;
    else {
      const moved = moveEffector(rig, pose, selected, target);
      pose = moved.pose;
      error = moved.error;
    }
    refresh();
  }
  ui.section("Pose every joint");
  ui.select("Pose preset", Object.keys(POSES), "Ready stance", (name) =>
    edit(() => {
      pose = presetPose(rig, name);
      error = 0;
    }),
  );
  const selection = ui.select(
    "Selected joint",
    JOINTS.map((j) => ({ value: j.id, label: j.label })),
    selected,
    select,
  );
  const modeControl = ui.select(
    "Joint motion",
    [
      { value: "rotate", label: "Rotate joint" },
      { value: "translate", label: "Move target (IK)" },
    ],
    mode,
    (value) => {
      commit();
      mode = value;
      refresh();
    },
  );
  const rotations = [
    "X rotation (degrees)",
    "Y rotation (degrees)",
    "Z rotation (degrees)",
  ].map((name, i) => {
    const input = ui.range(name, {
      min: -180,
      max: 180,
      step: 1,
      value: 0,
      onChange: (value) => {
        pose.rotations[selected][i] = value;
        error = 0;
        refresh();
      },
    });
    historyInput(input);
    return input;
  });
  const positions = ["Horizontal", "Height", "Depth"].map((name, i) => {
    const input = ui.range(name, {
      min: i === 1 ? -0.2 : -4,
      max: i === 1 ? 6 : 4,
      step: 0.01,
      value: 0,
      onChange: (value) => {
        const position =
          selected === "pelvis"
            ? pose.position.slice()
            : jointPosition(rig, selected);
        position[i] = value;
        move(position);
      },
    });
    historyInput(input);
    return input;
  });
  ui.note(
    "Click a gold joint dot or a body part. Rotation rings turn that joint and its children; arrows move hands, feet, or the whole body. Drag empty space to orbit.",
  );
  ui.button("Reset selected joint", () =>
    edit(() => {
      pose.rotations[selected] = [0, 0, 0];
      if (selected === "pelvis") pose.position = [0, 2.33, 0];
    }),
  );
  ui.toggle("Show bones", true, (value) => {
    showBones = value;
    refresh();
  });
  ui.section("Skin influence");
  ui.toggle("Show skin weights", false, (value) => {
    showWeights = value;
    model.setWeights(blend, showWeights);
    ctx.invalidate();
  });
  const blendControl = ui.range("Joint blend width", {
    min: 0.04,
    max: 0.65,
    step: 0.01,
    value: blend,
    onChange: (value) => {
      blend = value;
      model.setWeights(blend, showWeights);
      ctx.invalidate();
    },
  });
  historyInput(blendControl);
  ui.note(
    "Warm color follows the upper limb bone; cool color follows the lower bone. Blend width changes the actual skin weights.",
  );
  ui.section("Four-second timeline");
  const timeline = ui.range("Playhead (seconds)", {
    min: 0,
    max: 4,
    step: 0.01,
    value: time,
    onChange: (value) => {
      commit();
      playing = false;
      time = value;
      pose = sampleRigPose(keyframes, time, { loop: false });
      error = 0;
      refresh();
    },
  });
  ui.button(
    "Save keyframe here",
    () =>
      edit(() => {
        keyframes = keyframes.filter((k) => Math.abs(k.time - time) > 0.04);
        keyframes.push({ time, pose: structuredClone(pose) });
        keyframes.sort((a, b) => a.time - b.time);
      }),
    { primary: true },
  );
  ui.button("Delete nearest keyframe", () => {
    if (keyframes.length === 1) {
      ctx.setStatus("Keep at least one pose.");
      return;
    }
    edit(() => {
      const closest = keyframes.reduce((a, b) =>
        Math.abs(a.time - time) < Math.abs(b.time - time) ? a : b,
      );
      keyframes = keyframes.filter((k) => k !== closest);
    });
  });
  const play = ui.button("Play timeline", () => {
    commit();
    playing = !playing;
    refresh();
  });
  ui.button("Undo pose edit", () => {
    commit();
    const previous = undo.pop();
    if (previous) restore(previous);
  });
  ui.button("Export poses JSON", () => {
    commit();
    ctx.download(
      "mannequin-poses.json",
      JSON.stringify({ version: 2, duration: 4, blend, keyframes }, null, 2),
      "application/json",
    );
  });
  ui.file(
    "Import poses JSON",
    async (file) => {
      try {
        if (file.size > 500000)
          throw new Error("Keep pose files under 500 KB.");
        const imported = importSequence(JSON.parse(await file.text()), rig);
        edit(() => {
          keyframes = imported.keyframes;
          blend = imported.blend ?? blend;
          time = 0;
          pose = sampleRigPose(keyframes, 0);
          model.setWeights(blend, showWeights);
        });
      } catch (e) {
        model.update(pose, selected, showBones);
        ctx.setStatus(`Import failed: ${e.message}`);
      }
    },
    { accept: ".json" },
  );
  ui.note(
    "Keyframes save all 21 joint rotations and the body position. Existing hand-and-foot pose files still import.",
  );
  jointControls = createJointControls(ctx, model, {
    select,
    begin,
    commit,
    cancel,
    move,
    rotate: (value) => {
      pose.rotations[selected] = value;
      error = 0;
      refresh();
    },
  });
  ctx.onFrame((dt) => {
    if (!playing) return;
    time = (time + dt) % 4;
    pose = sampleRigPose(keyframes, time);
    refresh(false);
  });
  refresh();
  ctx.fit(ctx.root);
  return {
    getPose: () => structuredClone(pose),
    getSelectedJoint: () => selected,
    deactivate() {
      jointControls.deactivate();
      playing = false;
      commit();
    },
    activate() {
      jointControls.activate();
      refresh();
    },
    dispose() {
      jointControls.dispose();
      model.dispose();
    },
  };
}
