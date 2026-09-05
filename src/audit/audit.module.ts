import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// Módulo "puro" de dominio, sin controlador ni guards HTTP (mismo patrón que
// WalletModule): lo importan tanto AdminModule (para exponer /admin/audit-logs
// y registrar auditoría desde otros controladores admin) como WalletService
// (para componer el registro dentro de su propia transacción de ajuste).
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
