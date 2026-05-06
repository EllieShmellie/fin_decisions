# Fin Decisions — Notification System

Микросервисная система уведомлений на Nest.js, RabbitMQ и Telegram API.

## Архитектура

```
┌─────────────┐     ┌──────────┐     ┌─────────────┐     ┌──────────┐
│  Producer    │────▶│ RabbitMQ │────▶│  Consumer    │────▶│ Telegram │
│  (HTTP API)  │     │  Broker  │     │  (Processor) │     │  Bot API │
└─────────────┘     └──────────┘     └──────┬───────┘     └──────────┘
                                            │
                                            ▼
                                       ┌──────────┐
                                       │   Redis   │
                                       │(idempotent)│
                                       └──────────┘
```

### Компоненты

| Сервис | Назначение | Порт |
|--------|-----------|------|
| **Producer** | HTTP API для отправки событий в RabbitMQ | 3000 |
| **Consumer** | Получение событий из RMQ, обработка, отправка в Telegram | — |
| **RabbitMQ** | Брокер сообщений, retry через DLQ | 5672 |
| **Redis** | Хранение обработанных eventId (идемпотентность) | 6379 |

## Быстрый старт

### 1. Клонирование и настройка

```bash
git clone <url>
cd fin_decisions
cp .env.example .env
```

### 2. Настройка переменных окружения

Отредактируйте `.env`:

```env
# RabbitMQ
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=notifications.exchange
RABBITMQ_QUEUE=notifications.queue
RABBITMQ_ROUTING_KEY=notifications.created

# Telegram (обязательно для отправки)
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_DEFAULT_CHAT_ID=your_chat_id_here

# Redis
REDIS_URL=redis://localhost:6379

# Retry
MAX_RETRY_ATTEMPTS=3
RETRY_DELAY_MS=2000
```

### 3. Запуск через Docker Compose

```bash
docker compose up --build
```

Сервисы, которые запустятся:
- **Producer** — http://localhost:3000
- **RabbitMQ Management** — http://localhost:15672 (guest/guest)
- **Redis**

### 4. Локальный запуск (без Docker)

```bash
# Установка зависимостей
npm install

# Сборка shared
npm run build -w shared

# Терминал 1: Producer
npm run dev:producer

# Терминал 2: Consumer
npm run dev:consumer
```

### 5. Отправка тестового события

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "notification.created",
    "payload": {
      "message": "Hello from Nest.js",
      "chatId": "123456789"
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

## API

### POST /events

Создание и отправка события.

**Тело запроса:**

| Поле | Тип | Обязательное | Описание |
|------|-----|-------------|----------|
| type | string | да | Тип события (например, `notification.created`) |
| payload.message | string | да | Текст уведомления |
| payload.chatId | string | нет | Telegram chat ID (если не указан, используется `TELEGRAM_DEFAULT_CHAT_ID`) |

## Retry-механизм

```
Ошибка обработки → nack → Dead Letter Exchange → Dead Letter Queue
                                                          │
                                           retry < MAX? ──┤
                                              │           └── retry >= MAX → лог ошибки
                                              ▼
                                setTimeout(delay)
                                      │
                                      ▼
                            republish в main exchange
                                      │
                                      ▼
                              Consumer (повторная попытка)
```

- **Задержка**: экспоненциальная (`delay × 2^(retry-1)`)
- **MAX_RETRY_ATTEMPTS**: 3 (по умолчанию)
- **RETRY_DELAY_MS**: 2000ms (базовая задержка)
- После исчерпания попыток сообщение логируется как permanently failed

> **Ограничение текущей реализации**: задержка retry в DLQ реализована через `setTimeout` в consumer'е.
> Это корректно работает для демо и единичного инстанса, но при рестарте consumer'а во время таймера
> логика retry сбрасывается. Для production рекомендуется RabbitMQ Delayed Message Plugin
> или TTL-based retry queues.

## Идемпотентность

Идемпотентность реализована с атомарным lock'ом через Redis:

1. **Проверка `processed:{eventId}`** — если запись существует, событие уже было обработано → ack
2. **SET `processing:{eventId}` NX EX 60** — атомарный lock. Если не удался → другой consumer уже обрабатывает → ack
3. **Отправка в Telegram** — если успешно → `SET processed:{eventId} EX 86400` + `DEL processing:{eventId}`
4. **При ошибке Telegram** — `DEL processing:{eventId}` → throw → retry/DLQ

Таким образом:
- Уже обработанные события не обрабатываются повторно
- При одновременной обработке двумя consumer'ами lock выигрывает только один
- При падении consumer'а во время обработки lock истечёт через 60 секунд, и событие придёт снова через DLQ

## Обработка ошибок

| Сценарий | Действие |
|----------|----------|
| Ошибка соединения с RabbitMQ (Producer) | Reconnect с exponential backoff (до 10 попыток) |
| Ошибка соединения с RabbitMQ (Consumer) | Ошибка логируется, сервис падает (Docker restart) |
| Ошибка Telegram API | Ошибка логируется, событие уходит в retry через DLQ |
| Невалидное событие | Ошибка логируется, событие уходит в retry через DLQ |
| Уже обработанный eventId (processed) | Событие подтверждается (ack), в лог пишется duplicate |
| in-flight duplicate (processing lock занят) | Событие подтверждается (ack), в лог пишется in-flight |
| Превышено число retry | Сообщение подтверждается, в лог пишется permanently failed |
| TELEGRAM_BOT_TOKEN не задан | Consumer не стартует (fail-fast через config validation) |
| Нет chatId в payload и default | Ошибка обработки события → retry через DLQ |

## Переменные окружения

| Переменная | По умолчанию | Описание |
|-----------|-------------|----------|
| `RABBITMQ_URL` | `amqp://guest:guest@localhost:5672` | URL подключения к RabbitMQ |
| `RABBITMQ_EXCHANGE` | `notifications.exchange` | Exchange |
| `RABBITMQ_QUEUE` | `notifications.queue` | Основная очередь |
| `RABBITMQ_ROUTING_KEY` | `notifications.created` | Routing key |
| `RABBITMQ_DLX` | `notifications.dlx` | Dead Letter Exchange |
| `RABBITMQ_DLQ` | `notifications.dlq` | Dead Letter Queue |
| `TELEGRAM_BOT_TOKEN` | **обязательный** | Токен Telegram бота (fail-fast при отсутствии) |
| `TELEGRAM_DEFAULT_CHAT_ID` | — | Chat ID по умолчанию (если не указан в payload события) |
| `REDIS_URL` | `redis://localhost:6379` | URL подключения к Redis |
| `MAX_RETRY_ATTEMPTS` | `3` | Максимум retry попыток |
| `RETRY_DELAY_MS` | `2000` | Базовая задержка retry (ms) |
| `PRODUCER_PORT` | `3000` | Порт HTTP API Producer |

## Тестирование

```bash
# Unit-тесты Producer
npm run test -w apps/producer

# Unit-тесты Consumer
npm run test -w apps/consumer

# E2E-тесты
npm run test:e2e
```

## Запуск тестов

```bash
npm test
```

## Структура проекта

```
fin_decisions/
├── apps/
│   ├── producer/           # Producer Service (Nest.js)
│   │   ├── src/
│   │   │   ├── config/     # Конфигурация (env validation)
│   │   │   ├── producer/   # HTTP API, DTO
│   │   │   └── rabbitmq/   # RabbitMQ client
│   │   └── Dockerfile
│   └── consumer/           # Consumer Service (Nest.js)
│       ├── src/
│       │   ├── config/     # Конфигурация (env validation)
│       │   ├── consumer/   # Обработчик событий
│       │   ├── rabbitmq/   # RabbitMQ consumer + DLQ
│       │   ├── redis/      # Redis client (idempotency)
│       │   └── telegram/   # Telegram Bot API client
│       └── Dockerfile
├── shared/                 # Shared types/interfaces
├── docker-compose.yml
└── .env.example
```

## Технологический стек

- **Node.js** 20+
- **Nest.js** 11
- **TypeScript**
- **RabbitMQ** (через `amqplib`)
- **Redis** (через `ioredis`)
- **Telegram Bot API**
- **Docker** / **Docker Compose**
- **Jest** (тестирование)
