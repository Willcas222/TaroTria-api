import { Module } from '@nestjs/common';
import { DrawEngineService } from './draw-engine.service';
import { TarotService } from './tarot.service';

@Module({
  providers: [TarotService, DrawEngineService],
  exports: [TarotService, DrawEngineService],
})
export class TarotModule {}
