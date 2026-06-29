import http from 'node:http';
import https from 'node:https';
import querystring from 'node:querystring';

const parseBody = (buffer, headers, responseType) => {
  if (responseType === 'buffer') return buffer;
  const text = buffer.toString('utf8');
  const contentType = headers['content-type'] || '';
  if (contentType.includes('application/json') || /^[\s\r\n]*[\[{]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
};

const sanitizeHeaderValue = value => String(value).replace(/[^\t\x20-\x7e\x80-\xff]/g, '');

export const httpFetch = (url, options = {}) => {
  const target = new URL(url);
  const transport = target.protocol === 'https:' ? https : http;
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'User-Agent': 'music-hub request',
    ...(options.headers || {})
  };
  for (const [key, value] of Object.entries(headers)) headers[key] = sanitizeHeaderValue(value);

  let body = options.body ?? options.data;
  if (options.form) {
    body = querystring.stringify(options.form);
    headers['Content-Type'] = headers['Content-Type'] || headers['content-type'] || 'application/x-www-form-urlencoded';
  } else if (options.formData) {
    body = querystring.stringify(options.formData);
    headers['Content-Type'] = headers['Content-Type'] || headers['content-type'] || 'application/x-www-form-urlencoded';
  } else if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body);
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  if (body) headers['Content-Length'] = Buffer.byteLength(body);

  let req = null;
  const promise = new Promise((resolve, reject) => {
    req = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method,
      headers,
      timeout: options.timeout ?? 15000
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: parseBody(raw, res.headers, options.responseType),
          raw
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
  promise.cancel = () => {
    req?.destroy(new Error('Request canceled'));
  };
  return promise;
};
