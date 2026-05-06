import * as Joi from 'joi';

export const validationSchema = Joi.object({
  RABBITMQ_URL: Joi.string().uri().required(),
  RABBITMQ_EXCHANGE: Joi.string().required(),
  RABBITMQ_QUEUE: Joi.string().required(),
  RABBITMQ_ROUTING_KEY: Joi.string().required(),
  RABBITMQ_DLX: Joi.string().default('notifications.dlx'),
  RABBITMQ_DLQ: Joi.string().default('notifications.dlq'),
  TELEGRAM_BOT_TOKEN: Joi.string().required(),
  TELEGRAM_DEFAULT_CHAT_ID: Joi.string().optional(),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  MAX_RETRY_ATTEMPTS: Joi.number().default(3),
  RETRY_DELAY_MS: Joi.number().default(2000),
});
