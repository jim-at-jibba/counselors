import type { Command } from 'commander';
import { loadConfig } from '../../core/config.js';
import { info } from '../../ui/logger.js';

function formatGroupList(groups: Record<string, string[]>): string {
  const names = Object.keys(groups).sort();
  if (names.length === 0) {
    return '\nNo groups configured. Use "counselors groups add <name> --tools <list>" to create one.\n';
  }

  const lines: string[] = ['', 'Configured groups:', ''];
  for (const name of names) {
    const toolIds = groups[name] ?? [];
    lines.push(
      `  ${name}: ${toolIds.length > 0 ? toolIds.join(', ') : '(empty)'}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function registerGroupListCommand(program: Command): void {
  program
    .command('list')
    .alias('ls')
    .description('List configured groups')
    .action(async () => {
      const config = loadConfig();
      info(formatGroupList(config.groups));
    });
}
