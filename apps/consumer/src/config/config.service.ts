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

  get rabbitmqRetryExchange(): string {
    return this.configService.get<string>(
      'RABBITMQ_RETRY_EXCHANGE',
      'notifications.retry.exchange',
    );
  }

  get rabbitmqRetryQueue(): string {
    return this.configService.get<string>('RABBITMQ_RETRY_QUEUE', 'notifications.retry.queue');
  }

  get rabbitmqRetryRoutingKey(): string {
    return this.configService.get<string>('RABBITMQ_RETRY_ROUTING_KEY', 'notifications.retry');
  }

  get rabbitmqParkingExchange(): string {
    return this.configService.get<string>(
      'RABBITMQ_PARKING_EXCHANGE',
      'notifications.parking.exchange',
    );
  }

  get rabbitmqParkingQueue(): string {
    return this.configService.get<string>('RABBITMQ_PARKING_QUEUE', 'notifications.parking.queue');
  }

  get rabbitmqParkingRoutingKey(): string {
    return this.configService.get<string>('RABBITMQ_PARKING_ROUTING_KEY', 'notifications.parking');
  }

  get rabbitmqConfirmTimeoutMs(): number {
    return this.configService.get<number>('RABBITMQ_CONFIRM_TIMEOUT_MS', 5000);
  }

  get telegramRequestTimeoutMs(): number {
    return this.configService.get<number>('TELEGRAM_REQUEST_TIMEOUT_MS', 5000);
  }
}
