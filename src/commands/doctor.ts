import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import { resolveAdapter } from '../adapters/index.js';
import {
  AMP_DEEP_SETTINGS_FILE,
  AMP_SETTINGS_FILE,
  CONFIG_FILE,
} from '../constants.js';
import { loadConfig } from '../core/config.js';
import { findBinary, getBinaryVersion } from '../core/discovery.js';
import { detectInstallation } from '../core/upgrade.js';
import type { DoctorCheck } from '../types.js';
import { info } from '../ui/logger.js';
import { formatDoctorResults } from '../ui/output.js';

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check tool configuration and health')
    .action(async () => {
      const checks: DoctorCheck[] = [];

      // Check config file
      if (existsSync(CONFIG_FILE)) {
        checks.push({
          name: 'Config file',
          status: 'pass',
          message: CONFIG_FILE,
        });
      } else {
        checks.push({
          name: 'Config file',
          status: 'warn',
          message: 'Not found. Run "counselors init" to create one.',
        });
      }

      let config;
      try {
        config = loadConfig();
      } catch (e) {
        checks.push({
          name: 'Config parse',
          status: 'fail',
          message: `Invalid config: ${e}`,
        });
        info(formatDoctorResults(checks));
        process.exitCode = 1;
        return;
      }

      const toolIds = Object.keys(config.tools);
      if (toolIds.length === 0) {
        checks.push({
          name: 'Tools configured',
          status: 'warn',
          message: 'No tools configured. Run "counselors init".',
        });
      }

      // Check each configured tool
      for (const id of toolIds) {
        const toolConfig = config.tools[id];

        // Binary exists + executable
        const binaryPath = findBinary(toolConfig.binary);
        if (binaryPath) {
          checks.push({
            name: `${id}: binary`,
            status: 'pass',
            message: binaryPath,
          });
        } else {
          checks.push({
            name: `${id}: binary`,
            status: 'fail',
            message: `"${toolConfig.binary}" not found in PATH`,
          });
          continue;
        }

        // Version check
        const version = getBinaryVersion(binaryPath);
        if (version) {
          checks.push({
            name: `${id}: version`,
            status: 'pass',
            message: version,
          });
        } else {
          checks.push({
            name: `${id}: version`,
            status: 'warn',
            message: 'Could not determine version',
          });
        }

        // Read-only capability
        const adapter = resolveAdapter(id, toolConfig);
        let readOnlyLevel = adapter.readOnly.level;

        // Amp deep mode uses Bash (a write-capable tool), so it's bestEffort
        const adapterName = toolConfig.adapter ?? id;
        const isAmpDeep =
          adapterName === 'amp' &&
          toolConfig.extraFlags?.includes('deep') &&
          toolConfig.extraFlags?.[toolConfig.extraFlags.indexOf('deep') - 1] ===
            '-m';
        if (isAmpDeep) {
          readOnlyLevel = 'bestEffort';
        }

        checks.push({
          name: `${id}: read-only`,
          status: readOnlyLevel === 'none' ? 'warn' : 'pass',
          message: readOnlyLevel,
        });
      }

      // Check amp settings files if any amp-based tool is configured
      const hasAmp = Object.entries(config.tools).some(
        ([id, t]) => (t.adapter ?? id) === 'amp',
      );
      if (hasAmp) {
        if (existsSync(AMP_SETTINGS_FILE)) {
          checks.push({
            name: 'Amp settings file',
            status: 'pass',
            message: AMP_SETTINGS_FILE,
          });
        } else {
          checks.push({
            name: 'Amp settings file',
            status: 'warn',
            message: 'Not found. Amp read-only mode may not work.',
          });
        }
        if (existsSync(AMP_DEEP_SETTINGS_FILE)) {
          checks.push({
            name: 'Amp deep settings file',
            status: 'pass',
            message: AMP_DEEP_SETTINGS_FILE,
          });
        } else {
          checks.push({
            name: 'Amp deep settings file',
            status: 'warn',
            message: 'Not found. Amp deep mode may not work.',
          });
        }
      }

      // Check groups reference valid tools
      const groups = config.groups ?? {};
      for (const [groupName, members] of Object.entries(groups)) {
        const invalid = members.filter((m) => !config.tools[m]);
        if (invalid.length > 0) {
          checks.push({
            name: `group "${groupName}"`,
            status: 'fail',
            message: `References missing tool(s): ${invalid.join(', ')}`,
          });
        } else {
          checks.push({
            name: `group "${groupName}"`,
            status: 'pass',
            message: `${members.length} tool(s)`,
          });
        }
      }

      // Check for multiple installations
      const detection = detectInstallation();
      const sources: string[] = [];
      if (detection.brewVersion) sources.push('homebrew');
      if (detection.npmVersion) sources.push('npm');
      // Check standalone paths independently of the detected method
      const home = process.env.HOME ?? '';
      const standalonePaths = [
        join(home, '.local', 'bin', 'counselors'),
        join(home, 'bin', 'counselors'),
      ];
      const hasStandalone = home && standalonePaths.some((p) => existsSync(p));
      if (hasStandalone) sources.push('standalone');
      if (sources.length > 1) {
        checks.push({
          name: 'Multiple installations',
          status: 'warn',
          message: `Found counselors via ${sources.join(', ')}. This may cause version conflicts.`,
        });
      }

      info(formatDoctorResults(checks));

      if (checks.some((c) => c.status === 'fail')) {
        process.exitCode = 1;
      }
    });
}
