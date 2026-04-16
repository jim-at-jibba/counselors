import { sanitizePath } from '../constants.js';
import type { Invocation, RunRequest } from '../types.js';
import { BaseAdapter } from './base.js';

export class CopilotAdapter extends BaseAdapter {
  id = 'copilot';
  displayName = 'GitHub Copilot CLI';
  commands = ['copilot'];
  installUrl = 'https://github.com/features/copilot/cli';
  readOnly = { level: 'enforced' as const };
  modelFlag = '--model';
  models = [
    {
      id: 'claude-opus-4.6',
      compoundId: 'copilot-claude-opus-4.6',
      name: 'Claude Opus 4.6 — most capable',
      recommended: true,
      extraFlags: ['--model', 'claude-opus-4.6'],
    },
    {
      id: 'claude-opus-4.6-fast',
      compoundId: 'copilot-claude-opus-4.6-fast',
      name: 'Claude Opus 4.6 Fast',
      extraFlags: ['--model', 'claude-opus-4.6-fast'],
    },
    {
      id: 'claude-opus-4.5',
      compoundId: 'copilot-claude-opus-4.5',
      name: 'Claude Opus 4.5',
      extraFlags: ['--model', 'claude-opus-4.5'],
    },
    {
      id: 'claude-sonnet-4.6',
      compoundId: 'copilot-claude-sonnet-4.6',
      name: 'Claude Sonnet 4.6',
      extraFlags: ['--model', 'claude-sonnet-4.6'],
    },
    {
      id: 'claude-sonnet-4.5',
      compoundId: 'copilot-claude-sonnet-4.5',
      name: 'Claude Sonnet 4.5',
      extraFlags: ['--model', 'claude-sonnet-4.5'],
    },
    {
      id: 'claude-sonnet-4',
      compoundId: 'copilot-claude-sonnet-4',
      name: 'Claude Sonnet 4',
      extraFlags: ['--model', 'claude-sonnet-4'],
    },
    {
      id: 'claude-haiku-4.5',
      compoundId: 'copilot-claude-haiku-4.5',
      name: 'Claude Haiku 4.5',
      extraFlags: ['--model', 'claude-haiku-4.5'],
    },
    {
      id: 'gpt-5.4',
      compoundId: 'copilot-gpt-5.4',
      name: 'GPT-5.4',
      extraFlags: ['--model', 'gpt-5.4'],
    },
    {
      id: 'gpt-5.3-codex',
      compoundId: 'copilot-gpt-5.3-codex',
      name: 'GPT-5.3 Codex',
      extraFlags: ['--model', 'gpt-5.3-codex'],
    },
    {
      id: 'gpt-5.2-codex',
      compoundId: 'copilot-gpt-5.2-codex',
      name: 'GPT-5.2 Codex',
      extraFlags: ['--model', 'gpt-5.2-codex'],
    },
    {
      id: 'gpt-5.2',
      compoundId: 'copilot-gpt-5.2',
      name: 'GPT-5.2',
      extraFlags: ['--model', 'gpt-5.2'],
    },
    {
      id: 'gpt-5.1-codex-max',
      compoundId: 'copilot-gpt-5.1-codex-max',
      name: 'GPT-5.1 Codex Max',
      extraFlags: ['--model', 'gpt-5.1-codex-max'],
    },
    {
      id: 'gpt-5.1-codex',
      compoundId: 'copilot-gpt-5.1-codex',
      name: 'GPT-5.1 Codex',
      extraFlags: ['--model', 'gpt-5.1-codex'],
    },
    {
      id: 'gpt-5.1',
      compoundId: 'copilot-gpt-5.1',
      name: 'GPT-5.1',
      extraFlags: ['--model', 'gpt-5.1'],
    },
    {
      id: 'gpt-5.1-codex-mini',
      compoundId: 'copilot-gpt-5.1-codex-mini',
      name: 'GPT-5.1 Codex Mini',
      extraFlags: ['--model', 'gpt-5.1-codex-mini'],
    },
    {
      id: 'gpt-5-mini',
      compoundId: 'copilot-gpt-5-mini',
      name: 'GPT-5 Mini',
      extraFlags: ['--model', 'gpt-5-mini'],
    },
    {
      id: 'gpt-4.1',
      compoundId: 'copilot-gpt-4.1',
      name: 'GPT-4.1',
      extraFlags: ['--model', 'gpt-4.1'],
    },
    {
      id: 'gemini-3-pro-preview',
      compoundId: 'copilot-gemini-3-pro-preview',
      name: 'Gemini 3 Pro Preview',
      extraFlags: ['--model', 'gemini-3-pro-preview'],
    },
  ];

  buildInvocation(req: RunRequest): Invocation {
    const instruction = `Read the file at ${sanitizePath(req.promptFilePath)} and follow the instructions within it.`;
    const args = ['--no-color', '--allow-all-tools'];

    if (req.readOnlyPolicy !== 'none') {
      args.push('--deny-tool', 'write', '--deny-tool', 'shell');
    }

    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }

    // -p <instruction> must be last for executeTest compatibility
    args.push('-p', instruction);

    return { cmd: req.binary ?? 'copilot', args, cwd: req.cwd };
  }
}
