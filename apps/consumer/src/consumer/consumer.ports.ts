import { NotificationEvent } from '@fin/shared';

export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');
export const NOTIFICATION_SENDER = Symbol('NOTIFICATION_SENDER');

export interface IdempotencyStore {
  isProcessed(eventId: string): Promise<boolean>;
  tryAcquireLock(eventId: string): Promise<string | null>;
  completeProcessing(eventId: string, lockToken: string): Promise<void>;
  releaseLock(eventId: string, lockToken: string): Promise<void>;
}

export interface NotificationSender {
  sendNotification(event: NotificationEvent): Promise<void>;
}
