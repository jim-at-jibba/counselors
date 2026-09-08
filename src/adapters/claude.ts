import {
  READ_ONLY_GIT_COMMANDS,
  type ToolCapabilities,
} from '../core/capabilities.js';
import type { Invocation, ReadOnlyLevel, RunRequest } from '../types.js';
import { BaseAdapter } from './base.js';

const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];

/** Prefix-scoped Bash rule, e.g. `Bash(git diff:*)`. */
const bashRule = (command: string) => `Bash(${command}:*)`;

export class ClaudeAdapter extends BaseAdapter {
  id = 'claude';
  displayName = 'Claude Code';
  commands = ['claude'];
  installUrl = 'https://docs.anthropic.com/en/docs/claude-code';
  readOnly = { level: 'enforced' as const };
  modelFlag = '--model';
  models = [
    {
      id: 'opus',
      name: 'Opus 4.6 — most capable',
      recommended: true,
      extraFlags: ['--model', 'opus'],
    },
    {
      id: 'sonnet',
      name: 'Sonnet 4.5 — fast and capable',
      extraFlags: ['--model', 'sonnet'],
    },
    {
      id: 'haiku',
      name: 'Haiku 4.5 — fastest, most affordable',
      extraFlags: ['--model', 'haiku'],
    },
  ];

  capabilities(readOnlyPolicy: ReadOnlyLevel): ToolCapabilities {
    return { shell: readOnlyPolicy === 'none' ? 'full' : 'readOnlyGit' };
  }

  buildInvocation(req: RunRequest): Invocation {
    const instruction = this.fileInstruction(req);
    const args = ['-p', '--output-format', 'text'];

    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }

    if (req.readOnlyPolicy !== 'none') {
      // Bash is available but every invocation must match a git rule below;
      // anything else falls through to the permission prompt, which denies
      // under -p. Without this, reviewing a diff is impossible for the agent.
      const commands = [
        ...READ_ONLY_GIT_COMMANDS,
        ...(req.allowedCommands ?? []),
      ];
      args.push(
        '--tools',
        [...READ_ONLY_TOOLS, 'Bash'].join(','),
        '--allowedTools',
        [...READ_ONLY_TOOLS, ...commands.map(bashRule)].join(','),
        '--strict-mcp-config',
      );
    }

    args.push(instruction);

    return { cmd: req.binary ?? 'claude', args, cwd: req.cwd };
  }
}
