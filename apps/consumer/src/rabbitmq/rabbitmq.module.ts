import { Module, Global } from '@nestjs/common';
import { ConsumerModule } from '../consumer/consumer.module';
import { ConfigModule } from '../config/config.module';
import { RabbitmqService } from './rabbitmq.service';

@Global()
@Module({
  imports: [ConfigModule, ConsumerModule],
  providers: [RabbitmqService],
  exports: [RabbitmqService],
})
export class RabbitmqModule {}
