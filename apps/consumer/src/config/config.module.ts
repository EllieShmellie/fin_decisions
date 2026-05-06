import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { AppConfigService } from './config.service';
import { validationSchema } from './validation';

@Module({
  imports: [
    NestConfigModule.forRoot({
      envFilePath: ['.env', '../../.env'],
      validationSchema,
      isGlobal: true,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class ConfigModule {}
