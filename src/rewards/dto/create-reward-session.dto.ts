import { IsIn } from 'class-validator';
import type { RewardType } from '@prisma/client';

const REWARD_TYPES: RewardType[] = [
  'DAILY_CARD_UNLOCK',
  'TAROT_READING_UNLOCK',
  'FLASH_OFFER_UNLOCK',
];

export class CreateRewardSessionDto {
  @IsIn(REWARD_TYPES)
  rewardType: RewardType;
}
