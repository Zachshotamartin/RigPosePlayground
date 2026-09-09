# Joint posing verification

The full rig has 21 named joints, with an independent local rotation for each. All 21 joints and all 3 rotation axes retain rest bone lengths in unit tests. Chest rotations move descendant shoulders/hands/head while leaving the hips and legs unchanged. IK is also tested under combined pelvis/chest rotations and preserves downstream wrist rotation.

The browser test clicks every real projected joint, rotates and undoes each joint, drags an actual Three.js ring without orbiting the camera, cancels a drag, switches cached tools, checks whole-body JSON round trips, and selects a knee at 390px. Screenshots in examples were captured from the updated renderer.

Run npm test, npm run test:browser, and npm run build locally. No GitHub Actions.
