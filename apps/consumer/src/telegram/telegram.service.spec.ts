import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from './telegram.service';
import { AppConfigService } from '../config/config.service';

describe('TelegramService', () => {
  const createEvent = (overrides?: Record<string, unknown>) => ({
    eventId: 'test-uuid',
    type: 'notification.created',
    payload: { message: 'Hello World', chatId: '123' },
    createdAt: '2026-05-06T12:00:00.000Z',
    ...overrides,
  });

  describe('sendNotification', () => {
    it('should send message and resolve on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: AppConfigService,
            useValue: {
              telegramBotToken: 'test-token',
              telegramDefaultChatId: 'default-chat',
            },
          },
        ],
      }).compile();

      const service = module.get<TelegramService>(TelegramService);
      await service.sendNotification(createEvent());

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBe(
        'https://api.telegram.org/bottest-token/sendMessage',
      );
      const body = JSON.parse(callArgs[1].body);
      expect(body.chat_id).toBe('123');
      expect(body.parse_mode).toBe('HTML');
    });

    it('should use default chatId when not in payload', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: AppConfigService,
            useValue: {
              telegramBotToken: 'test-token',
              telegramDefaultChatId: 'default-chat',
            },
          },
        ],
      }).compile();

      const service = module.get<TelegramService>(TelegramService);
      await service.sendNotification(createEvent({ payload: { message: 'test' } }));

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.chat_id).toBe('default-chat');
    });

    it('should throw when no chatId is available', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: AppConfigService,
            useValue: {
              telegramBotToken: 'test-token',
              telegramDefaultChatId: undefined,
            },
          },
        ],
      }).compile();

      const service = module.get<TelegramService>(TelegramService);

      await expect(
        service.sendNotification(
          createEvent({ payload: { message: 'test' } }),
        ),
      ).rejects.toThrow('No chatId provided');
    });

    it('should throw on Telegram API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: jest.fn().mockResolvedValue('Forbidden'),
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: AppConfigService,
            useValue: {
              telegramBotToken: 'test-token',
              telegramDefaultChatId: 'chat',
            },
          },
        ],
      }).compile();

      const service = module.get<TelegramService>(TelegramService);

      await expect(
        service.sendNotification(createEvent()),
      ).rejects.toThrow('Telegram API error: 403');
    });
  });

  describe('formatMessage', () => {
    it('should format message correctly', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: AppConfigService,
            useValue: {
              telegramBotToken: 'test-token',
              telegramDefaultChatId: 'chat',
            },
          },
        ],
      }).compile();

      const service = module.get<TelegramService>(TelegramService);
      const message = (service as any).formatMessage(createEvent());

      expect(message).toContain('<b>Notification</b>');
      expect(message).toContain('notification.created');
      expect(message).toContain('Hello World');
      expect(message).toContain('test-uuid');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramService,
          {
            provide: AppConfigService,
            useValue: {
              telegramBotToken: 'test-token',
              telegramDefaultChatId: 'chat',
            },
          },
        ],
      }).compile();

      const service = module.get<TelegramService>(TelegramService);
      const escaped = (service as any).escapeHtml('<b>test & value</b>');
      expect(escaped).toBe('&lt;b&gt;test &amp; value&lt;/b&gt;');
    });
  });
});
