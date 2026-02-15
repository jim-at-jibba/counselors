import type { Command } from 'commander';
import {
  loadConfig,
  removeGroupFromConfig,
  saveConfig,
} from '../../core/config.js';
import { error, success } from '../../ui/logger.js';

export function registerGroupRemoveCommand(program: Command): void {
  program
    .command('remove <name>')
    .description('Remove a configured group')
    .action(async (name: string) => {
      const config = loadConfig();

      if (!config.groups[name]) {
        error(`Group "${name}" is not configured.`);
        process.exitCode = 1;
        return;
      }

      const updated = removeGroupFromConfig(config, name);
      saveConfig(updated);
      success(`Removed group "${name}".`);
    });
}
