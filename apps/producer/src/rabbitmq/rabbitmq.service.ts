import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, ConfirmChannel } from 'amqplib';
import type { ChannelModel } from 'amqplib';
import { AppConfigService } from '../config/config.service';

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.clearReconnectTimer();
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.connection = await connect(this.config.rabbitmqUrl);

      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error', err);
        this.scheduleReconnect();
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.channel = null;
        this.connection = null;
        this.scheduleReconnect();
      });

      this.channel = await this.connection.createConfirmChannel();

      await this.channel.assertExchange(this.config.rabbitmqExchange, 'direct', {
        durable: true,
      });

      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.logger.log('Connected to RabbitMQ');
    } catch (error) {
      this.isConnecting = false;
      this.logger.error('Failed to connect to RabbitMQ', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      this.logger.log('Reconnect already scheduled');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`,
      );
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.logger.log(
      `Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  async publish(message: object, routingKey?: string): Promise<boolean> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    const buffer = Buffer.from(JSON.stringify(message));
    const rk = routingKey || this.config.rabbitmqRoutingKey;

    const published = this.channel.publish(this.config.rabbitmqExchange, rk, buffer, {
      persistent: true,
    });

    if (!published) {
      this.logger.warn('Backpressure detected, waiting for drain');
      await new Promise<void>((resolve) => this.channel!.once('drain', resolve));
    }

    try {
      await this.waitForConfirmOrTimeout();
      this.logger.log(
        `Message confirmed by RabbitMQ: exchange=${this.config.rabbitmqExchange} routingKey=${rk}`,
      );
      return true;
    } catch (error) {
      this.logger.error('Broker rejected or channel error during confirm', error);
      await this.closeUnclearChannel();
      return false;
    }
  }

  private async waitForConfirmOrTimeout(): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel is not initialized');

    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        this.channel.waitForConfirms(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('RabbitMQ confirm timeout')),
            this.config.rabbitmqConfirmTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async closeUnclearChannel(): Promise<void> {
    try {
      await this.channel?.close();
    } catch (error) {
      this.logger.warn(
        `Failed to close unclear confirm channel: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      this.channel = null;
      this.scheduleReconnect();
    }
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
