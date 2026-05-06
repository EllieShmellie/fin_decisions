import { Module, Global } from '@nestjs/common';
import { RabbitmqService } from './rabbitmq.service';
import { ConsumerModule } from '../consumer/consumer.module';

@Global()
@Module({
  imports: [ConsumerModule],
  providers: [RabbitmqService],
  exports: [RabbitmqService],
})
export class RabbitmqModule {}
