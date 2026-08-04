# Wield CLI

Command-line interface for the **Wield** vault protocol - agent-managed allocation for tokenized real-world assets and tokenized equities on **Robinhood Chain Mainnet (chain ID 4663)**.

## Install

Requires [Bun](https://bun.sh) >= 1.1.

```bash
# From GitHub
npm install -g github:useWield/wield-cli

# Or clone + link locally
git clone https://github.com/useWield/wield-cli
cd wield-cli
bun install
npm link
```

```bash
wield --help
```

## Quick start

```bash
cp .env.example .env   # fill RPC_URL, VAULT_ADDRESS, keys

# Agent namespace (operator)
wield agent status                   # vault snapshot from chain
wield agent decisions --limit 5      # recent rebalance decisions
wield agent tick                     # dry-run rebalance (no tx)
wield agent tick --broadcast --yes   # execute rebalance
wield agent analyze                  # AI vault health report
wield agent explain --id 1           # AI explains decision #1
wield agent suggest                  # AI operator recommendations

# User namespace
wield user preview --deposit 100
wield user balance
wield user approve --max --yes
wield user deposit --amount 100 --yes
wield user withdraw --assets 50 --yes
```

| Namespace | Role | Commands |
|---|---|---|
| `agent` | Operator | `status`, `decisions`, `tick`, `analyze`, `explain`, `suggest` |
| `user` | Vault user | `preview`, `balance`, `approve`, `deposit`, `withdraw` |

## Network

| Field | Value |
|---|---|
| Chain | Robinhood Chain Mainnet |
| Chain ID | `4663` |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | https://robinhoodchain.blockscout.com |
| USDG (Paxos) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| Flagship vault | `0x7769526f55cd6B0B8a9E0Bf9e124618A0fe084de` |

## Environment variables

| Variable | Required for | Description |
|---|---|---|
| `RPC_URL` | all | Robinhood Chain RPC endpoint |
| `VAULT_ADDRESS` | all | Wield vault contract |
| `USDG_ADDRESS` | user commands | USDG token |
| `AGENT_PRIVATE_KEY` | `agent tick` | Agent signer |
| `USER_PRIVATE_KEY` | user write commands | Your wallet key |
| `UNDERLYING_1` | `agent tick` | First whitelisted underlying |
| `UNDERLYING_2` | `agent tick` | Second whitelisted underlying |
| `DB_PATH` | `agent decisions`, `agent explain` | Path to the agent decision database |

### LLM provider (AI commands only)

Set **one**:

| Variable | Provider | Default model |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI | `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | Anthropic | `claude-3-5-haiku-latest` |
| `OLLAMA_HOST` | Ollama (local) | `llama3.2` |

Overrides: `OPENAI_MODEL`, `ANTHROPIC_MODEL`, `OLLAMA_MODEL`. Without a key the AI commands print a hint and the rest of the CLI works normally.

## Global flags

| Flag | Description |
|---|---|
| `--json` | JSON on stdout, human messages on stderr |
| `--yes` | Skip confirmation prompts |
| `--help`, `-h` | Help for any command |
| `--api-key <key>` | Thin-client mode (CLI - API - chain) |
| `--api-url <url>` | API base URL (default `https://app.usewield.io`) |

### Thin-client mode

With `--api-key`, reads go through the Wield API instead of a direct RPC. Writes are still signed locally and only then broadcast.

```bash
wield agent status --api-key wield_xxxx
```

Get a key at https://app.usewield.io/app/settings.

## Key safety

- Read-only commands (`status`, `decisions`, `analyze`, `explain`, `suggest`, `preview`, `balance --address`) never load a private key.
- `agent` commands load only `AGENT_PRIVATE_KEY`; `user` commands load only `USER_PRIVATE_KEY`.
- `agent tick` is dry-run by default and needs `--broadcast --yes` to send a transaction.
- Robinhood Chain uses legacy gas pricing - the CLI sets this for you.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic error |
| 2 | User aborted |
| 3 | Missing or invalid env variable |
| 4 | RPC or LLM error |
| 5 | Transaction reverted |

## Development

```bash
bun install
bun test
bun run typecheck
bun run cli --help
```

## License

MIT - see [LICENSE](LICENSE).
