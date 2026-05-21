import {
  createSkillHandlers,
  getAgenticSkillTools,
  scanSkills,
  toAnthropicTools
} from "skill-deck";

const skills = await scanSkills(process.env.SKILLS_ROOT ?? "./skills");
const tools = toAnthropicTools(getAgenticSkillTools());
const handlers = createSkillHandlers({ skills });

console.log({
  toolNames: tools.map((tool) => tool.name),
  handlerNames: Object.keys(handlers)
});
