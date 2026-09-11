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
import {
  TAROT_FIVE_INTERPRETATION_TASK,
  tarotFiveInterpretationSchema,
} from './tasks/tarot-five-interpretation.schema';
import {
  TAROT_TEN_INTERPRETATION_TASK,
  tarotTenInterpretationSchema,
} from './tasks/tarot-ten-interpretation.schema';

export const AI_TASK_SCHEMAS: Record<string, z.ZodTypeAny> = {
  [TAROT_INTERPRETATION_TASK]: tarotInterpretationSchema,
  [TAROT_FIVE_INTERPRETATION_TASK]: tarotFiveInterpretationSchema,
  [TAROT_TEN_INTERPRETATION_TASK]: tarotTenInterpretationSchema,
  [PALM_IMAGE_LEGIBILITY_TASK]: palmImageLegibilitySchema,
  [PALM_READING_INTERPRETATION_TASK]: palmReadingInterpretationSchema,
};
