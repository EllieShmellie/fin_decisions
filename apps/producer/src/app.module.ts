import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';
import { ProducerModule } from './producer/producer.module';

@Module({
  imports: [ConfigModule, RabbitmqModule, ProducerModule],
})
export class AppModule {}
