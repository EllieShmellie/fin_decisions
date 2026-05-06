import { Test, TestingModule } from '@nestjs/testing';
import { ProducerService } from './producer.service';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';

describe('ProducerService', () => {
  let service: ProducerService;
  let rabbitmqService: jest.Mocked<RabbitmqService>;

  beforeEach(async () => {
    const mockRabbitmq = {
      publish: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProducerService,
        { provide: RabbitmqService, useValue: mockRabbitmq },
      ],
    }).compile();

    service = module.get<ProducerService>(ProducerService);
    rabbitmqService = module.get(RabbitmqService) as jest.Mocked<RabbitmqService>;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendEvent', () => {
    it('should publish event and return success response', async () => {
      const dto = {
        type: 'notification.created',
        payload: { message: 'Test', chatId: '123' },
      };

      const result = await service.sendEvent(dto);

      expect(result.success).toBe(true);
      expect(result.eventId).toBeDefined();
      expect(result.message).toBe('Event successfully sent');
      expect(rabbitmqService.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: dto.type,
          payload: dto.payload,
        }),
      );
    });

    it('should throw when publish fails', async () => {
      rabbitmqService.publish.mockResolvedValue(false);

      const dto = {
        type: 'notification.created',
        payload: { message: 'Test' },
      };

      await expect(service.sendEvent(dto)).rejects.toThrow(
        'Message was not confirmed by RabbitMQ',
      );
    });

    it('should include createdAt and eventId in event', async () => {
      rabbitmqService.publish.mockResolvedValue(true);

      await service.sendEvent({
        type: 'test.event',
        payload: { message: 'Hello' },
      });

      const publishedEvent = rabbitmqService.publish.mock.calls[0][0] as any;
      expect(publishedEvent.eventId).toBeDefined();
      expect(publishedEvent.createdAt).toBeDefined();
      expect(typeof publishedEvent.eventId).toBe('string');
      expect(typeof publishedEvent.createdAt).toBe('string');
    });
  });
});
