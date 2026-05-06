import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect, Channel, ConsumeMessage } from 'amqplib';
import type { ChannelModel } from 'amqplib';
import { AppConfigService } from '../config/config.service';
import { ConsumerService } from '../consumer/consumer.service';

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;

  constructor(
    private readonly config: AppConfigService,
    private readonly consumerService: ConsumerService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
    await this.setupInfrastructure();
    await this.startConsuming();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      this.connection = await connect(this.config.rabbitmqUrl);
      this.channel = await this.connection.createChannel();
      this.channel.prefetch(1);
      this.logger.log('Connected to RabbitMQ');
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ', error);
      throw error;
    }
  }

  private async setupInfrastructure(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    await this.channel.assertExchange(this.config.rabbitmqExchange, 'direct', {
      durable: true,
    });

    await this.channel.assertExchange(this.config.rabbitmqDlx, 'direct', {
      durable: true,
    });

    const queue = await this.channel.assertQueue(this.config.rabbitmqQueue, {
      durable: true,
      deadLetterExchange: this.config.rabbitmqDlx,
      deadLetterRoutingKey: this.config.rabbitmqRoutingKey,
    });

    await this.channel.bindQueue(
      queue.queue,
      this.config.rabbitmqExchange,
      this.config.rabbitmqRoutingKey,
    );

    const dlq = await this.channel.assertQueue(this.config.rabbitmqDlq, {
      durable: true,
    });

    await this.channel.bindQueue(
      dlq.queue,
      this.config.rabbitmqDlx,
      this.config.rabbitmqRoutingKey,
    );

    this.logger.log(
      `RabbitMQ infrastructure set up: exchange=${this.config.rabbitmqExchange} queue=${this.config.rabbitmqQueue}`,
    );
  }

  private async startConsuming(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    await this.channel.consume(
      this.config.rabbitmqQueue,
      (msg) => this.handleMessage(msg),
      { noAck: false },
    );

    await this.channel.consume(
      this.config.rabbitmqDlq,
      (msg) => this.handleDlqMessage(msg),
      { noAck: false },
    );

    this.logger.log('Started consuming messages from main and DLQ');
  }

  private async handleMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) return;

    const retryCount = msg.properties.headers?.['x-retry-count'] || 0;

    try {
      const content = JSON.parse(msg.content.toString());

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

      if (retryCount < this.config.maxRetryAttempts) {
        this.channel.nack(msg, false, false);
        this.logger.log(`Event sent to DLQ for retry: retry=${retryCount + 1}`);
      } else {
        this.channel.ack(msg);
        this.logger.error(
          `Event permanently failed after ${retryCount} retry attempts`,
        );
      }
    }
  }

  private async handleDlqMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) return;

    const retryCount = (msg.properties.headers?.['x-retry-count'] || 0) + 1;
    const delay = this.config.retryDelayMs * Math.pow(2, retryCount - 1);

    this.logger.log(
      `DLQ message received, scheduling retry ${retryCount} with delay ${delay}ms`,
    );

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      await this.publishWithConfirm(
        this.config.rabbitmqExchange,
        this.config.rabbitmqRoutingKey,
        msg.content,
        {
          headers: { 'x-retry-count': retryCount },
          persistent: true,
        },
      );
      this.channel.ack(msg);
      this.logger.log(`Message re-published for retry ${retryCount}`);
    } catch (error) {
      this.logger.error(
        `Failed to re-publish message from DLQ: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async publishWithConfirm(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: object,
  ): Promise<void> {
    if (!this.connection) throw new Error('RMQ connection not available');

    const confirmChannel = await this.connection.createConfirmChannel();
    try {
      const published = confirmChannel.publish(exchange, routingKey, content, options);
      if (!published) {
        throw new Error('Failed to buffer message for republish');
      }
      await confirmChannel.waitForConfirms();
    } finally {
      await confirmChannel.close();
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
