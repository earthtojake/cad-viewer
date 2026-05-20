import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_ADAPTIVE_PORT_COUNT,
  DEFAULT_PORT_END,
  buildExplorerUrl,
  buildViteSpawnOptions,
  formatEnsureDevResult,
  parseEnsureDevArgs,
  resolveEnsureDevRequest,
  resolveWorkspaceRoot,
  selectExplorerServer,
} from "./ensure-dev.mjs";
import { DEFAULT_EXPLORER_PORT } from "../lib/explorerServerInfo.mjs";
import {
  readExplorerServerRegistry,
  removeExplorerServerRegistryEntry,
  writeExplorerServerRegistry,
} from "../lib/explorerServerRegistry.mjs";

function makeTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cad-explorer-ensure-"));
}

test("parseEnsureDevArgs accepts launcher options", () => {
  assert.deepEqual(
    parseEnsureDevArgs([
      "--workspace-root", "/tmp/work",
      "--root-dir=models",
      "--file", "sample.step",
      "--port=4180",
      "--port-end", "4188",
      "--json",
    ]),
    {
      workspaceRoot: "/tmp/work",
      rootDir: "models",
      file: "sample.step",
      port: 4180,
      portEnd: 4188,
      json: true,
      help: false,
    }
  );
});

test("resolveWorkspaceRoot prefers explicit root, then INIT_CWD outside the app root", () => {
  const appRoot = path.join(os.tmpdir(), "cad-explorer-app");
  assert.equal(
    resolveWorkspaceRoot({
      workspaceRoot: "explicit",
      cwd: "/tmp",
      appRoot,
      env: { INIT_CWD: "/tmp/from-init" },
    }),
    path.resolve("/tmp", "explicit")
  );
  assert.equal(
    resolveWorkspaceRoot({
      cwd: appRoot,
      appRoot,
      env: { INIT_CWD: "/tmp/from-init" },
    }),
    path.resolve("/tmp/from-init")
  );
});

test("resolveEnsureDevRequest maps workspace-relative files inside root directories", () => {
  const workspaceRoot = makeTempWorkspace();
  fs.mkdirSync(path.join(workspaceRoot, "models"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "models", "sample.step"), "ISO-10303-21;\nEND-ISO-10303-21;\n");

  const request = resolveEnsureDevRequest({
    options: {
      workspaceRoot,
      rootDir: "models",
      file: "models/sample.step",
      port: 4180,
      portEnd: 4182,
    },
    cwd: workspaceRoot,
    env: {},
  });

  assert.equal(request.workspaceRoot, workspaceRoot);
  assert.equal(request.rootDir, "models");
  assert.equal(request.rootPath, path.join(workspaceRoot, "models"));
  assert.equal(request.fileParam, "sample.step");
  assert.equal(request.port, 4180);
  assert.equal(request.portEnd, 4182);
});

test("resolveEnsureDevRequest expands the default port search window", () => {
  const workspaceRoot = makeTempWorkspace();
  fs.mkdirSync(path.join(workspaceRoot, "models"), { recursive: true });

  const request = resolveEnsureDevRequest({
    options: {
      workspaceRoot,
      rootDir: "models",
    },
    cwd: workspaceRoot,
    env: {},
  });

  assert.equal(request.port, DEFAULT_EXPLORER_PORT);
  assert.equal(request.portEnd, Math.max(DEFAULT_PORT_END, DEFAULT_EXPLORER_PORT + DEFAULT_ADAPTIVE_PORT_COUNT));

  const configured = resolveEnsureDevRequest({
    options: {
      workspaceRoot,
      rootDir: "models",
    },
    cwd: workspaceRoot,
    env: { EXPLORER_PORT_END: "4180" },
  });
  assert.equal(configured.portEnd, 4180);
});

test("resolveEnsureDevRequest maps scan-root-relative and absolute file paths", () => {
  const workspaceRoot = makeTempWorkspace();
  const filePath = path.join(workspaceRoot, "models", "nested", "sample part.step");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "ISO-10303-21;\nEND-ISO-10303-21;\n");

  const scanRelative = resolveEnsureDevRequest({
    options: {
      workspaceRoot,
      rootDir: "models",
      file: "nested/sample part.step",
    },
    cwd: workspaceRoot,
    env: {},
  });
  assert.equal(scanRelative.fileParam, "nested/sample part.step");

  const absolute = resolveEnsureDevRequest({
    options: {
      workspaceRoot,
      rootDir: "models",
      file: filePath,
    },
    cwd: workspaceRoot,
    env: {},
  });
  assert.equal(absolute.fileParam, "nested/sample part.step");
});

test("resolveEnsureDevRequest rejects files outside the scan root", () => {
  const workspaceRoot = makeTempWorkspace();
  fs.mkdirSync(path.join(workspaceRoot, "models"), { recursive: true });
  assert.throws(() => resolveEnsureDevRequest({
    options: {
      workspaceRoot,
      rootDir: "models",
      file: "../outside.step",
    },
    cwd: workspaceRoot,
    env: {},
  }), /inside the scan root/);
});

test("buildExplorerUrl adds scan-root-relative file params", () => {
  assert.equal(
    buildExplorerUrl(
      { url: "http://127.0.0.1:4180", port: 4180 },
      "nested/arm step.step"
    ),
    "http://127.0.0.1:4180/?file=nested/arm%20step.step"
  );
});

test("selectExplorerServer reuses matching explorer roots", async () => {
  const rootPath = path.resolve("/tmp/work-a");
  const selection = await selectExplorerServer({
    rootPath,
    port: 4178,
    portEnd: 4180,
    probeServer: async (port) => port === 4178
      ? { app: "cad-explorer", rootPath, port, url: "http://127.0.0.1:4178" }
      : null,
    canBind: async () => {
      throw new Error("canBind should not be called for a matching Explorer");
    },
  });

  assert.equal(selection.action, "reuse");
  assert.equal(selection.port, 4178);
});

test("selectExplorerServer scans the full range for reusable explorers before binding", async () => {
  const rootPath = path.resolve("/tmp/work-a");
  const selection = await selectExplorerServer({
    rootPath,
    port: 4178,
    portEnd: 4180,
    probeServer: async (port) => port === 4180
      ? { app: "cad-explorer", rootPath, port, url: "http://127.0.0.1:4180" }
      : null,
    canBind: async () => {
      throw new Error("canBind should not be called before a later reusable Explorer is checked");
    },
  });

  assert.equal(selection.action, "reuse");
  assert.equal(selection.port, 4180);
});

test("selectExplorerServer reuses registered explorers when live probes are blocked", async () => {
  const rootPath = path.resolve("/tmp/work-a");
  const selection = await selectExplorerServer({
    rootPath,
    port: 4178,
    portEnd: 4180,
    probeServer: async () => null,
    canBind: async () => {
      throw new Error("canBind should not be called when a registered Explorer matches");
    },
    registeredServers: [
      { app: "cad-explorer", rootPath, port: 4180, pid: process.pid, url: "http://127.0.0.1:4180" }
    ],
  });

  assert.equal(selection.action, "reuse");
  assert.equal(selection.port, 4180);
});

test("selectExplorerServer skips different roots and starts on the first free port", async () => {
  const selection = await selectExplorerServer({
    rootPath: path.resolve("/tmp/work-b"),
    port: 4178,
    portEnd: 4180,
    probeServer: async (port) => port === 4178
      ? { app: "cad-explorer", rootPath: path.resolve("/tmp/work-a"), port, url: "http://127.0.0.1:4178" }
      : null,
    canBind: async (port) => port === 4179,
  });

  assert.equal(selection.action, "start");
  assert.equal(selection.port, 4179);
});

test("selectExplorerServer explains sandbox binding denials", async () => {
  await assert.rejects(
    selectExplorerServer({
      rootPath: path.resolve("/tmp/work-c"),
      port: 4178,
      portEnd: 4179,
      probeServer: async () => null,
      canBind: async (port) => ({ canBind: false, errorCode: "EPERM", message: `bind ${port}` }),
    }),
    /local port binding was denied.*EPERM/
  );
});

test("explorer server registry records live servers and removes stale entries", () => {
  const registryPath = path.join(makeTempWorkspace(), "servers.json");
  const liveServer = {
    schemaVersion: 1,
    app: "cad-explorer",
    workspaceRoot: "/tmp/workspace",
    rootDir: "models",
    rootPath: "/tmp/workspace/models",
    port: 4178,
    pid: process.pid,
    url: "http://127.0.0.1:4178",
  };
  const staleServer = {
    ...liveServer,
    port: 4179,
    pid: 999999999,
    url: "http://127.0.0.1:4179",
  };

  assert.equal(writeExplorerServerRegistry(staleServer, { registryPath }), true);
  assert.equal(writeExplorerServerRegistry(liveServer, { registryPath }), true);
  assert.deepEqual(
    readExplorerServerRegistry({ registryPath }).map((server) => server.port),
    [4178]
  );

  assert.equal(removeExplorerServerRegistryEntry(liveServer, { registryPath }), true);
  assert.deepEqual(readExplorerServerRegistry({ registryPath }), []);
});

test("buildViteSpawnOptions starts native Vite with explicit Explorer environment", () => {
  const spawnOptions = buildViteSpawnOptions({
    workspaceRoot: "/tmp/workspace",
    rootDir: "models",
    port: 4182,
    env: { PATH: "/bin" },
  });

  assert.equal(spawnOptions.command, process.execPath);
  assert.equal(spawnOptions.args.at(-1), "dev");
  assert.equal(spawnOptions.options.env.EXPLORER_WORKSPACE_ROOT, "/tmp/workspace");
  assert.equal(spawnOptions.options.env.EXPLORER_ROOT_DIR, "models");
  assert.equal(spawnOptions.options.env.EXPLORER_PORT, "4182");
  assert.equal(spawnOptions.options.detached, true);
});

test("formatEnsureDevResult can print JSON payloads", () => {
  assert.deepEqual(
    JSON.parse(formatEnsureDevResult({
      action: "reused",
      serverInfo: {
        app: "cad-explorer",
        rootPath: "/tmp/work",
        port: 4178,
        url: "http://127.0.0.1:4178",
      },
      fileParam: "part.step",
      json: true,
    })),
    {
      action: "reused",
      url: "http://127.0.0.1:4178/?file=part.step",
      server: {
        app: "cad-explorer",
        rootPath: "/tmp/work",
        port: 4178,
        url: "http://127.0.0.1:4178",
      },
    }
  );
});
