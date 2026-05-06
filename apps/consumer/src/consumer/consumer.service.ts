import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { TelegramService } from '../telegram/telegram.service';
import { NotificationEvent } from '@fin/shared';

@Injectable()
export class ConsumerService {
  private readonly logger = new Logger(ConsumerService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly telegramService: TelegramService,
  ) {}

  async processEvent(event: NotificationEvent): Promise<void> {
    if (!event.eventId || !event.type || !event.payload) {
      throw new Error('Invalid event structure: missing required fields');
    }

    const isDuplicate = await this.redisService.isDuplicate(event.eventId);
    if (isDuplicate) {
      this.logger.log(`Duplicate event detected: eventId=${event.eventId}. Skipping.`);
      return;
    }

    this.logger.log(`Processing event: eventId=${event.eventId} type=${event.type}`);

    const sent = await this.telegramService.sendNotification(event);

    if (sent) {
      await this.redisService.markProcessed(event.eventId);
      this.logger.log(`Event processed and marked as completed: eventId=${event.eventId}`);
    }
  }
}
