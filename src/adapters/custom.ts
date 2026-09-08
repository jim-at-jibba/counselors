import type { ToolCapabilities } from '../core/capabilities.js';
import type {
  Invocation,
  ReadOnlyLevel,
  RunRequest,
  ToolConfig,
} from '../types.js';
import { BaseAdapter } from './base.js';

export class CustomAdapter extends BaseAdapter {
  id: string;
  displayName: string;
  commands: string[];
  installUrl = '';
  readOnly: { level: ReadOnlyLevel };
  models: { id: string; name: string; recommended?: boolean }[] = [];

  private config: ToolConfig;

  constructor(id: string, config: ToolConfig) {
    super();
    this.id = id;
    this.displayName = id;
    this.commands = [config.binary];
    this.readOnly = { level: config.readOnly.level };
    this.config = config;
  }

  /**
   * Custom tools carry arbitrary user-supplied flags, so counselors cannot infer
   * what the sandbox permits. Stay silent unless the user declares it in config —
   * a wrong environment note is worse than none.
   */
  capabilities(_readOnlyPolicy: ReadOnlyLevel): ToolCapabilities {
    return this.config.capabilities ?? { shell: 'full' };
  }

  buildInvocation(req: RunRequest): Invocation {
    const args: string[] = [];

    if (req.extraFlags) {
      args.push(...req.extraFlags);
    }

    // Add read-only flags if applicable
    if (req.readOnlyPolicy !== 'none' && this.config.readOnly.flags) {
      args.push(...this.config.readOnly.flags);
    }

    const cmd = req.binary ?? this.config.binary;

    if (this.config.stdin === true) {
      return {
        cmd,
        args,
        stdin: this.appendCapabilityNote(req.prompt, req),
        cwd: req.cwd,
      };
    }

    args.push(this.fileInstruction(req));

    return { cmd, args, cwd: req.cwd };
  }
}
