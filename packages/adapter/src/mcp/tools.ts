import type { AgenticTool } from "../core/types";

export function toMcpTools(tools: AgenticTool[]): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  }));
}
