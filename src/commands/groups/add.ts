import type { Command } from 'commander';
import { SAFE_ID_RE } from '../../constants.js';
import { addGroupToConfig, loadConfig, saveConfig } from '../../core/config.js';
import { error, success } from '../../ui/logger.js';

function parseToolList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function registerGroupAddCommand(program: Command): void {
  program
    .command('add <name>')
    .description('Create or update a group (comma-separated tool IDs)')
    .requiredOption('-t, --tools <list>', 'Comma-separated tool IDs')
    .action(async (name: string, opts: { tools?: string }) => {
      if (!SAFE_ID_RE.test(name)) {
        error(
          `Invalid group name "${name}". Use only letters, numbers, dots, hyphens, and underscores.`,
        );
        process.exitCode = 1;
        return;
      }

      const toolIds = parseToolList(opts.tools);
      if (toolIds.length === 0) {
        error('No tool IDs provided. Use --tools <a,b,c>.');
        process.exitCode = 1;
        return;
      }

      const config = loadConfig();
      if (Object.keys(config.tools).length === 0) {
        error('No tools configured. Run "counselors init" first.');
        process.exitCode = 1;
        return;
      }

      for (const id of toolIds) {
        if (!config.tools[id]) {
          error(`Tool "${id}" is not configured.`);
          process.exitCode = 1;
          return;
        }
      }

      const existed = Boolean(config.groups[name]);
      const updated = addGroupToConfig(config, name, toolIds);
      saveConfig(updated);
      success(
        existed
          ? `Updated group "${name}" (${toolIds.length} tool(s)).`
          : `Created group "${name}" (${toolIds.length} tool(s)).`,
      );
    });
}
