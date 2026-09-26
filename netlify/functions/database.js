import apiHandler from '../../api/database.js';

export default async function handler(request) {
  let body = {};
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    try {
      const raw = await request.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
  }

  const req = {
    method: request.method,
    url: request.url,
    body,
  };

  let statusCode = 200;
  let responseBody = {};

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(payload) {
      responseBody = payload;
      return res;
    },
  };

  try {
    await apiHandler(req, res);
  } catch (error) {
    statusCode = 500;
    responseBody = { error: error?.message || 'Database request failed' };
  }

  return new Response(JSON.stringify(responseBody), {
    status: statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
