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

  get maxRetryAttempts(): number {
    return this.configService.get<number>('MAX_RETRY_ATTEMPTS', 3);
  }

  get port(): number {
    return this.configService.get<number>('PRODUCER_PORT', 3000);
  }
}
