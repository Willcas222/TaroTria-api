export const VALIDATE_PALM_IMAGE_JOB = 'VALIDATE_PALM_IMAGE';

export interface ValidateImageJobData {
  palmImageId: string;
}

// Mismo motivo que en reading-processing.types.ts: BullMQ rechaza ":" en un
// jobId custom.
export function validateImageJobId(palmImageId: string): string {
  return `${VALIDATE_PALM_IMAGE_JOB}-${palmImageId}`;
}
