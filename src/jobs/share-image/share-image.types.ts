export const GENERATE_SHARE_IMAGE_JOB = 'GENERATE_SHARE_IMAGE';

export interface GenerateShareImageJobData {
  shareLinkId: string;
}

// Mismo motivo que en los demás jobs de esta cola: BullMQ rechaza ":" en un
// jobId custom.
export function generateShareImageJobId(shareLinkId: string): string {
  return `${GENERATE_SHARE_IMAGE_JOB}-${shareLinkId}`;
}
