import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { WalletService } from './wallet.service';

// Módulo "puro" de dominio: solo el servicio, sin controlador ni
// dependencias de autenticación. Lo importan tanto el lado API
// (AuthModule para el bono, ReadingsModule para reservar/consumir) como el
// worker (los processors, para confirmar/liberar) — ninguno de los dos
// necesita cargar guards HTTP para poder usar WalletService. La ruta HTTP
// real vive en WalletHttpModule. Importa AuditModule (también puro, sin
// HTTP) porque adjustBalance registra la auditoría dentro de su misma
// transacción de base de datos.
@Module({
  imports: [AuditModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
