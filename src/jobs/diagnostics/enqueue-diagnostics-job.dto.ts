import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class EnqueueDiagnosticsJobDto {
  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  simulateFailures?: number;
}
