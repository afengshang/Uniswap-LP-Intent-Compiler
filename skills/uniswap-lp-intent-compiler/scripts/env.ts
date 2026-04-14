import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface LoadedEnvInfo {
  loadedFrom?: string;
  loadedKeys: string[];
}

let cachedEnvInfo: LoadedEnvInfo | undefined;

function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

function walkUpForFile(startDir: string, filename: string): string | undefined {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function loadWorkspaceEnv(): LoadedEnvInfo {
  if (cachedEnvInfo) {
    return cachedEnvInfo;
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const searchRoots = [process.cwd(), scriptDir, path.resolve(scriptDir, ".."), path.resolve(scriptDir, "..", "..")];

  let envPath: string | undefined;
  for (const root of searchRoots) {
    envPath = walkUpForFile(root, ".env");
    if (envPath) {
      break;
    }
  }

  if (!envPath) {
    cachedEnvInfo = { loadedKeys: [] };
    return cachedEnvInfo;
  }

  const parsed = parseEnvFile(fs.readFileSync(envPath, "utf8"));
  const loadedKeys: string[] = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
    loadedKeys.push(key);
  }

  cachedEnvInfo = {
    loadedFrom: envPath,
    loadedKeys
  };

  return cachedEnvInfo;
}

export function hasEnvKeys(keys: string[]): boolean {
  loadWorkspaceEnv();
  return keys.every((key) => Boolean(process.env[key]));
}
