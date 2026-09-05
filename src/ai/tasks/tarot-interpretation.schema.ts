import { z } from 'zod';

export const TAROT_INTERPRETATION_TASK = 'TAROT_THREE_INTERPRETATION';

export const tarotInterpretationSchema = z.object({
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
    .min(1),
  insights: z.array(z.string().min(1)).min(1),
  suggestedActions: z.array(z.string().min(1)).min(1),
  closingReflection: z.string().min(1),
  disclaimer: z.string().min(1),
});

export type TarotInterpretation = z.infer<typeof tarotInterpretationSchema>;
