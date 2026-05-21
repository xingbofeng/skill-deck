import {
  scanSkills,
  toOpenAIAgentsLocalSkills
} from "skill-deck";

const skills = await scanSkills(process.env.SKILLS_ROOT ?? "./skills");

const shellToolConfig = {
  shell: "your-shell-instance",
  environment: {
    type: "local",
    skills: toOpenAIAgentsLocalSkills(skills)
  },
  needsApproval: true
};

console.log(shellToolConfig);
