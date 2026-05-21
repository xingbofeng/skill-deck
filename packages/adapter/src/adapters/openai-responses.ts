import type { AgenticTool } from "../core/types";

export function toOpenAIResponsesTools(tools: AgenticTool[]): Array<{
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}> {
  return tools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
    strict: true
  }));
}
