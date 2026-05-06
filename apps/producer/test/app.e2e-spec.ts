import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RabbitmqService } from '../src/rabbitmq/rabbitmq.service';

describe('Producer (e2e)', () => {
  let app: INestApplication;
  let rabbitmqService: jest.Mocked<RabbitmqService>;

  beforeAll(async () => {
    const mockRabbitmq = {
      publish: jest.fn().mockResolvedValue(true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RabbitmqService)
      .useValue(mockRabbitmq)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    rabbitmqService = moduleFixture.get(RabbitmqService) as jest.Mocked<RabbitmqService>;
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /events', () => {
    it('should return 201 and create event', async () => {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          type: 'notification.created',
          payload: { message: 'Test', chatId: '123' },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.eventId).toBeDefined();
      expect(response.body.message).toBe('Event successfully sent');
      expect(rabbitmqService.publish).toHaveBeenCalled();
    });

    it('should return 400 for missing type', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .send({
          payload: { message: 'test' },
        })
        .expect(400);
    });

    it('should return 400 for missing payload', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .send({
          type: 'notification.created',
        })
        .expect(400);
    });

    it('should return 400 for empty message', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .send({
          type: 'notification.created',
          payload: { message: '' },
        })
        .expect(400);
    });

    it('should return 400 for extra fields', async () => {
      await request(app.getHttpServer())
        .post('/events')
        .send({
          type: 'notification.created',
          payload: { message: 'test' },
          extraField: 'should not be allowed',
        })
        .expect(400);
    });
  });
});
