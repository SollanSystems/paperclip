import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { planChildProcessSpawn } from "@paperclipai/adapter-utils/server-utils";

const tempDirs = new Set<string>();

async function makeTempDir(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.add(dir);
  return dir;
}

describe("planChildProcessSpawn", () => {
  afterEach(async () => {
    await Promise.all(
      [...tempDirs].map(async (dir) => {
        await fs.rm(dir, { recursive: true, force: true });
      }),
    );
    tempDirs.clear();
  });

  it("uses shell mode for Windows batch commands and quotes spaced arguments", async () => {
    const dir = await makeTempDir("paperclip-spawn-plan-");
    const commandPath = path.join(dir, "fake opencode.CMD");
    await fs.writeFile(commandPath, "@echo off\r\necho ok\r\n", "utf8");
    await fs.chmod(commandPath, 0o755);

    const plan = await planChildProcessSpawn(
      commandPath,
      ["models", "C:/Program Files/OpenCode"],
      dir,
      process.env,
      "win32",
    );

    expect(plan.shell).toBe(true);
    expect(plan.args).toEqual([]);
    expect(plan.command).toContain(`"${commandPath}"`);
    expect(plan.command).toContain("\"C:/Program Files/OpenCode\"");
  });

  it("keeps direct spawn mode for non-batch commands", async () => {
    const plan = await planChildProcessSpawn(
      process.execPath,
      ["--version"],
      process.cwd(),
      process.env,
      "win32",
    );

    expect(plan.shell).toBe(false);
    expect(plan.command).toBe(process.execPath);
    expect(plan.args).toEqual(["--version"]);
  });
});
