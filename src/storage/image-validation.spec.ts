import { readImageDimensions, sniffImageMimeType } from './image-validation';

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const WEBP_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'),
]);

describe('sniffImageMimeType', () => {
  it('detects JPEG from its magic bytes', () => {
    expect(sniffImageMimeType(JPEG_HEADER)).toBe('image/jpeg');
  });

  it('detects PNG from its magic bytes', () => {
    expect(sniffImageMimeType(PNG_HEADER)).toBe('image/png');
  });

  it('detects WebP from its RIFF/WEBP markers', () => {
    expect(sniffImageMimeType(WEBP_HEADER)).toBe('image/webp');
  });

  it('rejects an SVG disguised with an image extension', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(sniffImageMimeType(svg)).toBeNull();
  });

  it('rejects an executable disguised as an image', () => {
    // Cabecera MZ de un ejecutable PE de Windows.
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
    expect(sniffImageMimeType(exe)).toBeNull();
  });

  it('rejects a buffer too short to contain any known header', () => {
    expect(sniffImageMimeType(Buffer.from([0xff]))).toBeNull();
  });
});

describe('readImageDimensions', () => {
  it('returns null for bytes that are not a parseable image', () => {
    expect(readImageDimensions(Buffer.from('not-an-image'))).toBeNull();
  });
});
