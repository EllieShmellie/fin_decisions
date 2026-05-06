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

    if (await this.redisService.isProcessed(event.eventId)) {
      this.logger.log(`Already processed: eventId=${event.eventId}. Skipping.`);
      return;
    }

    const lockAcquired = await this.redisService.tryAcquireLock(event.eventId);
    if (!lockAcquired) {
      this.logger.log(`In-flight duplicate: eventId=${event.eventId}. Another consumer is processing.`);
      throw new Error('In-flight duplicate: event is being processed by another consumer');
    }

    this.logger.log(`Processing event: eventId=${event.eventId} type=${event.type}`);

    try {
      await this.telegramService.sendNotification(event);
      await this.redisService.markProcessed(event.eventId);
      await this.redisService.releaseLock(event.eventId);
      this.logger.log(`Event processed and marked as completed: eventId=${event.eventId}`);
    } catch (error) {
      await this.redisService.releaseLock(event.eventId);
      this.logger.error(
        `Failed to process event: eventId=${event.eventId}`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}
