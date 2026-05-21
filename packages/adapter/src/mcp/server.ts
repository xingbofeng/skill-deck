import http from "node:http";
import { homedir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { FSWatcher } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

import { scanSkills } from "../core/scan";
import type { AgenticHandlerResult, SkillParseMode, SkillScanLayout } from "../core/types";
import { getAgenticSkillTools } from "../core/tools";
import { createSkillHandlers } from "../runtime/handlers";
import { toMcpCallResult } from "./result";
import { readMcpResource, toMcpResources } from "./resources";
import { toMcpTools } from "./tools";
import { createLocalShellRunner } from "../runtime/shell";
import type { ShellSecurityOptions } from "../runtime/security";
import { createSkillFileWatcher } from "../runtime/watcher";

const DEFAULT_SHARE_OUTPUT_ROOT = "~/skilldeck-shares";

type CreateServerOptions = {
  skillsRoot: string;
  layout?: SkillScanLayout;
  transport?: "stdio" | "http" | "streamable-http";
  host?: string;
  port?: number;
  parseMode?: SkillParseMode;
  followSymlinks?: boolean;
  skillMode?: "compact" | "guided" | "active";
  exposeSkills?: number;
  includeShare?: boolean;
  shareOutputRoot?: string;
  shareOutputRoots?: string[];
  hotReload?: boolean;
  debounceMs?: number;
  includeShell?: boolean;
  includeManagementTools?: boolean;
  allowedRoots?: string[];
  defaultCwd?: string;
  timeoutMs?: number;
  maxOutputLength?: number;
  stdio?: {
    stdin?: Readable;
    stdout?: Writable;
  };
};

type StdioMcpServer = {
  transport: "stdio";
  server: Server;
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  resources: Array<{
    uri: string;
    name: string;
    description: string;
    mimeType: "application/json" | "text/markdown" | "text/html";
  }>;
  handlers: Record<string, (args: unknown) => Promise<unknown>>;
  close: () => Promise<void>;
};

function skillActivationInstructions(skillMode: "compact" | "guided" | "active"): string {
  if (skillMode === "compact") {
    return "This server exposes local Agent Skills. For complex tasks, call search_skills or read_skill first. Always load the full SKILL.md before applying a skill.";
  }
  return "This server exposes local Agent Skills. For complex tasks, call skill_guide, search_skills, or a use_skill_* tool first. Always load the full SKILL.md before applying a skill.";
}

function expandHome(input: string): string {
  return input === "~" || input.startsWith("~/")
    ? path.join(homedir(), input.slice(2))
    : input;
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createMcpProtocolServer(
  skillMode: "compact" | "guided" | "active",
  getTools: () => Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
  getHandlers: () => Record<string, (args: unknown) => Promise<AgenticHandlerResult>>,
  getSkills: () => Awaited<ReturnType<typeof scanSkills>>,
  shareOutputRoots: string[] = []
): Server {
  const server = new Server(
    { name: "skill-deck", version: "0.1.0" },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: skillActivationInstructions(skillMode)
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: getTools() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const handlers = getHandlers();
    const handler = new Set(getTools().map((tool) => tool.name)).has(name) ? handlers[name] : undefined;
    if (!handler) {
      return toMcpCallResult({ error: `unknown tool: ${name}` });
    }
    const result = await handler(request.params.arguments ?? {});
    return toMcpCallResult(result);
  });
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: toMcpResources(getSkills())
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const data = await readMcpResource(request.params.uri, getSkills(), undefined, {
      shareOutputRoots
    });
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: data.mimeType,
          text: data.text
        }
      ]
    };
  });

  return server;
}

export async function createSkillMcpServer(
  options: CreateServerOptions
): Promise<http.Server | StdioMcpServer> {
  const transport = options.transport ?? "stdio";
  const skillMode = options.skillMode ?? "active";
  const includeShare = options.includeShare ?? true;
  const shareOutputRoots =
    options.shareOutputRoots ??
    (options.shareOutputRoot
      ? [options.shareOutputRoot]
      : includeShare
        ? [DEFAULT_SHARE_OUTPUT_ROOT]
        : []);
  const normalizedShareOutputRoots = shareOutputRoots.map(expandHome);
  const skills = await scanSkills(options.skillsRoot, {
    mode: options.parseMode ?? "strict",
    layout: options.layout ?? "recursive",
    followSymlinks: options.followSymlinks ?? false
  });
  let currentSkills = skills;

  const getTools = () =>
    toMcpTools(
      getAgenticSkillTools({
        includeShell: options.includeShell ?? false,
        includeManagement: options.includeManagementTools ?? false,
        skillMode,
        skills: currentSkills,
        exposeSkills: options.exposeSkills ?? 20,
        includeShare
      })
    );

  const handlers = createSkillHandlers({
    skills,
    skillsRoot: options.skillsRoot,
    layout: options.layout ?? "recursive",
    mode: options.parseMode ?? "strict",
    followSymlinks: options.followSymlinks ?? false,
    skillMode,
    includeShare,
    shareOutputRoots: normalizedShareOutputRoots,
    includeManagement: options.includeManagementTools ?? false,
    readFile: async (filePath: string) => readFile(filePath, "utf8"),
    onSkillsReload: (nextSkills) => {
      currentSkills = nextSkills;
    },
    runShell: options.includeShell
      ? createLocalShellRunner({
          timeoutMs: options.timeoutMs,
          maxOutputLength: options.maxOutputLength
        })
      : undefined,
    security: {
      allowedRoots: options.allowedRoots ?? [options.skillsRoot],
      defaultCwd: options.defaultCwd ?? options.skillsRoot,
      timeoutMs: options.timeoutMs,
      maxOutputLength: options.maxOutputLength,
      inheritEnv: false
    } satisfies ShellSecurityOptions
  });
  if (transport === "stdio") {
    const server = createMcpProtocolServer(
      skillMode,
      getTools,
      () => handlers as Record<string, (args: unknown) => Promise<AgenticHandlerResult>>,
      () => currentSkills,
      normalizedShareOutputRoots
    );

    const stdio = new StdioServerTransport(options.stdio?.stdin, options.stdio?.stdout);
    // Keep the process alive for MCP hosts that connect over stdio.
    (options.stdio?.stdin ?? process.stdin).resume();
    await server.connect(stdio);

    return {
      transport: "stdio",
      server,
      tools: getTools(),
      resources: toMcpResources(skills),
      handlers: handlers as Record<string, (args: unknown) => Promise<unknown>>,
      close: () => server.close()
    };
  }

  if (transport === "streamable-http") {
    const protocolServer = createMcpProtocolServer(
      skillMode,
      getTools,
      () => handlers as Record<string, (args: unknown) => Promise<AgenticHandlerResult>>,
      () => currentSkills,
      normalizedShareOutputRoots
    );
    const streamableTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    await protocolServer.connect(streamableTransport);

    const server = http.createServer(async (request, response) => {
      if (request.url !== "/mcp") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not found" }));
        return;
      }
      await streamableTransport.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(options.port ?? 3333, options.host ?? "127.0.0.1", (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    server.on("close", () => {
      void streamableTransport.close();
      void protocolServer.close();
    });
    return server;
  }

  let watcher: FSWatcher | undefined;
  if (options.hotReload) {
    watcher = createSkillFileWatcher({
      root: options.skillsRoot,
      skills,
      debounceMs: options.debounceMs ?? 500,
      onChange: async () => {
        await handlers.reload_skills?.({});
      }
    }) as FSWatcher;
  }

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method !== "POST") {
        response.writeHead(405, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "method not allowed" }));
        return;
      }

      if (request.url === "/tools/list") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ tools: getTools() }));
        return;
      }

      if (request.url === "/tools/call") {
        const body = (await readJsonBody(request)) as {
          name?: unknown;
          arguments?: unknown;
        };
        if (typeof body.name !== "string") {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "name is required" }));
          return;
        }
        const handler = new Set(getTools().map((tool) => tool.name)).has(body.name)
          ? handlers[body.name as keyof typeof handlers]
          : undefined;
        if (!handler) {
          response.writeHead(404, { "content-type": "application/json" });
          response.end(JSON.stringify(toMcpCallResult({ error: `unknown tool: ${body.name}` })));
          return;
        }
        const result = await handler(body.arguments ?? {});
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(toMcpCallResult(result)));
        return;
      }

      if (request.url === "/resources/list") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ resources: toMcpResources(currentSkills) }));
        return;
      }

      if (request.url === "/resources/read") {
        const body = (await readJsonBody(request)) as { uri?: unknown };
        if (typeof body.uri !== "string") {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "uri is required" }));
          return;
        }
        const data = await readMcpResource(body.uri, currentSkills, undefined, {
          shareOutputRoots: normalizedShareOutputRoots
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            contents: [
              {
                uri: body.uri,
                mimeType: data.mimeType,
                text: data.text
              }
            ]
          })
        );
        return;
      }

      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
      );
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(options.port ?? 3333, options.host ?? "127.0.0.1", (error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  server.on("close", () => {
    watcher?.close();
  });

  return server;
}
