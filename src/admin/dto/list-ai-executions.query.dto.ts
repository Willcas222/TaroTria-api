import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

const AI_EXECUTION_STATUSES = ['PENDING', 'COMPLETED', 'FAILED'] as const;

export class ListAiExecutionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(AI_EXECUTION_STATUSES)
  status?: (typeof AI_EXECUTION_STATUSES)[number];
}
