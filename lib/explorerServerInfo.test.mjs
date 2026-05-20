import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EXPLORER_SERVER_APP_ID,
  buildExplorerServerInfo,
  isExplorerServerInfo,
  normalizeExplorerPort,
} from "./explorerServerInfo.mjs";

test("buildExplorerServerInfo returns dev-server identity without catalog data", () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cad-explorer-server-"));
  fs.mkdirSync(path.join(workspaceRoot, "models"), { recursive: true });

  const info = buildExplorerServerInfo({
    workspaceRoot,
    rootDir: "models",
    port: 4184,
    pid: 12345,
  });

  assert.deepEqual(info, {
    schemaVersion: 1,
    app: EXPLORER_SERVER_APP_ID,
    workspaceRoot,
    rootDir: "models",
    rootPath: path.join(workspaceRoot, "models"),
    port: 4184,
    pid: 12345,
    url: "http://127.0.0.1:4184",
  });
  assert.equal("entries" in info, false);
  assert.equal("root" in info, false);
  assert.equal(isExplorerServerInfo(info), true);
});

test("normalizeExplorerPort falls back for invalid values", () => {
  assert.equal(normalizeExplorerPort("4180"), 4180);
  assert.equal(normalizeExplorerPort("invalid", 4178), 4178);
  assert.equal(normalizeExplorerPort("70000", 4178), 4178);
});
