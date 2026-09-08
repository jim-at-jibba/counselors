import { sanitizePath } from '../constants.js';
import {
  capabilityNote,
  defaultCapabilities,
  type ToolCapabilities,
} from '../core/capabilities.js';
import { countWords } from '../core/text-utils.js';
import type {
  ExecResult,
  Invocation,
  ReadOnlyLevel,
  RunRequest,
  ToolAdapter,
  ToolConfig,
  ToolReport,
} from '../types.js';

export abstract class BaseAdapter implements ToolAdapter {
  abstract id: string;
  abstract displayName: string;
  abstract commands: string[];
  abstract installUrl: string;
  abstract readOnly: { level: ReadOnlyLevel };
  modelFlag = '-m';
  abstract models: { id: string; name: string; recommended?: boolean }[];

  abstract buildInvocation(req: RunRequest): Invocation;

  getEffectiveReadOnlyLevel(_toolConfig: ToolConfig): ReadOnlyLevel {
    return this.readOnly.level;
  }

  /**
   * What the agent can actually do once this adapter's sandbox flags are
   * applied. Adapters override this when they grant scoped shell access;
   * the value drives the environment note appended to every prompt so agents
   * don't burn turns attempting calls the sandbox will deny.
   */
  capabilities(readOnlyPolicy: ReadOnlyLevel): ToolCapabilities {
    return defaultCapabilities(readOnlyPolicy);
  }

  /**
   * Instruction pointing a file-based CLI at the prompt file. Stays on a single
   * line so a hostile prompt-file path cannot smuggle extra instructions past
   * sanitizePath by way of an embedded newline.
   */
  protected fileInstruction(req: RunRequest): string {
    const instruction = `Read the file at ${sanitizePath(req.promptFilePath)} and follow the instructions within it.`;
    const note = this.capabilityNote(req);
    return note ? `${instruction} ${note}` : instruction;
  }

  /** Append the environment note to a prompt delivered over stdin. */
  protected appendCapabilityNote(text: string, req: RunRequest): string {
    const note = this.capabilityNote(req);
    return note ? `${text}\n\n${note}` : text;
  }

  private capabilityNote(req: RunRequest): string {
    return capabilityNote(this.capabilities(req.readOnlyPolicy));
  }

  parseResult(result: ExecResult): Partial<ToolReport> {
    return {
      status: result.timedOut
        ? 'timeout'
        : result.exitCode === 0
          ? 'success'
          : 'error',
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      wordCount: countWords(result.stdout),
    };
  }
}
