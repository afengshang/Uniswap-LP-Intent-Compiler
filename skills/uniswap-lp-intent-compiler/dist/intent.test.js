import assert from "node:assert/strict";
import test from "node:test";
import { parseIntent } from "./intent.js";
test("parseIntent extracts pair, amount, and conservative profile", () => {
    const result = parseIntent("Open a conservative WOKB/USDC LP on X Layer with $250");
    assert.equal(result.pairHint, "WOKB/USDC");
    assert.equal(result.depositUsd, 250);
    assert.equal(result.riskProfile, "conservative");
});
test("parseIntent defaults to balanced profile and default budget", () => {
    const result = parseIntent("Find LP ideas on X Layer");
    assert.equal(result.depositUsd, 100);
    assert.equal(result.riskProfile, "balanced");
    assert.equal(result.preference, "balanced");
});
test("parseIntent ignores the trailing digit in USD₮0 and keeps the explicit budget", () => {
    const result = parseIntent("Build a balanced xETH/USD₮0 LP plan on X Layer with $25");
    assert.equal(result.pairHint, "XETH/USDT0");
    assert.equal(result.depositUsd, 25);
});
