import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { NotificationEvent } from '@fin/shared';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly defaultChatId: string;
  private readonly apiBase: string;

  constructor(private readonly config: AppConfigService) {
    this.botToken = config.telegramBotToken;
    this.defaultChatId = config.telegramDefaultChatId;
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendNotification(event: NotificationEvent): Promise<boolean> {
    const chatId = event.payload.chatId || this.defaultChatId;

    if (!this.botToken || !chatId) {
      this.logger.warn(
        'Telegram bot token or chat ID not configured. Skipping notification.',
      );
      return false;
    }

    const message = this.formatMessage(event);

    try {
      const response = await fetch(
        `${this.apiBase}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
          }),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Telegram API error: ${response.status} ${errorBody}`);
      }

      this.logger.log(`Telegram notification sent to chatId=${chatId} for event=${event.eventId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send Telegram notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private formatMessage(event: NotificationEvent): string {
    return [
      `<b>Notification</b>`,
      `Type: ${event.type}`,
      `Message: ${event.payload.message}`,
      `Event ID: ${event.eventId}`,
      `Created: ${event.createdAt}`,
    ].join('\n');
  }
}
