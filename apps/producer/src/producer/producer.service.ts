import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RabbitmqService } from '../rabbitmq/rabbitmq.service';
import { NotificationEvent } from '@fin/shared';
import { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class ProducerService {
  private readonly logger = new Logger(ProducerService.name);

  constructor(private readonly rabbitmqService: RabbitmqService) {}

  async sendEvent(dto: CreateEventDto): Promise<{ success: boolean; eventId: string; message: string }> {
    const event: NotificationEvent = {
      eventId: uuidv4(),
      type: dto.type,
      payload: dto.payload,
      createdAt: new Date().toISOString(),
    };

    this.logger.log(`Sending event: eventId=${event.eventId} type=${event.type}`);

    try {
      const published = await this.rabbitmqService.publish(event);

      if (!published) {
        throw new Error('Message was not confirmed by RabbitMQ');
      }

      this.logger.log(`Event sent successfully: eventId=${event.eventId}`);
      return {
        success: true,
        eventId: event.eventId,
        message: 'Event successfully sent',
      };
    } catch (error) {
      this.logger.error(`Failed to send event: eventId=${event.eventId}`, error);
      throw error;
    }
  }
}
