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
      isDuplicate: jest.fn(),
      markProcessed: jest.fn(),
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
    it('should skip duplicate events', async () => {
      redisService.isDuplicate.mockResolvedValue(true);

      await service.processEvent(createEvent());

      expect(telegramService.sendNotification).not.toHaveBeenCalled();
      expect(redisService.markProcessed).not.toHaveBeenCalled();
    });

    it('should process new events and send telegram notification', async () => {
      redisService.isDuplicate.mockResolvedValue(false);
      telegramService.sendNotification.mockResolvedValue(true);

      await service.processEvent(createEvent());

      expect(telegramService.sendNotification).toHaveBeenCalledTimes(1);
      expect(redisService.markProcessed).toHaveBeenCalledWith('test-uuid');
    });

    it('should throw on invalid event structure', async () => {
      const invalidEvent = { eventId: 'test' } as NotificationEvent;

      await expect(service.processEvent(invalidEvent)).rejects.toThrow(
        'Invalid event structure',
      );
    });

    it('should not mark as processed if telegram send fails', async () => {
      redisService.isDuplicate.mockResolvedValue(false);
      telegramService.sendNotification.mockResolvedValue(false);

      await service.processEvent(createEvent());

      expect(redisService.markProcessed).not.toHaveBeenCalled();
    });

    it('should throw if telegram throws', async () => {
      redisService.isDuplicate.mockResolvedValue(false);
      telegramService.sendNotification.mockRejectedValue(new Error('Telegram error'));

      await expect(service.processEvent(createEvent())).rejects.toThrow('Telegram error');
    });
  });
});
