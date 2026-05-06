import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, Channel } from 'amqplib';
import type { ChannelModel } from 'amqplib';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await connect(this.config.rabbitmqUrl);
      this.channel = await this.connection.createChannel();

      await this.channel.assertExchange(this.config.rabbitmqExchange, 'direct', {
        durable: true,
      });

      this.logger.log('Connected to RabbitMQ');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      throw error;
    }
  }

  async publish(
    message: object,
    routingKey?: string,
  ): Promise<boolean> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    const buffer = Buffer.from(JSON.stringify(message));
    const rk = routingKey || this.config.rabbitmqRoutingKey;

    const result = this.channel.publish(
      this.config.rabbitmqExchange,
      rk,
      buffer,
      { persistent: true },
    );

    this.logger.log(`Message published to exchange=${this.config.rabbitmqExchange} routingKey=${rk}`);
    return result;
  }

  private async disconnect(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error('Error disconnecting from RabbitMQ', error);
    }
  }
}
