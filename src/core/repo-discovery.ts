import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAdapter } from '../adapters/index.js';
import type { Config } from '../types.js';
import type { ProgressEvent } from './dispatcher.js';
import { execute } from './executor.js';
import { buildToolReport } from './text-utils.js';

export interface RepoDiscoveryOptions {
  config: Config;
  toolId: string;
  cwd: string;
  target?: string;
  onProgress?: (event: ProgressEvent) => void;
}

export interface RepoDiscoveryResult {
  repoContext: string;
}

/**
 * Phase 1: Run one tool to scan the repo and produce a freeform repo context string.
 * The discovery prompt is lightweight — it asks the agent to identify the main tech
 * stack(s) and main modules/directories.
 */
export async function runRepoDiscovery(
  options: RepoDiscoveryOptions,
): Promise<RepoDiscoveryResult> {
  const { config, toolId, cwd, target, onProgress } = options;

  const toolConfig = config.tools[toolId];
  if (!toolConfig) {
    throw new Error(`Tool "${toolId}" not configured for discovery.`);
  }

  const adapter = resolveAdapter(toolId, toolConfig);

  const targetClause = target
    ? `The user wants to focus on: "${target}". Resolve this into concrete directories/files that exist in the project.`
    : 'Analyze the entire project.';

  const prompt = `You are analyzing a software project to understand its structure.

Working directory: ${cwd}

${targetClause}

Identify the following and output them as plain text (no JSON, no markdown fences):

1. **Main tech stack(s)**: Languages, frameworks, and build tools used.
2. **Main modules/directories**: Source code directories worth exploring (not vendor, node_modules, or generated files).

Be concise. This output will be passed to another agent as context for a more detailed task.`;

  const tmpDir = mkdtempSync(join(tmpdir(), 'counselors-discover-'));
  const promptFile = join(tmpDir, 'discover-prompt.md');
  writeFileSync(promptFile, prompt, 'utf-8');

  const timeout = toolConfig.timeout ?? config.defaults.timeout;
  const invocation = adapter.buildInvocation({
    prompt,
    promptFilePath: promptFile,
    toolId,
    outputDir: tmpDir,
    readOnlyPolicy: 'enforced',
    timeout,
    cwd,
    binary: toolConfig.binary,
    extraFlags: toolConfig.extraFlags,
  });

  let result;
  try {
    result = await execute(invocation, timeout * 1000, (pid) => {
      onProgress?.({ toolId, event: 'started', pid });
    });
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }

  onProgress?.({
    toolId,
    event: 'completed',
    report: buildToolReport(toolId, result),
  });

  if (result.timedOut) {
    throw new Error(
      `Discovery timed out after ${timeout}s. Try a simpler target.`,
    );
  }

  if (result.exitCode !== 0) {
    throw new Error(
      `Discovery failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`,
    );
  }

  return { repoContext: result.stdout.trim() };
}
