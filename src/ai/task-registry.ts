import type { z } from 'zod';
import {
  PALM_IMAGE_LEGIBILITY_TASK,
  palmImageLegibilitySchema,
} from './tasks/palm-legibility.schema';
import {
  PALM_READING_INTERPRETATION_TASK,
  palmReadingInterpretationSchema,
} from './tasks/palm-reading-interpretation.schema';
import {
  TAROT_INTERPRETATION_TASK,
  tarotInterpretationSchema,
} from './tasks/tarot-interpretation.schema';

export const AI_TASK_SCHEMAS: Record<string, z.ZodTypeAny> = {
  [TAROT_INTERPRETATION_TASK]: tarotInterpretationSchema,
  [PALM_IMAGE_LEGIBILITY_TASK]: palmImageLegibilitySchema,
  [PALM_READING_INTERPRETATION_TASK]: palmReadingInterpretationSchema,
};
