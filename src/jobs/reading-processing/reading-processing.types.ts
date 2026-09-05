import { randomUUID } from 'node:crypto';

export const PROCESS_TAROT_JOB = 'PROCESS_TAROT';
export const PROCESS_PALM_JOB = 'PROCESS_PALM';

export interface ProcessReadingJobData {
  readingId: string;
}

// BullMQ rejects custom job IDs containing ":" (it uses that character
// internally to namespace Redis keys), so "-" is used here instead.
export function tarotProcessingJobId(readingId: string): string {
  return `${PROCESS_TAROT_JOB}-${readingId}`;
}

export function palmProcessingJobId(readingId: string): string {
  return `${PROCESS_PALM_JOB}-${readingId}`;
}

// Un reintento no puede reutilizar el jobId original: `removeOnFail: 100`
// conserva el job ya fallado en Redis, y BullMQ trata un `add()` con un
// jobId existente como no-op (devuelve el job viejo sin volver a
// ejecutarlo) — el mismo mecanismo que hace idempotente el envío original
// impediría silenciosamente cualquier reintento real. Un sufijo aleatorio
// por intento evita eso; el processor sigue siendo el guardián real de no
// duplicar trabajo (ignora cualquier job si la lectura ya quedó COMPLETED).
export function tarotRetryJobId(readingId: string): string {
  return `${PROCESS_TAROT_JOB}-${readingId}-retry-${randomUUID()}`;
}

export function palmRetryJobId(readingId: string): string {
  return `${PROCESS_PALM_JOB}-${readingId}-retry-${randomUUID()}`;
}
