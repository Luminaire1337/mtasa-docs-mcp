import { beforeAll, describe, expect, test } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

const projectRoot = resolve(process.cwd());
const buildScriptPath = resolve(projectRoot, "scripts/build.mjs");
const smokeScriptPath = resolve(projectRoot, "scripts/smoke.mjs");

const hasBunRuntime = (() => {
  const result = spawnSync("bun", ["--version"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  return result.status === 0;
})();

const runCommand = (
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandResult> => {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finalize = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finalize(() => {
        rejectResult(
          new Error(
            `Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`,
          ),
        );
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      finalize(() => rejectResult(error));
    });

    child.on("close", (code) => {
      finalize(() => {
        resolveResult({
          code: code ?? -1,
          stdout,
          stderr,
        });
      });
    });
  });
};

const expectCommonSmokeSuccess = (result: CommandResult): void => {
  expect(result.code).toBe(0);

  const output = `${result.stdout}\n${result.stderr}`;
  expect(output).toContain("Smoke tests passed.");
  expect(output).toContain("MTA:SA Documentation MCP Server running");

  const hasRuntimeModeLog =
    output.includes(
      "Using vector similarity search for intelligent function discovery",
    ) || output.includes("using JS vector distance fallback search");
  expect(hasRuntimeModeLog).toBe(true);
};

describe("runtime smoke integration", () => {
  beforeAll(async () => {
    const buildResult = await runCommand(
      process.execPath,
      [buildScriptPath],
      120_000,
    );

    expect(buildResult.code).toBe(0);
  });

  test("passes smoke checks on Node runtime", async () => {
    const result = await runCommand(
      process.execPath,
      [smokeScriptPath, "--runtime=node"],
      120_000,
    );

    expectCommonSmokeSuccess(result);
  }, 150_000);

  const bunRuntimeTest = hasBunRuntime ? test : test.skip;

  bunRuntimeTest(
    "passes smoke checks on Bun runtime with JS vector fallback",
    async () => {
      const result = await runCommand(
        process.execPath,
        [smokeScriptPath, "--runtime=bun"],
        120_000,
      );

      expectCommonSmokeSuccess(result);

      const output = `${result.stdout}\n${result.stderr}`;
      if (output.includes("Failed to load SQLite vector extension")) {
        expect(output).toContain(
          "Vector extension unavailable; using JS vector distance fallback search",
        );
      }
    },
    150_000,
  );
});
