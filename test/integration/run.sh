#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.integration.yml)

cleanup() {
  docker compose "${COMPOSE_FILES[@]}" down --remove-orphans --volumes >/dev/null 2>&1 || true
}

wait_for_http() {
  local url="$1"

  for _ in {1..60}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for $url"
  return 1
}

send_event() {
  local message="$1"

  curl -fsS -X POST 'http://localhost:3000/events' \
    -H 'Content-Type: application/json' \
    -d "{
      \"type\": \"notification.created\",
      \"payload\": {
        \"message\": \"${message}\"
      }
    }"
}

read_event_id() {
  local response="$1"

  node -e "
    const response = JSON.parse(process.argv[1]);
    if (!response.success || !response.eventId) {
      console.error('Unexpected producer response:', process.argv[1]);
      process.exit(1);
    }
    process.stdout.write(response.eventId);
  " "$response"
}

assert_mock_telegram_received() {
  local event_id="$1"
  local expected_message="$2"
  local expected_status="$3"

  curl -fsS 'http://localhost:18080/requests' | node -e "
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      const requests = JSON.parse(data);
      const eventId = process.argv[1];
      const expectedMessage = process.argv[2];
      const expectedStatus = Number(process.argv[3]);
      const found = requests.some((request) => {
        return request.body
          && request.body.chat_id === '123456789'
          && request.responseStatus === expectedStatus
          && typeof request.body.text === 'string'
          && request.body.text.includes(eventId)
          && request.body.text.includes(expectedMessage);
      });
      process.exit(found ? 0 : 1);
    });
  " "$event_id" "$expected_message" "$expected_status"
}

assert_parking_queue_has_message() {
  local expected_count="$1"

  curl -fsS 'http://guest:guest@localhost:15672/api/queues/%2F/notifications.parking.queue' | node -e "
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      const queue = JSON.parse(data);
      process.exit(Number(queue.messages_ready || 0) >= Number(process.argv[1]) ? 0 : 1);
    });
  " "$expected_count"
}

cleanup
trap cleanup EXIT

docker compose "${COMPOSE_FILES[@]}" up -d --build

wait_for_http 'http://localhost:3000/api-json'
wait_for_http 'http://localhost:18080/health'
wait_for_http 'http://guest:guest@localhost:15672/api/overview'

success_message='Integration test notification'
response="$(send_event "$success_message")"
event_id="$(read_event_id "$response")"

for _ in {1..30}; do
  if assert_mock_telegram_received "$event_id" "$success_message" 200; then
    docker compose "${COMPOSE_FILES[@]}" logs consumer | grep "Event processed successfully: eventId=${event_id}" >/dev/null
    echo "Integration test passed: event ${event_id} reached mock Telegram"
    break
  fi
  sleep 1
done

if ! assert_mock_telegram_received "$event_id" "$success_message" 200; then
  echo "Mock Telegram did not receive event ${event_id}"
  docker compose "${COMPOSE_FILES[@]}" logs producer consumer mock-telegram
  exit 1
fi

failure_message='Integration permanent failure'
failure_response="$(send_event "$failure_message")"
failure_event_id="$(read_event_id "$failure_response")"

for _ in {1..30}; do
  if assert_mock_telegram_received "$failure_event_id" "$failure_message" 403 \
    && assert_parking_queue_has_message 1; then
    docker compose "${COMPOSE_FILES[@]}" logs consumer | grep 'Event parked permanently after 0 retries' >/dev/null
    echo "Integration test passed: permanent failure ${failure_event_id} reached parking queue"
    exit 0
  fi
  sleep 1
done

echo "Permanent failure event ${failure_event_id} did not reach parking queue"
docker compose "${COMPOSE_FILES[@]}" logs producer consumer mock-telegram
curl -fsS 'http://guest:guest@localhost:15672/api/queues/%2F/notifications.parking.queue' || true
exit 1
