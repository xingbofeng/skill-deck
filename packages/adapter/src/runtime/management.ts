import { inspectSkillFolders } from "../core/diagnostics";
import { scanSkills } from "../core/scan";
import type {
  AgenticHandlerResult,
  AgenticSkill,
  SkillParseMode,
  SkillScanLayout
} from "../core/types";

type ManagementState = {
  skills: AgenticSkill[];
};

type ManagementOptions = {
  skillsRoot: string;
  state: ManagementState;
  mode?: SkillParseMode;
  layout?: SkillScanLayout;
  followSymlinks?: boolean;
};

export function createManagementHandlers(options: ManagementOptions): {
  list_skill_folders: (args: unknown) => Promise<AgenticHandlerResult>;
  validate_skills: (args: unknown) => Promise<AgenticHandlerResult>;
  reload_skills: (args: unknown) => Promise<AgenticHandlerResult>;
} {
  const mode = options.mode ?? "strict";
  const layout = options.layout ?? "recursive";

  return {
    list_skill_folders: async () => ({
      data: await inspectSkillFolders(options.skillsRoot, {
        mode,
        layout,
        followSymlinks: options.followSymlinks ?? false
      })
    }),

    validate_skills: async () => {
      const folders = await inspectSkillFolders(options.skillsRoot, {
        mode,
        layout,
        followSymlinks: options.followSymlinks ?? false
      });
      return {
        data: {
          skillsRoot: options.skillsRoot,
          valid: folders.filter((folder) => folder.status === "valid").length,
          invalid: folders.filter((folder) => folder.status === "invalid").length,
          skipped: folders.filter((folder) => folder.status === "skipped").length,
          issues: folders
            .filter((folder) => folder.status !== "valid" || folder.code === "symlink_followed")
            .map((folder) => ({
              path: folder.path,
              severity: folder.status === "invalid" ? "error" : "warning",
              code: folder.code,
              message: folder.message,
              errors: folder.errors,
              warnings: folder.warnings
            }))
        }
      };
    },

    reload_skills: async () => {
      const scanned = await scanSkills(options.skillsRoot, {
        mode,
        layout,
        followSymlinks: options.followSymlinks ?? false,
        includeInvalid: true
      });
      const validSkills = scanned.filter((skill) => skill.valid);
      options.state.skills.splice(0, options.state.skills.length, ...validSkills);
      return {
        data: {
          loaded: validSkills.length,
          failed: scanned.length - validSkills.length,
          total: scanned.length
        }
      };
    }
  };
}
