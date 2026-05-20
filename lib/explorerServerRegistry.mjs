import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isExplorerServerInfo } from "./explorerServerInfo.mjs";

export const EXPLORER_SERVER_REGISTRY_VERSION = 1;
export const EXPLORER_SERVER_REGISTRY_FILENAME = "cad-explorer-servers.json";

export function explorerServerRegistryPath(env = process.env) {
  const configuredPath = String(env.EXPLORER_SERVER_REGISTRY || "").trim();
  return configuredPath
    ? path.resolve(configuredPath)
    : path.join(os.tmpdir(), EXPLORER_SERVER_REGISTRY_FILENAME);
}

export function explorerServerProcessIsAlive(pid) {
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) {
    return false;
  }
  try {
    process.kill(numericPid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function normalizeRegistryServers(payload) {
  const sourceServers = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.servers)
      ? payload.servers
      : [];
  return sourceServers
    .map((server) => ({
      ...server,
      port: Number(server?.port),
      pid: Number(server?.pid)
    }))
    .filter((server) => isExplorerServerInfo(server))
    .sort((a, b) => a.port - b.port);
}

export function readExplorerServerRegistry({
  registryPath = explorerServerRegistryPath(),
  includeDead = false
} = {}) {
  try {
    const payload = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    return normalizeRegistryServers(payload).filter((server) => (
      includeDead || explorerServerProcessIsAlive(server.pid)
    ));
  } catch {
    return [];
  }
}

function writeRegistryServers(servers, registryPath) {
  const payload = {
    version: EXPLORER_SERVER_REGISTRY_VERSION,
    servers
  };
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const tempPath = `${registryPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(tempPath, registryPath);
}

export function writeExplorerServerRegistry(serverInfo, {
  registryPath = explorerServerRegistryPath()
} = {}) {
  if (!isExplorerServerInfo(serverInfo)) {
    return false;
  }

  try {
    const currentServers = readExplorerServerRegistry({ registryPath });
    const nextServers = currentServers
      .filter((server) => (
        server.port !== serverInfo.port &&
        server.pid !== serverInfo.pid
      ))
      .concat({
        ...serverInfo,
        registeredAt: new Date().toISOString()
      })
      .sort((a, b) => a.port - b.port);
    writeRegistryServers(nextServers, registryPath);
    return true;
  } catch {
    return false;
  }
}

export function removeExplorerServerRegistryEntry(serverInfo, {
  registryPath = explorerServerRegistryPath()
} = {}) {
  if (!serverInfo || typeof serverInfo !== "object") {
    return false;
  }

  try {
    const currentServers = readExplorerServerRegistry({ registryPath, includeDead: true });
    const nextServers = currentServers.filter((server) => !(
      server.port === serverInfo.port ||
      server.pid === serverInfo.pid
    ));
    writeRegistryServers(nextServers, registryPath);
    return true;
  } catch {
    return false;
  }
}
