import type { AgenticTool } from "../core/types";

export function toAnthropicTools(tools: AgenticTool[]): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return tools.map((tool) => ({
    name: tool.name.replace(/[^a-zA-Z0-9_-]/g, "_"),
    description: tool.description,
    input_schema: tool.inputSchema
  }));
}
