import { spawn } from "node:child_process";

type RunnerInput = {
  command: string;
  cwd?: string;
  shell?: string;
  timeoutMs?: number;
  maxOutputLength?: number;
  env?: Record<string, string>;
  inheritEnv?: boolean;
};

type RunnerOutput = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut?: boolean;
  truncated?: boolean;
  durationMs?: number;
};

const ANSI_REGEX = new RegExp(String.raw`\x1b\[[0-9;]*m`, "g");

function stripAnsi(input: string): string {
  return input.replace(ANSI_REGEX, "");
}

function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

export function createLocalShellRunner(defaults?: {
  shell?: string;
  timeoutMs?: number;
  maxOutputLength?: number;
  inheritEnv?: boolean;
}): (input: RunnerInput) => Promise<RunnerOutput> {
  return async (input: RunnerInput): Promise<RunnerOutput> => {
    const timeoutMs = input.timeoutMs ?? defaults?.timeoutMs ?? 30000;
    const maxOutputLength = input.maxOutputLength ?? defaults?.maxOutputLength ?? 8000;
    const inheritEnv = input.inheritEnv ?? defaults?.inheritEnv ?? false;
    const shell = input.shell ?? defaults?.shell ?? "/bin/bash";
    const startedAt = Date.now();

    return new Promise((resolve) => {
      const child = spawn(shell, ["-lc", input.command], {
        cwd: input.cwd,
        env: inheritEnv
          ? { ...process.env, ...(input.env ?? {}) }
          : { ...(input.env ?? {}) },
        detached: true
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }, timeoutMs);

      child.on("error", (error) => {
        clearTimeout(timer);
        resolve({
          stdout: "",
          stderr: error.message,
          exitCode: 127,
          timedOut,
          truncated: false,
          durationMs: Date.now() - startedAt
        });
      });

      child.on("close", (exitCode) => {
        clearTimeout(timer);
        const cleanStdout = stripAnsi(stdout);
        const cleanStderr = stripAnsi(stderr);
        const out = truncate(cleanStdout, maxOutputLength);
        const err = truncate(cleanStderr, maxOutputLength);
        resolve({
          stdout: out.text,
          stderr: err.text,
          exitCode,
          timedOut,
          truncated: out.truncated || err.truncated,
          durationMs: Date.now() - startedAt
        });
      });
    });
  };
}
