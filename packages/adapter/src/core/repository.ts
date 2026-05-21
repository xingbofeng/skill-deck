import type { AgenticSkill, SkillComplexity } from "./types";

type SearchInput = {
  query?: string;
  category?: string;
  tag?: string;
  complexity?: SkillComplexity | string;
  limit?: number;
  offset?: number;
  fields?: string[];
};

type SearchItem = {
  score: number;
  skill: Partial<AgenticSkill>;
};

type SearchPage = {
  items: SearchItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    nextOffset?: number;
  };
};

type ResolveResult =
  | { skill: AgenticSkill }
  | { error: string; candidates?: Array<{ id: string; name: string; path: string }> };

export type SkillRepository = {
  list: () => AgenticSkill[];
  search: (input?: SearchInput) => SearchPage;
  resolve: (ref: string) => ResolveResult;
  replace: (nextSkills: AgenticSkill[]) => void;
};

function sortSkills(skills: AgenticSkill[]): AgenticSkill[] {
  return [...skills].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;
    return a.id.localeCompare(b.id);
  });
}

const DEFAULT_SEARCH_FIELDS = [
  "id",
  "name",
  "description",
  "category",
  "tags",
  "complexity",
  "whenToUse",
  "dependencies",
  "hasExamples",
  "path",
  "bodyPath",
  "valid",
  "warnings",
  "errors"
];

function scoreSkill(skill: AgenticSkill, query: string | undefined): number {
  if (!query) return 0;
  if (skill.name.toLowerCase().includes(query)) return 100;
  if (
    skill.tags.some((item) => item.toLowerCase().includes(query)) ||
    (skill.category ?? "").toLowerCase().includes(query)
  ) {
    return 80;
  }
  if (skill.description.toLowerCase().includes(query)) return 60;
  if (skill.whenToUse.some((item) => item.toLowerCase().includes(query))) return 50;
  const metadata = JSON.stringify(skill.metadata ?? {}).toLowerCase();
  return metadata.includes(query) ? 20 : 0;
}

function projectSkill(skill: AgenticSkill, fields: string[] | undefined): Partial<AgenticSkill> {
  const selected = fields && fields.length > 0 ? fields : DEFAULT_SEARCH_FIELDS;
  const projected: Partial<AgenticSkill> = {};
  for (const field of selected) {
    if (field === "score") continue;
    if (field in skill) {
      const key = field as keyof AgenticSkill;
      projected[key] = skill[key] as never;
    }
  }
  return projected;
}

export function createSkillRepository(initialSkills: AgenticSkill[]): SkillRepository {
  let skills = sortSkills(initialSkills);

  function list(): AgenticSkill[] {
    return [...skills];
  }

  function search(input: SearchInput = {}): SearchPage {
    const query = input.query?.trim().toLowerCase();
    const category = input.category?.trim().toLowerCase();
    const tag = input.tag?.trim().toLowerCase();
    const complexity = input.complexity?.trim().toLowerCase();
    const offset = Number.isInteger(input.offset) && input.offset && input.offset > 0 ? input.offset : 0;
    const limit = Number.isInteger(input.limit) && input.limit && input.limit > 0 ? input.limit : 50;

    const filtered = skills.filter((skill) => {
      if (query) {
        const haystack = [
          skill.name,
          skill.description,
          skill.category ?? "",
          skill.tags.join(" "),
          skill.whenToUse.join(" ")
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (category && (skill.category ?? "").toLowerCase() !== category) return false;
      if (tag && !skill.tags.some((item) => item.toLowerCase() === tag)) return false;
      if (complexity && (skill.complexity ?? "").toLowerCase() !== complexity) return false;
      return true;
    });
    const ranked = filtered
      .map((skill) => ({ skill, score: scoreSkill(skill, query) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const byName = a.skill.name.localeCompare(b.skill.name);
        if (byName !== 0) return byName;
        return a.skill.id.localeCompare(b.skill.id);
      });
    const page = ranked.slice(offset, offset + limit);
    const nextOffset = offset + limit < ranked.length ? offset + limit : undefined;

    return {
      items: page.map((item) => ({
        score: item.score,
        skill: projectSkill(item.skill, input.fields)
      })),
      pagination: {
        limit,
        offset,
        total: ranked.length,
        ...(nextOffset === undefined ? {} : { nextOffset })
      }
    };
  }

  function resolve(ref: string): ResolveResult {
    const byId = skills.find((skill) => skill.id === ref);
    if (byId) return { skill: byId };

    const byName = skills.filter((skill) => skill.name === ref);
    if (byName.length === 1) return { skill: byName[0]! };
    if (byName.length > 1) {
      return {
        error: `ambiguous skill reference: ${ref}`,
        candidates: byName.map((skill) => ({
          id: skill.id,
          name: skill.name,
          path: skill.path
        }))
      };
    }

    return { error: `skill not found: ${ref}` };
  }

  function replace(nextSkills: AgenticSkill[]): void {
    skills = sortSkills(nextSkills);
  }

  return { list, search, resolve, replace };
}
