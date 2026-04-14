#!/usr/bin/env node
import { discoverCandidatePools } from "./candidate.js";
import { parseIntent } from "./intent.js";
import { closeLp, monitorPosition, openLp, planLp, suggestReposition } from "./lp.js";
import { getPreflightStatus } from "./preflight.js";
function printJson(payload) {
    console.log(JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
}
function parseArgs(argv) {
    const [command = "plan", ...rest] = argv;
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const token = rest[index];
        if (!token.startsWith("--")) {
            continue;
        }
        const key = token.slice(2);
        const next = rest[index + 1];
        if (!next || next.startsWith("--")) {
            options[key] = true;
            continue;
        }
        const collected = [next];
        index += 1;
        while (index + 1 < rest.length && !rest[index + 1].startsWith("--")) {
            collected.push(rest[index + 1]);
            index += 1;
        }
        options[key] = collected.join(" ").replace(/\^/gu, "");
    }
    return { command, options };
}
function parseMode(input) {
    if (input === "official-skills-hybrid" || input === "fallback-onchainos") {
        return input;
    }
    return undefined;
}
function intentFromOptions(options) {
    const rawIntent = typeof options.intent === "string" ? options.intent : "Find low-risk but decent-yield LPs on X Layer";
    const parsed = parseIntent(rawIntent);
    if (typeof options.pair === "string") {
        parsed.pairHint = String(options.pair).toUpperCase();
    }
    if (typeof options.pool === "string") {
        parsed.poolAddressHint = String(options.pool).toLowerCase();
    }
    return parsed;
}
async function main() {
    const parsed = parseArgs(process.argv.slice(2));
    const intent = intentFromOptions(parsed.options);
    const swapPlanningMode = parseMode(parsed.options.mode);
    switch (parsed.command) {
        case "preflight": {
            const status = await getPreflightStatus();
            printJson({ ok: true, data: status });
            return;
        }
        case "discover": {
            const candidates = await discoverCandidatePools(intent);
            printJson({ ok: true, data: candidates });
            return;
        }
        case "plan": {
            const plan = await planLp(intent, { swapPlanningMode });
            printJson({ ok: true, data: plan });
            return;
        }
        case "open": {
            const receipt = await openLp(intent, {
                confirm: parsed.options.confirm === true,
                swapPlanningMode
            });
            printJson({ ok: true, data: receipt });
            return;
        }
        case "monitor": {
            if (typeof parsed.options["token-id"] !== "string") {
                throw new Error("monitor requires --token-id <id>");
            }
            const health = await monitorPosition(parsed.options["token-id"]);
            printJson({ ok: true, data: health });
            return;
        }
        case "close": {
            if (typeof parsed.options["token-id"] !== "string") {
                throw new Error("close requires --token-id <id>");
            }
            const receipt = await closeLp(parsed.options["token-id"], parsed.options.confirm === true);
            printJson({ ok: true, data: receipt });
            return;
        }
        case "reposition-suggest": {
            if (typeof parsed.options["token-id"] !== "string") {
                throw new Error("reposition-suggest requires --token-id <id>");
            }
            const suggestion = await suggestReposition(parsed.options["token-id"]);
            printJson({ ok: true, data: suggestion });
            return;
        }
        default:
            throw new Error(`Unsupported command: ${parsed.command}`);
    }
}
main().catch((error) => {
    console.error(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exitCode = 1;
});
