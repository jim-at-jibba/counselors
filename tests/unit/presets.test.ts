import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getPresetNames,
  parsePresetYaml,
  resolvePreset,
} from '../../src/presets/index.js';

describe('resolvePreset', () => {
  it('returns the bug-hunt preset by name', () => {
    const preset = resolvePreset('bug-hunt');
    expect(preset.name).toBe('bug-hunt');
    expect(preset.description).toContain('bugs');
    expect(preset.defaultRounds).toBe(3);
    expect(preset.defaultReadOnly).toBe('enforced');
  });

  it('bug-hunt description preserves multi-line content', () => {
    const preset = resolvePreset('bug-hunt');
    expect(preset.description).toContain('\n');
    expect(preset.description).toContain('Logic errors');
    expect(preset.description).toContain('Race conditions');
  });

  it('returns the state-drift preset', () => {
    const preset = resolvePreset('state-drift');
    expect(preset.name).toBe('state-drift');
    expect(preset.description).toContain('impossible states');
    expect(preset.description).toContain('Boolean explosion');
    expect(preset.defaultRounds).toBe(3);
    expect(preset.defaultReadOnly).toBe('enforced');
  });

  it('returns the security preset', () => {
    const preset = resolvePreset('security');
    expect(preset.name).toBe('security');
    expect(preset.description).toContain('Injection flaws');
    expect(preset.description).toContain('XSS');
    expect(preset.defaultRounds).toBe(3);
    expect(preset.defaultReadOnly).toBe('enforced');
  });

  it('throws for unknown preset with available names', () => {
    expect(() => resolvePreset('nonexistent')).toThrow(
      'Unknown preset "nonexistent"',
    );
    expect(() => resolvePreset('nonexistent')).toThrow('bug-hunt');
  });

  it('throws for empty string', () => {
    expect(() => resolvePreset('')).toThrow('Unknown preset ""');
  });

  it('resolves a preset from an absolute file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preset-'));
    const file = join(dir, 'custom.yml');
    writeFileSync(
      file,
      'name: custom\ndescription: A custom preset\ndefaultRounds: 2\n',
    );
    const preset = resolvePreset(file);
    expect(preset.name).toBe('custom');
    expect(preset.description).toBe('A custom preset');
    expect(preset.defaultRounds).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it('resolves a .yaml extension as a file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preset-'));
    const file = join(dir, 'test.yaml');
    writeFileSync(file, 'name: test\ndescription: yaml ext test\n');
    const preset = resolvePreset(file);
    expect(preset.name).toBe('test');
    rmSync(dir, { recursive: true, force: true });
  });

  it('treats bare .yml name without path separator as file path', () => {
    // "my-preset.yml" ends with .yml so isFilePath returns true
    expect(() => resolvePreset('my-preset.yml')).toThrow('Preset file not found');
  });

  it('treats input with backslash as file path', () => {
    expect(() => resolvePreset('presets\\custom')).toThrow(
      'Preset file not found',
    );
  });

  it('throws when preset file does not exist', () => {
    expect(() => resolvePreset('/tmp/nonexistent-preset.yml')).toThrow(
      'Preset file not found',
    );
  });

  it('throws when file exists but has invalid YAML', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preset-'));
    const file = join(dir, 'bad.yml');
    writeFileSync(file, '{{invalid yaml');
    expect(() => resolvePreset(file)).toThrow('Invalid YAML');
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws when file has valid YAML but fails schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preset-'));
    const file = join(dir, 'bad-schema.yml');
    writeFileSync(file, 'defaultRounds: 5\n');
    expect(() => resolvePreset(file)).toThrow('Invalid preset');
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('parsePresetYaml', () => {
  it('parses valid YAML with all fields', () => {
    const preset = parsePresetYaml(
      'name: test\ndescription: Test preset\ndefaultRounds: 1\ndefaultReadOnly: enforced\n',
      'test.yml',
    );
    expect(preset.name).toBe('test');
    expect(preset.description).toBe('Test preset');
    expect(preset.defaultRounds).toBe(1);
    expect(preset.defaultReadOnly).toBe('enforced');
  });

  it('parses minimal YAML with only required fields', () => {
    const preset = parsePresetYaml(
      'name: minimal\ndescription: Just the basics\n',
      'minimal.yml',
    );
    expect(preset.name).toBe('minimal');
    expect(preset.description).toBe('Just the basics');
    expect(preset.defaultRounds).toBeUndefined();
    expect(preset.defaultReadOnly).toBeUndefined();
  });

  it('parses multi-line YAML block scalar description', () => {
    const yaml = `name: multi
description: |
  Line one.
  Line two.

  After blank line.
`;
    const preset = parsePresetYaml(yaml, 'multi.yml');
    expect(preset.description).toContain('Line one.');
    expect(preset.description).toContain('Line two.');
    expect(preset.description).toContain('After blank line.');
  });

  it('strips unknown fields from output', () => {
    const preset = parsePresetYaml(
      'name: test\ndescription: ok\ncustomField: should-be-stripped\n',
      'extra.yml',
    );
    expect(preset).not.toHaveProperty('customField');
    expect(preset.name).toBe('test');
  });

  it('includes source in YAML syntax error message', () => {
    expect(() => parsePresetYaml('{{invalid', 'my-file.yml')).toThrow(
      'my-file.yml',
    );
  });

  it('includes source in schema validation error message', () => {
    expect(() =>
      parsePresetYaml('defaultRounds: 1\n', 'incomplete.yml'),
    ).toThrow('incomplete.yml');
  });

  it('throws on invalid YAML syntax', () => {
    expect(() => parsePresetYaml('{{invalid', 'bad.yml')).toThrow(
      'Invalid YAML',
    );
  });

  it('throws on missing required fields', () => {
    expect(() =>
      parsePresetYaml('defaultRounds: 1\n', 'incomplete.yml'),
    ).toThrow('Invalid preset');
  });

  it('throws on invalid field types', () => {
    expect(() =>
      parsePresetYaml(
        'name: test\ndescription: ok\ndefaultRounds: not-a-number\n',
        'bad-type.yml',
      ),
    ).toThrow('Invalid preset');
  });

  it('throws on invalid defaultReadOnly value', () => {
    expect(() =>
      parsePresetYaml(
        'name: test\ndescription: ok\ndefaultReadOnly: invalid\n',
        'bad-enum.yml',
      ),
    ).toThrow('Invalid preset');
  });

  it('accepts valid defaultReadOnly values', () => {
    for (const level of ['enforced', 'bestEffort', 'none']) {
      const preset = parsePresetYaml(
        `name: test\ndescription: ok\ndefaultReadOnly: ${level}\n`,
        'valid.yml',
      );
      expect(preset.defaultReadOnly).toBe(level);
    }
  });
});

describe('getPresetNames', () => {
  it('returns all built-in preset names', () => {
    const names = getPresetNames();
    expect(names).toContain('bug-hunt');
    expect(names).toContain('state-drift');
    expect(names).toContain('security');
  });

  it('returns non-empty array', () => {
    expect(getPresetNames().length).toBeGreaterThan(0);
  });

  it('returns sorted names', () => {
    const names = getPresetNames();
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});
