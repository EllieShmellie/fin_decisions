import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { ProducerService } from './producer.service';
import { CreateEventDto } from './dto/create-event.dto';

@ApiTags('Events')
@Controller('events')
export class ProducerController {
  private readonly logger = new Logger(ProducerController.name);

  constructor(private readonly producerService: ProducerService) {}

  @Post()
  @ApiOperation({ summary: 'Send an event to the notification system' })
  @ApiBody({ type: CreateEventDto })
  async createEvent(@Body() dto: CreateEventDto) {
    this.logger.log(`Received event creation request: type=${dto.type}`);
    return this.producerService.sendEvent(dto);
  }
}
