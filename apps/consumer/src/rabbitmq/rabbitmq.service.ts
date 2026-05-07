import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, Channel, ConfirmChannel, ConsumeMessage, Options } from 'amqplib';
import type { ChannelModel } from 'amqplib';
import { AppConfigService } from '../config/config.service';
import { ConsumerService } from '../consumer/consumer.service';
import {
  isPermanentProcessingError,
  PermanentProcessingError,
} from '../consumer/processing.errors';
import { NotificationEvent } from '@fin/shared';

type MessageHeaders = Record<string, unknown>;

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly consumerService: ConsumerService,
  ) {}

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

      this.channel = await this.connection.createChannel();
      this.channel.prefetch(1);

      await this.setupInfrastructure();
      await this.startConsuming();

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

  private async setupInfrastructure(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    await this.channel.assertExchange(this.config.rabbitmqExchange, 'direct', {
      durable: true,
    });

    await this.channel.assertExchange(this.config.rabbitmqRetryExchange, 'direct', {
      durable: true,
    });

    await this.channel.assertExchange(this.config.rabbitmqParkingExchange, 'direct', {
      durable: true,
    });

    const queue = await this.channel.assertQueue(this.config.rabbitmqQueue, {
      durable: true,
    });

    await this.channel.bindQueue(
      queue.queue,
      this.config.rabbitmqExchange,
      this.config.rabbitmqRoutingKey,
    );

    const retryQueue = await this.channel.assertQueue(this.config.rabbitmqRetryQueue, {
      durable: true,
      messageTtl: this.config.retryDelayMs,
      deadLetterExchange: this.config.rabbitmqExchange,
      deadLetterRoutingKey: this.config.rabbitmqRoutingKey,
    });

    await this.channel.bindQueue(
      retryQueue.queue,
      this.config.rabbitmqRetryExchange,
      this.config.rabbitmqRetryRoutingKey,
    );

    const parkingQueue = await this.channel.assertQueue(this.config.rabbitmqParkingQueue, {
      durable: true,
    });

    await this.channel.bindQueue(
      parkingQueue.queue,
      this.config.rabbitmqParkingExchange,
      this.config.rabbitmqParkingRoutingKey,
    );

    this.logger.log(
      `RabbitMQ infrastructure set up: exchange=${this.config.rabbitmqExchange} queue=${this.config.rabbitmqQueue} retryQueue=${this.config.rabbitmqRetryQueue} parkingQueue=${this.config.rabbitmqParkingQueue}`,
    );
  }

  private async startConsuming(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    await this.channel.consume(this.config.rabbitmqQueue, (msg) => this.handleMessage(msg), {
      noAck: false,
    });

    this.logger.log('Started consuming messages from main queue');
  }

  private async handleMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) return;

    const retryCount = this.getRetryCount(msg);

    try {
      const content = this.parseEvent(msg);

      this.logger.log(
        `Received event: eventId=${content.eventId} type=${content.type} retry=${retryCount}`,
      );

      await this.consumerService.processEvent(content);

      this.channel.ack(msg);
      this.logger.log(`Event processed successfully: eventId=${content.eventId}`);
    } catch (error) {
      this.logger.error(
        `Failed to process event: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );

      if (isPermanentProcessingError(error) || retryCount >= this.config.maxRetryAttempts) {
        await this.transferToParkingThenAck(msg, retryCount, error);
        return;
      }

      await this.transferToRetryThenAck(msg, retryCount + 1);
    }
  }

  private parseEvent(msg: ConsumeMessage): NotificationEvent {
    try {
      const content = JSON.parse(msg.content.toString()) as Partial<NotificationEvent>;

      if (
        !content.eventId ||
        !content.type ||
        !content.payload ||
        typeof content.payload.message !== 'string'
      ) {
        throw new PermanentProcessingError('Invalid event structure: missing required fields');
      }

      return content as NotificationEvent;
    } catch (error) {
      if (isPermanentProcessingError(error)) {
        throw error;
      }
      throw new PermanentProcessingError('Invalid event JSON', error);
    }
  }

  private async transferToRetryThenAck(msg: ConsumeMessage, retryCount: number): Promise<void> {
    if (!this.channel) return;

    try {
      await this.publishWithConfirm(
        this.config.rabbitmqRetryExchange,
        this.config.rabbitmqRetryRoutingKey,
        msg.content,
        this.buildPublishOptions(msg, {
          ...this.getHeaders(msg),
          'x-retry-count': retryCount,
        }),
      );

      this.channel.ack(msg);
      this.logger.log(`Event moved to retry queue: retry=${retryCount}`);
    } catch (publishError) {
      this.logger.error(
        `Failed to move event to retry queue: ${publishError instanceof Error ? publishError.message : 'Unknown error'}`,
      );
      this.channel.nack(msg, false, true);
    }
  }

  private async transferToParkingThenAck(
    msg: ConsumeMessage,
    retryCount: number,
    error: unknown,
  ): Promise<void> {
    if (!this.channel) return;

    try {
      await this.publishWithConfirm(
        this.config.rabbitmqParkingExchange,
        this.config.rabbitmqParkingRoutingKey,
        msg.content,
        this.buildPublishOptions(msg, {
          ...this.getHeaders(msg),
          'x-retry-count': retryCount,
          'x-parking-reason': error instanceof Error ? error.message : 'Unknown error',
        }),
      );

      this.channel.ack(msg);
      this.logger.error(`Event parked permanently after ${retryCount} retries`);
    } catch (publishError) {
      this.logger.error(
        `Failed to move event to parking queue: ${publishError instanceof Error ? publishError.message : 'Unknown error'}`,
      );
      this.channel.nack(msg, false, true);
    }
  }

  private getHeaders(msg: ConsumeMessage): MessageHeaders {
    return { ...(msg.properties.headers ?? {}) };
  }

  private getRetryCount(msg: ConsumeMessage): number {
    const retryCount = msg.properties.headers?.['x-retry-count'];
    return typeof retryCount === 'number' ? retryCount : Number(retryCount) || 0;
  }

  private buildPublishOptions(msg: ConsumeMessage, headers: MessageHeaders): Options.Publish {
    return {
      persistent: true,
      contentType: msg.properties.contentType,
      contentEncoding: msg.properties.contentEncoding,
      correlationId: msg.properties.correlationId,
      replyTo: msg.properties.replyTo,
      messageId: msg.properties.messageId,
      timestamp: msg.properties.timestamp,
      type: msg.properties.type,
      userId: msg.properties.userId,
      appId: msg.properties.appId,
      headers,
    };
  }

  private async publishWithConfirm(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Options.Publish,
  ): Promise<void> {
    if (!this.connection) throw new Error('RMQ connection not available');

    const confirmChannel = await this.connection.createConfirmChannel();
    try {
      const published = confirmChannel.publish(exchange, routingKey, content, options);

      if (!published) {
        await new Promise<void>((resolve) => confirmChannel.once('drain', resolve));
      }

      await this.waitForConfirmOrTimeout(confirmChannel);
    } finally {
      try {
        await confirmChannel.close();
      } catch (error) {
        this.logger.warn(
          `Failed to close confirm channel: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }
  }

  private async waitForConfirmOrTimeout(channel: ConfirmChannel): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
      await Promise.race([
        channel.waitForConfirms(),
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
