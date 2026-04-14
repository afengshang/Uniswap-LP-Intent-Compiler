import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { SwapPlanningMode } from "./types.js";

export interface OfficialSkillDefinition {
  id: "liquidity-planner" | "swap-integration";
  displayName: string;
  path: string;
  responsibility: string;
  proofSection: string;
}

const codexHome = process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex");

export const OFFICIAL_UNISWAP_SKILLS: OfficialSkillDefinition[] = [
  {
    id: "liquidity-planner",
    displayName: "Uniswap liquidity-planner",
    path: path.join(codexHome, "skills", "uniswap", "liquidity-planner", "SKILL.md"),
    responsibility: "LP intent normalization, pool and fee framing, range archetype guidance, analytics conventions",
    proofSection: "Workflow steps 3-7 and position-types/data-providers references"
  },
  {
    id: "swap-integration",
    displayName: "Uniswap swap-integration",
    path: path.join(codexHome, "skills", "uniswap", "swap-integration", "SKILL.md"),
    responsibility: "Trading API approval, quote, swap request construction, validation, retry and confirmation rules",
    proofSection: "Trading API 3-step flow and critical implementation notes"
  }
];

export const OFFICIAL_UNISWAP_SKILL_NAMES = OFFICIAL_UNISWAP_SKILLS.map((skill) => skill.displayName);
export const DEFAULT_SWAP_PLANNING_MODE: SwapPlanningMode = "official-skills-hybrid";

export function getOfficialSkillStatuses() {
  return OFFICIAL_UNISWAP_SKILLS.map((skill) => ({
    ...skill,
    installed: fs.existsSync(skill.path)
  }));
}

export function getMissingOfficialSkillIds(): string[] {
  return getOfficialSkillStatuses()
    .filter((skill) => !skill.installed)
    .map((skill) => skill.id);
}

export function getOfficialSkillPaths(): string[] {
  return OFFICIAL_UNISWAP_SKILLS.map((skill) => skill.path);
}
