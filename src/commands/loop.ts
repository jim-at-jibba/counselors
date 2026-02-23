import { join, resolve } from 'node:path';
import type { Command } from 'commander';
import { parseDurationMs } from '../core/cleanup.js';
import { safeWriteFile } from '../core/fs-utils.js';
import { runLoop } from '../core/loop.js';
import { synthesizeFinal } from '../core/synthesis.js';
import { resolvePreset } from '../presets/index.js';
import type { Preset, PresetContext } from '../presets/types.js';
import type { RunManifest } from '../types.js';
import { error, info } from '../ui/logger.js';
import { formatDryRun, formatRunSummary } from '../ui/output.js';
import { ProgressDisplay } from '../ui/progress.js';
import {
  buildDryRunInvocations,
  createOutputDir,
  getPromptLabel,
  resolvePrompt,
  resolveReadOnlyPolicy,
  resolveTools,
} from './_run-shared.js';

export function registerLoopCommand(program: Command): void {
  const loopCmd = program
    .command('loop [prompt]')
    .description(
      'Multi-round dispatch — agents iterate, seeing prior outputs each round',
    )
    .option('-f, --file <path>', 'Use a pre-built prompt file (no wrapping)')
    .option('-t, --tools <tools>', 'Comma-separated list of tools to use')
    .option(
      '-g, --group <groups>',
      'Comma-separated group name(s) to run (expands to tool IDs)',
    )
    .option(
      '--context <paths>',
      'Gather context from paths (comma-separated, or "." for git diff)',
    )
    .option('--read-only <level>', 'Read-only policy: strict, best-effort, off')
    .option('--rounds <N>', 'Number of dispatch rounds (default: 3)', '3')
    .option('--duration <time>', 'Max total duration (e.g. "30m", "1h")')
    .option('--preset <name>', 'Use a built-in preset (e.g. "test")')
    .option('--scope <path>', 'Constrain preset discovery to a directory')
    .option('--dry-run', 'Show what would be dispatched without running')
    .option('--json', 'Output manifest as JSON')
    .option('-o, --output-dir <dir>', 'Base output directory');

  loopCmd.action(
      async (
        promptArg: string | undefined,
        opts: {
          file?: string;
          tools?: string;
          group?: string;
          context?: string;
          readOnly?: string;
          rounds?: string;
          duration?: string;
          preset?: string;
          scope?: string;
          dryRun?: boolean;
          json?: boolean;
          outputDir?: string;
        },
      ) => {
        const cwd = process.cwd();

        // Resolve tools
        const resolved = await resolveTools(opts, cwd);
        if (!resolved) return;
        const { toolIds, config } = resolved;

        // Resolve read-only policy
        let readOnlyPolicy = resolveReadOnlyPolicy(opts.readOnly, config);
        if (!readOnlyPolicy) return;

        // Parse rounds and duration
        const roundsExplicit =
          loopCmd.getOptionValueSource('rounds') === 'cli';
        let rounds = Number.parseInt(opts.rounds ?? '3', 10);
        if (Number.isNaN(rounds) || rounds < 1) {
          error('--rounds must be a positive integer.');
          process.exitCode = 1;
          return;
        }

        let durationMs: number | undefined;
        if (opts.duration) {
          try {
            durationMs = parseDurationMs(opts.duration);
          } catch (e) {
            error(
              e instanceof Error
                ? e.message
                : `Invalid --duration value "${opts.duration}".`,
            );
            process.exitCode = 1;
            return;
          }
          // If duration is set but rounds is default, allow unlimited rounds
          if (!roundsExplicit) rounds = Number.MAX_SAFE_INTEGER;
        }

        // Resolve preset
        let preset: Preset | undefined;
        let presetContext: PresetContext | undefined;

        if (opts.preset) {
          try {
            preset = resolvePreset(opts.preset);
          } catch (e) {
            error(
              e instanceof Error
                ? e.message
                : `Unknown preset "${opts.preset}".`,
            );
            process.exitCode = 1;
            return;
          }

          // Apply preset defaults (only if not explicitly overridden)
          if (!roundsExplicit && !durationMs && preset.defaultRounds) {
            rounds = preset.defaultRounds;
          }
          if (!opts.readOnly && preset.defaultReadOnly) {
            readOnlyPolicy = preset.defaultReadOnly;
          }
        }

        // Resolve prompt
        let promptContent: string;
        let promptSource: 'inline' | 'file' | 'stdin';
        let slug: string;

        if (preset && !promptArg && !opts.file) {
          // Preset mode: prompt arg is optional (it becomes the target).
          // The preset's buildInitialPrompt will generate the actual prompt.
          promptContent = '';
          promptSource = 'inline';
          slug = `${Date.now()}-${preset.name}`;
        } else {
          const prompt = await resolvePrompt(promptArg, opts, cwd, config);
          if (!prompt) return;
          promptContent = prompt.promptContent;
          promptSource = prompt.promptSource;
          slug = prompt.slug;
        }

        if (!slug) slug = `${Date.now()}-loop`;

        // Preset: run prepare phase and override prompt
        if (preset) {
          if (preset.prepare) {
            info(`Running ${preset.name} preset discovery phase...`);
            presetContext = await preset.prepare({
              config,
              toolIds,
              cwd,
              target: promptArg,
              scope: opts.scope,
            });
          } else {
            presetContext = {};
          }

          promptContent = preset.buildInitialPrompt(presetContext, promptArg);
          promptSource = 'inline';
          if (!promptArg) {
            slug = `${Date.now()}-${preset.name}`;
          }
        }

        // Dry run — no filesystem side effects
        if (opts.dryRun) {
          const baseDir = opts.outputDir || config.defaults.outputDir;
          const dryOutputDir = join(baseDir, slug);
          const invocations = buildDryRunInvocations(
            config,
            toolIds,
            promptContent,
            dryOutputDir,
            readOnlyPolicy,
            cwd,
          );
          info(formatDryRun(invocations));
          const roundCount =
            rounds === Number.MAX_SAFE_INTEGER ? 'unlimited' : String(rounds);
          const durStr = durationMs ? `, max duration: ${opts.duration}` : '';
          info(`  Rounds: ${roundCount}${durStr}`);
          if (preset) {
            info(`  Preset: ${preset.name}`);
          }
          return;
        }

        // Create output directory
        const { outputDir, promptFilePath } = createOutputDir(
          opts,
          slug,
          promptContent,
          cwd,
          config,
        );

        const promptLabel = getPromptLabel(promptArg, opts.file);

        // Run multi-round loop
        const runStart = Date.now();
        const effectiveRounds =
          rounds === Number.MAX_SAFE_INTEGER ? 999 : rounds;
        const display = new ProgressDisplay(toolIds, outputDir);

        try {
          const loopResult = await runLoop({
            config,
            toolIds,
            promptContent,
            promptFilePath,
            outputDir,
            readOnlyPolicy,
            cwd,
            rounds: effectiveRounds,
            durationMs,
            onRoundStart: (round) => {
              display.setRound(round, effectiveRounds);
              display.resetTools();
            },
            onProgress: (event) => {
              if (event.event === 'started')
                display.start(event.toolId, event.pid);
              if (event.event === 'completed')
                display.complete(event.toolId, event.report!);
            },
            buildRoundPrompt: preset?.buildRoundPrompt
              ? (round, base, paths) =>
                  preset!.buildRoundPrompt!(
                    round,
                    base,
                    paths,
                    presetContext ?? {},
                  )
              : undefined,
          });

          display.stop();

          // Flatten all tool reports for the manifest
          const allReports = loopResult.rounds.flatMap((r) => r.tools);

          // Write final synthesis
          const finalSynthesis = synthesizeFinal(loopResult.rounds, outputDir);
          safeWriteFile(
            resolve(outputDir, 'final-synthesis.md'),
            finalSynthesis,
          );

          // Build manifest
          const manifest: RunManifest = {
            timestamp: new Date().toISOString(),
            slug,
            prompt: promptLabel,
            promptSource,
            readOnlyPolicy,
            tools: allReports,
            rounds: loopResult.rounds,
            totalRounds: loopResult.rounds.length,
            durationMs: Date.now() - runStart,
            preset: preset?.name,
          };

          safeWriteFile(
            resolve(outputDir, 'run.json'),
            JSON.stringify(manifest, null, 2),
          );

          if (opts.json) {
            info(JSON.stringify(manifest, null, 2));
          } else {
            info(formatRunSummary(manifest));
          }
        } catch (e) {
          display.stop();
          throw e;
        }
      },
    );
}
