import { TransformControls } from "three/addons/controls/TransformControls.js";
import { JOINTS } from "./rig.js";

export function createJointControls(ctx, model, callbacks) {
  const { THREE: T, canvas, camera, controls, scene } = ctx;
  const proxy = new T.Object3D();
  scene.add(proxy);
  const gizmo = new TransformControls(camera, canvas);
  gizmo.setSize(0.7);
  gizmo.setSpace("local");
  const helper = gizmo.getHelper();
  scene.add(helper);
  const ray = new T.Raycaster(),
    captures = new Set();
  let selected,
    mode = "rotate",
    active = true,
    suppress = false;
  function sync(id, nextMode) {
    selected = id;
    mode = nextMode;
    if (gizmo.dragging) return;
    const bone = model.rig.joints[id];
    proxy.position.copy(bone.getWorldPosition(new T.Vector3()));
    proxy.quaternion.copy(
      mode === "rotate"
        ? bone.getWorldQuaternion(new T.Quaternion())
        : new T.Quaternion(),
    );
    proxy.updateMatrixWorld();
    gizmo.setMode(mode);
    gizmo.setSpace(mode === "rotate" ? "local" : "world");
    gizmo.attach(proxy);
    gizmo.enabled = active;
    helper.visible = active;
    ctx.invalidate();
  }
  function cancel() {
    if (gizmo.dragging) {
      suppress = true;
      gizmo.reset();
      gizmo.dragging = false;
      suppress = false;
      callbacks.cancel();
    }
    controls.enabled = true;
    for (const id of captures)
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    captures.clear();
    if (selected) sync(selected, mode);
  }
  gizmo.addEventListener("mouseDown", () => {
    controls.enabled = false;
    callbacks.begin();
  });
  gizmo.addEventListener("objectChange", () => {
    if (suppress) return;
    if (mode === "translate") callbacks.move(proxy.position.toArray());
    else {
      const parent = model.rig.joints[selected].parent.getWorldQuaternion(
        new T.Quaternion(),
      );
      const q = parent.invert().multiply(proxy.quaternion);
      const rotation = new T.Euler()
        .setFromQuaternion(q, "XYZ")
        .toArray()
        .slice(0, 3)
        .map((n) => (n * 180) / Math.PI);
      callbacks.rotate(rotation);
    }
    ctx.invalidate();
  });
  gizmo.addEventListener("mouseUp", () => {
    controls.enabled = true;
    callbacks.commit();
    queueMicrotask(() => sync(selected, mode));
  });
  gizmo.addEventListener("change", () => ctx.invalidate());
  function pickJoint(event, markersOnly = false) {
    const rect = canvas.getBoundingClientRect();
    let best = null;
    camera.updateMatrixWorld();
    model.rig.root.updateWorldMatrix(true, true);
    for (const marker of model.markers) {
      const projected = marker.position.clone().project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const distance = Math.hypot(
        rect.left + ((projected.x + 1) * rect.width) / 2 - event.clientX,
        rect.top + ((1 - projected.y) * rect.height) / 2 - event.clientY,
      );
      if (
        distance <= (event.pointerType === "touch" ? 22 : 11) &&
        (!best || distance < best.distance)
      )
        best = { id: marker.userData.joint, distance };
    }
    if (best) return best.id;
    if (markersOnly) return null;
    ray.setFromCamera(ctx.pointer(event), camera);
    const surface = ray.intersectObjects(model.surfaces, false)[0];
    if (!surface) return null;
    const sameChain = JOINTS.filter(
      (j) =>
        j.id === surface.object.userData.joint ||
        j.parent === surface.object.userData.joint,
    );
    if (surface.object.isSkinnedMesh) {
      sameChain.sort(
        (a, b) =>
          model.rig.joints[a.id]
            .getWorldPosition(new T.Vector3())
            .distanceToSquared(surface.point) -
          model.rig.joints[b.id]
            .getWorldPosition(new T.Vector3())
            .distanceToSquared(surface.point),
      );
      return sameChain[0].id;
    }
    return surface.object.userData.joint;
  }
  ctx.listen(
    canvas,
    "pointerdown",
    (event) => {
      if (!active || event.button !== 0) return;
      const markerId = pickJoint(event, true);
      if (markerId && markerId !== selected) {
        event.preventDefault();
        event.stopImmediatePropagation();
        callbacks.select(markerId);
        canvas.focus({ preventScroll: true });
        return;
      }
      gizmo.pointerHover({
        x: ctx.pointer(event).x,
        y: ctx.pointer(event).y,
        button: 0,
      });
      if (gizmo.axis) {
        controls.enabled = false;
        captures.add(event.pointerId);
        return;
      }
      const id = pickJoint(event);
      if (!id) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      callbacks.select(id);
      canvas.focus({ preventScroll: true });
    },
    { capture: true },
  );
  ctx.listen(canvas, "pointerup", (event) => {
    captures.delete(event.pointerId);
    controls.enabled = true;
  });
  ctx.listen(canvas, "pointercancel", cancel, { capture: true });
  ctx.listen(canvas, "lostpointercapture", () => {
    if (gizmo.dragging) cancel();
  });
  ctx.listen(
    canvas,
    "keydown",
    (event) => {
      if (event.key === "Escape" && gizmo.dragging) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      }
    },
    { capture: true },
  );
  ctx.listen(window, "blur", cancel);
  ctx.listen(window, "resize", cancel);
  return {
    sync,
    cancel,
    deactivate() {
      cancel();
      active = false;
      gizmo.enabled = false;
      gizmo.disconnect();
      helper.visible = false;
    },
    activate() {
      active = true;
      gizmo.connect(canvas);
      sync(selected, mode);
    },
    dispose() {
      cancel();
      gizmo.dispose();
      scene.remove(helper, proxy);
    },
  };
}
