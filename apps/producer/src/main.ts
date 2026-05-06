import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Fin Decisions — Producer API')
    .setDescription('API для отправки событий в систему уведомлений')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PRODUCER_PORT || 3000;
  await app.listen(port);
  logger.log(`Producer service is running on port ${port}`);
  logger.log(`Swagger UI available at http://localhost:${port}/api`);
}

bootstrap().catch((err) => {
  Logger.error('Failed to start producer service', err);
  process.exit(1);
});
