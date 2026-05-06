import { Module } from '@nestjs/common';
import { ConsumerService } from './consumer.service';
import { TelegramModule } from '../telegram/telegram.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [TelegramModule, RedisModule],
  providers: [ConsumerService],
  exports: [ConsumerService],
})
export class ConsumerModule {}
