import type { ReadOnlyLevel } from '../types.js';

/**
 * What shell access a tool actually has once its read-only sandbox is applied.
 *
 * - `none`        — no shell at all; the agent must work from inlined context
 * - `readOnlyGit` — shell restricted to read-only git inspection commands
 * - `full`        — every command may run (writes may still be blocked elsewhere)
 */
export type ShellAccess = 'none' | 'readOnlyGit' | 'full';

export interface ToolCapabilities {
  shell: ShellAccess;
}

/**
 * Read-only git commands worth allowing through a sandbox. Agents reach for
 * these constantly when reviewing changes, and denying them wastes turns.
 */
export const READ_ONLY_GIT_COMMANDS = [
  'git status',
  'git diff',
  'git log',
  'git show',
  'git blame',
] as const;

// Kept free of newlines so it can be appended to a single-line CLI instruction
// argument without weakening the no-control-characters guarantee on that arg.
const NOTES: Record<ShellAccess, string> = {
  none: 'ENVIRONMENT: You have no shell access in this session — do not attempt `git`, `grep`, or any other shell command, as the sandbox denies them and the attempt only wastes your turn. Use your file-reading tools instead, and work from whatever diff or file contents the prompt provides; if something you need is missing, say so in your response rather than shelling out for it.',
  readOnlyGit: `ENVIRONMENT: Your shell access is restricted to read-only git inspection (${READ_ONLY_GIT_COMMANDS.join(', ')}); every other shell command is denied by the sandbox. Invoke these bare and as a single command — you are already in the repository working directory, so a leading \`cd\`, a wrapper prefix, or any \`&&\`, pipe, or redirect stops the command matching the allow-rule and it will be denied. Use your file-reading tools rather than shelling out to \`cat\` or \`grep\`.`,
  full: '',
};

/** Single-line note describing the tool's real capabilities, or '' when unrestricted. */
export function capabilityNote(caps: ToolCapabilities): string {
  return NOTES[caps.shell];
}

/** Default capabilities for an adapter with no sandbox-specific knowledge. */
export function defaultCapabilities(policy: ReadOnlyLevel): ToolCapabilities {
  return { shell: policy === 'none' ? 'full' : 'none' };
}
