#!/usr/bin/env node

import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginName = "kodelet@dictate";
const extensionName = "dictate";

await installDictatePlugin();

export async function installDictatePlugin(): Promise<void> {
  if (skipInstall()) return;

  const home = os.homedir();
  if (!home) {
    process.stderr.write("Kodelet dictate plugin install skipped: home directory is unavailable\n");
    return;
  }

  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const sdkEntrypoint = fileURLToPath(import.meta.resolve("kodelet"));
  const sdkRoot = path.resolve(path.dirname(sdkEntrypoint), "..");
  const runner = path.join(sdkRoot, "dist", "bin", "kodelet-extension-node.js");
  const entrypoint = path.join(packageRoot, "dist", "index.js");
  const extensionDir = path.join(
    home,
    ".kodelet",
    "plugins",
    pluginName,
    "extensions",
    extensionName,
  );
  const executable = path.join(extensionDir, "kodelet-extension-dictate");

  await access(runner);
  await access(entrypoint);
  await mkdir(extensionDir, { recursive: true });
  await writeFile(executable, extensionWrapper(runner, entrypoint), "utf8");
  await chmod(executable, 0o755);
}

function skipInstall(): boolean {
  const value = process.env.KODELET_SKIP_DICTATE_PLUGIN_INSTALL;
  return value === "1" || value?.toLowerCase() === "true";
}

function extensionWrapper(runner: string, entrypoint: string): string {
  return `#!/usr/bin/env sh
exec node ${shellQuote(runner)} ${shellQuote(entrypoint)} "$@"
`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
