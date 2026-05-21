import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";

import { createSkillMcpServer } from "../../src/mcp/server";

async function createSkillRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "asa-mcp-root-"));
  const skillDir = path.join(root, "sample");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    path.join(skillDir, "skill.md"),
    `---
name: sample
description: sample desc
---`,
    "utf8"
  );
  return root;
}

describe("createSkillMcpServer", () => {
  test("uses active mode and default Share output root when not configured", async () => {
    const skillsRoot = await createSkillRoot();
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 0
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const toolsListRes = await fetch(`${base}/tools/list`, { method: "POST" });
    const toolsListJson = await toolsListRes.json();
    const toolNames = toolsListJson.tools.map((tool: { name: string }) => tool.name);
    expect(toolNames).toContain("skill_guide");
    expect(toolNames).toContain("generate_skill_share");
    expect(toolNames.some((name: string) => name.startsWith("use_skill_sample_"))).toBe(true);

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test("stdio transport handles MCP initialize and tools/list without process stdout", async () => {
    const skillsRoot = await createSkillRoot();
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const messages: unknown[] = [];
    let buffer = "";
    stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) messages.push(JSON.parse(line));
      }
    });

    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "stdio",
      skillMode: "guided",
      includeShare: false,
      stdio: { stdin, stdout }
    });

    stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "vitest", version: "0.0.0" }
        }
      })}\n`
    );
    stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      })}\n`
    );

    await new Promise<void>((resolve) => {
      const started = Date.now();
      const interval = setInterval(() => {
        if (messages.length >= 2 || Date.now() - started > 1000) {
          clearInterval(interval);
          resolve();
        }
      }, 10);
    });

    const initialize = messages.find(
      (message): message is { id: number; result: { serverInfo: { name: string } } } =>
        typeof message === "object" && message !== null && "id" in message && message.id === 1
    );
    const toolsList = messages.find(
      (message): message is { id: number; result: { tools: Array<{ name: string }> } } =>
        typeof message === "object" && message !== null && "id" in message && message.id === 2
    );

    expect(initialize?.result.serverInfo.name).toBe("skill-deck");
    expect(toolsList?.result.tools.map((tool) => tool.name)).toContain("skill_guide");

    await rawServer.close();
    stdin.destroy();
    stdout.destroy();
  });

  test("stdio transport resumes stdin so the MCP process stays alive", async () => {
    const skillsRoot = await createSkillRoot();
    const stdin = new PassThrough();
    const stdout = new PassThrough();

    await createSkillMcpServer({
      skillsRoot,
      transport: "stdio",
      includeShare: false,
      stdio: { stdin, stdout }
    });

    expect(stdin.readableFlowing).not.toBe(false);

    stdin.destroy();
    stdout.destroy();
  });

  test("http transport supports tools/list and tools/call", async () => {
    const skillsRoot = await createSkillRoot();
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      includeShare: false
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const toolsListRes = await fetch(`${base}/tools/list`, {
      method: "POST"
    });
    const toolsListJson = await toolsListRes.json();
    expect(toolsListJson.tools.some((tool: { name: string }) => tool.name === "list_skills")).toBe(
      true
    );

    const callRes = await fetch(`${base}/tools/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "list_skills",
        arguments: {}
      })
    });
    const callJson = await callRes.json();
    expect(callJson.content[0]?.text).toContain("ok");

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test("MCP server exposes Share tools by default", async () => {
    const skillsRoot = await createSkillRoot();
    const shareRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-mcp-share-"));
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      shareOutputRoot: shareRoot
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const toolsListRes = await fetch(`${base}/tools/list`, {
      method: "POST"
    });
    const toolsListJson = await toolsListRes.json();
    expect(toolsListJson.tools.map((tool: { name: string }) => tool.name)).toContain(
      "generate_skill_share"
    );

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test("MCP server can disable Share tools explicitly", async () => {
    const skillsRoot = await createSkillRoot();
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      includeShare: false
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const toolsListRes = await fetch(`${base}/tools/list`, {
      method: "POST"
    });
    const toolsListJson = await toolsListRes.json();
    expect(toolsListJson.tools.map((tool: { name: string }) => tool.name)).not.toContain(
      "generate_skill_share"
    );

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test("streamable-http transport responds to MCP initialize at /mcp", async () => {
    const skillsRoot = await createSkillRoot();
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "streamable-http",
      host: "127.0.0.1",
      port: 0,
      skillMode: "guided",
      includeShare: false
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "vitest", version: "0.0.0" }
        }
      })
    });
    const text = await response.text();
    const json = JSON.parse(text.replace(/^event: message\s+data: /m, "").trim());

    expect(response.status).toBe(200);
    expect(json.result).toMatchObject({
      serverInfo: {
        name: "skill-deck"
      },
      capabilities: {
        tools: {},
        resources: {}
      },
      instructions: expect.stringContaining("skill_guide")
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test("http transport exposes guided and active Skill Activation tools", async () => {
    const skillsRoot = await createSkillRoot();
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      skillMode: "active",
      exposeSkills: 1,
      includeShare: false
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const toolsListRes = await fetch(`${base}/tools/list`, { method: "POST" });
    const toolsListJson = await toolsListRes.json();
    const toolNames = toolsListJson.tools.map((tool: { name: string }) => tool.name);
    expect(toolNames).toContain("skill_guide");
    expect(toolNames.some((name: string) => name.startsWith("use_skill_sample_"))).toBe(true);

    const directTool = toolNames.find((name: string) => name.startsWith("use_skill_sample_"));
    const callRes = await fetch(`${base}/tools/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: directTool, arguments: {} })
    });
    const callJson = await callRes.json();
    expect(callJson.structuredContent).toMatchObject({
      name: "sample",
      body: expect.stringContaining("sample desc")
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test("http transport reads generated share artifact resources", async () => {
    const skillsRoot = await createSkillRoot();
    const shareRoot = await mkdtemp(path.join(tmpdir(), "skilldeck-mcp-share-"));
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      includeShare: true,
      shareOutputRoot: shareRoot
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const generatedRes = await fetch(`${base}/tools/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "generate_skill_share",
        arguments: { refs: ["sample"], outDir: shareRoot }
      })
    });
    const generated = await generatedRes.json();
    const artifactId = generated.structuredContent.artifactId;

    const resourceRes = await fetch(`${base}/resources/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ uri: `share://artifact/${artifactId}/index.html` })
    });
    const resource = await resourceRes.json();
    expect(resource).toMatchObject({
      contents: [
        expect.objectContaining({
          mimeType: "text/html",
          text: expect.stringContaining("sample")
        })
      ]
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test("http transport updates active tools after hot reload", async () => {
    const skillsRoot = await createSkillRoot();
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      skillMode: "active",
      exposeSkills: 10,
      hotReload: true,
      debounceMs: 10,
      includeShare: false
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const initialToolsRes = await fetch(`${base}/tools/list`, { method: "POST" });
    const initialToolsJson = await initialToolsRes.json();
    const toolNamesBefore = initialToolsJson.tools.map((tool: { name: string }) => tool.name);
    expect(toolNamesBefore.some((name: string) => name.startsWith("use_skill_sample_"))).toBe(true);

    const addedDir = path.join(skillsRoot, "added");
    await mkdir(addedDir, { recursive: true });
    await writeFile(
      path.join(addedDir, "skill.md"),
      `---
name: added
description: added desc
---`,
      "utf8"
    );

    let updatedToolName: string | undefined;
    const started = Date.now();
    while (Date.now() - started < 2000 && !updatedToolName) {
      const callRes = await fetch(`${base}/tools/list`, { method: "POST" });
      const toolsJson = await callRes.json();
      updatedToolName = toolsJson.tools
        .map((tool: { name: string }) => tool.name)
        .find((name: string) => name.startsWith("use_skill_added_"));
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    expect(updatedToolName).toBeTypeOf("string");

    const callRes = await fetch(`${base}/tools/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: updatedToolName,
        arguments: {}
      })
    });
    const callJson = await callRes.json();
    expect(callJson.structuredContent).toMatchObject({
      name: "added",
      body: expect.stringContaining("added desc")
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test("http transport wires enabled management tools to handlers", async () => {
    const skillsRoot = await createSkillRoot();
    const invalidDir = path.join(skillsRoot, "invalid");
    await mkdir(invalidDir, { recursive: true });
    await writeFile(path.join(invalidDir, "skill.md"), "# invalid", "utf8");
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      includeManagementTools: true,
      includeShare: false
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const callRes = await fetch(`${base}/tools/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "validate_skills",
        arguments: {}
      })
    });
    const callJson = await callRes.json();
    expect(callJson.isError).toBeUndefined();
    expect(callJson.structuredContent).toMatchObject({
      valid: 1,
      invalid: 1
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test("http transport rejects hidden management tools when not enabled", async () => {
    const skillsRoot = await createSkillRoot();
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      includeShare: false
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const callRes = await fetch(`${base}/tools/call`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "reload_skills",
        arguments: {}
      })
    });
    const callJson = await callRes.json();
    expect(callJson.isError).toBe(true);
    expect(callJson.content[0]?.text).toContain("unknown tool");

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  test("http transport hot reloads changed skill files", async () => {
    const skillsRoot = await createSkillRoot();
    const rawServer = await createSkillMcpServer({
      skillsRoot,
      transport: "http",
      host: "127.0.0.1",
      port: 0,
      hotReload: true,
      debounceMs: 10,
      includeShare: false
    });
    const server = rawServer as Server;
    const address = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;

    const addedDir = path.join(skillsRoot, "added");
    await mkdir(addedDir, { recursive: true });
    await writeFile(
      path.join(addedDir, "skill.md"),
      `---
name: added
description: added desc
---`,
      "utf8"
    );
    let names: string[] = [];
    const started = Date.now();
    while (Date.now() - started < 1500) {
      const callRes = await fetch(`${base}/tools/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "list_skills",
          arguments: {}
        })
      });
      const callJson = await callRes.json();
      names = callJson.structuredContent.data.map((skill: { name: string }) => skill.name);
      if (names.includes("added")) break;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    expect(names).toContain("added");

    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
});
