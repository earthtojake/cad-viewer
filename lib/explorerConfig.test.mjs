import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_EXPLORER_GITHUB_URL,
  normalizeExplorerDefaultFile,
  normalizeExplorerGithubUrl
} from "./explorerConfig.mjs";

test("normalizeExplorerDefaultFile keeps scan-relative file paths", () => {
  assert.equal(normalizeExplorerDefaultFile("/STEP/sample_part.step/"), "STEP/sample_part.step");
  assert.equal(normalizeExplorerDefaultFile("STEP\\sample_part.step"), "STEP/sample_part.step");
});

test("normalizeExplorerGithubUrl defaults to the project repository", () => {
  assert.equal(normalizeExplorerGithubUrl(""), DEFAULT_EXPLORER_GITHUB_URL);
});

test("normalizeExplorerGithubUrl accepts configured GitHub URLs", () => {
  assert.equal(
    normalizeExplorerGithubUrl("github.com/example/repo"),
    "https://github.com/example/repo"
  );
  assert.equal(
    normalizeExplorerGithubUrl("https://github.com/example/repo/tree/main"),
    "https://github.com/example/repo/tree/main"
  );
});
