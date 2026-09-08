import type { ToolCapabilities } from '../core/capabilities.js';
import type { Invocation, ReadOnlyLevel, RunRequest } from '../types.js';
import { BaseAdapter } from './base.js';

export class CodexAdapter extends BaseAdapter {
  id = 'codex';
  displayName = 'OpenAI Codex';
  commands = ['codex'];
  installUrl = 'https://github.com/openai/codex';
  readOnly = { level: 'enforced' as const };
  models = [
    {
      id: 'gpt-5.3-codex',
      compoundId: 'codex-5.3-high',
      name: 'GPT-5.3 Codex — high reasoning',
      recommended: true,
      extraFlags: ['-m', 'gpt-5.3-codex', '-c', 'model_reasoning_effort=high'],
    },
    {
      id: 'gpt-5.3-codex',
      compoundId: 'codex-5.3-xhigh',
      name: 'GPT-5.3 Codex — xhigh reasoning',
      extraFlags: ['-m', 'gpt-5.3-codex', '-c', 'model_reasoning_effort=xhigh'],
    },
    {
      id: 'gpt-5.3-codex',
      compoundId: 'codex-5.3-medium',
      name: 'GPT-5.3 Codex — medium reasoning',
      extraFlags: [
        '-m',
        'gpt-5.3-codex',
        '-c',
        'model_reasoning_effort=medium',
      ],
    },
  ];

  // `--sandbox read-only` restricts writes at the filesystem layer, not which
  // commands may run, so the agent keeps a working shell either way.
  capabilities(_readOnlyPolicy: ReadOnlyLevel): ToolCapabilities {
    return { shell: 'full' };
  }

  buildInvocation(req: RunRequest): Invocation {
    const instruction = this.fileInstruction(req);
    const args = ['exec'];

    if (req.readOnlyPolicy !== 'none') {
      args.push('--sandbox', 'read-only');
    }

    args.push('-c', 'web_search=live', '--skip-git-repo-check');

    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }

    args.push(instruction);

    return { cmd: req.binary ?? 'codex', args, cwd: req.cwd };
  }
}
