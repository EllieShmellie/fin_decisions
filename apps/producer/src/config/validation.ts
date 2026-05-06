import * as Joi from 'joi';

export const validationSchema = Joi.object({
  RABBITMQ_URL: Joi.string().uri().required(),
  RABBITMQ_EXCHANGE: Joi.string().required(),
  RABBITMQ_QUEUE: Joi.string().required(),
  RABBITMQ_ROUTING_KEY: Joi.string().required(),
  RABBITMQ_DLX: Joi.string().optional(),
  RABBITMQ_DLQ: Joi.string().optional(),
  MAX_RETRY_ATTEMPTS: Joi.number().default(3),
  PRODUCER_PORT: Joi.number().default(3000),
  RETRY_DELAY_MS: Joi.number().default(2000),
});
