const http = require('node:http');

const requests = [];

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && request.url === '/requests') {
    sendJson(response, 200, requests);
    return;
  }

  if (request.method === 'POST' && /^\/bot[^/]+\/sendMessage$/.test(request.url || '')) {
    const rawBody = await readBody(request);
    const parsedBody = rawBody ? JSON.parse(rawBody) : {};
    requests.push({
      method: request.method,
      url: request.url,
      body: parsedBody,
      receivedAt: new Date().toISOString(),
    });

    sendJson(response, 200, {
      ok: true,
      result: {
        message_id: requests.length,
        chat: { id: parsedBody.chat_id },
        text: parsedBody.text,
      },
    });
    return;
  }

  sendJson(response, 404, { ok: false, description: 'Not found' });
});

server.listen(8080, '0.0.0.0', () => {
  console.log('Mock Telegram API listening on port 8080');
});
