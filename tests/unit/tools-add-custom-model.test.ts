import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mock dependencies ──

// Track calls to logger
const mockInfo = vi.fn();
const mockSuccess = vi.fn();
const mockWarn = vi.fn();
const mockError = vi.fn();
vi.mock('../../src/ui/logger.js', () => ({
  info: (...args: unknown[]) => mockInfo(...args),
  success: (...args: unknown[]) => mockSuccess(...args),
  warn: (...args: unknown[]) => mockWarn(...args),
  error: (...args: unknown[]) => mockError(...args),
}));

vi.mock('../../src/ui/output.js', () => ({
  createSpinner: () => ({ start: () => ({ stop: () => {} }) }),
  formatTestResults: (results: { passed: boolean; toolId: string }[]) =>
    results.map((r) => `${r.passed ? '✓' : '✗'} ${r.toolId}`).join('\n'),
}));

// Control prompt responses
const mockSelectModelDetails = vi.fn();
const mockPromptInput = vi.fn();
const mockConfirmOverwrite = vi.fn();
const mockConfirmAction = vi.fn();
const mockPromptSelect = vi.fn();
vi.mock('../../src/ui/prompts.js', () => ({
  selectModelDetails: (...args: unknown[]) => mockSelectModelDetails(...args),
  promptInput: (...args: unknown[]) => mockPromptInput(...args),
  confirmOverwrite: (...args: unknown[]) => mockConfirmOverwrite(...args),
  confirmAction: (...args: unknown[]) => mockConfirmAction(...args),
  promptSelect: (...args: unknown[]) => mockPromptSelect(...args),
}));

// Mock discovery to always find the binary
const mockDiscoverTool = vi
  .fn()
  .mockReturnValue({ found: true, path: '/usr/bin/tool', version: '1.0' });
vi.mock('../../src/core/discovery.js', () => ({
  discoverTool: (...args: unknown[]) => mockDiscoverTool(...args),
  findBinary: () => null,
}));

// Mock config — we'll track what gets saved
let savedConfig: unknown = null;
const testDir = join(tmpdir(), `counselors-add-test-${Date.now()}`);
const testConfigFile = join(testDir, 'config.json');

vi.mock('../../src/core/config.js', () => ({
  loadConfig: () => ({
    version: 1,
    defaults: {
      timeout: 540,
      outputDir: '.counselors',
      readOnly: 'bestEffort',
      maxContextKb: 50,
      maxParallel: 4,
    },
    tools: {},
    groups: {},
    configPath: testConfigFile,
  }),
  addToolToConfig: (_config: unknown, _name: string, _tool: unknown) => {
    // Return the config with the tool added so saveConfig receives it
    const cfg = _config as Record<string, unknown>;
    return {
      ...cfg,
      tools: {
        ...((cfg.tools ?? {}) as Record<string, unknown>),
        [_name]: _tool,
      },
    };
  },
  saveConfig: (config: unknown) => {
    savedConfig = config;
  },
}));

vi.mock('../../src/core/amp-utils.js', () => ({
  copyAmpSettings: vi.fn(),
}));

// Mock executeTest
const mockExecuteTest = vi.fn();
vi.mock('../../src/core/executor.js', () => ({
  executeTest: (...args: unknown[]) => mockExecuteTest(...args),
}));

// Import after mocks
const { registerAddCommand } = await import('../../src/commands/tools/add.js');

// Minimal Commander-like program
function createProgram() {
  let registeredAction: ((toolId?: string) => Promise<void>) | null = null;

  const cmd = {
    description: () => cmd,
    action: (fn: (toolId?: string) => Promise<void>) => {
      registeredAction = fn;
      return cmd;
    },
  };

  const program = {
    command: () => cmd,
    run: (toolId?: string) => registeredAction!(toolId),
  };

  return program;
}

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  savedConfig = null;
  process.exitCode = undefined;
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe('tools add — custom model flow', () => {
  it('prompts for model identifier and extra flags, constructs correct extraFlags', async () => {
    const program = createProgram();
    registerAddCommand(program as any);

    mockSelectModelDetails.mockResolvedValueOnce({ id: '__custom__' });
    mockPromptInput
      .mockResolvedValueOnce('my-custom-model') // model identifier
      .mockResolvedValueOnce('--reasoning high') // extra flags
      .mockResolvedValueOnce('codex-my-custom-model'); // tool name (accept default)
    mockExecuteTest.mockResolvedValueOnce({
      toolId: 'codex-my-custom-model',
      passed: true,
      output: 'OK',
      durationMs: 500,
    });

    await program.run('codex');

    // Should have prompted for model identifier and extra flags
    expect(mockPromptInput).toHaveBeenCalledWith('Model identifier:');
    expect(mockPromptInput).toHaveBeenCalledWith(
      'Extra flags (optional, space-separated):',
    );

    // Should have prompted for name with derived default
    expect(mockPromptInput).toHaveBeenCalledWith(
      'Tool name:',
      'codex-my-custom-model',
    );

    // Should save the config with adapter's modelFlag + model id + extra flags
    expect(savedConfig).not.toBeNull();
    const tools = (savedConfig as any).tools;
    expect(tools['codex-my-custom-model']).toBeDefined();
    expect(tools['codex-my-custom-model'].extraFlags).toEqual([
      '-m',
      'my-custom-model',
      '--reasoning',
      'high',
    ]);
    expect(tools['codex-my-custom-model'].adapter).toBe('codex');

    // Should run a test after saving
    expect(mockExecuteTest).toHaveBeenCalledOnce();
    expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('Added'));
  });

  it('constructs extraFlags with no extra flags provided', async () => {
    const program = createProgram();
    registerAddCommand(program as any);

    mockSelectModelDetails.mockResolvedValueOnce({ id: '__custom__' });
    mockPromptInput
      .mockResolvedValueOnce('gpt-5.1') // model identifier
      .mockResolvedValueOnce('') // no extra flags
      .mockResolvedValueOnce('codex-gpt-5.1'); // tool name
    mockExecuteTest.mockResolvedValueOnce({
      toolId: 'codex-gpt-5.1',
      passed: true,
      output: 'OK',
      durationMs: 200,
    });

    await program.run('codex');

    const tools = (savedConfig as any).tools;
    expect(tools['codex-gpt-5.1'].extraFlags).toEqual(['-m', 'gpt-5.1']);
    expect(mockPromptInput).toHaveBeenCalledWith('Tool name:', 'codex-gpt-5.1');
  });

  it('sanitizes model ID with special characters for default name', async () => {
    const program = createProgram();
    registerAddCommand(program as any);

    mockSelectModelDetails.mockResolvedValueOnce({ id: '__custom__' });
    mockPromptInput
      .mockResolvedValueOnce('openai/gpt-5') // model identifier with /
      .mockResolvedValueOnce('') // no extra flags
      .mockResolvedValueOnce('codex-openai_gpt-5'); // accept sanitized default
    mockExecuteTest.mockResolvedValueOnce({
      toolId: 'codex-openai_gpt-5',
      passed: true,
      output: 'OK',
      durationMs: 200,
    });

    await program.run('codex');

    // Default name should sanitize / to _
    expect(mockPromptInput).toHaveBeenCalledWith(
      'Tool name:',
      'codex-openai_gpt-5',
    );

    // extraFlags should use the raw model ID (not sanitized)
    const tools = (savedConfig as any).tools;
    expect(tools['codex-openai_gpt-5'].extraFlags).toEqual([
      '-m',
      'openai/gpt-5',
    ]);
  });

  it('errors on empty model identifier', async () => {
    const program = createProgram();
    registerAddCommand(program as any);

    mockSelectModelDetails.mockResolvedValueOnce({ id: '__custom__' });
    mockPromptInput.mockResolvedValueOnce('   '); // empty/whitespace model id

    await program.run('codex');

    expect(mockError).toHaveBeenCalledWith('No model identifier provided.');
    expect(process.exitCode).toBe(1);
    expect(mockExecuteTest).not.toHaveBeenCalled();
  });

  it('warns but keeps config when test fails', async () => {
    const program = createProgram();
    registerAddCommand(program as any);

    mockSelectModelDetails.mockResolvedValueOnce({ id: '__custom__' });
    mockPromptInput
      .mockResolvedValueOnce('fake-model') // model identifier
      .mockResolvedValueOnce('') // no extra flags
      .mockResolvedValueOnce('codex-fake-model'); // tool name
    mockExecuteTest.mockResolvedValueOnce({
      toolId: 'codex-fake-model',
      passed: false,
      output: '',
      error: 'Model not found',
      durationMs: 1000,
      command: 'codex exec -m fake-model "Reply with exactly: OK"',
    });

    await program.run('codex');

    // Config should still be saved
    expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('Added'));
    expect(savedConfig).not.toBeNull();

    // Should warn about the failure
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('test failed'),
    );
  });

  it('uses --model flag for claude adapter custom model', async () => {
    const program = createProgram();
    registerAddCommand(program as any);

    mockSelectModelDetails.mockResolvedValueOnce({ id: '__custom__' });
    mockPromptInput
      .mockResolvedValueOnce('sonnet-next') // model identifier
      .mockResolvedValueOnce('') // no extra flags
      .mockResolvedValueOnce('claude-sonnet-next'); // tool name
    mockExecuteTest.mockResolvedValueOnce({
      toolId: 'claude-sonnet-next',
      passed: true,
      output: 'OK',
      durationMs: 300,
    });

    await program.run('claude');

    // Claude adapter uses --model, not -m
    const tools = (savedConfig as any).tools;
    expect(tools['claude-sonnet-next'].extraFlags).toEqual([
      '--model',
      'sonnet-next',
    ]);
    expect(tools['claude-sonnet-next'].adapter).toBe('claude');
  });

  it('does not run test for regular (non-custom) model selection', async () => {
    const program = createProgram();
    registerAddCommand(program as any);

    mockSelectModelDetails.mockResolvedValueOnce({
      id: 'gpt-5.3-codex',
      compoundId: 'codex-5.3-high',
      extraFlags: ['-m', 'gpt-5.3-codex', '-c', 'model_reasoning_effort=high'],
    });
    mockPromptInput.mockResolvedValueOnce('codex-5.3-high'); // tool name

    await program.run('codex');

    expect(mockExecuteTest).not.toHaveBeenCalled();
    expect(mockSuccess).toHaveBeenCalledWith(expect.stringContaining('Added'));

    // Verify saved config has correct extraFlags from the selected model
    const tools = (savedConfig as any).tools;
    expect(tools['codex-5.3-high']).toBeDefined();
    expect(tools['codex-5.3-high'].extraFlags).toEqual([
      '-m',
      'gpt-5.3-codex',
      '-c',
      'model_reasoning_effort=high',
    ]);
    expect(tools['codex-5.3-high'].adapter).toBe('codex');
  });
});
