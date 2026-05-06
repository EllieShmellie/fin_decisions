import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const logger = new Logger('Bootstrap');

  await app.init();
  logger.log('Consumer service is running and listening for messages');
}

bootstrap().catch((err) => {
  Logger.error('Failed to start consumer service', err);
  process.exit(1);
});
