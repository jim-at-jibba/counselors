import { describe, expect, it, vi } from 'vitest';

// Mock @inquirer/prompts so we can control what the user "selects"
const mockSelect = vi.fn();
vi.mock('@inquirer/prompts', () => ({
  select: (...args: unknown[]) => mockSelect(...args),
  checkbox: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
}));

const { selectModelDetails } = await import('../../src/ui/prompts.js');

const sampleModels = [
  {
    id: 'model-a',
    name: 'Model A',
    recommended: true,
    extraFlags: ['-m', 'a'],
  },
  {
    id: 'model-b',
    name: 'Model B',
    compoundId: 'tool-model-b',
    extraFlags: ['-m', 'b'],
  },
];

describe('selectModelDetails', () => {
  it('appends "Custom model..." as the last choice', async () => {
    mockSelect.mockResolvedValueOnce('0');

    await selectModelDetails('codex', sampleModels);

    const call = mockSelect.mock.calls[0][0];
    const choices = call.choices;
    expect(choices[choices.length - 1]).toEqual({
      name: 'Custom model...',
      value: '__custom__',
    });
  });

  it('returns sentinel { id: "__custom__" } when custom is selected', async () => {
    mockSelect.mockResolvedValueOnce('__custom__');

    const result = await selectModelDetails('codex', sampleModels);

    expect(result).toEqual({ id: '__custom__' });
    expect(result).not.toHaveProperty('compoundId');
    expect(result).not.toHaveProperty('extraFlags');
  });

  it('returns normal model details when a regular model is selected', async () => {
    mockSelect.mockResolvedValueOnce('1');

    const result = await selectModelDetails('codex', sampleModels);

    expect(result).toEqual({
      id: 'model-b',
      compoundId: 'tool-model-b',
      extraFlags: ['-m', 'b'],
    });
  });

  it('marks recommended models in the choice name', async () => {
    mockSelect.mockResolvedValueOnce('0');

    await selectModelDetails('codex', sampleModels);

    const call = mockSelect.mock.calls[0][0];
    expect(call.choices[0].name).toBe('Model A (Recommended)');
    expect(call.choices[1].name).toBe('Model B');
  });
});
