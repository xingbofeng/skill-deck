import { createSkillMcpServer } from "../mcp/server";
import { parseMcpServeConfig } from "./config";

export async function runMcpServeCommand(args: string[]): Promise<unknown> {
  const config = parseMcpServeConfig(args);
  return createSkillMcpServer(config);
}
