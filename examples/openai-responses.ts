import {
  createSkillHandlers,
  getAgenticSkillTools,
  scanSkills,
  toOpenAIResponsesTools
} from "skill-deck";

const skills = await scanSkills(process.env.SKILLS_ROOT ?? "./skills");
const tools = toOpenAIResponsesTools(getAgenticSkillTools({ includeShell: false }));
const handlers = createSkillHandlers({ skills });

console.log({
  toolNames: tools.map((tool) => tool.name),
  handlerNames: Object.keys(handlers)
});
