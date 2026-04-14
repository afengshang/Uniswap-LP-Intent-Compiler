# Uniswap LP Intent Compiler Skill

This directory is the reusable Codex and OpenClaw-style `SKILL.md` package for `uniswap-lp-intent-compiler`.  
这个目录是 `uniswap-lp-intent-compiler` 面向 Codex 和 OpenClaw 风格 `SKILL.md` loader 的可复用技能包。

## Quick Start | 快速开始

From the installed skill directory, run:  
在安装后的 skill 目录中执行：

```bash
npm install
npm run preflight
```

If preflight returns `ready: true`, the skill is ready for natural-language LP workflows.  
如果 preflight 返回 `ready: true`，说明这个 skill 已经可以执行自然语言 LP 工作流。

## Install | 安装方式

Copy this folder itself into:  
把这个目录本身复制到：

```text
$CODEX_HOME/skills/uniswap-lp-intent-compiler
```

Typical target paths:  
常见目标路径示例：

```text
Windows: %USERPROFILE%\.codex\skills\uniswap-lp-intent-compiler
macOS/Linux: ~/.codex/skills/uniswap-lp-intent-compiler
```

## What To Copy | 需要复制的内容

Keep these files and directories:  
保留下列文件和目录：

- `SKILL.md`
- `package.json`
- `tsconfig.json`
- `agents/`
- `scripts/`
- `references/`

Optional | 可选：

- `dist/`

Do not copy | 不要复制：

- `node_modules/` from another workspace / 不要从其他工作区复制 `node_modules/`

## First-Time Setup | 首次初始化

Run this once inside the installed skill directory:  
在安装后的 skill 目录里执行一次：

```bash
npm install
```

Then verify:  
然后执行验证：

```bash
npm run preflight
```

If `dist/` is missing, the launcher can rebuild it on first run as long as the skill directory has its own dependencies installed.  
如果没有 `dist/`，只要当前 skill 目录已经安装好依赖，启动器会在首次运行时自动重建。

If Codex was already running, restart the session so the skill index refreshes.  
如果 Codex 已经在运行，请重开会话以刷新 skill 索引。

For Claude Code, use the repository root adapter files instead:  
如果是 Claude Code，请改用仓库根目录里的适配文件：

- `CLAUDE.md`
- `.claude/skills/uniswap-lp-intent-compiler/`
- `.claude/agents/uniswap-lp-orchestrator.md`
- optional `.claude/commands/` / 可选 `.claude/commands/`

## Runtime Requirements | 运行前提

- official `liquidity-planner` skill installed / 已安装官方 `liquidity-planner`
- official `swap-integration` skill installed / 已安装官方 `swap-integration`
- `onchainos` CLI installed / 已安装 `onchainos` CLI
- Agentic Wallet logged in / Agentic Wallet 已登录
- workspace `.env` containing `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`
- `UNISWAP_API_KEY` for prize-mode official routing / 奖项模式的官方路由需要 `UNISWAP_API_KEY`

## Credential Links | 凭证获取链接

Use `.env.example` in the repository root as the template.  
请使用仓库根目录的 `.env.example` 作为模板。

- OKX OnchainOS Dev Portal:
  - [OKX OnchainOS Dev Portal](https://web3.okx.com/onchainos/dev-portal)
  - 用于获取 `OKX_API_KEY`、`OKX_SECRET_KEY`、`OKX_PASSPHRASE`
- Agentic Wallet setup guide:
  - [Agentic Wallet setup guide](https://web3.okx.com/onchainos/dev-docs/wallet/install-your-agentic-wallet)
  - 用于安装和登录 Agentic Wallet
- Uniswap API docs:
  - [Uniswap API Introduction](https://api-docs.uniswap.org/introduction)
  - [Uniswap API FAQs](https://api-docs.uniswap.org/guides/faqs)
  - 按文档中的 Developer Portal 指引申请 `UNISWAP_API_KEY`

## Natural-Language Capabilities | 自然语言能力

After `preflight` passes, the skill exposes a natural-language menu for:  
在 `preflight` 通过后，skill 会暴露一组自然语言能力菜单，包括：

- discovering and ranking X Layer LP candidates / 搜索并排序 X Layer LP 候选
- compiling an LP plan for a selected pair / 为指定交易对生成 LP 计划
- opening an LP with Agentic Wallet guardrails / 通过 Agentic Wallet 护栏执行开仓
- monitoring an LP NFT / 监控 LP NFT 仓位
- generating a reposition suggestion / 生成 reposition 建议
- generating a safe LP close plan / 生成安全的 LP close 计划

## Supported / Not Supported | 支持范围 / 暂不支持

Supported now | 当前支持：

- X Layer LP workflows / X Layer LP 工作流
- LP discovery, planning, open, monitor, reposition suggestion, and close plan / 候选发现、规划、开仓、监控、reposition 建议和 close 计划
- Codex and OpenClaw-style `SKILL.md` installation / Codex 与 OpenClaw 风格 `SKILL.md` 安装方式
- skill-local dependency install with `npm install` / 通过 `npm install` 安装 skill 本地依赖

Not supported in this version | 当前版本暂不支持：

- automatic reposition broadcasting / 不自动广播 reposition
- unlimited approvals / 不使用无限授权
- non-X Layer execution / 不支持非 X Layer 执行
