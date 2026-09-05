import { z } from 'zod';

export const PALM_READING_INTERPRETATION_TASK = 'PALM_READING_INTERPRETATION';

export const palmReadingInterpretationSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  observations: z.object({
    heartLine: z.string().min(1),
    headLine: z.string().min(1),
    lifeLine: z.string().min(1),
    generalShape: z.string().min(1),
  }),
  strengths: z.array(z.string().min(1)).min(1),
  growthAreas: z.array(z.string().min(1)).min(1),
  reflection: z.string().min(1),
  disclaimer: z.string().min(1),
});

export type PalmReadingInterpretation = z.infer<
  typeof palmReadingInterpretationSchema
>;
