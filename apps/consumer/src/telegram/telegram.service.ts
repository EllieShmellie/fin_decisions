import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/config.service';
import { NotificationEvent } from '@fin/shared';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly botToken: string;
  private readonly defaultChatId: string | undefined;
  private readonly apiBase: string;

  constructor(private readonly config: AppConfigService) {
    this.botToken = config.telegramBotToken;
    this.defaultChatId = config.telegramDefaultChatId;
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendNotification(event: NotificationEvent): Promise<void> {
    const chatId = event.payload.chatId || this.defaultChatId;

    if (!chatId) {
      throw new Error(
        'No chatId provided in event payload and TELEGRAM_DEFAULT_CHAT_ID is not set',
      );
    }

    const message = this.formatMessage(event);

    const response = await fetch(`${this.apiBase}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Telegram API error: ${response.status} ${errorBody}`);
    }

    this.logger.log(
      `Telegram notification sent to chatId=${chatId} for event=${event.eventId}`,
    );
  }

  private formatMessage(event: NotificationEvent): string {
    return [
      '<b>Notification</b>',
      `Type: ${this.escapeHtml(event.type)}`,
      `Message: ${this.escapeHtml(event.payload.message)}`,
      `Event ID: ${this.escapeHtml(event.eventId)}`,
      `Created: ${this.escapeHtml(event.createdAt)}`,
    ].join('\n');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
