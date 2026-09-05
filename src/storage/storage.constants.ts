export const PALM_IMAGE_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type PalmImageMimeType = (typeof PALM_IMAGE_ALLOWED_MIME_TYPES)[number];

export const MIME_TYPE_TO_EXTENSION: Record<PalmImageMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const PALM_IMAGE_MIN_DIMENSION_PX = 200;

export const PRESIGNED_UPLOAD_EXPIRY_SECONDS = 5 * 60;
