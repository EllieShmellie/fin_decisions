import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationEvent } from '@fin/shared';
import {
  IDEMPOTENCY_STORE,
  IdempotencyStore,
  NOTIFICATION_SENDER,
  NotificationSender,
} from './consumer.ports';
import { PermanentProcessingError, RetryableProcessingError } from './processing.errors';

@Injectable()
export class ConsumerService {
  private readonly logger = new Logger(ConsumerService.name);

  constructor(
    @Inject(IDEMPOTENCY_STORE)
    private readonly idempotencyStore: IdempotencyStore,
    @Inject(NOTIFICATION_SENDER)
    private readonly notificationSender: NotificationSender,
  ) {}

  async processEvent(event: NotificationEvent): Promise<void> {
    if (!event.eventId || !event.type || !event.payload) {
      throw new PermanentProcessingError('Invalid event structure: missing required fields');
    }

    if (await this.idempotencyStore.isProcessed(event.eventId)) {
      this.logger.log(`Already processed: eventId=${event.eventId}. Skipping.`);
      return;
    }

    const lockToken = await this.idempotencyStore.tryAcquireLock(event.eventId);
    if (!lockToken) {
      this.logger.log(
        `In-flight duplicate: eventId=${event.eventId}. Another consumer is processing.`,
      );
      throw new RetryableProcessingError(
        'In-flight duplicate: event is being processed by another consumer',
      );
    }

    this.logger.log(`Processing event: eventId=${event.eventId} type=${event.type}`);

    try {
      await this.notificationSender.sendNotification(event);
      await this.idempotencyStore.completeProcessing(event.eventId, lockToken);
      this.logger.log(`Event processed and marked as completed: eventId=${event.eventId}`);
    } catch (error) {
      await this.idempotencyStore.releaseLock(event.eventId, lockToken);
      this.logger.error(
        `Failed to process event: eventId=${event.eventId}`,
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }
}
