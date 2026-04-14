import { spawn } from "node:child_process";

import { hasEnvKeys, loadWorkspaceEnv } from "./env.js";
import { getMissingOfficialSkillIds, getOfficialSkillPaths, getOfficialSkillStatuses, OFFICIAL_UNISWAP_SKILL_NAMES } from "./official-skills.js";
import type { PreflightStatus, SkillCapabilityPrompt, SwapPlanningMode } from "./types.js";

export const REQUIRED_OKX_ENV_KEYS = ["OKX_API_KEY", "OKX_SECRET_KEY", "OKX_PASSPHRASE"] as const;
export const REQUIRED_UNISWAP_ENV_KEYS = ["UNISWAP_API_KEY"] as const;
export const CAPABILITY_PROMPTS: SkillCapabilityPrompt[] = [
  {
    id: "discover-lp-candidates",
    capability: "Discover and rank X Layer LP candidates",
    naturalLanguagePrompt: "Use the official Uniswap skills to find low-risk but decent-yield LP candidates on X Layer.",
    cliEquivalent: 'npm run lp -- plan --intent "Find low-risk but decent-yield LPs on X Layer"'
  },
  {
    id: "build-lp-plan",
    capability: "Compile a selected-pair LP plan",
    naturalLanguagePrompt: "Build a balanced WOKB/USDC LP plan on X Layer with $25 using official Uniswap range guidance.",
    cliEquivalent: "npm run lp -- plan --intent 'Build a balanced WOKB/USDC LP plan on X Layer with $25'"
  },
  {
    id: "open-lp",
    capability: "Open an LP with Agentic Wallet guardrails",
    naturalLanguagePrompt: "Open the selected X Layer LP after showing me the plan and running tx-scan.",
    cliEquivalent: "npm run lp -- open --intent 'Open a balanced WOKB/USDC LP on X Layer with $2' --confirm"
  },
  {
    id: "monitor-lp",
    capability: "Monitor an LP NFT",
    naturalLanguagePrompt: "Monitor my X Layer LP NFT 155 and tell me whether it is in range.",
    cliEquivalent: "npm run lp -- monitor --token-id 155"
  },
  {
    id: "reposition-suggest",
    capability: "Suggest a reposition without broadcasting",
    naturalLanguagePrompt: "Suggest a reposition for my X Layer LP NFT 155 using the official Uniswap range archetype.",
    cliEquivalent: "npm run lp -- reposition-suggest --token-id 155"
  },
  {
    id: "close-lp",
    capability: "Close or cancel an LP after review",
    naturalLanguagePrompt: "Show me a safe close plan for my X Layer LP NFT 155 before removing liquidity.",
    cliEquivalent: "npm run lp -- close --token-id 155"
  }
];

interface CommandInspection {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface PreflightFacts {
  officialSkillsReady: boolean;
  onchainosInstalled: boolean;
  walletReady: boolean;
  okxEnvReady: boolean;
  uniswapApiKeyReady: boolean;
}

function inspectCommand(args: string[]): Promise<CommandInspection> {
  return new Promise((resolve) => {
    const child = spawn(process.platform === "win32" ? "onchainos.exe" : "onchainos", args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      resolve({
        ok: false,
        exitCode: 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: error instanceof Error ? error.message : String(error)
      });
    });

    child.on("close", (exitCode) => {
      resolve({
        ok: (exitCode ?? 1) === 0 || (exitCode ?? 1) === 2,
        exitCode: exitCode ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

export function deriveExecutionMode(facts: PreflightFacts): SwapPlanningMode {
  return facts.uniswapApiKeyReady ? "official-skills-hybrid" : "fallback-onchainos";
}

export function derivePreflightSummary(facts: PreflightFacts) {
  const ready =
    facts.officialSkillsReady &&
    facts.onchainosInstalled &&
    facts.walletReady &&
    facts.okxEnvReady &&
    facts.uniswapApiKeyReady;

  const remediation: string[] = [];
  if (!facts.officialSkillsReady) {
    remediation.push("Install the official Uniswap liquidity-planner and swap-integration skills under $CODEX_HOME/skills/uniswap/.");
  }
  if (!facts.onchainosInstalled) {
    remediation.push("Install the OnchainOS CLI and make sure `onchainos` is available in PATH.");
  }
  if (!facts.walletReady) {
    remediation.push("Log in to Agentic Wallet before running prize-mode LP execution.");
  }
  if (!facts.okxEnvReady) {
    remediation.push("Populate OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE in the workspace .env.");
  }
  if (!facts.uniswapApiKeyReady) {
    remediation.push("Add UNISWAP_API_KEY to the workspace .env to enable official-skills-hybrid swap routing.");
  }

  return {
    ready,
    executionMode: deriveExecutionMode(facts),
    prizeMode: ready,
    remediation
  };
}

export async function getPreflightStatus(): Promise<PreflightStatus> {
  const envInfo = loadWorkspaceEnv();
  const skillStatuses = getOfficialSkillStatuses();
  const walletStatus = await inspectCommand(["wallet", "status"]);

  let walletReady = false;
  let walletMessage = walletStatus.error ?? walletStatus.stderr ?? "Wallet status unavailable.";

  if (walletStatus.ok) {
    try {
      const parsed = JSON.parse(walletStatus.stdout || walletStatus.stderr) as { ok?: boolean; data?: Record<string, unknown> };
      walletReady = parsed.ok === true;
      walletMessage = walletReady ? "Agentic Wallet is authenticated." : "Agentic Wallet responded but is not ready.";
    } catch {
      walletReady = false;
      walletMessage = "Agentic Wallet returned a non-JSON response.";
    }
  }

  const facts: PreflightFacts = {
    officialSkillsReady: getMissingOfficialSkillIds().length === 0,
    onchainosInstalled: walletStatus.error === undefined,
    walletReady,
    okxEnvReady: hasEnvKeys([...REQUIRED_OKX_ENV_KEYS]),
    uniswapApiKeyReady: hasEnvKeys([...REQUIRED_UNISWAP_ENV_KEYS])
  };

  const summary = derivePreflightSummary(facts);

  return {
    ready: summary.ready,
    prizeMode: summary.prizeMode,
    executionMode: summary.executionMode,
    officialSkillsUsed: OFFICIAL_UNISWAP_SKILL_NAMES,
    officialSkillPaths: getOfficialSkillPaths(),
    envFilePath: envInfo.loadedFrom,
    checks: [
      {
        id: "official-uniswap-skills",
        ok: facts.officialSkillsReady,
        message: facts.officialSkillsReady
          ? "Official Uniswap AI Skills are installed."
          : `Missing official skill(s): ${getMissingOfficialSkillIds().join(", ")}.`,
        remediation:
          "Install liquidity-planner and swap-integration into $CODEX_HOME/skills/uniswap/ before running prize mode."
      },
      {
        id: "onchainos-cli",
        ok: facts.onchainosInstalled,
        message: facts.onchainosInstalled
          ? "OnchainOS CLI is installed."
          : `OnchainOS CLI is unavailable: ${walletStatus.error ?? "spawn failed"}.`,
        remediation: "Install OnchainOS CLI and ensure `onchainos` resolves in PATH."
      },
      {
        id: "agentic-wallet",
        ok: facts.walletReady,
        message: walletMessage,
        remediation: "Run `onchainos wallet login` and verify the current account is ready."
      },
      {
        id: "okx-env",
        ok: facts.okxEnvReady,
        message: facts.okxEnvReady
          ? "OKX API credentials were loaded from the workspace environment."
          : "Missing one or more OKX API credentials.",
        remediation: "Set OKX_API_KEY, OKX_SECRET_KEY, and OKX_PASSPHRASE in the workspace .env."
      },
      {
        id: "uniswap-api-key",
        ok: facts.uniswapApiKeyReady,
        message: facts.uniswapApiKeyReady
          ? "UNISWAP_API_KEY is available for official Trading API routing."
          : "UNISWAP_API_KEY is missing, so the skill will fall back to OnchainOS swap routing.",
        remediation: "Set UNISWAP_API_KEY in the workspace .env for prize-mode official swap routing."
      }
    ],
    capabilityPrompts: CAPABILITY_PROMPTS,
    remediation: summary.remediation
  };
}
