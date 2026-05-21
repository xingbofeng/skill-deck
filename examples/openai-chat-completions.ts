import {
  buildSkillsPrompt,
  createSkillHandlers,
  getAgenticSkillTools,
  scanSkills,
  toOpenAIChatTools
} from "skill-deck";

const skills = await scanSkills(process.env.SKILLS_ROOT ?? "./skills");
const system = buildSkillsPrompt(skills);
const tools = toOpenAIChatTools(getAgenticSkillTools());
const handlers = createSkillHandlers({ skills });

console.log({
  system,
  toolNames: tools.map((tool) => tool.function.name),
  handlerNames: Object.keys(handlers)
});
