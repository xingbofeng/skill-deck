import { scanSkills } from "../core/scan";
import { hasFlag, valueAfterFlag } from "./config";

export async function runScanCommand(args: string[]): Promise<unknown[]> {
  const skillsRoot = valueAfterFlag(args, "--skills");
  if (!skillsRoot) throw new Error("--skills is required");
  return scanSkills(skillsRoot, {
    includeInvalid: hasFlag(args, "--include-invalid"),
    mode: (valueAfterFlag(args, "--mode") as "strict" | "loose" | undefined) ?? "strict",
    followSymlinks: hasFlag(args, "--follow-symlinks")
  });
}
