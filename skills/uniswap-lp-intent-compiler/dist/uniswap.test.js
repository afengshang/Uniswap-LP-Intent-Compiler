import assert from "node:assert/strict";
import test from "node:test";
import { NATIVE_OKB_SENTINEL } from "./config.js";
import { buildTradingApprovalRequest, buildTradingQuoteRequest, prepareTradingSwapRequest } from "./uniswap.js";
test("buildTradingApprovalRequest maps native sentinel to zero address", () => {
    const request = buildTradingApprovalRequest({
        walletAddress: "0x1111111111111111111111111111111111111111",
        token: NATIVE_OKB_SENTINEL,
        amount: 123n
    });
    assert.equal(request.token, "0x0000000000000000000000000000000000000000");
    assert.equal(request.chainId, 196);
});
test("buildTradingQuoteRequest uses string chain ids", () => {
    const request = buildTradingQuoteRequest({
        walletAddress: "0x1111111111111111111111111111111111111111",
        fromToken: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
        toToken: "0x74b7f16337b8972027f6196a17a631ac6de26d22",
        amountIn: 1000n
    });
    assert.equal(request.tokenInChainId, "196");
    assert.equal(request.tokenOutChainId, "196");
    assert.equal(request.type, "EXACT_INPUT");
});
test("prepareTradingSwapRequest strips null permitData for classic routes", () => {
    const request = prepareTradingSwapRequest({
        routing: "CLASSIC",
        permitData: null,
        permitTransaction: null,
        quote: {
            output: {
                amount: "123"
            }
        }
    });
    assert.ok(!("permitData" in request));
    assert.ok(!("permitTransaction" in request));
});
