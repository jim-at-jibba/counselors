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
