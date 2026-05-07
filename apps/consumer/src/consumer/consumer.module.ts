import { Module } from '@nestjs/common';
import { ConsumerService } from './consumer.service';
import { TelegramModule } from '../telegram/telegram.module';
import { RedisModule } from '../redis/redis.module';
import { RedisService } from '../redis/redis.service';
import { TelegramService } from '../telegram/telegram.service';
import { IDEMPOTENCY_STORE, NOTIFICATION_SENDER } from './consumer.ports';

@Module({
  imports: [TelegramModule, RedisModule],
  providers: [
    ConsumerService,
    { provide: IDEMPOTENCY_STORE, useExisting: RedisService },
    { provide: NOTIFICATION_SENDER, useExisting: TelegramService },
  ],
  exports: [ConsumerService],
})
export class ConsumerModule {}
