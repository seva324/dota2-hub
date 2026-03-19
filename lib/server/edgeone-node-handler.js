import { loadApiHandler, resolveApiTarget } from './edgeone-api-router.js';

function appendQueryValue(target, key, value) {
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    const current = target[key];
    target[key] = Array.isArray(current) ? [...current, value] : [current, value];
    return;
  }
  target[key] = value;
}

function buildQuery(url, queryOverrides = {}) {
  const query = {};
  for (const [key, value] of url.searchParams.entries()) {
    appendQueryValue(query, key, value);
  }
  for (const [key, value] of Object.entries(queryOverrides)) {
    if (value !== undefined) {
      query[key] = value;
    }
  }
  return query;
}

function buildHeaders(request) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, chunk) => {
      const separator = chunk.indexOf('=');
      if (separator <= 0) return acc;
      const key = chunk.slice(0, separator).trim();
      const value = chunk.slice(separator + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

async function parseBody(request) {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return undefined;

  const contentType = request.headers.get('content-type') || '';
  const rawBody = await request.text();
  if (!rawBody) return undefined;

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return rawBody;
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody).entries());
  }

  return rawBody;
}

function toResponseBody(body) {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string' || body instanceof Uint8Array) return body;
  return JSON.stringify(body);
}

function createResponseController() {
  const headers = new Headers();
  const state = {
    headers,
    statusCode: 200,
    body: null,
    ended: false,
  };

  return {
    state,
    res: {
      headersSent: false,
      setHeader(name, value) {
        if (Array.isArray(value)) {
          headers.delete(name);
          value.forEach((item) => headers.append(name, String(item)));
          return this;
        }
        headers.set(name, String(value));
        return this;
      },
      getHeader(name) {
        return headers.get(name);
      },
      status(code) {
        state.statusCode = code;
        return this;
      },
      writeHead(code, maybeHeaders, maybeExtraHeaders) {
        state.statusCode = code;
        const headerBag = typeof maybeHeaders === 'object' && maybeHeaders !== null ? maybeHeaders : maybeExtraHeaders;
        if (headerBag && typeof headerBag === 'object') {
          for (const [key, value] of Object.entries(headerBag)) {
            this.setHeader(key, value);
          }
        }
        this.headersSent = true;
        return this;
      },
      json(payload) {
        if (!headers.has('content-type')) {
          headers.set('content-type', 'application/json; charset=utf-8');
        }
        state.body = JSON.stringify(payload);
        state.ended = true;
        this.headersSent = true;
        return this;
      },
      send(payload) {
        state.body = toResponseBody(payload);
        state.ended = true;
        this.headersSent = true;
        return this;
      },
      end(payload) {
        if (payload !== undefined) {
          state.body = toResponseBody(payload);
        }
        state.ended = true;
        this.headersSent = true;
        return this;
      },
    },
  };
}

export async function runEdgeOneApiRequest(request, context = {}) {
  const url = new URL(request.url);
  const target = resolveApiTarget(url.pathname);

  if (!target) {
    return Response.json(
      { error: 'API route not found', path: url.pathname },
      { status: 404 }
    );
  }

  const handler = await loadApiHandler(target.key);
  if (!handler) {
    return Response.json(
      { error: 'API handler not available', path: url.pathname },
      { status: 500 }
    );
  }

  const headers = buildHeaders(request);
  headers.host = headers.host || url.host;
  headers['x-forwarded-proto'] = headers['x-forwarded-proto'] || url.protocol.replace(':', '');

  const req = {
    method: request.method.toUpperCase(),
    url: `${url.pathname}${url.search}`,
    query: buildQuery(url, target.queryOverrides),
    headers,
    body: await parseBody(request),
    cookies: parseCookies(request.headers.get('cookie') || ''),
    context,
  };

  const { res, state } = createResponseController();
  await handler(req, res);

  if (!state.ended) {
    res.end();
  }

  return new Response(state.body, {
    status: state.statusCode,
    headers: state.headers,
  });
}
