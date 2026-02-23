import { z } from 'zod';
import type { ReadOnlyLevel } from '../types.js';

export interface PresetDefinition {
  name: string;
  description: string;
  defaultRounds?: number;
  defaultReadOnly?: ReadOnlyLevel;
}

export const PresetDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  defaultRounds: z.number().optional(),
  defaultReadOnly: z.enum(['enforced', 'bestEffort', 'none']).optional(),
});
