import { IsIn } from 'class-validator';
import { PALM_IMAGE_ALLOWED_MIME_TYPES } from '../../storage/storage.constants';

export class PresignPalmImageDto {
  @IsIn(PALM_IMAGE_ALLOWED_MIME_TYPES)
  contentType: (typeof PALM_IMAGE_ALLOWED_MIME_TYPES)[number];
}
