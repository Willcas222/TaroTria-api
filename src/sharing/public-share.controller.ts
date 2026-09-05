import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SharingService } from './sharing.service';

// Sin JwtAuthGuard a propósito: el resumen es público por diseño (sección
// 14 del plan, ruta /r/[token] del frontend). La única protección real es
// que SharingService.getPublicSummary() valida que el enlace no esté
// revocado y que la lectura siga COMPLETED.
@Controller('shared')
export class PublicShareController {
  constructor(private readonly sharingService: SharingService) {}

  @Get(':token')
  async getSummary(@Param('token') token: string) {
    return { summary: await this.sharingService.getPublicSummary(token) };
  }

  // El bucket sigue siendo privado (igual que las imágenes de palma) — esto
  // proxya el objeto en vez de exponer una URL directa al bucket, para que
  // revocar el enlace también corte el acceso a la imagen de inmediato.
  //
  // Cross-Origin-Resource-Policy: Helmet aplica "same-origin" por defecto en
  // toda la API (correcto para todo lo demás), pero esta imagen está hecha
  // para incrustarse en cualquier sitio (WhatsApp, redes sociales, nuestro
  // propio frontend en otro origen) — sin este override el navegador la
  // bloquea igual que si fuera un recurso privado. Encontrado real
  // verificando en un navegador de verdad (curl nunca lo habría detectado,
  // no aplica CORP).
  @Get(':token/image')
  async getImage(@Param('token') token: string, @Res() res: Response) {
    const image = await this.sharingService.getShareImageBytes(token);
    if (!image) {
      throw new NotFoundException('Imagen no encontrada.');
    }
    res.set('Content-Type', image.contentType);
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(image.buffer);
  }
}
