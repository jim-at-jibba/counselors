# OpenCode Adapter — Design

**Date:** 2026-05-14
**Status:** Approved, ready for implementation plan

## Goal

Add OpenCode (`opencode` CLI) as a first-class built-in adapter for Counselors, alongside Claude, Codex, Gemini, Amp, and Copilot.

## Background

OpenCode is an open-source coding agent CLI that connects to 150+ models across 7 providers (Anthropic, OpenAI, OpenCode-hosted, OpenCode-Go-hosted, Cerebras, GitHub Copilot, Z.AI). The model picker is `-m provider/model` (e.g. `-m anthropic/claude-opus-4-7`). The CLI exposes `opencode run --prompt "..."` for one-shot, non-interactive runs, with `--format json` for machine-readable output.

The Copilot adapter pattern (curated `models` array enumerated in the adapter source) does not transfer cleanly:

- 150+ models is too many to multi-select in the init wizard.
- The list churns weekly as OpenCode adds providers.
- A curated short list undersells OpenCode's "bring any model" ethos.

Read-only enforcement is also different: OpenCode has no `--deny-tool` flag like Copilot. It exposes a rich `permission` config (allow/ask/deny per tool, with wildcards) sourced from JSON config files OR the `OPENCODE_CONFIG_CONTENT` env var (inline JSON, high precedence — overrides project config).

## Design

### Model selection — hybrid curated + custom

The adapter ships a **deliberately small** curated list (4 entries) covering the obvious flagships plus a free option for new users without API keys. Power users reach beyond it via two paths:

1. **Interactive "Custom model..."** — the existing `selectModelDetails` and `selectModels` flows in `src/ui/prompts.ts` gain a working custom-model entry that prompts for a `provider/model` string and stores it as `extraFlags: ['-m', '<typed>']`. (Today the `__custom__` sentinel exists but is not wired to extraFlags — fixing this benefits every adapter.)
2. **Direct config edit** — users add tool entries to `~/.config/counselors/config.json` with `adapter: 'opencode'` and arbitrary `extraFlags: ['-m', '<anything>']`.

**Curated list (4 models):**

| Model id (compound) | `-m` value | Purpose |
| --- | --- | --- |
| `opencode-claude-opus-4-7` | `anthropic/claude-opus-4-7` | **Recommended** — flagship Anthropic |
| `opencode-gpt-5.5` | `openai/gpt-5.5` | Flagship OpenAI |
| `opencode-zen-gpt-5.4` | `opencode/gpt-5.4` | OpenCode-hosted (no user API key needed) |
| `opencode-deepseek-flash-free` | `opencode/deepseek-v4-flash-free` | Free tier — onboarding-friendly |

### Read-only enforcement — always inject permission config

The adapter **always** sets `OPENCODE_CONFIG_CONTENT` on the child process env (never relies on `--dangerously-skip-permissions`). This makes behavior predictable across all three read-only levels:

- `readOnly: 'enforced'` and `readOnly: 'bestEffort'` →
  ```json
  {"permission":{"*":"allow","edit":"deny","bash":"deny","webfetch":"deny","task":"deny"}}
  ```
- `readOnly: 'none'` →
  ```json
  {"permission":"allow"}
  ```

`readOnly.level` on the adapter is set to `'enforced'` because OpenCode's deny semantics actually block the tool call (no prompt, no fallthrough). `bestEffort` and `enforced` produce the same env in practice — the distinction is for UX/labeling consistency with other adapters.

`OPENCODE_CONFIG_CONTENT` is loaded after project `opencode.json` (per OpenCode's precedence rules), so a user-friendly project config does not weaken the enforcement.

### Adapter implementation sketch

`src/adapters/opencode.ts`:

```ts
export class OpencodeAdapter extends BaseAdapter {
  id = 'opencode';
  displayName = 'OpenCode';
  commands = ['opencode'];
  installUrl = 'https://opencode.ai';
  readOnly = { level: 'enforced' as const };
  modelFlag = '-m';
  models = [
    { id: 'claude-opus-4-7', compoundId: 'opencode-claude-opus-4-7',
      name: 'Claude Opus 4.7 (Anthropic) — most capable',
      recommended: true,
      extraFlags: ['-m', 'anthropic/claude-opus-4-7'] },
    { id: 'gpt-5.5', compoundId: 'opencode-gpt-5.5',
      name: 'GPT-5.5 (OpenAI)',
      extraFlags: ['-m', 'openai/gpt-5.5'] },
    { id: 'zen-gpt-5.4', compoundId: 'opencode-zen-gpt-5.4',
      name: 'GPT-5.4 (OpenCode hosted — no API key needed)',
      extraFlags: ['-m', 'opencode/gpt-5.4'] },
    { id: 'deepseek-flash-free', compoundId: 'opencode-deepseek-flash-free',
      name: 'DeepSeek V4 Flash (free)',
      extraFlags: ['-m', 'opencode/deepseek-v4-flash-free'] },
  ];

  buildInvocation(req: RunRequest): Invocation {
    const instruction = `Read the file at ${sanitizePath(req.promptFilePath)} and follow the instructions within it.`;
    const args = ['run'];
    if (req.extraFlags) args.push(...req.extraFlags);
    args.push('--prompt', instruction);

    const permission = req.readOnlyPolicy === 'none'
      ? '"allow"'
      : '{"*":"allow","edit":"deny","bash":"deny","webfetch":"deny","task":"deny"}';
    const env = { OPENCODE_CONFIG_CONTENT: `{"permission":${permission}}` };

    return { cmd: req.binary ?? 'opencode', args, env, cwd: req.cwd };
  }
}
```

### `selectModelDetails` / `selectModels` fix

Wire the existing "Custom model..." sentinel through to a real `input()` prompt that returns `{ id: <typed>, extraFlags: ['-m', <typed>] }` (using the adapter's `modelFlag` rather than hardcoded `-m`, so it generalises). For the multi-select path, add a "Custom model..." pseudo-choice that loops adding entries until the user declines.

### Registration

`src/adapters/index.ts` — add `opencode: () => new OpencodeAdapter()` to `builtInAdapters`.

### Tests (`tests/unit/adapters/opencode.test.ts`)

Mirror `tests/unit/adapters/copilot.test.ts` plus:

- Invocation includes `run --prompt <instruction>` (default formatted output, no `--format json`).
- `OPENCODE_CONFIG_CONTENT` env present in all three read-only modes.
- `enforced` and `bestEffort` produce identical permission JSON.
- `none` produces `{"permission":"allow"}`.
- `extraFlags` from a model are interleaved before `--prompt`.
- Recommended model is `anthropic/claude-opus-4-7`.

Integration coverage: extend the existing custom-model prompt tests once `selectModelDetails` is fixed.

### Docs

- Add OpenCode row to the supported tools table in `README.md`.
- Add a CHANGELOG entry under unreleased.

## Out of scope

- Dynamic model discovery via `opencode models` (rejected — picker UX gets unusable past ~20 entries; the custom path is the answer).
- Provider auth setup (handled by OpenCode itself via `opencode auth`).
- Per-tool `external_directory` rules (workspace boundary is already implicit via `cwd`).
- Agent selection via `--agent` (can be exposed later as an `extraFlags` recipe in user config; not built-in).

## Risks

- **Permission key drift:** if OpenCode renames a permission key (e.g. `edit` → `write`), our enforced mode silently weakens. Mitigation: pin behavior in a unit test that asserts the literal env string.
- **Output format:** We use OpenCode's default formatted stdout (not `--format json`) so the saved report is consistent with other adapters and the `countWords` parser in `base.ts` produces meaningful numbers. If we later want structured cost/usage data, that's a follow-up.
