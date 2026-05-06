import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get rabbitmqUrl(): string {
    return this.configService.get<string>('RABBITMQ_URL')!;
  }

  get rabbitmqExchange(): string {
    return this.configService.get<string>('RABBITMQ_EXCHANGE')!;
  }

  get rabbitmqQueue(): string {
    return this.configService.get<string>('RABBITMQ_QUEUE')!;
  }

  get rabbitmqRoutingKey(): string {
    return this.configService.get<string>('RABBITMQ_ROUTING_KEY')!;
  }

  get rabbitmqDlx(): string {
    return this.configService.get<string>('RABBITMQ_DLX', 'notifications.dlx');
  }

  get rabbitmqDlq(): string {
    return this.configService.get<string>('RABBITMQ_DLQ', 'notifications.dlq');
  }

  get telegramBotToken(): string {
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN')!;
  }

  get telegramDefaultChatId(): string | undefined {
    return this.configService.get<string>('TELEGRAM_DEFAULT_CHAT_ID');
  }

  get redisUrl(): string {
    return this.configService.get<string>('REDIS_URL', 'redis://localhost:6379');
  }

  get maxRetryAttempts(): number {
    return this.configService.get<number>('MAX_RETRY_ATTEMPTS', 3);
  }

  get retryDelayMs(): number {
    return this.configService.get<number>('RETRY_DELAY_MS', 2000);
  }
}
