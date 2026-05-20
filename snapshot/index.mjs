#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_EXPLORER_ROOT_DIR,
  normalizeExplorerRootDir,
  resolveExplorerRoot,
} from "../lib/cadDirectoryScanner.mjs";
import {
  stepGlbArtifactPathForSource,
  stepModulePathForStepSource
} from "../common/stepSidecars.mjs";
import {
  encodePathParam,
  pathIsInsideOrEqual,
  resolveWorkspaceRoot as resolveViewerWorkspaceRoot,
} from "../lib/pathUtils.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const explorerAppRoot = path.resolve(scriptDir, "..");
const defaultWorkspaceRoot = path.resolve(explorerAppRoot, "../../../..");
const commonRoot = path.join(explorerAppRoot, "common");
const libRoot = path.join(explorerAppRoot, "lib");
const nodeModulesRoot = path.join(explorerAppRoot, "node_modules");
const SIMPLE_RENDER_WIDTH = 1200;
const SIMPLE_RENDER_HEIGHT = 900;
const SIMPLE_SQUARE_RENDER_WIDTH = 1024;
const SIMPLE_SQUARE_RENDER_HEIGHT = 1024;
const DIAGNOSTIC_RENDER_WIDTH = 1600;
const DIAGNOSTIC_RENDER_HEIGHT = 1200;
const COMPLEX_ASSEMBLY_RENDER_WIDTH = 1800;
const COMPLEX_ASSEMBLY_RENDER_HEIGHT = 1200;
const COMPLEX_ASSEMBLY_LARGE_RENDER_WIDTH = 1920;
const COMPLEX_ASSEMBLY_LARGE_RENDER_HEIGHT = 1440;
const PRESENTATION_RENDER_WIDTH = 2400;
const PRESENTATION_RENDER_HEIGHT = 1600;
const PRESENTATION_LARGE_RENDER_WIDTH = 2800;
const PRESENTATION_LARGE_RENDER_HEIGHT = 1800;
const ORBIT_RENDER_WIDTH = 960;
const ORBIT_RENDER_HEIGHT = 640;
const CONTACT_SHEET_RENDER_WIDTH = 2400;
const CONTACT_SHEET_RENDER_HEIGHT = 1600;
const DEFAULT_RENDER_THEME_ID = "technical";
const DEFAULT_TIMEOUT_SECONDS = 300;
const SUPPORTED_RENDER_MODES = new Set(["view", "orbit", "section", "list"]);
const RENDER_DAEMON_PROTOCOL_VERSION = 1;
const RENDER_DAEMON_IDLE_TIMEOUT_SECONDS = 600;
const RENDER_DAEMON_MAX_JOBS = 100;

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasStepModuleRenderParams(value) {
  return value !== undefined && value !== null;
}

function stepModuleRenderParamsAreAnimated(rawParams) {
  return isObject(rawParams) && isObject(rawParams.animate) && Object.keys(rawParams.animate).length > 0;
}

function resolveWorkspaceRoot({
  workspaceRoot = "",
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  return resolveViewerWorkspaceRoot({
    workspaceRoot,
    env,
    cwd,
    appRoot: explorerAppRoot,
    defaultWorkspaceRoot,
  });
}

function parseRequiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseSnapshotArgs(argv = []) {
  const options = {
    command: "snapshot",
    daemonCommand: "",
    socket: "",
    job: "",
    input: "",
    output: "",
    mode: "view",
    theme: DEFAULT_RENDER_THEME_ID,
    camera: "iso",
    width: null,
    height: null,
    sizeProfile: "",
    params: undefined,
    paramsSpecified: false,
    workspaceRoot: "",
    rootDir: "",
    noDaemon: false,
    viewLabels: false,
    json: false,
    help: false,
  };

  if (argv[0] === "daemon") {
    options.command = "daemon";
    options.daemonCommand = argv[1] || "";
    for (let index = 2; index < argv.length; index += 1) {
      const arg = argv[index];
      if (arg === "--socket") {
        options.socket = parseRequiredValue(argv, index, arg);
        index += 1;
        continue;
      }
      if (arg.startsWith("--socket=")) {
        options.socket = arg.slice("--socket=".length);
        continue;
      }
      if (arg === "--help" || arg === "-h") {
        options.help = true;
        continue;
      }
      throw new Error(`Unknown daemon argument: ${arg}`);
    }
    return options;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--no-daemon") {
      options.noDaemon = true;
      continue;
    }
    if (arg === "--view-labels") {
      options.viewLabels = true;
      continue;
    }
    if (arg === "--job") {
      options.job = parseRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--job=")) {
      options.job = arg.slice("--job=".length);
      continue;
    }
    if (arg === "--input") {
      options.input = parseRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      continue;
    }
    if (arg === "--output") {
      options.output = parseRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === "-o") {
      options.output = parseRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }
    if (arg === "--mode") {
      options.mode = parseRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
      continue;
    }
    if (arg === "--theme") {
      options.theme = parseRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--theme=")) {
      options.theme = arg.slice("--theme=".length);
      continue;
    }
    if (arg === "--params") {
      options.params = parseRequiredValue(argv, index, arg);
      options.paramsSpecified = true;
      index += 1;
      continue;
    }
    if (arg.startsWith("--params=")) {
      options.params = arg.slice("--params=".length);
      options.paramsSpecified = true;
      continue;
    }
    if (arg === "--size-profile") {
      options.sizeProfile = parseRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--size-profile=")) {
      options.sizeProfile = arg.slice("--size-profile=".length);
      continue;
    }
    if (arg === "--camera") {
      options.camera = parseRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--camera=")) {
      options.camera = arg.slice("--camera=".length);
      continue;
    }
    if (arg === "--width") {
      options.width = positiveInteger(parseRequiredValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--width=")) {
      options.width = positiveInteger(arg.slice("--width=".length), "--width");
      continue;
    }
    if (arg === "--height") {
      options.height = positiveInteger(parseRequiredValue(argv, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--height=")) {
      options.height = positiveInteger(arg.slice("--height=".length), "--height");
      continue;
    }
    if (arg === "--workspace-root") {
      options.workspaceRoot = parseRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--workspace-root=")) {
      options.workspaceRoot = arg.slice("--workspace-root=".length);
      continue;
    }
    if (arg === "--root-dir") {
      options.rootDir = parseRequiredValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--root-dir=")) {
      options.rootDir = arg.slice("--root-dir=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function positiveInteger(value, label) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function helpText() {
  return `Usage:
  npm run snapshot -- --job render-job.json
  npm run snapshot -- --job -
  npm run snapshot -- --input models/part.step --output /tmp/part.png --theme technical
  npm run snapshot -- daemon status
  npm run snapshot -- daemon stop

Shortcut flags are for theme-based snapshots only. The default theme is technical. --theme accepts a built-in theme name, an inline JSON theme object, or a JSON theme file path. Put solid/wire output in theme.display.mode. Use --view-labels to burn the camera/view label into shortcut outputs. Use --params with STEP module sidecar JSON params, and --size-profile for default dimensions such as simple, diagnostic, labeled, assembly, presentation, orbit, or contact-sheet.
`;
}

async function readStdin(stdin = process.stdin) {
  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function applyOptionOverridesToJob(job, options) {
  if (!options.viewLabels && !options.sizeProfile && !options.paramsSpecified) {
    return job;
  }
  const render = job.render && typeof job.render === "object" ? job.render : {};
  return {
    ...job,
    ...(options.paramsSpecified ? { params: parseParamsOption(options.params) } : {}),
    render: {
      ...render,
      ...(options.viewLabels ? { viewLabels: true } : {}),
      ...(options.sizeProfile ? { sizeProfile: options.sizeProfile } : {})
    }
  };
}

function parseParamsOption(rawParams) {
  try {
    const parsed = JSON.parse(String(rawParams || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("params must be a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(`--params must be a JSON object: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadThemeOption(rawTheme, { cwd = process.cwd() } = {}) {
  const theme = String(rawTheme || DEFAULT_RENDER_THEME_ID).trim() || DEFAULT_RENDER_THEME_ID;
  if (theme.startsWith("{")) {
    return normalizeThemePayload(JSON.parse(theme), theme);
  }
  const themePath = path.isAbsolute(theme) ? theme : path.resolve(cwd, theme);
  const looksLikeThemeFile = theme.toLowerCase().endsWith(".json") || theme.includes("/") || theme.includes(path.sep);
  if (!looksLikeThemeFile && !fs.existsSync(themePath)) {
    return {
      id: theme,
      settings: null
    };
  }
  if (!fs.existsSync(themePath)) {
    throw new Error(`Theme JSON file does not exist: ${theme}`);
  }
  return normalizeThemePayload(JSON.parse(fs.readFileSync(themePath, "utf8")), themePath);
}

function normalizeThemePayload(parsed, sourceLabel) {
  const payload = parsed?.theme && typeof parsed.theme === "object" ? parsed.theme : parsed;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Theme JSON must contain a theme object: ${sourceLabel}`);
  }
  return {
    id: String(payload.id || (String(sourceLabel).endsWith(".json") ? path.basename(sourceLabel, path.extname(sourceLabel)) : "custom")),
    settings: payload.settings && typeof payload.settings === "object" ? payload.settings : payload
  };
}

export async function loadJobFromOptions(options, { stdin = process.stdin, cwd = process.cwd() } = {}) {
  if (options.job) {
    const text = options.job === "-"
      ? await readStdin(stdin)
      : fs.readFileSync(path.resolve(cwd, options.job), "utf8");
    return applyOptionOverridesToJob(JSON.parse(text), options);
  }
  if (!stdin.isTTY && !options.input) {
    const text = await readStdin(stdin);
    if (text.trim()) {
      return applyOptionOverridesToJob(JSON.parse(text), options);
    }
  }
  if (!options.input) {
    throw new Error("render requires --job, stdin JSON, or --input");
  }
  if (options.mode !== "list" && !options.output) {
    throw new Error("render shortcut requires --output for non-list modes");
  }
  const output = {
    path: options.output,
    camera: options.camera
  };
  if (options.width) {
    output.width = options.width;
  }
  if (options.height) {
    output.height = options.height;
  }
  return {
    input: options.input,
    workspaceRoot: options.workspaceRoot || "",
    rootDir: options.rootDir || "",
    mode: options.mode,
    outputs: options.mode === "list"
      ? []
      : [output],
    theme: loadThemeOption(options.theme, { cwd }),
    ...(options.paramsSpecified ? { params: parseParamsOption(options.params) } : {}),
    render: {
      viewLabels: options.viewLabels,
      ...(options.sizeProfile ? { sizeProfile: options.sizeProfile } : {})
    }
  };
}

function inputKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".step") {
    return "step";
  }
  if (extension === ".stp") {
    return "stp";
  }
  if (extension === ".3mf") {
    return "3mf";
  }
  return extension.replace(/^\./, "");
}

function resolveInputPath(rawInput, { workspaceRoot, rootPath, cwd }) {
  const candidates = [];
  if (path.isAbsolute(rawInput)) {
    candidates.push(path.resolve(rawInput));
  } else {
    candidates.push(path.resolve(workspaceRoot, rawInput));
    candidates.push(path.resolve(rootPath, rawInput));
    candidates.push(path.resolve(cwd, rawInput));
  }
  const uniqueCandidates = [...new Set(candidates)];
  const existing = uniqueCandidates.find((candidate) => fs.existsSync(candidate));
  const selected = existing || uniqueCandidates[0];
  if (!pathIsInsideOrEqual(selected, rootPath)) {
    throw new Error(`Render input must be inside the Explorer scan root: ${rawInput}`);
  }
  if (!fs.existsSync(selected)) {
    throw new Error(`Render input does not exist: ${rawInput}`);
  }
  return selected;
}

function assetUrlForPath(filePath, rootPath) {
  if (!pathIsInsideOrEqual(filePath, rootPath)) {
    throw new Error(`Render asset must be inside the Explorer scan root: ${filePath}`);
  }
  return `/__render_asset/${encodePathParam(path.relative(rootPath, filePath))}`;
}

function resolveSrdfUrdfPath(srdfPath, rootPath) {
  const text = fs.readFileSync(srdfPath, "utf8");
  const match = text.match(/<explorer:urdf\b[^>]*\bpath=["']([^"']+)["']/)
    || text.match(/<urdf\b[^>]*\bpath=["']([^"']+)["']/);
  const candidates = [];
  if (match?.[1]) {
    const raw = match[1];
    candidates.push(path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(rootPath, raw));
    candidates.push(path.resolve(path.dirname(srdfPath), raw));
  }
  candidates.push(path.join(path.dirname(srdfPath), `${path.basename(srdfPath, path.extname(srdfPath))}.urdf`));
  const urdfPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!urdfPath) {
    throw new Error(`SRDF render input must reference an existing URDF: ${srdfPath}`);
  }
  if (!pathIsInsideOrEqual(urdfPath, rootPath)) {
    throw new Error(`SRDF-linked URDF must be inside the Explorer scan root: ${urdfPath}`);
  }
  return urdfPath;
}

function themeIdForJob(job = {}) {
  const theme = job.theme;
  if (typeof theme === "string") {
    return theme.trim().toLowerCase() || DEFAULT_RENDER_THEME_ID;
  }
  if (theme && typeof theme === "object") {
    return String(theme.id || "").trim().toLowerCase() || DEFAULT_RENDER_THEME_ID;
  }
  return DEFAULT_RENDER_THEME_ID;
}

function normalizeSizeProfile(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function explicitSizeProfile(job = {}, output = {}) {
  return normalizeSizeProfile(
    output.sizeProfile
      || job.render?.sizeProfile
      || job.sizeProfile
      || ""
  );
}

function defaultRenderSize(job = {}, output = {}) {
  const mode = String(job.mode || "view").trim().toLowerCase();
  const profile = explicitSizeProfile(job, output);
  if (profile === "simple-square" || profile === "square") {
    return { width: SIMPLE_SQUARE_RENDER_WIDTH, height: SIMPLE_SQUARE_RENDER_HEIGHT };
  }
  if (profile === "simple" || profile === "simple-part" || profile === "unlabeled") {
    return { width: SIMPLE_RENDER_WIDTH, height: SIMPLE_RENDER_HEIGHT };
  }
  if (profile === "presentation-large" || profile === "hero" || profile === "large-presentation") {
    return { width: PRESENTATION_LARGE_RENDER_WIDTH, height: PRESENTATION_LARGE_RENDER_HEIGHT };
  }
  if (profile === "presentation") {
    return { width: PRESENTATION_RENDER_WIDTH, height: PRESENTATION_RENDER_HEIGHT };
  }
  if (profile === "complex-assembly-large" || profile === "assembly-large") {
    return { width: COMPLEX_ASSEMBLY_LARGE_RENDER_WIDTH, height: COMPLEX_ASSEMBLY_LARGE_RENDER_HEIGHT };
  }
  if (profile === "complex-assembly" || profile === "assembly") {
    return { width: COMPLEX_ASSEMBLY_RENDER_WIDTH, height: COMPLEX_ASSEMBLY_RENDER_HEIGHT };
  }
  if (profile === "contact-sheet" || profile === "contactsheet") {
    return { width: CONTACT_SHEET_RENDER_WIDTH, height: CONTACT_SHEET_RENDER_HEIGHT };
  }
  if (profile === "orbit" || mode === "orbit" || stepModuleRenderParamsAreAnimated(job.params)) {
    return { width: ORBIT_RENDER_WIDTH, height: ORBIT_RENDER_HEIGHT };
  }
  if (
    profile === "dimensioned"
    || profile === "section"
    || profile === "labeled"
    || mode === "section"
    || job.render?.viewLabels === true
    || output.viewLabel
    || output.label
  ) {
    return { width: DIAGNOSTIC_RENDER_WIDTH, height: DIAGNOSTIC_RENDER_HEIGHT };
  }
  if (profile === "diagnostic" || ["diagnostic", DEFAULT_RENDER_THEME_ID].includes(themeIdForJob(job))) {
    return { width: DIAGNOSTIC_RENDER_WIDTH, height: DIAGNOSTIC_RENDER_HEIGHT };
  }
  return { width: SIMPLE_RENDER_WIDTH, height: SIMPLE_RENDER_HEIGHT };
}

function resolveOutputSize(job = {}, output = {}) {
  const defaults = defaultRenderSize(job, output);
  return {
    width: positiveInteger(output?.width || job.width || defaults.width, "output width"),
    height: positiveInteger(output?.height || job.height || defaults.height, "output height")
  };
}

export function resolveRenderJob(rawJob, {
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const job = rawJob && typeof rawJob === "object" ? structuredClone(rawJob) : {};
  const workspaceRoot = resolveWorkspaceRoot({
    workspaceRoot: job.workspaceRoot,
    env,
    cwd,
  });
  const rootDir = normalizeExplorerRootDir(job.rootDir || env.EXPLORER_ROOT_DIR || DEFAULT_EXPLORER_ROOT_DIR);
  const { rootPath } = resolveExplorerRoot(workspaceRoot, rootDir);
  const input = String(job.input || "").trim();
  if (!input) {
    throw new Error("render job is missing input");
  }
  const inputPath = resolveInputPath(input, { workspaceRoot, rootPath, cwd });
  const kind = inputKind(inputPath);
  const hasParamRender = hasStepModuleRenderParams(job.params);
  const animatedParams = stepModuleRenderParamsAreAnimated(job.params);
  const resolved = {
    workspaceRoot,
    rootDir,
    rootPath,
    inputPath,
    inputUrl: assetUrlForPath(inputPath, rootPath),
    kind
  };
  if (kind === "step" || kind === "stp") {
    const glbPath = stepGlbArtifactPathForSource(inputPath, { existsSync: fs.existsSync });
    if (!fs.existsSync(glbPath)) {
      throw new Error(`STEP/STP render input is missing its Explorer GLB artifact: ${glbPath}`);
    }
    resolved.glbPath = glbPath;
    resolved.glbUrl = assetUrlForPath(glbPath, rootPath);
  }
  if (hasParamRender) {
    if (kind !== "step" && kind !== "stp") {
      throw new Error("render params require a STEP/STP input with an Explorer STEP module sidecar");
    }
    const stepModulePath = stepModulePathForStepSource(inputPath);
    if (!fs.existsSync(stepModulePath)) {
      throw new Error(`STEP/STP render params require an Explorer STEP module sidecar: ${stepModulePath}`);
    }
    resolved.stepModulePath = stepModulePath;
    resolved.stepModuleUrl = assetUrlForPath(stepModulePath, rootPath);
  }
  if (kind === "srdf") {
    const urdfPath = resolveSrdfUrdfPath(inputPath, rootPath);
    resolved.urdfPath = urdfPath;
    resolved.urdfUrl = assetUrlForPath(urdfPath, rootPath);
  }
  const mode = String(job.mode || "view").trim().toLowerCase();
  if (!SUPPORTED_RENDER_MODES.has(mode)) {
    throw new Error(`Unsupported render mode: ${mode || "(missing)"}`);
  }
  const rawRender = job.render && typeof job.render === "object" ? job.render : {};
  const normalizedRender = { ...rawRender };
  const rawScale = String(
    rawRender.scale ||
    rawRender.sceneScale ||
    rawRender.sceneScaleMode ||
    job.scale ||
    job.sceneScale ||
    ""
  ).trim().toLowerCase();
  if (rawScale) {
    normalizedRender.scale = rawScale === "urdf" ? "urdf" : "cad";
  }
  const rawClip = rawRender.clip || job.clip || rawRender.clipSettings || job.clipSettings || null;
  if (rawClip && typeof rawClip === "object") {
    normalizedRender.clip = rawClip;
  }
  const normalizedParameters = job.parameters || job.stepModuleRuntime || null;
  if (hasParamRender && mode !== "view") {
    throw new Error("render params support only view mode; set theme.display.mode for solid or wire output");
  }
  const outputs = Array.isArray(job.outputs) ? job.outputs : [];
  if (mode !== "list" && outputs.length === 0) {
    throw new Error("render job must include outputs for non-list modes");
  }
  if (animatedParams && outputs.length !== 1) {
    throw new Error("animated render params require exactly one output");
  }
  const normalizedOutputs = outputs.map((output) => {
    const { width, height } = resolveOutputSize({ ...job, mode }, output);
    return {
      ...output,
      path: output?.path ? path.resolve(cwd, String(output.path)) : "",
      width,
      height,
      camera: output?.camera || job.camera || "iso"
    };
  });
  return {
    ...job,
    mode,
    render: normalizedRender,
    ...(normalizedParameters ? { parameters: normalizedParameters } : {}),
    workspaceRoot,
    rootDir,
    outputs: normalizedOutputs,
    resolved
  };
}

export function normalizeSnapshotRenderJob(rawJob, options = {}) {
  return resolveRenderJob(rawJob, options);
}

function contentTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }
  if (extension === ".js" || extension === ".mjs") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }
  if (extension === ".wasm") {
    return "application/wasm";
  }
  if (extension === ".stl") {
    return "model/stl";
  }
  if (extension === ".glb") {
    return "model/gltf-binary";
  }
  return "application/octet-stream";
}

function sendText(res, statusCode, text) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(text);
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "not found");
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-type", contentTypeForPath(filePath));
  res.setHeader("cache-control", "no-store");
  fs.createReadStream(filePath).pipe(res);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("error", reject);
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

class RenderHttpServer {
  constructor() {
    this.job = null;
    this.resultResolve = null;
    this.resultReject = null;
    this.sockets = new Set();
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        sendText(res, 500, error instanceof Error ? error.message : String(error));
      });
    });
    this.server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.on("close", () => {
        this.sockets.delete(socket);
      });
    });
  }

  async start() {
    await new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = this.server.address();
    this.url = `http://127.0.0.1:${port}/render.html`;
  }

  beginJob(job) {
    this.job = job;
    return new Promise((resolve, reject) => {
      this.resultResolve = resolve;
      this.resultReject = reject;
    });
  }

  clearJob() {
    this.job = null;
    this.resultResolve = null;
    this.resultReject = null;
  }

  async close() {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    await new Promise((resolve) => this.server.close(resolve));
  }

  async handleRequest(req, res) {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1/");
    if (req.method === "GET" && requestUrl.pathname === "/render.html") {
      serveFile(res, path.join(commonRoot, "render.html"));
      return;
    }
    if (req.method === "GET" && requestUrl.pathname === "/job") {
      if (!this.job) {
        sendText(res, 404, "no active render job");
        return;
      }
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify(this.job));
      return;
    }
    if (req.method === "POST" && requestUrl.pathname === "/result") {
      const body = await readRequestBody(req);
      const result = JSON.parse(body);
      this.resultResolve?.(result);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "GET" && requestUrl.pathname.startsWith("/__render_asset/")) {
      if (!this.job) {
        sendText(res, 404, "no active render job");
        return;
      }
      const relativePath = decodeURIComponent(requestUrl.pathname.slice("/__render_asset/".length));
      const filePath = path.resolve(this.job.resolved.rootPath, relativePath);
      if (!pathIsInsideOrEqual(filePath, this.job.resolved.rootPath)) {
        sendText(res, 403, "forbidden");
        return;
      }
      serveFile(res, filePath);
      return;
    }
    for (const [prefix, root] of [
      ["/common/", commonRoot],
      ["/lib/", libRoot],
      ["/node_modules/", nodeModulesRoot],
    ]) {
      if (req.method === "GET" && requestUrl.pathname.startsWith(prefix)) {
        const relativePath = decodeURIComponent(requestUrl.pathname.slice(prefix.length));
        const filePath = path.resolve(root, relativePath);
        if (!pathIsInsideOrEqual(filePath, root)) {
          sendText(res, 403, "forbidden");
          return;
        }
        serveFile(res, filePath);
        return;
      }
    }
    sendText(res, 404, "not found");
  }
}

class BrowserRenderWorker {
  constructor() {
    this.playwright = null;
    this.browser = null;
    this.server = null;
    this.started = false;
    this.queue = Promise.resolve();
  }

  async start() {
    if (this.started) {
      return;
    }
    const playwrightModule = await import("playwright").catch((error) => {
      throw new Error(`CAD Explorer render requires the playwright package: ${error.message}`);
    });
    this.playwright = playwrightModule;
    this.browser = await this.playwright.chromium.launch({ headless: true });
    this.server = new RenderHttpServer();
    await this.server.start();
    this.started = true;
  }

  async render(job) {
    const result = this.queue.then(() => this.renderNow(job));
    this.queue = result.catch(() => {});
    return result;
  }

  async renderNow(job) {
    await this.start();
    const timeoutSeconds = Number(job.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS);
    const resultPromise = this.server.beginJob(job);
    const context = await this.browser.newContext({
      viewport: {
        width: Math.max(...(job.outputs || [{ width: SIMPLE_RENDER_WIDTH }]).map((output) => Number(output.width) || SIMPLE_RENDER_WIDTH), SIMPLE_RENDER_WIDTH),
        height: Math.max(...(job.outputs || [{ height: SIMPLE_RENDER_HEIGHT }]).map((output) => Number(output.height) || SIMPLE_RENDER_HEIGHT), SIMPLE_RENDER_HEIGHT),
      },
      deviceScaleFactor: 1,
    });
    try {
      const page = await context.newPage();
      await page.goto(this.server.url, {
        waitUntil: "load",
        timeout: Math.max(1, timeoutSeconds * 1000),
      });
      const result = await Promise.race([
        resultPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`snapshot timed out after ${timeoutSeconds}s`)), timeoutSeconds * 1000)),
      ]);
      if (!result?.ok) {
        throw new Error(result?.error || "unknown browser snapshot failure");
      }
      return result;
    } finally {
      await context.close().catch(() => {});
      this.server.clearJob();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
    this.browser = null;
    if (this.server) {
      await this.server.close().catch(() => {});
    }
    this.server = null;
    this.started = false;
  }
}

function snapshotDaemonSocketPath() {
  const digest = crypto.createHash("sha256")
    .update(`${process.execPath}|${scriptPath}|${explorerAppRoot}`)
    .digest("hex")
    .slice(0, 16);
  return path.join(os.tmpdir(), `cad-viewer-snapshotd-${process.getuid?.() || 0}-${digest}.sock`);
}

function daemonRenderTimeoutMs(job) {
  return (Number(job.timeoutSeconds || DEFAULT_TIMEOUT_SECONDS) + 5) * 1000;
}

function sendDaemonRequest(socketPath, request, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    const timer = setTimeout(() => {
      client.destroy();
      reject(new Error("snapshot daemon request timed out"));
    }, timeoutMs);
    let data = "";
    client.on("connect", () => {
      client.write(`${JSON.stringify({ protocolVersion: RENDER_DAEMON_PROTOCOL_VERSION, ...request })}\n`);
    });
    client.on("data", (chunk) => {
      data += chunk.toString("utf8");
      if (data.includes("\n")) {
        clearTimeout(timer);
        client.end();
        try {
          resolve(JSON.parse(data.trim()));
        } catch (error) {
          reject(error);
        }
      }
    });
    client.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function daemonFailureIsRestartable(response) {
  return /protocol version mismatch/i.test(String(response?.error || ""));
}

async function requestDaemonRender(socketPath, job) {
  let response;
  try {
    response = await sendDaemonRequest(socketPath, { command: "render", job }, daemonRenderTimeoutMs(job));
  } catch (error) {
    if (error && typeof error === "object") {
      error.daemonRestartable = true;
    }
    throw error;
  }
  if (!response.ok) {
    const error = new Error(response.error || "snapshot daemon failed");
    error.daemonRestartable = daemonFailureIsRestartable(response);
    throw error;
  }
  return response;
}

async function waitForDaemon(socketPath, processHandle) {
  const deadline = Date.now() + 15000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`snapshot daemon exited before ready with code ${processHandle.exitCode}`);
    }
    try {
      const response = await sendDaemonRequest(socketPath, { command: "status" }, 500);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`snapshot daemon did not become ready: ${lastError?.message || "timeout"}`);
}

async function renderViaDaemon(job) {
  const socketPath = snapshotDaemonSocketPath();
  try {
    const response = await requestDaemonRender(socketPath, job);
    return {
      ...response.result,
      timings: {
        ...(response.result?.timings || {}),
        daemon: "warm"
      }
    };
  } catch (error) {
    if (!error?.daemonRestartable) {
      throw error;
    }
    fs.rmSync(socketPath, { force: true });
    const child = spawn(process.execPath, [scriptPath, "daemon", "run", "--socket", socketPath], {
      detached: true,
      stdio: "ignore",
      cwd: process.cwd(),
      env: process.env,
    });
    child.unref();
    await waitForDaemon(socketPath, child);
    const response = await requestDaemonRender(socketPath, job);
    return {
      ...response.result,
      timings: {
        ...(response.result?.timings || {}),
        daemon: "started"
      }
    };
  }
}

async function renderOnce(job) {
  const worker = new BrowserRenderWorker();
  try {
    const result = await worker.render(job);
    return {
      ...result,
      timings: {
        ...(result.timings || {}),
        daemon: "disabled"
      }
    };
  } finally {
    await worker.close();
  }
}

function writeOutputPayload(output) {
  if (!output?.path) {
    return;
  }
  fs.mkdirSync(path.dirname(output.path), { recursive: true });
  if (typeof output.text === "string") {
    fs.writeFileSync(output.path, output.text);
    return;
  }
  const dataUrl = String(output.dataUrl || "");
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error(`Snapshot output did not include a base64 data URL: ${output.path}`);
  }
  fs.writeFileSync(output.path, Buffer.from(match[2], "base64"));
}

function writeRenderOutputs(result) {
  for (const output of Array.isArray(result.outputs) ? result.outputs : []) {
    writeOutputPayload(output);
  }
}

function printRenderResult(result, { json = false, stdout = process.stdout } = {}) {
  if (json || !Array.isArray(result.outputs)) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (result.mode === "list") {
    stdout.write(`${JSON.stringify(result.parts || [], null, 2)}\n`);
    return;
  }
  for (const output of result.outputs) {
    if (output.path) {
      stdout.write(`saved snapshot: ${output.path}\n`);
    }
  }
  for (const warning of result.warnings || []) {
    stdout.write(`warning: ${warning}\n`);
  }
}

async function runDaemonCommand(options, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const socketPath = options.socket ? path.resolve(options.socket) : snapshotDaemonSocketPath();
  const command = options.daemonCommand;
  if (command === "status") {
    try {
      const response = await sendDaemonRequest(socketPath, { command: "status" });
      if (!response.ok) {
        stderr.write(`${response.error || "snapshot daemon status failed"}\n`);
        return 1;
      }
      stdout.write(`snapshot daemon running: pid=${response.pid} jobs=${response.jobs} browserStarted=${String(response.browserStarted)} socket=${socketPath}\n`);
      return 0;
    } catch {
      stdout.write(`snapshot daemon not running: socket=${socketPath}\n`);
      return 1;
    }
  }
  if (command === "stop") {
    try {
      await sendDaemonRequest(socketPath, { command: "stop" });
      stdout.write(`stopped snapshot daemon: socket=${socketPath}\n`);
    } catch {
      fs.rmSync(socketPath, { force: true });
      stdout.write(`snapshot daemon not running: socket=${socketPath}\n`);
    }
    return 0;
  }
  if (command === "run") {
    return serveRenderDaemon(socketPath);
  }
  throw new Error("daemon command must be one of: status, stop, run");
}

async function serveRenderDaemon(socketPath) {
  fs.rmSync(socketPath, { force: true });
  const worker = new BrowserRenderWorker();
  let jobs = 0;
  let stopRequested = false;
  let lastActivity = Date.now();
  const server = net.createServer((connection) => {
    let data = "";
    connection.on("data", async (chunk) => {
      data += chunk.toString("utf8");
      if (!data.includes("\n")) {
        return;
      }
      const raw = data.trim();
      data = "";
      lastActivity = Date.now();
      let response;
      try {
        const request = JSON.parse(raw);
        if (request.protocolVersion !== RENDER_DAEMON_PROTOCOL_VERSION) {
          throw new Error("snapshot daemon protocol version mismatch");
        }
        if (request.command === "status") {
          response = {
            ok: true,
            pid: process.pid,
            jobs,
            browserStarted: worker.started,
          };
        } else if (request.command === "stop") {
          stopRequested = true;
          response = { ok: true, stopped: true };
        } else if (request.command === "render") {
          if (!request.job || typeof request.job !== "object") {
            throw new Error("snapshot daemon request is missing job");
          }
          response = { ok: true, result: await worker.render(request.job) };
          jobs += 1;
        } else {
          throw new Error(`unknown snapshot daemon command: ${request.command}`);
        }
      } catch (error) {
        response = {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
      connection.end(`${JSON.stringify({ protocolVersion: RENDER_DAEMON_PROTOCOL_VERSION, ...response })}\n`);
    });
  });
  await new Promise((resolve) => server.listen(socketPath, resolve));
  fs.chmodSync(socketPath, 0o600);
  while (!stopRequested && jobs < RENDER_DAEMON_MAX_JOBS && Date.now() - lastActivity < RENDER_DAEMON_IDLE_TIMEOUT_SECONDS * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  await worker.close();
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(socketPath, { force: true });
  return 0;
}

export async function runRenderCli(argv = process.argv.slice(2), {
  env = process.env,
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const options = parseSnapshotArgs(argv);
  if (options.help) {
    stdout.write(helpText());
    return 0;
  }
  if (options.command === "daemon") {
    return runDaemonCommand(options, { stdout, stderr });
  }
  const rawJob = await loadJobFromOptions(options);
  const job = resolveRenderJob(rawJob, { env, cwd });
  const result = options.noDaemon || job.useDaemon === false
    ? await renderOnce(job)
    : await renderViaDaemon(job);
  writeRenderOutputs(result);
  printRenderResult(result, { json: options.json, stdout });
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  runRenderCli()
    .then((code) => {
      process.exit(code);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    });
}
