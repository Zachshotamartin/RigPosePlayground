import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { JOINTS } from "../src/rig.js";
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  cacheDir: ".vite/joints",
});
await server.listen();
const browser = await chromium.launch({ channel: "chromium" });
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${server.httpServer.address().port}/tests/fixtures/lifecycle.html`,
  );
  await page.waitForFunction(() => window.rigTool);
  const canvas = page.locator("canvas"),
    selection = page.getByRole("combobox", {
      name: "Selected joint",
      exact: true,
    }),
    mode = page.getByRole("combobox", { name: "Joint motion", exact: true }),
    button = (name) => page.getByRole("button", { name, exact: true }),
    range = (name) => page.getByRole("slider", { name, exact: true });
  const state = () => page.evaluate(() => window.rigTool.getPose());
  async function point(id) {
    await canvas.scrollIntoViewIfNeeded();
    return page.evaluate((id) => {
      const { THREE: T, root, camera, canvas } = window.fixture.ctx;
      root.updateWorldMatrix(true, true);
      camera.updateMatrixWorld();
      const p = root
          .getObjectByName("rig-joint-" + id)
          .getWorldPosition(new T.Vector3())
          .project(camera),
        r = canvas.getBoundingClientRect();
      return [
        r.left + ((p.x + 1) * r.width) / 2,
        r.top + ((1 - p.y) * r.height) / 2,
      ];
    }, id);
  }
  const setRange = async (name, value) => {
    await range(name).fill(String(value));
    await range(name).dispatchEvent("input");
    await range(name).dispatchEvent("change");
  };
  async function exportData() {
    const wait = page.waitForEvent("download");
    await button("Export poses JSON").click();
    return JSON.parse(await readFile(await (await wait).path(), "utf8"));
  }
  // Every listed joint can be selected at its actual projected location, not through a mocked selection callback.
  for (const { id } of JOINTS) {
    await page.mouse.click(...(await point(id)));
    assert.equal(await selection.inputValue(), id, `Click selects ${id}`);
  }
  console.log("PASS: direct clicks on all 21 joint positions.");
  for (const { id } of JOINTS) {
    await selection.selectOption(id);
    await mode.selectOption("rotate");
    const before = await state();
    await setRange("Z rotation (degrees)", 23);
    assert.ok(Math.abs((await state()).rotations[id][2] - 23) < 0.001, id);
    await button("Undo pose edit").click();
    assert.deepEqual(await state(), before, `Undo ${id}`);
  }
  console.log("PASS: every joint rotation and exact slider undo.");
  await selection.selectOption("chest");
  await setRange("Y rotation (degrees)", 32);
  await selection.selectOption("rightWrist");
  await setRange("Height", 3.6);
  await setRange("Joint blend width", 0.42);
  await button("Save keyframe here").click();
  const sequence = await exportData();
  assert.equal(sequence.version, 2);
  assert.equal(sequence.keyframes[0].pose.rotations.chest[1], 32);
  assert.equal(Object.keys(sequence.keyframes[0].pose.rotations).length, 21);
  assert.equal(sequence.blend, 0.42);
  await page
    .getByRole("combobox", { name: "Pose preset", exact: true })
    .selectOption("Ready stance");
  await page
    .getByLabel("Import poses JSON")
    .setInputFiles({
      name: "poses.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(sequence)),
    });
  await page.waitForFunction(
    () => window.rigTool.getPose().rotations.chest[1] === 32,
  );
  assert.deepEqual((await exportData()).keyframes, sequence.keyframes);
  // Find a visible rotation-ring point by observing the actual helper geometry, then drag through normal browser input.
  await selection.selectOption("head");
  await canvas.scrollIntoViewIfNeeded();
  const ringPoints = await page.evaluate(() => {
    const { scene, THREE: T, camera, canvas } = window.fixture.ctx;
    scene.updateMatrixWorld(true);
    const helper = scene.children.find((c) => c.isTransformControlsRoot),
      r = canvas.getBoundingClientRect(),
      points = [];
    helper.children
      .find((c) => c.type === "TransformControlsGizmo")
      .gizmo.rotate.traverse((o) => {
        if (o.isMesh && o.name === "Z" && o.visible) {
          const a = o.geometry.attributes.position;
          for (
            let i = 0;
            i < a.count;
            i += Math.max(1, Math.floor(a.count / 16))
          ) {
            const p = new T.Vector3()
              .fromBufferAttribute(a, i)
              .applyMatrix4(o.matrixWorld)
              .project(camera);
            points.push([
              r.left + ((p.x + 1) * r.width) / 2,
              r.top + ((1 - p.y) * r.height) / 2,
            ]);
          }
        }
      });
    return points;
  });
  let start;
  for (const p of ringPoints) {
    await page.mouse.move(...p);
    const axis = await page.evaluate(
      () =>
        window.fixture.ctx.scene.children.find((c) => c.isTransformControlsRoot)
          .controls.axis,
    );
    if (axis === "Z") {
      start = p;
      break;
    }
  }
  assert.ok(start, "A visible Z rotation ring can be targeted");
  const beforeDrag = await state(),
    cameraBefore = await page.evaluate(() =>
      window.fixture.ctx.camera.position.toArray(),
    );
  await page.mouse.move(...start);
  await page.mouse.down();
  await page.mouse.move(start[0] + 32, start[1] + 20, { steps: 10 });
  await page.mouse.up();
  assert.notDeepEqual(
    (await state()).rotations.head,
    beforeDrag.rotations.head,
  );
  assert.deepEqual(
    await page.evaluate(() => window.fixture.ctx.camera.position.toArray()),
    cameraBefore,
    "Joint drag must not orbit the camera",
  );
  await button("Undo pose edit").click();
  assert.deepEqual(await state(), beforeDrag);
  // Cancellation and cached tool lifecycle must not leave the gizmo, pose, or OrbitControls stuck.
  await canvas.scrollIntoViewIfNeeded();
  await page.mouse.move(...start);
  await page.mouse.down();
  await page.mouse.move(start[0] + 25, start[1] + 15, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.deepEqual(await state(), beforeDrag);
  assert.equal(
    await page.evaluate(() => window.fixture.ctx.controls.enabled),
    true,
  );
  await page.evaluate(() => {
    window.fixture.switchExperiment("empty", () => ({}));
    window.fixture.switchExperiment("default");
  });
  assert.equal(await canvas.count(), 1);
  assert.deepEqual(await state(), beforeDrag);
  await button("Play timeline").click();
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector('input[aria-label="Playhead (seconds)"]').value,
      ) > 0.08,
  );
  await button("Pause timeline").click();
  assert.equal((await state()).rotations.head.length, 3);
  await page.setViewportSize({ width: 390, height: 844 });
  await selection.selectOption("pelvis");
  await page.mouse.click(...(await point("leftKnee")));
  assert.equal(await selection.inputValue(), "leftKnee");
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= 390),
  );
  await canvas.screenshot({ path: "/tmp/rig-joints-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await selection.selectOption("chest");
  await canvas.screenshot({ path: "/tmp/rig-joints-desktop.png" });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: full-body export/import, ring drag without camera orbit, Escape, cached switching, timeline playback, and mobile selection.",
  );
} finally {
  await browser.close();
  await server.close();
}
