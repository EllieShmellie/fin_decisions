import * as Joi from 'joi';

export const validationSchema = Joi.object({
  RABBITMQ_URL: Joi.string().uri().required(),
  RABBITMQ_EXCHANGE: Joi.string().required(),
  RABBITMQ_QUEUE: Joi.string().required(),
  RABBITMQ_ROUTING_KEY: Joi.string().required(),
  RABBITMQ_RETRY_EXCHANGE: Joi.string().default('notifications.retry.exchange'),
  RABBITMQ_RETRY_QUEUE: Joi.string().default('notifications.retry.queue'),
  RABBITMQ_RETRY_ROUTING_KEY: Joi.string().default('notifications.retry'),
  RABBITMQ_PARKING_EXCHANGE: Joi.string().default('notifications.parking.exchange'),
  RABBITMQ_PARKING_QUEUE: Joi.string().default('notifications.parking.queue'),
  RABBITMQ_PARKING_ROUTING_KEY: Joi.string().default('notifications.parking'),
  RABBITMQ_CONFIRM_TIMEOUT_MS: Joi.number().default(5000),
  TELEGRAM_BOT_TOKEN: Joi.string().min(1).required(),
  TELEGRAM_DEFAULT_CHAT_ID: Joi.string().optional(),
  TELEGRAM_REQUEST_TIMEOUT_MS: Joi.number().default(5000),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  MAX_RETRY_ATTEMPTS: Joi.number().default(3),
  RETRY_DELAY_MS: Joi.number().default(2000),
});
