import { spawnSync } from "node:child_process";

const skillsRoot = process.env.SKILLS_ROOT ?? "/Users/you/.kidmemory/skills";
const outDir = process.env.SHARE_OUT ?? "./skilldeck-share";

const result = spawnSync(
  "skill-deck",
  [
    "share",
    skillsRoot,
    "--out",
    outDir
    // Add "--no-redact" only for local debugging; redaction is safer for sharing.
  ],
  { encoding: "utf8" }
);

if (result.status !== 0) {
  throw new Error(result.stderr || "skill-deck share failed");
}

console.log(JSON.parse(result.stdout));

