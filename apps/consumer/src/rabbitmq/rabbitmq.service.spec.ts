import { Test, TestingModule } from '@nestjs/testing';
import { RabbitmqService } from './rabbitmq.service';
import { ConsumerService } from '../consumer/consumer.service';
import { AppConfigService } from '../config/config.service';
import { ConsumeMessage } from 'amqplib';

describe('RabbitmqService — retry flow', () => {
  let service: RabbitmqService;
  let consumerService: jest.Mocked<ConsumerService>;
  let mockChannel: { ack: jest.Mock; nack: jest.Mock };

  function createMsg(
    retryCount = 0,
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
        headers: { 'x-retry-count': retryCount } as Record<string, unknown>,
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
            rabbitmqExchange: 'test.exchange',
            rabbitmqRoutingKey: 'test.key',
            rabbitmqDlx: 'test.dlx',
            rabbitmqDlq: 'test.dlq',
            rabbitmqQueue: 'test.queue',
            telegramBotToken: 'test-token',
            redisUrl: 'redis://localhost:6379',
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
  });

  describe('handleMessage (main queue)', () => {
    it('should ack on success', async () => {
      const msg = createMsg(0);
      (service as any).channel = mockChannel;

      await (service as any).handleMessage(msg);

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should nack(false,false) — route to DLX/DLQ on processing failure', async () => {
      consumerService.processEvent.mockRejectedValueOnce(new Error('fail'));
      const msg = createMsg(0);
      (service as any).channel = mockChannel;

      await (service as any).handleMessage(msg);

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, false);
    });

    it('should ack permanently when retryCount >= maxRetryAttempts', async () => {
      consumerService.processEvent.mockRejectedValueOnce(new Error('fail'));
      const msg = createMsg(3);
      (service as any).channel = mockChannel;

      await (service as any).handleMessage(msg);

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });
  });

  describe('handleDlqMessage (DLQ)', () => {
    it('should ack parked when retryCount > max', async () => {
      const msg = createMsg(3); // 3+1=4 > max=3 → ack parked
      (service as any).channel = mockChannel;

      await (service as any).handleDlqMessage(msg);

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
    });

    it('should nack(false,true) — requeue in DLQ on republish failure', async () => {
      jest.useFakeTimers();
      (service as any).publishWithConfirm = jest
        .fn()
        .mockRejectedValueOnce(new Error('confirm error'));

      const msg = createMsg(0);
      (service as any).channel = mockChannel;

      const handlePromise = (service as any).handleDlqMessage(msg);
      jest.advanceTimersByTime(10000);
      await handlePromise;

      expect(mockChannel.nack).toHaveBeenCalledWith(msg, false, true);
      jest.useRealTimers();
    });

    it('should ack and republish on success', async () => {
      jest.useFakeTimers();
      (service as any).publishWithConfirm = jest
        .fn()
        .mockResolvedValueOnce(undefined);

      const msg = createMsg(0);
      (service as any).channel = mockChannel;

      const handlePromise = (service as any).handleDlqMessage(msg);
      jest.advanceTimersByTime(10000);
      await handlePromise;

      expect(mockChannel.ack).toHaveBeenCalledWith(msg);
      expect((service as any).publishWithConfirm).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});
