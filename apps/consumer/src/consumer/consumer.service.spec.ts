import { Test, TestingModule } from '@nestjs/testing';
import { ConsumerService } from './consumer.service';
import { RedisService } from '../redis/redis.service';
import { TelegramService } from '../telegram/telegram.service';
import { NotificationEvent } from '@fin/shared';

describe('ConsumerService', () => {
  let service: ConsumerService;
  let redisService: jest.Mocked<RedisService>;
  let telegramService: jest.Mocked<TelegramService>;

  beforeEach(async () => {
    const mockRedis = {
      isProcessed: jest.fn(),
      tryAcquireLock: jest.fn(),
      markProcessed: jest.fn(),
      releaseLock: jest.fn(),
    };

    const mockTelegram = {
      sendNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsumerService,
        { provide: RedisService, useValue: mockRedis },
        { provide: TelegramService, useValue: mockTelegram },
      ],
    }).compile();

    service = module.get<ConsumerService>(ConsumerService);
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
    telegramService = module.get(TelegramService) as jest.Mocked<TelegramService>;
  });

  const createEvent = (
    overrides?: Partial<NotificationEvent>,
  ): NotificationEvent => ({
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
      redisService.isProcessed.mockResolvedValue(true);

      await service.processEvent(createEvent());

      expect(redisService.tryAcquireLock).not.toHaveBeenCalled();
      expect(telegramService.sendNotification).not.toHaveBeenCalled();
    });

    it('should skip when lock cannot be acquired (in-flight duplicate)', async () => {
      redisService.isProcessed.mockResolvedValue(false);
      redisService.tryAcquireLock.mockResolvedValue(false);

      await service.processEvent(createEvent());

      expect(telegramService.sendNotification).not.toHaveBeenCalled();
    });

    it('should process new events and send telegram notification', async () => {
      redisService.isProcessed.mockResolvedValue(false);
      redisService.tryAcquireLock.mockResolvedValue(true);

      await service.processEvent(createEvent());

      expect(telegramService.sendNotification).toHaveBeenCalledTimes(1);
      expect(redisService.markProcessed).toHaveBeenCalledWith('test-uuid');
      expect(redisService.releaseLock).toHaveBeenCalledWith('test-uuid');
    });

    it('should release lock and throw if telegram fails', async () => {
      redisService.isProcessed.mockResolvedValue(false);
      redisService.tryAcquireLock.mockResolvedValue(true);
      const telegramError = new Error('Telegram API error: 403');
      telegramService.sendNotification.mockRejectedValue(telegramError);

      await expect(service.processEvent(createEvent())).rejects.toThrow(
        'Telegram API error: 403',
      );

      expect(redisService.releaseLock).toHaveBeenCalledWith('test-uuid');
      expect(redisService.markProcessed).not.toHaveBeenCalled();
    });

    it('should throw on invalid event structure', async () => {
      const invalidEvent = { eventId: 'test' } as NotificationEvent;

      await expect(service.processEvent(invalidEvent)).rejects.toThrow(
        'Invalid event structure',
      );
    });
  });
});
