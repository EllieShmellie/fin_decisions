import * as Joi from 'joi';

export const validationSchema = Joi.object({
  RABBITMQ_URL: Joi.string().uri().required(),
  RABBITMQ_EXCHANGE: Joi.string().required(),
  RABBITMQ_QUEUE: Joi.string().required(),
  RABBITMQ_ROUTING_KEY: Joi.string().required(),
  RABBITMQ_CONFIRM_TIMEOUT_MS: Joi.number().default(5000),
  PRODUCER_PORT: Joi.number().default(3000),
});
