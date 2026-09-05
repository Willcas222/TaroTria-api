export const DELETE_EXPIRED_IMAGES_JOB = 'DELETE_EXPIRED_IMAGES';

// jobId fijo: BullMQ dedupe un repeatable job por su jobId, así que
// reiniciar el worker nunca duplica el schedule.
export const DELETE_EXPIRED_IMAGES_SCHEDULE_ID =
  'delete-expired-images-schedule';

export const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

export const CLEANUP_BATCH_SIZE = 100;
