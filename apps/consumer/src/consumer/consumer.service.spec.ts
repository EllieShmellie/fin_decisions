import { Test, TestingModule } from '@nestjs/testing';
import { ConsumerService } from './consumer.service';
import { NotificationEvent } from '@fin/shared';
import {
  IDEMPOTENCY_STORE,
  IdempotencyStore,
  NOTIFICATION_SENDER,
  NotificationSender,
} from './consumer.ports';

describe('ConsumerService', () => {
  let service: ConsumerService;
  let idempotencyStore: jest.Mocked<IdempotencyStore>;
  let notificationSender: jest.Mocked<NotificationSender>;

  beforeEach(async () => {
    const mockRedis = {
      isProcessed: jest.fn(),
      tryAcquireLock: jest.fn(),
      completeProcessing: jest.fn(),
      releaseLock: jest.fn(),
    };

    const mockTelegram = {
      sendNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsumerService,
        { provide: IDEMPOTENCY_STORE, useValue: mockRedis },
        { provide: NOTIFICATION_SENDER, useValue: mockTelegram },
      ],
    }).compile();

    service = module.get<ConsumerService>(ConsumerService);
    idempotencyStore = module.get(IDEMPOTENCY_STORE) as jest.Mocked<IdempotencyStore>;
    notificationSender = module.get(NOTIFICATION_SENDER) as jest.Mocked<NotificationSender>;
  });

  const createEvent = (overrides?: Partial<NotificationEvent>): NotificationEvent => ({
    eventId: 'test-uuid',
    type: 'notification.created',
    payload: { message: 'Test', chatId: '123' },
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processEvent', () => {
    it('should skip already processed events', async () => {
      idempotencyStore.isProcessed.mockResolvedValue(true);

      await service.processEvent(createEvent());

      expect(idempotencyStore.tryAcquireLock).not.toHaveBeenCalled();
      expect(notificationSender.sendNotification).not.toHaveBeenCalled();
    });

    it('should throw when lock cannot be acquired (in-flight duplicate)', async () => {
      idempotencyStore.isProcessed.mockResolvedValue(false);
      idempotencyStore.tryAcquireLock.mockResolvedValue(null);

      await expect(service.processEvent(createEvent())).rejects.toThrow('In-flight duplicate');

      expect(notificationSender.sendNotification).not.toHaveBeenCalled();
    });

    it('should process new events and send telegram notification', async () => {
      idempotencyStore.isProcessed.mockResolvedValue(false);
      idempotencyStore.tryAcquireLock.mockResolvedValue('lock-token');

      await service.processEvent(createEvent());

      expect(notificationSender.sendNotification).toHaveBeenCalledTimes(1);
      expect(idempotencyStore.completeProcessing).toHaveBeenCalledWith('test-uuid', 'lock-token');
      expect(idempotencyStore.releaseLock).not.toHaveBeenCalled();
    });

    it('should release lock and throw if telegram fails', async () => {
      idempotencyStore.isProcessed.mockResolvedValue(false);
      idempotencyStore.tryAcquireLock.mockResolvedValue('lock-token');
      const telegramError = new Error('Telegram API error: 403');
      notificationSender.sendNotification.mockRejectedValue(telegramError);

      await expect(service.processEvent(createEvent())).rejects.toThrow('Telegram API error: 403');

      expect(idempotencyStore.releaseLock).toHaveBeenCalledWith('test-uuid', 'lock-token');
      expect(idempotencyStore.completeProcessing).not.toHaveBeenCalled();
    });

    it('should throw on invalid event structure', async () => {
      const invalidEvent = { eventId: 'test' } as NotificationEvent;

      await expect(service.processEvent(invalidEvent)).rejects.toThrow('Invalid event structure');
    });
  });
});
