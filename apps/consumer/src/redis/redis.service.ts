import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';
import { AppConfigService } from '../config/config.service';
import { IdempotencyStore } from '../consumer/consumer.ports';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy, IdempotencyStore {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: AppConfigService) {}

  onModuleInit(): void {
    try {
      this.client = new Redis(this.config.redisUrl);
      this.client.on('error', (err) => {
        this.logger.error('Redis connection error', err);
      });
      this.logger.log(`Connected to Redis at ${this.config.redisUrl}`);
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
    this.logger.log('Disconnected from Redis');
  }

  async isProcessed(eventId: string): Promise<boolean> {
    if (!this.client) throw new Error('Redis client not available');
    const exists = await this.client.exists(`processed:${eventId}`);
    return exists === 1;
  }

  async tryAcquireLock(eventId: string, ttlSec = 60): Promise<string | null> {
    if (!this.client) throw new Error('Redis client not available');
    const token = randomUUID();
    const result = await this.client.set(`processing:${eventId}`, token, 'EX', ttlSec, 'NX');
    return result === 'OK' ? token : null;
  }

  async completeProcessing(eventId: string, lockToken: string): Promise<void> {
    if (!this.client) throw new Error('Redis client not available');
    await this.client.set(`processed:${eventId}`, '1', 'EX', 86400);
    await this.releaseLock(eventId, lockToken);
  }

  async releaseLock(eventId: string, lockToken: string): Promise<void> {
    if (!this.client) throw new Error('Redis client not available');
    await this.client.eval(
      `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      end
      return 0
      `,
      1,
      `processing:${eventId}`,
      lockToken,
    );
  }
}
