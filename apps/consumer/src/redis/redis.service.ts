import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    try {
      this.client = new Redis(this.config.redisUrl);
      this.logger.log(`Connected to Redis at ${this.config.redisUrl}`);
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
    this.logger.log('Disconnected from Redis');
  }

  async isDuplicate(eventId: string): Promise<boolean> {
    if (!this.client) return false;
    const exists = await this.client.exists(`event:${eventId}`);
    return exists === 1;
  }

  async markProcessed(eventId: string): Promise<void> {
    if (!this.client) return;
    await this.client.set(`event:${eventId}`, '1', 'EX', 86400);
  }
}
