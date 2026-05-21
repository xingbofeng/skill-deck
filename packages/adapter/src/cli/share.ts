import { readFile } from "node:fs/promises";

import { scanSkills } from "../core/scan";
import { generateSkillShare, type RenderShareImage } from "../runtime/share";
import { hasFlag, valueAfterFlag } from "./config";

export async function runShareCommand(args: string[], options: { renderImage?: RenderShareImage } = {}): Promise<{
  result: unknown;
  warnings: string[];
}> {
  const inputPath = args[1];
  const outDir = valueAfterFlag(args, "--out");
  if (!inputPath) throw new Error("share path is required");
  if (!outDir) throw new Error("--out is required");

  const skills = await scanSkills(inputPath, { includeInvalid: false });
  const redact = !hasFlag(args, "--no-redact");
  const result = await generateSkillShare({
    skills: await Promise.all(
      skills.map(async (skill) => ({
        skill,
        body: await readFile(skill.bodyPath, "utf8")
      }))
    ),
    outDir,
    redact,
    renderImage: options.renderImage
  });

  return {
    result,
    warnings: redact ? [] : ["Redaction disabled; share output may contain local paths, secrets, or private URLs."]
  };
}
