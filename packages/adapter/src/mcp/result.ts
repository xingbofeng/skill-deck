import type { AgenticHandlerResult } from "../core/types";

function toStructuredContent(data: unknown): Record<string, unknown> | undefined {
  if (data === undefined) return undefined;
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { data };
}

export function toMcpCallResult(result: AgenticHandlerResult): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
} {
  if (result.error) {
    return {
      content: [{ type: "text", text: result.error }],
      structuredContent: toStructuredContent(result.data),
      isError: true
    };
  }
  return {
    content: [{ type: "text", text: result.text ?? "ok" }],
    structuredContent: toStructuredContent(result.data)
  };
}
