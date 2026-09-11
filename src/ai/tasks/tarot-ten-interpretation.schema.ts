import { z } from 'zod';

export const TAROT_TEN_INTERPRETATION_TASK = 'TAROT_TEN_INTERPRETATION';

export const tarotTenInterpretationSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  cards: z
    .array(
      z.object({
        position: z.string().min(1),
        cardCode: z.string().min(1),
        interpretation: z.string().min(1),
      }),
    )
    .length(10),
  insights: z.array(z.string().min(1)).min(1),
  suggestedActions: z.array(z.string().min(1)).min(1),
  closingReflection: z.string().min(1),
  disclaimer: z.string().min(1),
});

export type TarotTenInterpretation = z.infer<
  typeof tarotTenInterpretationSchema
>;
