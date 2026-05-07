import { Test, TestingModule } from '@nestjs/testing';
import { ConsumeMessage } from 'amqplib';
import { RabbitmqService } from './rabbitmq.service';
import { ConsumerService } from '../consumer/consumer.service';
import { AppConfigService } from '../config/config.service';
import { PermanentProcessingError } from '../consumer/processing.errors';

describe('RabbitmqService — retry and parking flow', () => {
  let service: RabbitmqService;
  let consumerService: jest.Mocked<ConsumerService>;
  let mockChannel: { ack: jest.Mock; nack: jest.Mock };

  function createMsg(
    retryCount = 0,
    headers: Record<string, unknown> = {},
    overrides?: Partial<Record<string, unknown>>,
  ): ConsumeMessage {
    return {
      content: Buffer.from(
        JSON.stringify({
          eventId: 'test-uuid',
          type: 'notification.created',
          payload: { message: 'Test', chatId: '123' },
          createdAt: new Date().toISOString(),
          ...overrides,
        }),
      ),
      properties: {
        headers: { ...headers, 'x-retry-count': retryCount },
        contentType: 'application/json',
        correlationId: 'correlation-1',
        messageId: 'message-1',
      },
      fields: {
        deliveryTag: 1,
        consumerTag: 'tag',
        exchange: 'ex',
        routingKey: 'rk',
        redelivered: false,
      },
    } as unknown as ConsumeMessage;
  }

  beforeEach(async () => {
    const mockConsumer = {
      processEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitmqService,
        { provide: ConsumerService, useValue: mockConsumer },
        {
          provide: AppConfigService,
          useValue: {
            maxRetryAttempts: 3,
            retryDelayMs: 2000,
            rabbitmqExchange: 'main.exchange',
            rabbitmqRoutingKey: 'main.key',
            rabbitmqRetryExchange: 'retry.exchange',
            rabbitmqRetryRoutingKey: 'retry.key',
            rabbitmqRetryQueue: 'retry.queue',
            rabbitmqParkingExchange: 'parking.exchange',
            rabbitmqParkingRoutingKey: 'parking.key',
            rabbitmqParkingQueue: 'parking.queue',
            rabbitmqConfirmTimeoutMs: 100,
            rabbitmqQueue: 'main.queue',
            rabbitmqUrl: 'amqp://localhost',
          },
        },
      ],
    }).compile();

    service = module.get<RabbitmqService>(RabbitmqService);
    consumerService = module.get(ConsumerService) as jest.Mocked<ConsumerService>;
    mockChannel = {
      ack: jest.fn(),
      nack: jest.fn(),
    };
    (service as any).channel = mockChannel;
  });

  it('acks original message on successful processing', async () => {
    const msg = createMsg();

    await (service as any).handleMessage(msg);

    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    expect(mockChannel.nack).not.toHaveBeenCalled();
  });

  it('publishes retry message with incremented retry count before ack', async () => {
    consumerService.processEvent.mockRejectedValueOnce(new Error('temporary'));
    (service as any).publishWithConfirm = jest.fn().mockResolvedValue(undefined);
    const msg = createMsg(1, { 'x-original-header': 'kept' });

    await (service as any).handleMessage(msg);

    expect((service as any).publishWithConfirm).toHaveBeenCalledWith(
      'retry.exchange',
      'retry.key',
      msg.content,
      expect.objectContaining({
        persistent: true,
        correlationId: 'correlation-1',
        messageId: 'message-1',
        headers: expect.objectContaining({
          'x-original-header': 'kept',
          'x-retry-count': 2,
        }),
      }),
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('does not ack and requeues original when retry publish fails', async () => {
    consumerService.processEvent.mockRejectedValueOnce(new Error('temporary'));
    (service as any).publishWithConfirm = jest
      .fn()
      .mockRejectedValueOnce(new Error('confirm error'));
    const msg = createMsg(0);

    await (service as any).handleMessage(msg);

    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, true);
  });

  it('publishes to parking before ack on exhausted retries', async () => {
    consumerService.processEvent.mockRejectedValueOnce(new Error('exhausted'));
    (service as any).publishWithConfirm = jest.fn().mockResolvedValue(undefined);
    const msg = createMsg(3, { 'x-original-header': 'kept' });

    await (service as any).handleMessage(msg);

    expect((service as any).publishWithConfirm).toHaveBeenCalledWith(
      'parking.exchange',
      'parking.key',
      msg.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-original-header': 'kept',
          'x-retry-count': 3,
          'x-parking-reason': 'exhausted',
        }),
      }),
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('parks permanent errors without retry', async () => {
    consumerService.processEvent.mockRejectedValueOnce(new PermanentProcessingError('bad event'));
    (service as any).publishWithConfirm = jest.fn().mockResolvedValue(undefined);
    const msg = createMsg(0);

    await (service as any).handleMessage(msg);

    expect((service as any).publishWithConfirm).toHaveBeenCalledWith(
      'parking.exchange',
      'parking.key',
      msg.content,
      expect.any(Object),
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('does not ack and requeues original when parking publish fails', async () => {
    consumerService.processEvent.mockRejectedValueOnce(new PermanentProcessingError('bad event'));
    (service as any).publishWithConfirm = jest
      .fn()
      .mockRejectedValueOnce(new Error('confirm error'));
    const msg = createMsg(0);

    await (service as any).handleMessage(msg);

    expect(mockChannel.ack).not.toHaveBeenCalled();
    expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, true);
  });

  it('parks invalid JSON as permanent failure', async () => {
    (service as any).publishWithConfirm = jest.fn().mockResolvedValue(undefined);
    const msg = createMsg();
    msg.content = Buffer.from('{not-json');

    await (service as any).handleMessage(msg);

    expect(consumerService.processEvent).not.toHaveBeenCalled();
    expect((service as any).publishWithConfirm).toHaveBeenCalledWith(
      'parking.exchange',
      'parking.key',
      msg.content,
      expect.any(Object),
    );
    expect(mockChannel.ack).toHaveBeenCalledWith(msg);
  });

  it('times out unclear confirm state', async () => {
    jest.useFakeTimers();
    const confirmChannel = {
      waitForConfirms: jest.fn(() => new Promise<void>(() => undefined)),
    };

    const waitPromise = (service as any).waitForConfirmOrTimeout(confirmChannel);
    jest.advanceTimersByTime(100);

    await expect(waitPromise).rejects.toThrow('RabbitMQ confirm timeout');
    jest.useRealTimers();
  });
});
