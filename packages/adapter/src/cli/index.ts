#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parseMcpServeConfig } from "./config";
import { runMcpServeCommand } from "./mcp-serve";
import { runScanCommand } from "./scan";
import { runShareCommand } from "./share";
import { runValidateCommand } from "./validate";
import type { RenderShareImage } from "../runtime/share";

type CliIo = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  onServerStart?: (server: { close: (cb: (err?: Error) => void) => void }) => void;
  renderShareImage?: RenderShareImage;
};

type ShareCliResult = {
  skillCount: number;
  redacted: boolean;
  files: Array<{
    kind: "manifest" | "html" | "cover" | "detail";
    path: string;
  }>;
};

const ROOT_HELP = `Usage: skill-deck <command>

Commands:
  scan --skills <dir>                         Scan local Skill folders.
  validate --skills <dir>                     Validate Skill folder layout and SKILL.md files.
  mcp serve --skills <dir> [options]          Start the SkillDeck MCP server.
  share <skill-or-root> --out <dir> [options] Generate index.html, cover.png, and detail.png.

Run "skill-deck <command> --help" for command-specific options.
`;

const SHARE_HELP = `Usage: skill-deck share <skill-or-root> --out <dir>

Options:
  --out <dir>     Output directory for index.html, cover.png, detail.png, and manifest.json.
  --no-redact     Disable default redaction for local paths, private URLs, and secrets.
  --help          Show this help message.
`;

const MCP_SERVE_HELP = `Usage: skill-deck mcp serve --skills <dir> [options]

Options:
  --transport <stdio|http|streamable-http>  Transport to start. Defaults to stdio.
  --skill-mode <compact|guided|active>      Skill Activation mode. Defaults to active.
  --expose-skills <n>                       Maximum direct use_skill_* tools in active mode.
  --share-output-root <dir>                 Allowed Share output root. Defaults to ~/skilldeck-shares.
  --disable-share-tools                     Hide Share MCP tools.
  --follow-symlinks                         Follow symlinked skill folders.
  --hot-reload                              Watch valid Skill files and reload inventory.
  --help                                    Show this help message.
`;

function hasHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

function writeStdout(io: CliIo, text: string): void {
  (io.stdout ?? process.stdout.write.bind(process.stdout))(text);
}

function writeStderr(io: CliIo, text: string): void {
  (io.stderr ?? process.stderr.write.bind(process.stderr))(text);
}

function formatShareResult(result: unknown): string {
  const share = result as ShareCliResult;
  const pathFor = (kind: ShareCliResult["files"][number]["kind"]) =>
    share.files.find((file) => file.kind === kind)?.path ?? "(not generated)";
  return [
    "Share package generated",
    "",
    `Skills: ${share.skillCount}`,
    `Redaction: ${share.redacted ? "enabled" : "disabled"}`,
    "",
    "Files:",
    `  HTML page: ${pathFor("html")}`,
    `  Cover image: ${pathFor("cover")}`,
    `  Detail image: ${pathFor("detail")}`,
    `  Manifest: ${pathFor("manifest")}`,
    "",
    "Open:",
    `  open ${pathFor("html")}`,
    `  open ${pathFor("cover")}`,
    `  open ${pathFor("detail")}`,
    ""
  ].join("\n");
}

export async function runCli(args: string[], io: CliIo = {}): Promise<number> {
  const command = args[0];
  if (!command || hasHelp(args) && (command === "--help" || command === "-h")) {
    writeStdout(io, ROOT_HELP);
    return 0;
  }

  if (command === "scan") {
    const skills = await runScanCommand(args);
    writeStdout(io, JSON.stringify(skills));
    return 0;
  }

  if (command === "validate") {
    const { diagnostics, exitCode } = await runValidateCommand(args);
    writeStdout(io, JSON.stringify(diagnostics));
    return exitCode;
  }

  if (command === "share") {
    if (hasHelp(args)) {
      writeStdout(io, SHARE_HELP);
      return 0;
    }
    try {
      const { result, warnings } = await runShareCommand(args, {
        renderImage: io.renderShareImage
      });
      for (const warning of warnings) {
        writeStderr(io, `${warning}\n`);
      }
      writeStdout(io, formatShareResult(result));
      return 0;
    } catch (error) {
      writeStderr(io, `${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  if (command === "mcp" && args[1] === "serve") {
    if (hasHelp(args)) {
      writeStdout(io, MCP_SERVE_HELP);
      return 0;
    }
    let config: ReturnType<typeof parseMcpServeConfig>;
    let server: unknown;
    try {
      config = parseMcpServeConfig(args);
      server = await runMcpServeCommand(args);
    } catch (error) {
      writeStderr(io, `${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }

    if (config.transport === "http") {
      io.onServerStart?.(server as { close: (cb: (err?: Error) => void) => void });
    }
    return 0;
  }

  writeStderr(io, `unknown command: ${command}\n`);
  return 1;
}

export function isCliEntrypoint(moduleUrl: string, argvEntry?: string): boolean {
  if (!argvEntry) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvEntry);
  } catch {
    return false;
  }
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  runCli(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
