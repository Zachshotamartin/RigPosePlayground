# Rig & Pose Playground

A browser editor for an articulated, skinned mannequin. Click any joint or body part, rotate it in 3D, or move a hand or foot with two-bone inverse kinematics. The same source powers the standalone tool and the portfolio's Mesh workshop.

## Run

Requires Node.js 22 or later. No GitHub Actions are configured.

```sh
npm ci
npm run dev
npm test
npm run test:browser
npm run build
```

## Posing

- **21 selectable body joints:** pelvis, lower spine, chest, neck, head, both collarbones, shoulders, elbows, wrists, hips, knees, ankles, and toes.
- Click a gold joint dot or a body part to select it. The **Selected joint** menu offers the same selection without pointer precision.
- **Rotate joint** exposes three local rotation rings and X/Y/Z degree sliders. A parent rotation carries its descendants: the chest carries the shoulders and head; the pelvis carries the entire body. Bone lengths stay fixed.
- Wrists and ankles also offer **Move target (IK)**. Drag the translation arrows or use Horizontal, Height, and Depth. FABRIK solves the two upstream bones under the current torso pose. Wrist and ankle articulation is retained.
- The pelvis offers **Move whole body**. Hands are mitten-shaped; individual fingers are outside this rig.
- Empty-space dragging orbits the camera. Joint handles capture their own gesture. Escape cancels a drag, Undo reverses a completed gesture, and switching tools safely releases input while preserving the pose.
- **Show skin weights** displays actual upper/lower limb influence; **Joint blend width** changes normalized weights on the skinned geometry.

## Animation and files

Four starter poses populate a four-second timeline. Scrub, edit any body joint, then **Save keyframe here**. Save within 0.04 seconds replaces an existing frame; Delete nearest keeps at least one frame. Playback uses quaternion interpolation to avoid long rotations across the ±180° boundary.

Exported JSON version 2 contains `{version, duration, blend, keyframes: [{time, pose: {position, rotations}}]}`. Every keyframe stores all 21 rotations and the body position. Import also accepts the original version 1 hand/foot target format and converts it to full joint poses. Files, frame counts, coordinates, rotations, and times are validated before replacing the current sequence. All processing stays in the browser.

## Implementation

- `src/rig.js`: named parent-child skeleton, full-pose state, target solving, quaternion interpolation, and versioned import.
- `src/mannequin.js`: actual Three.js bones and skinned limbs, articulated torso/head/hands/feet, selectable joint markers, and bone/weight visualization.
- `src/jointControls.js`: direct joint picking, Three.js TransformControls, camera/input ownership, cancellation, and cached-tool lifecycle.
- `src/kinematics.js`: pure FABRIK solver, normalized blend weights, and legacy target interpolation.
- `src/index.js`: accessible controls, gesture undo, keyframe editing, and full-body exports.

The positional solver follows [FABRIK](https://www.andreasaristidou.com/FABRIK.html). Limb surfaces use [Three.js SkinnedMesh](https://threejs.org/docs/#SkinnedMesh); joint handles use the installed Three.js TransformControls implementation.

## Limits and verification

This is a body-posing workshop, not an anatomical simulator. There is no automatic balance, collision avoidance, anatomical angle limiting, individual finger rig, or dual-quaternion skinning. Linear blending can lose volume at tight bends. IK targets beyond reach preserve limb length.

Unit tests exercise every joint and axis, parent/child motion, invariant bone lengths, IK under rotated parents, shortest-path interpolation, and old/new file imports. Real browser tests click all 21 projected joints, change and undo each rotation, drag an actual ring without orbiting the camera, cancel with Escape, switch cached tools, play the timeline, round-trip exported JSON, and select joints at a 390px width.

[Open the portfolio tool](https://zachsm.com/experiments/mesh-workshop?tool=rig-pose-playground)
