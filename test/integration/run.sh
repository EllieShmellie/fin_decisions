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

cleanup
trap cleanup EXIT

docker compose "${COMPOSE_FILES[@]}" up -d --build

wait_for_http 'http://localhost:3000/api-json'
wait_for_http 'http://localhost:18080/health'

response="$(
  curl -fsS -X POST 'http://localhost:3000/events' \
    -H 'Content-Type: application/json' \
    -d '{
      "type": "notification.created",
      "payload": {
        "message": "Integration test notification"
      }
    }'
)"

event_id="$(
  node -e "
    const response = JSON.parse(process.argv[1]);
    if (!response.success || !response.eventId) {
      console.error('Unexpected producer response:', process.argv[1]);
      process.exit(1);
    }
    process.stdout.write(response.eventId);
  " "$response"
)"

for _ in {1..30}; do
  if curl -fsS 'http://localhost:18080/requests' | node -e "
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      const requests = JSON.parse(data);
      const eventId = process.argv[1];
      const found = requests.some((request) => {
        return request.body
          && request.body.chat_id === '123456789'
          && typeof request.body.text === 'string'
          && request.body.text.includes(eventId)
          && request.body.text.includes('Integration test notification');
      });
      process.exit(found ? 0 : 1);
    });
  " "$event_id"; then
    docker compose "${COMPOSE_FILES[@]}" logs consumer | grep "Event processed successfully: eventId=${event_id}" >/dev/null
    echo "Integration test passed: event ${event_id} reached mock Telegram"
    exit 0
  fi
  sleep 1
done

echo "Mock Telegram did not receive event ${event_id}"
docker compose "${COMPOSE_FILES[@]}" logs producer consumer mock-telegram
exit 1
