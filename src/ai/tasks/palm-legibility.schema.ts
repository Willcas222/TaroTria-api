import { z } from 'zod';

export const PALM_IMAGE_LEGIBILITY_TASK = 'PALM_IMAGE_LEGIBILITY_CHECK';

export const palmImageLegibilitySchema = z.object({
  isLegiblePalm: z.boolean(),
  reason: z.string().min(1),
});

export type PalmImageLegibility = z.infer<typeof palmImageLegibilitySchema>;
