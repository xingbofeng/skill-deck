import { createManagementHandlers } from "../runtime/management";
import { hasFlag, valueAfterFlag } from "./config";

export async function runValidateCommand(args: string[]): Promise<{
  diagnostics: unknown;
  exitCode: number;
}> {
  const skillsRoot = valueAfterFlag(args, "--skills");
  if (!skillsRoot) throw new Error("--skills is required");
  const layout = valueAfterFlag(args, "--layout");
  if (layout && layout !== "direct" && layout !== "recursive") {
    throw new Error("invalid --layout");
  }

  const handlers = createManagementHandlers({
    skillsRoot,
    state: { skills: [] },
    layout: (layout as "direct" | "recursive" | undefined) ?? "recursive",
    followSymlinks: hasFlag(args, "--follow-symlinks")
  });
  const result = await handlers.validate_skills({});
  const diagnostics = result.data as { invalid?: number };
  return {
    diagnostics,
    exitCode: diagnostics.invalid && diagnostics.invalid > 0 ? 2 : 0
  };
}
