# Fin Decisions Notification System

Микросервисная система уведомлений на Nest.js: Producer принимает HTTP-события, публикует их в RabbitMQ, Consumer обрабатывает сообщения и отправляет уведомления в Telegram.

## Что внутри

```text
Producer HTTP API -> RabbitMQ -> Consumer -> Telegram Bot API
                                      |
                                      v
                                    Redis
                              idempotency state
```

- `apps/producer` — HTTP API для создания событий и публикации в RabbitMQ.
- `apps/consumer` — обработчик RabbitMQ-сообщений и отправка Telegram-уведомлений.
- `shared` — общие типы событий.
- `RabbitMQ` — основной broker, retry queue и parking queue.
- `Redis` — idempotency lock и marker обработанных событий.

## Быстрый запуск

```bash
git clone <repo-url>
cd fin_decisions
cp .env.example .env
```

Заполните в `.env` Telegram-настройки:

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_DEFAULT_CHAT_ID=your_chat_id
```

Затем запустите сервисы:

```bash
docker compose up --build
```

Доступные адреса:

- Producer API: http://localhost:3000
- Swagger: http://localhost:3000/api
- RabbitMQ Management: http://localhost:15672 (`guest` / `guest`)

## Проверка вручную

Через Swagger откройте `POST /events`, либо отправьте запрос:

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "notification.created",
    "payload": {
      "message": "Hello from Fin Decisions"
    }
  }'
```

Успешный ответ:

```json
{
  "success": true,
  "eventId": "uuid",
  "message": "Event successfully sent"
}
```

## Надежность обработки

Producer публикует сообщения через RabbitMQ confirm channel и не считает `channel.publish()` подтверждением доставки. Consumer также переносит сообщения между очередями только по правилу:

```text
publishWithConfirm(target queue) -> ack original message
```

Если publish в retry или parking queue не подтвердился, исходное сообщение не ack'ается и возвращается в очередь.

Что реализовано:

- durable exchanges/queues;
- JSON-сериализация событий;
- уникальный `eventId`;
- broker confirms для Producer и Consumer transfer flow;
- confirm timeout и пересоздание channel при неясном состоянии;
- fixed TTL retry queue с DLX обратно в main exchange;
- parking queue для permanent failures и исчерпанных retry;
- сохранение headers при republish, включая `x-retry-count`;
- Redis idempotency lock с unique token и token-checked release;
- HTML escaping для Telegram-сообщений;
- классификация Telegram ошибок на retryable и permanent.

## API

### `POST /events`

Создает событие и отправляет его в RabbitMQ.

```json
{
  "type": "notification.created",
  "payload": {
    "message": "Notification text",
    "chatId": "optional_chat_id"
  }
}
```

Поля:

- `type` — обязательная строка.
- `payload.message` — обязательная строка.
- `payload.chatId` — опциональная строка; если не передана, используется default chat id из env.

## Конфигурация

Все переменные окружения перечислены в `.env.example`. Основные:

- `RABBITMQ_URL`
- `RABBITMQ_EXCHANGE`
- `RABBITMQ_QUEUE`
- `RABBITMQ_ROUTING_KEY`
- `RABBITMQ_RETRY_EXCHANGE`
- `RABBITMQ_RETRY_QUEUE`
- `RABBITMQ_PARKING_EXCHANGE`
- `RABBITMQ_PARKING_QUEUE`
- `RABBITMQ_CONFIRM_TIMEOUT_MS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_DEFAULT_CHAT_ID`
- `TELEGRAM_REQUEST_TIMEOUT_MS`
- `REDIS_URL`
- `MAX_RETRY_ATTEMPTS`
- `RETRY_DELAY_MS`
- `PRODUCER_PORT`

## Локальный запуск без Docker

Нужны запущенные RabbitMQ и Redis.

```bash
npm install
npm run build -w shared
npm run dev:producer
npm run dev:consumer
```

## Тесты

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

В CI дополнительно выполняется Docker build обоих сервисов.

## Структура проекта

```text
fin_decisions/
├── apps/
│   ├── producer/
│   │   ├── src/config/
│   │   ├── src/producer/
│   │   ├── src/rabbitmq/
│   │   └── Dockerfile
│   └── consumer/
│       ├── src/config/
│       ├── src/consumer/
│       ├── src/rabbitmq/
│       ├── src/redis/
│       ├── src/telegram/
│       └── Dockerfile
├── shared/
├── docker-compose.yml
└── .env.example
```

## Стек

- Node.js 20
- Nest.js 11
- TypeScript
- RabbitMQ / `amqplib`
- Redis / `ioredis`
- Telegram Bot API
- Docker Compose
- Jest
