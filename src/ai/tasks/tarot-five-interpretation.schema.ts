import { z } from 'zod';

export const TAROT_FIVE_INTERPRETATION_TASK = 'TAROT_FIVE_INTERPRETATION';

export const tarotFiveInterpretationSchema = z.object({
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
    .length(5),
  insights: z.array(z.string().min(1)).min(1),
  suggestedActions: z.array(z.string().min(1)).min(1),
  closingReflection: z.string().min(1),
  disclaimer: z.string().min(1),
});

export type TarotFiveInterpretation = z.infer<
  typeof tarotFiveInterpretationSchema
>;
