# Examples

## Natural-Language Examples

- `Use the Uniswap LP Intent Compiler to find lower-risk LP candidates on X Layer.`
- `Build me a balanced WOKB/USDC LP plan on X Layer with $25.`
- `Open the selected X Layer LP after preflight and tx-scan pass.`
- `Monitor LP NFT 155 and tell me whether it is in range.`
- `Suggest a reposition for LP NFT 155 without broadcasting.`
- `Show me the close plan for LP NFT 155 before removing liquidity.`
- `我想组LP`
- `帮我做LP`
- `帮我加池子`
- `我想做流动性`
- `帮我找一个适合的 LP 池子`

## Slash Skill Examples

- `/uniswap-lp-intent-compiler preflight`
- `/uniswap-lp-intent-compiler find low-risk but decent-yield LPs on X Layer`
- `/uniswap-lp-intent-compiler open a balanced WOKB/USDC LP on X Layer with $2`
- `/uniswap-lp-intent-compiler monitor token id 155`
- `/uniswap-lp-intent-compiler suggest a reposition for token id 155`
- `/uniswap-lp-intent-compiler close token id 155`

## Output Expectations

- Start with a short human-readable summary.
- Include `ready`, `prizeMode`, and `executionMode` when reporting preflight.
- Include selected pool, pair archetype, range, and swap mode when reporting plans.
- Include risk notes and confirmation requirements before any state-changing step.
