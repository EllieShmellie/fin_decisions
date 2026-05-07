import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  IsDefined,
  IsNotEmptyObject,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class EventPayloadDto {
  @ApiProperty({ description: 'Текст уведомления' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ description: 'Telegram chat ID (если не указан, используется DEFAULT)' })
  @IsString()
  @IsOptional()
  chatId?: string;
}

export class CreateEventDto {
  @ApiProperty({ description: 'Тип события', example: 'notification.created' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ type: () => EventPayloadDto })
  @IsDefined()
  @IsNotEmptyObject()
  @IsObject()
  @ValidateNested()
  @Type(() => EventPayloadDto)
  payload: EventPayloadDto;
}
