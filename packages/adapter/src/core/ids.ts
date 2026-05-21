import { realpath } from "node:fs/promises";
import { createHash } from "node:crypto";

export async function buildStableSkillId(
  name: string,
  skillDirPath: string
): Promise<string> {
  const canonicalPath = await realpath(skillDirPath);
  const hash = createHash("sha1").update(canonicalPath).digest("hex").slice(0, 8);
  return `${name}@${hash}`;
}
