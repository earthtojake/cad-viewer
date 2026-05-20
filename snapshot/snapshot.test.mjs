import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";

import { normalizeThemeSettings as normalizeCommonThemeSettings } from "../common/themeSettings.js";
import { normalizeStepModuleDefinition } from "../common/stepModule.js";
import { normalizeStepModuleRenderParams } from "../common/stepModuleParams.js";
import { normalizeThemeSettings as normalizeUiThemeSettings } from "../lib/themeSettings.js";
import {
  loadJobFromOptions,
  normalizeSnapshotRenderJob,
  parseSnapshotArgs,
  resolveRenderJob
} from "./index.mjs";

async function withTempWorkspace(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "render-snapshot-test-"));
  try {
    return await callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function stdinFrom(text) {
  const stream = Readable.from([text]);
  stream.isTTY = false;
  return stream;
}

test("shortcut flags build a theme snapshot request", async () => {
  const options = parseSnapshotArgs([
    "--input", "models/part.step",
    "--output", "/tmp/part.png",
    "--mode", "view",
    "--theme", "technical",
    "--camera", "top",
    "--width", "800",
    "--height", "600",
    "--view-labels"
  ]);
  const job = await loadJobFromOptions(options);

  assert.equal(job.input, "models/part.step");
  assert.equal(job.mode, "view");
  assert.equal(job.theme.id, "technical");
  assert.deepEqual(job.theme.settings, null);
  assert.equal(job.render.viewLabels, true);
  assert.deepEqual(job.outputs, [{
    path: "/tmp/part.png",
    camera: "top",
    width: 800,
    height: 600
  }]);
});

test("shortcut flags default to the technical theme", async () => {
  const options = parseSnapshotArgs([
    "--input", "models/part.step",
    "--output", "/tmp/part.png"
  ]);
  const job = await loadJobFromOptions(options);

  assert.equal(options.theme, "technical");
  assert.equal(job.theme.id, "technical");
  assert.deepEqual(job.theme.settings, null);
});

test("shortcut default job shape stays owned by the snapshot script", async () => {
  const options = parseSnapshotArgs([
    "--input", "models/part.step",
    "--output", "/tmp/part.png"
  ]);
  const job = await loadJobFromOptions(options);

  assert.deepEqual(job, {
    input: "models/part.step",
    workspaceRoot: "",
    rootDir: "",
    mode: "view",
    outputs: [{
      path: "/tmp/part.png",
      camera: "iso"
    }],
    theme: {
      id: "technical",
      settings: null
    },
    render: {
      viewLabels: false
    }
  });
  assert.equal(job.render.profile, undefined);
});

test("shortcut input requires an output for non-list modes", async () => {
  await assert.rejects(
    loadJobFromOptions(parseSnapshotArgs(["--input", "models/part.step"])),
    /requires --output/
  );

  const job = await loadJobFromOptions(parseSnapshotArgs([
    "--input", "models/part.step",
    "--mode", "list"
  ]));
  assert.deepEqual(job.outputs, []);
});

test("JSON job loading remains byte-for-byte unchanged without shortcut overrides", async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const rawJob = {
      input: "models/part.glb",
      mode: "view",
      theme: {
        id: "dark",
        settings: {
          display: { mode: "wireframe" }
        }
      },
      render: {
        transparent: true,
        clip: {
          enabled: true,
          axis: "z",
          offset: 0.5
        }
      },
      outputs: [{
        path: "/tmp/part.png",
        camera: "front",
        width: 800,
        height: 600
      }]
    };
    const jobPath = path.join(workspaceRoot, "job.json");
    fs.writeFileSync(jobPath, JSON.stringify(rawJob));

    const job = await loadJobFromOptions(parseSnapshotArgs(["--job", jobPath]));

    assert.deepEqual(job, rawJob);
  });
});

test("params flag builds a STEP module param snapshot request", async () => {
  const options = parseSnapshotArgs([
    "--input", "models/part.step",
    "--output", "/tmp/part.png",
    "--params", '{"drive":180,"ringVisible":false}'
  ]);
  const job = await loadJobFromOptions(options);

  assert.deepEqual(job.params, {
    drive: 180,
    ringVisible: false
  });
});

test("params flag overrides JSON job params", async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const jobPath = path.join(workspaceRoot, "job.json");
    fs.writeFileSync(jobPath, JSON.stringify({
      input: "models/part.step",
      outputs: [{ path: "/tmp/part.png" }],
      params: { drive: 15 }
    }));
    const options = parseSnapshotArgs([
      "--job", jobPath,
      "--params", '{"drive":42}'
    ]);
    const job = await loadJobFromOptions(options);

    assert.deepEqual(job.params, { drive: 42 });
  });
});

test("animated STEP params use default GIF timing", () => {
  const definition = normalizeStepModuleDefinition({
    manifest: {
      schemaVersion: 1,
      parameters: {
        drive: { type: "number", min: 0, max: 360, default: 0 }
      }
    }
  }, { url: "/models/.part.step.js" });
  const params = normalizeStepModuleRenderParams(definition, {
    animate: {
      drive: { from: 0, to: 360 }
    }
  });

  assert.equal(params.fps, 18);
  assert.equal(params.durationSeconds, 4);
  assert.equal(params.frameCount, 72);
  assert.equal(params.loop, true);
});

test("STEP params reject unknown parameter ids against the sidecar schema", () => {
  const definition = normalizeStepModuleDefinition({
    manifest: {
      schemaVersion: 1,
      parameters: {
        drive: { type: "number", min: 0, max: 360, default: 0 }
      }
    }
  }, { url: "/models/.part.step.js" });

  assert.throws(
    () => normalizeStepModuleRenderParams(definition, { spin: 180 }),
    /Unknown STEP module parameter/
  );
  assert.throws(
    () => normalizeStepModuleRenderParams(definition, { animate: { spin: { from: 0, to: 360 } } }),
    /Unknown STEP module animated parameter/
  );
});

test("theme flag accepts a JSON object", async () => {
  const options = parseSnapshotArgs([
    "--input", "models/part.step",
    "--output", "/tmp/part.png",
    "--theme", JSON.stringify({
      id: "inline-review",
      settings: { materials: { defaultColor: "#abcdef" } }
    })
  ]);
  const job = await loadJobFromOptions(options);

  assert.equal(job.theme.id, "inline-review");
  assert.equal(job.theme.settings.materials.defaultColor, "#abcdef");
});

test("theme flag accepts a JSON file", async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const themePath = path.join(workspaceRoot, "review-theme.json");
    fs.writeFileSync(themePath, JSON.stringify({
      id: "file-review",
      settings: { materials: { defaultColor: "#fedcba" } }
    }));
    const options = parseSnapshotArgs([
      "--input", "models/part.step",
      "--output", "/tmp/part.png",
      "--theme", themePath
    ]);
    const job = await loadJobFromOptions(options, { cwd: workspaceRoot });

    assert.equal(job.theme.id, "file-review");
    assert.equal(job.theme.settings.materials.defaultColor, "#fedcba");
  });
});

test("JSON jobs can be read from explicit stdin", async () => {
  const options = parseSnapshotArgs(["--job", "-"]);
  const job = await loadJobFromOptions(options, {
    stdin: stdinFrom(JSON.stringify({
      input: "models/part.glb",
      mode: "view",
      theme: {
        id: "technical",
        settings: {
          display: { mode: "wireframe" }
        }
      },
      outputs: [{ path: "/tmp/part.png" }]
    }))
  });

  assert.equal(job.input, "models/part.glb");
  assert.equal(job.mode, "view");
  assert.equal(job.theme.settings.display.mode, "wireframe");
  assert.equal(job.outputs[0].path, "/tmp/part.png");
});

test("piped stdin is treated as the job when shortcut input is absent", async () => {
  const options = parseSnapshotArgs([]);
  const job = await loadJobFromOptions(options, {
    stdin: stdinFrom(JSON.stringify({
      input: "models/stdin.glb",
      mode: "section",
      outputs: [{ path: "/tmp/stdin.png" }]
    }))
  });

  assert.equal(job.input, "models/stdin.glb");
  assert.equal(job.mode, "section");
});

test("custom theme settings are rejected as shortcut flags", () => {
  assert.throws(
    () => parseSnapshotArgs(["--input", "part.step", "--output", "part.png", "--theme-settings", "{}"]),
    /Unknown argument: --theme-settings/
  );
  assert.throws(
    () => parseSnapshotArgs(["--input", "part.step", "--output", "part.png", "--preset", "diagnostic"]),
    /Unknown argument: --preset/
  );
});

test("JSON job files can carry custom theme settings", async () => {
  await withTempWorkspace(async (workspaceRoot) => {
    const modelRoot = path.join(workspaceRoot, "models");
    fs.mkdirSync(modelRoot, { recursive: true });
    const inputPath = path.join(modelRoot, "part.glb");
    fs.writeFileSync(inputPath, "glb");
    const jobPath = path.join(workspaceRoot, "job.json");
    fs.writeFileSync(jobPath, JSON.stringify({
      input: "models/part.glb",
      workspaceRoot,
      rootDir: "models",
      mode: "view",
      outputs: [{ path: "/tmp/part.png", width: 320, height: 240 }],
      theme: {
        id: "light",
        settings: {
          materials: {
            defaultColor: "#ff0000"
          }
        }
      }
    }));

    const options = parseSnapshotArgs(["--job", jobPath]);
    const rawJob = await loadJobFromOptions(options);
    const resolved = resolveRenderJob(rawJob, { cwd: workspaceRoot, env: {} });

    assert.equal(resolved.theme.settings.materials.defaultColor, "#ff0000");
    assert.equal(resolved.resolved.kind, "glb");
    assert.equal(resolved.resolved.inputUrl, "/__render_asset/part.glb");
    assert.equal(resolved.outputs[0].width, 320);
  });
});

test("Explorer UI and headless render jobs reuse theme normalization", () => {
  const customSettings = {
    materials: {
      tintColor: "#ff8800",
      fillColors: ["#ff8800", "#0066cc"],
      saturation: 3,
      opacity: 0.72
    },
    edges: {
      enabled: true,
      contrastMode: "auto",
      thickness: 12
    },
    floor: {
      mode: "glass"
    }
  };

  assert.deepEqual(
    normalizeUiThemeSettings(customSettings),
    normalizeCommonThemeSettings(customSettings)
  );
});

test("render jobs pick theme-aware default output sizes", () => {
  return withTempWorkspace((workspaceRoot) => {
    const modelRoot = path.join(workspaceRoot, "models");
    fs.mkdirSync(modelRoot, { recursive: true });
    fs.writeFileSync(path.join(modelRoot, "part.glb"), "glb");

    const resolveFirstOutput = (job) => resolveRenderJob({
      input: "models/part.glb",
      workspaceRoot,
      rootDir: "models",
      outputs: [{ path: "/tmp/part.png" }],
      ...job
    }, { cwd: workspaceRoot, env: {} }).outputs[0];

    assert.deepEqual(
      { width: resolveFirstOutput({ theme: { id: "technical" } }).width, height: resolveFirstOutput({ theme: { id: "technical" } }).height },
      { width: 1600, height: 1200 }
    );
    assert.deepEqual(
      { width: resolveFirstOutput({ theme: { id: "diagnostic" } }).width, height: resolveFirstOutput({ theme: { id: "diagnostic" } }).height },
      { width: 1600, height: 1200 }
    );
    assert.deepEqual(
      { width: resolveFirstOutput({}).width, height: resolveFirstOutput({}).height },
      { width: 1600, height: 1200 }
    );
    assert.deepEqual(
      { width: resolveFirstOutput({ render: { sizeProfile: "simple" } }).width, height: resolveFirstOutput({ render: { sizeProfile: "simple" } }).height },
      { width: 1200, height: 900 }
    );
    assert.deepEqual(
      { width: resolveFirstOutput({ render: { sizeProfile: "simple-square" } }).width, height: resolveFirstOutput({ render: { sizeProfile: "simple-square" } }).height },
      { width: 1024, height: 1024 }
    );
    assert.deepEqual(
      { width: resolveFirstOutput({ mode: "section" }).width, height: resolveFirstOutput({ mode: "section" }).height },
      { width: 1600, height: 1200 }
    );
    assert.deepEqual(
      { width: resolveFirstOutput({ mode: "orbit" }).width, height: resolveFirstOutput({ mode: "orbit" }).height },
      { width: 960, height: 640 }
    );
    assert.deepEqual(
      { width: resolveFirstOutput({ render: { sizeProfile: "assembly-large" } }).width, height: resolveFirstOutput({ render: { sizeProfile: "assembly-large" } }).height },
      { width: 1920, height: 1440 }
    );
    assert.deepEqual(
      { width: resolveFirstOutput({ render: { sizeProfile: "presentation" } }).width, height: resolveFirstOutput({ render: { sizeProfile: "presentation" } }).height },
      { width: 2400, height: 1600 }
    );
    assert.deepEqual(
      { width: resolveFirstOutput({ render: { sizeProfile: "contact-sheet" } }).width, height: resolveFirstOutput({ render: { sizeProfile: "contact-sheet" } }).height },
      { width: 2400, height: 1600 }
    );
  });
});

test("normalizeSnapshotRenderJob is the snapshot-owned render job normalizer", () => {
  return withTempWorkspace((workspaceRoot) => {
    const modelRoot = path.join(workspaceRoot, "models");
    fs.mkdirSync(modelRoot, { recursive: true });
    fs.writeFileSync(path.join(modelRoot, "part.glb"), "glb");

    const rawJob = {
      input: "models/part.glb",
      workspaceRoot,
      rootDir: "models",
      outputs: [{ path: "/tmp/part.png" }]
    };

    assert.deepEqual(
      normalizeSnapshotRenderJob(rawJob, { cwd: workspaceRoot, env: {} }),
      resolveRenderJob(rawJob, { cwd: workspaceRoot, env: {} })
    );
  });
});

test("supported explicit input formats resolve path-targetedly", () => {
  return withTempWorkspace((workspaceRoot) => {
    const modelRoot = path.join(workspaceRoot, "models");
    fs.mkdirSync(modelRoot, { recursive: true });
    const cases = [
      ["part.step", "step"],
      ["part.stp", "stp"],
      ["part.glb", "glb"],
      ["part.stl", "stl"],
      ["part.3mf", "3mf"],
      ["part.dxf", "dxf"],
      ["robot.urdf", "urdf"],
      ["robot.sdf", "sdf"],
      ["robot.srdf", "srdf"]
    ];

    for (const [filename] of cases) {
      fs.writeFileSync(path.join(modelRoot, filename), filename.endsWith(".srdf")
        ? '<robot><explorer:urdf path="robot.urdf"/></robot>'
        : filename);
      if (filename.endsWith(".step") || filename.endsWith(".stp")) {
        fs.writeFileSync(path.join(modelRoot, `.${filename}.glb`), "glb");
      }
    }

    for (const [filename, kind] of cases) {
      const resolved = resolveRenderJob({
        input: `models/${filename}`,
        workspaceRoot,
        rootDir: "models",
        mode: "list"
      }, { cwd: workspaceRoot, env: {} });

      assert.equal(resolved.resolved.kind, kind);
      assert.equal(resolved.resolved.inputUrl, `/__render_asset/${filename}`);
    }
  });
});

test("unsupported render modes are rejected", () => {
  return withTempWorkspace((workspaceRoot) => {
    const modelRoot = path.join(workspaceRoot, "models");
    fs.mkdirSync(modelRoot, { recursive: true });
    fs.writeFileSync(path.join(modelRoot, "part.glb"), "glb");

    assert.throws(
      () => resolveRenderJob({
        input: "models/part.glb",
        workspaceRoot,
        rootDir: "models",
        mode: "explode",
        outputs: [{ path: "/tmp/part.png" }]
      }, { cwd: workspaceRoot, env: {} }),
      /Unsupported render mode: explode/
    );
    assert.throws(
      () => resolveRenderJob({
        input: "models/part.glb",
        workspaceRoot,
        rootDir: "models",
        mode: "wireframe",
        outputs: [{ path: "/tmp/part.png" }]
      }, { cwd: workspaceRoot, env: {} }),
      /Unsupported render mode: wireframe/
    );
  });
});

test("STEP inputs resolve package-local hidden GLB artifacts", () => {
  return withTempWorkspace((workspaceRoot) => {
    const modelRoot = path.join(workspaceRoot, "models");
    fs.mkdirSync(modelRoot, { recursive: true });
    fs.writeFileSync(path.join(modelRoot, "bracket.step"), "step");
    fs.writeFileSync(path.join(modelRoot, ".bracket.step.glb"), "glb");

    const resolved = resolveRenderJob({
      input: "models/bracket.step",
      workspaceRoot,
      rootDir: "models",
      outputs: [{ path: "/tmp/bracket.png" }]
    }, { cwd: workspaceRoot, env: {} });

    assert.equal(resolved.resolved.kind, "step");
    assert.equal(resolved.resolved.inputUrl, "/__render_asset/bracket.step");
    assert.equal(resolved.resolved.glbUrl, "/__render_asset/.bracket.step.glb");
  });
});

test("STEP params resolve adjacent STEP module sidecars", () => {
  return withTempWorkspace((workspaceRoot) => {
    const modelRoot = path.join(workspaceRoot, "models");
    fs.mkdirSync(modelRoot, { recursive: true });
    fs.writeFileSync(path.join(modelRoot, "bracket.step"), "step");
    fs.writeFileSync(path.join(modelRoot, ".bracket.step.glb"), "glb");
    fs.writeFileSync(path.join(modelRoot, ".bracket.step.js"), "export default { manifest: { schemaVersion: 1 } };\n");

    const resolved = resolveRenderJob({
      input: "models/bracket.step",
      workspaceRoot,
      rootDir: "models",
      outputs: [{ path: "/tmp/bracket.png" }],
      params: { drive: 20 }
    }, { cwd: workspaceRoot, env: {} });

    assert.equal(resolved.resolved.stepModuleUrl, "/__render_asset/.bracket.step.js");
    assert.equal(resolved.resolved.stepModulePath, path.join(modelRoot, ".bracket.step.js"));
  });
});

test("animated STEP params use GIF-oriented default output sizing", () => {
  return withTempWorkspace((workspaceRoot) => {
    const modelRoot = path.join(workspaceRoot, "models");
    fs.mkdirSync(modelRoot, { recursive: true });
    fs.writeFileSync(path.join(modelRoot, "bracket.step"), "step");
    fs.writeFileSync(path.join(modelRoot, ".bracket.step.glb"), "glb");
    fs.writeFileSync(path.join(modelRoot, ".bracket.step.js"), "export default { manifest: { schemaVersion: 1 } };\n");

    const resolved = resolveRenderJob({
      input: "models/bracket.step",
      workspaceRoot,
      rootDir: "models",
      outputs: [{ path: "/tmp/bracket.gif" }],
      params: {
        animate: {
          drive: { from: 0, to: 360 }
        }
      }
    }, { cwd: workspaceRoot, env: {} });

    assert.equal(resolved.outputs[0].width, 960);
    assert.equal(resolved.outputs[0].height, 640);
  });
});

test("STEP params require a STEP module sidecar and supported mode", () => {
  return withTempWorkspace((workspaceRoot) => {
    const modelRoot = path.join(workspaceRoot, "models");
    fs.mkdirSync(modelRoot, { recursive: true });
    fs.writeFileSync(path.join(modelRoot, "bracket.step"), "step");
    fs.writeFileSync(path.join(modelRoot, ".bracket.step.glb"), "glb");
    fs.writeFileSync(path.join(modelRoot, "part.glb"), "glb");

    assert.throws(
      () => resolveRenderJob({
        input: "models/bracket.step",
        workspaceRoot,
        rootDir: "models",
        outputs: [{ path: "/tmp/bracket.png" }],
        params: { drive: 20 }
      }, { cwd: workspaceRoot, env: {} }),
      /STEP module sidecar/
    );

    fs.writeFileSync(path.join(modelRoot, ".bracket.step.js"), "export default { manifest: { schemaVersion: 1 } };\n");
    assert.throws(
      () => resolveRenderJob({
        input: "models/bracket.step",
        workspaceRoot,
        rootDir: "models",
        mode: "section",
        outputs: [{ path: "/tmp/bracket.png" }],
        params: { drive: 20 }
      }, { cwd: workspaceRoot, env: {} }),
      /support only view mode/
    );

    assert.throws(
      () => resolveRenderJob({
        input: "models/part.glb",
        workspaceRoot,
        rootDir: "models",
        outputs: [{ path: "/tmp/part.png" }],
        params: { drive: 20 }
      }, { cwd: workspaceRoot, env: {} }),
      /require a STEP\/STP input/
    );
  });
});

test("animated STEP params require one output", () => {
  return withTempWorkspace((workspaceRoot) => {
    const modelRoot = path.join(workspaceRoot, "models");
    fs.mkdirSync(modelRoot, { recursive: true });
    fs.writeFileSync(path.join(modelRoot, "bracket.step"), "step");
    fs.writeFileSync(path.join(modelRoot, ".bracket.step.glb"), "glb");
    fs.writeFileSync(path.join(modelRoot, ".bracket.step.js"), "export default { manifest: { schemaVersion: 1 } };\n");

    assert.throws(
      () => resolveRenderJob({
        input: "models/bracket.step",
        workspaceRoot,
        rootDir: "models",
        outputs: [
          { path: "/tmp/a.gif" },
          { path: "/tmp/b.gif" }
        ],
        params: {
          animate: {
            drive: { from: 0, to: 360 }
          }
        }
      }, { cwd: workspaceRoot, env: {} }),
      /exactly one output/
    );
  });
});

test("daemon arguments parse status and stop commands", () => {
  assert.deepEqual(
    {
      command: parseSnapshotArgs(["daemon", "status"]).command,
      daemonCommand: parseSnapshotArgs(["daemon", "status"]).daemonCommand
    },
    {
      command: "daemon",
      daemonCommand: "status"
    }
  );
  assert.equal(parseSnapshotArgs(["daemon", "stop", "--socket", "/tmp/snapshot.sock"]).socket, "/tmp/snapshot.sock");
});
