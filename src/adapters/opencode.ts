import type { Invocation, RunRequest } from '../types.js';
import { BaseAdapter } from './base.js';

const READONLY_PERMISSION =
  '{"*":"allow","edit":"deny","bash":"deny","webfetch":"deny","task":"deny"}';
const OPEN_PERMISSION = '"allow"';

export class OpencodeAdapter extends BaseAdapter {
  id = 'opencode';
  displayName = 'OpenCode';
  commands = ['opencode'];
  installUrl = 'https://opencode.ai';
  readOnly = { level: 'enforced' as const };
  modelFlag = '-m';
  models = [
    {
      id: 'claude-opus-4-7',
      compoundId: 'opencode-claude-opus-4-7',
      name: 'Claude Opus 4.7 (Anthropic) — most capable',
      recommended: true,
      extraFlags: ['-m', 'anthropic/claude-opus-4-7'],
    },
    {
      id: 'gpt-5.5',
      compoundId: 'opencode-gpt-5.5',
      name: 'GPT-5.5 (OpenAI)',
      extraFlags: ['-m', 'openai/gpt-5.5'],
    },
    {
      id: 'zen-gpt-5.4',
      compoundId: 'opencode-zen-gpt-5.4',
      name: 'GPT-5.4 (OpenCode hosted — no API key needed)',
      extraFlags: ['-m', 'opencode/gpt-5.4'],
    },
    {
      id: 'deepseek-flash-free',
      compoundId: 'opencode-deepseek-flash-free',
      name: 'DeepSeek V4 Flash (free)',
      extraFlags: ['-m', 'opencode/deepseek-v4-flash-free'],
    },
  ];

  buildInvocation(req: RunRequest): Invocation {
    const instruction = this.fileInstruction(req);
    const args = ['run'];

    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }

    args.push(instruction);

    const permission =
      req.readOnlyPolicy === 'none' ? OPEN_PERMISSION : READONLY_PERMISSION;
    const env = {
      OPENCODE_CONFIG_CONTENT: `{"permission":${permission}}`,
    };

    return { cmd: req.binary ?? 'opencode', args, env, cwd: req.cwd };
  }
}
