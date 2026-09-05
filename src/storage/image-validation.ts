import { imageSize } from 'image-size';
import type { PalmImageMimeType } from './storage.constants';

// El backend nunca confía en el Content-Type declarado por el cliente: aquí
// se detecta el formato real a partir de los primeros bytes del archivo
// (magic numbers), que es la única forma confiable de rechazar un ejecutable
// o un SVG disfrazado con una extensión de imagen.
export function sniffImageMimeType(buffer: Buffer): PalmImageMimeType | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export interface ImageDimensions {
  widthPx: number;
  heightPx: number;
}

export function readImageDimensions(buffer: Buffer): ImageDimensions | null {
  try {
    const { width, height } = imageSize(buffer);
    if (!width || !height) {
      return null;
    }
    return { widthPx: width, heightPx: height };
  } catch {
    return null;
  }
}
