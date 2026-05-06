import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from './telegram.service';
import { AppConfigService } from '../config/config.service';

describe('TelegramService', () => {
  let service: TelegramService;

  beforeEach(async () => {
    const mockConfig = {
      telegramBotToken: 'test-token',
      telegramDefaultChatId: 'default-chat',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: AppConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendNotification', () => {
    it('should return false if bot token is empty', async () => {
      const emptyConfig = {
        telegramBotToken: '',
        telegramDefaultChatId: '',
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          { provide: AppConfigService, useValue: emptyConfig },
        ],
      }).compile();

      const emptyService = module.get<TelegramService>(TelegramService);
      const result = await emptyService.sendNotification({
        eventId: 'test',
        type: 'test',
        payload: { message: 'test' },
        createdAt: new Date().toISOString(),
      });

      expect(result).toBe(false);
    });

    it('should format message correctly', () => {
      const event = {
        eventId: 'uuid-123',
        type: 'notification.created',
        payload: { message: 'Hello World', chatId: '123' },
        createdAt: '2026-05-06T12:00:00.000Z',
      };

      const message = (service as any).formatMessage(event);

      expect(message).toContain('Notification');
      expect(message).toContain('notification.created');
      expect(message).toContain('Hello World');
      expect(message).toContain('uuid-123');
      expect(message).toContain('2026-05-06T12:00:00.000Z');
    });

    it('should use default chatId when not in payload', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
      });

      const event = {
        eventId: 'test',
        type: 'test',
        payload: { message: 'test' },
        createdAt: new Date().toISOString(),
      };

      await service.sendNotification(event);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.chat_id).toBe('default-chat');
    });

    it('should use payload chatId when provided', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
      });

      const event = {
        eventId: 'test',
        type: 'test',
        payload: { message: 'test', chatId: 'from-payload' },
        createdAt: new Date().toISOString(),
      };

      await service.sendNotification(event);

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.chat_id).toBe('from-payload');
    });

    it('should throw on Telegram API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('Forbidden'),
      });

      const event = {
        eventId: 'test',
        type: 'test',
        payload: { message: 'test', chatId: '123' },
        createdAt: new Date().toISOString(),
      };

      await expect(service.sendNotification(event)).rejects.toThrow(
        'Telegram API error: 403',
      );
    });
  });
});
