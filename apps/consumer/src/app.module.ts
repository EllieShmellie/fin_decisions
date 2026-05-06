import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { RabbitmqModule } from './rabbitmq/rabbitmq.module';

@Module({
  imports: [ConfigModule, RabbitmqModule],
})
export class AppModule {}
