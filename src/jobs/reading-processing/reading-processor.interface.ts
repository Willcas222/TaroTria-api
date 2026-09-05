// Contrato de dominio para "procesar una lectura hasta un resultado final".
// TarotReadingProcessor es la primera implementación concreta (conectada a
// BullMQ vía @Processor/WorkerHost); un futuro PROCESS_PALM (lectura de
// manos, Fase 6) podría implementar el mismo contrato sin acoplarse al
// motor de tarot.
export interface ReadingProcessor {
  processReading(readingId: string): Promise<void>;
}
