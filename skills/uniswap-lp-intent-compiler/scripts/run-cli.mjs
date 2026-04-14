import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, "..");
const invocationCwd = process.cwd();
const cliPath = path.join(skillRoot, "dist", "cli.js");
const tsconfigPath = path.join(skillRoot, "tsconfig.json");
const packageJsonPath = path.join(skillRoot, "package.json");
const requireFromHere = createRequire(import.meta.url);

function resolveOptional(specifier, roots) {
  for (const root of roots) {
    try {
      return requireFromHere.resolve(specifier, { paths: [root] });
    } catch {
      continue;
    }
  }

  return undefined;
}

function exitWithRemediation(lines) {
  for (const line of lines) {
    console.error(line);
  }

  process.exit(1);
}

function ensureRuntimeDependencies() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
  const missing = runtimeDependencies.filter(
    (dependency) => !resolveOptional(dependency, [skillRoot, invocationCwd])
  );

  if (missing.length > 0) {
    exitWithRemediation([
      `Missing skill runtime dependencies: ${missing.join(", ")}`,
      `Run 'npm install' inside ${skillRoot} before using this skill.`,
      "Do not copy node_modules from another workspace; install dependencies fresh in the skill directory."
    ]);
  }
}

function buildIfNeeded() {
  if (fs.existsSync(cliPath)) {
    return;
  }

  const tscPath = resolveOptional("typescript/bin/tsc", [skillRoot, invocationCwd]);

  if (!tscPath) {
    exitWithRemediation([
      `Could not find TypeScript to build ${skillRoot}.`,
      `Either copy the prebuilt dist folder into ${skillRoot} or run 'npm install' there first.`
    ]);
  }

  const build = spawnSync(process.execPath, [tscPath, "-p", tsconfigPath], {
    cwd: skillRoot,
    stdio: "inherit",
    shell: false
  });

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

ensureRuntimeDependencies();
buildIfNeeded();

const run = spawnSync(process.execPath, [cliPath, ...process.argv.slice(2)], {
  cwd: invocationCwd,
  env: process.env,
  stdio: "inherit",
  shell: false
});

process.exit(run.status ?? 1);
