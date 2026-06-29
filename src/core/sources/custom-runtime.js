import vm from 'node:vm';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { httpFetch } from '../../utils/request.js';

const inflate = promisify(zlib.inflate);
const deflate = promisify(zlib.deflate);

const eventNames = {
  inited: 'inited',
  request: 'request',
  updateAlert: 'updateAlert'
};

const normalizeResult = result => {
  if (result && typeof result === 'object' && result.status === false) {
    throw new Error(result.message || result.msg || 'Custom source initialization failed');
  }
  if (result && typeof result === 'object' && 'status' in result && 'body' in result) {
    return result;
  }
  return result;
};

const parseScriptInfo = (code, fileName) => {
  const pick = key => code.match(new RegExp(`@${key}\\s+([^\\n\\r]+)`))?.[1]?.trim();
  return {
    name: pick('name') || fileName,
    description: pick('description') || '',
    version: pick('version') || '1.0.0',
    author: pick('author') || '',
    homepage: pick('homepage') || '',
    updateUrl: pick('updateUrl') || '',
    rawScript: code
  };
};

const normalizeRequestResponse = response => ({
  statusCode: response.statusCode,
  status: response.statusCode,
  statusMessage: response.statusMessage || '',
  headers: response.headers,
  body: response.body,
  raw: response.raw,
  bytes: Buffer.isBuffer(response.raw) ? response.raw.length : Buffer.byteLength(String(response.body ?? ''))
});

const hasModuleExports = sandbox => {
  const exported = sandbox.module?.exports;
  if (!exported) return false;
  if (typeof exported === 'function') return true;
  return exported !== sandbox.exports || Object.keys(exported).length > 0;
};

export const loadCustomSourceScript = async ({ code, fileName, logger, initTimeoutMs = 5000, onUpdateAlert = null }) => {
  let sourceApi = null;
  const listeners = new Map();
  const currentScriptInfo = parseScriptInfo(code, fileName);
  const updateAlerts = [];
  const asyncErrors = [];
  const onUnhandledRejection = reason => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    asyncErrors.push(error);
    logger?.warn?.(`[${fileName}] unhandled source promise rejection: ${error.message}`);
  };
  let resolveInited;
  const inited = new Promise(resolve => {
    resolveInited = resolve;
  });

  const send = (event, payload) => {
    if (event === eventNames.inited) {
      sourceApi = payload;
      resolveInited(payload);
    } else if (event === eventNames.updateAlert) {
      if (!updateAlerts.length && payload && payload.updateUrl && String(payload.updateUrl).length < 1024) {
        updateAlerts.push(payload);
        onUpdateAlert?.(payload, currentScriptInfo);
        logger?.info?.(`[${fileName}] source update alert`, payload);
      }
    }
    const handler = listeners.get(event);
    if (handler) handler(payload);
  };

  const on = (event, handler) => {
    listeners.set(event, handler);
  };

  const request = (url, options = {}, callback) => {
    let canceled = false;
    const pending = httpFetch(url, options)
      .then(response => {
        if (!canceled) callback?.(null, normalizeRequestResponse(response), response.body);
      })
      .catch(error => {
        if (!canceled) callback?.(error, {
          statusCode: 0,
          status: 0,
          statusMessage: error.message,
          headers: {},
          body: null,
          raw: Buffer.alloc(0),
          bytes: 0
        });
      });
    return () => {
      canceled = true;
      pending.cancel?.();
    };
  };

  const module = { exports: {} };
  const sandbox = vm.createContext({
    console: {
      log: (...args) => logger?.info?.(...args),
      warn: (...args) => logger?.warn?.(...args),
      error: (...args) => logger?.error?.(...args)
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    JSON,
    Promise,
    encodeURI,
    encodeURIComponent,
    decodeURI,
    decodeURIComponent,
    globalThis: {},
    lx: {
      version: '2.1.3',
      env: 'desktop',
      currentScriptInfo,
      EVENT_NAMES: eventNames,
      request,
      on,
      send,
      utils: {
        crypto: {
          md5: value => crypto.createHash('md5').update(String(value ?? '')).digest('hex'),
          randomBytes: size => crypto.randomBytes(size),
          aesEncrypt(buffer, mode, key, iv) {
            const cipher = crypto.createCipheriv(mode, key, iv);
            return Buffer.concat([cipher.update(buffer), cipher.final()]);
          },
          rsaEncrypt(buffer, key) {
            return crypto.publicEncrypt({ key, padding: crypto.constants.RSA_NO_PADDING }, buffer);
          }
        },
        buffer: {
          from: (...args) => Buffer.from(...args),
          bufToString: (buf, format) => Buffer.from(buf, 'binary').toString(format)
        },
        zlib: {
          inflate,
          deflate
        }
      }
    },
    EVENT_NAMES: eventNames,
    request,
    on,
    send,
    module,
    exports: module.exports
  });
  sandbox.globalThis = sandbox;
  sandbox.globalThis.lx = sandbox.lx;
  sandbox.lx.scriptInfo = currentScriptInfo;
  sandbox.lx.sourceInfo = currentScriptInfo;
  sandbox.__lxUnhandledRejection = reason => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    asyncErrors.push(error);
    logger?.warn?.(`[${fileName}] source promise rejection: ${error.message}`);
  };
  sandbox.window = sandbox;
  vm.runInContext(`
    (() => {
      const nativeThen = Promise.prototype.then;
      Promise.prototype.then = function(onFulfilled, onRejected) {
        const next = nativeThen.call(this, onFulfilled, onRejected);
        nativeThen.call(next, null, error => globalThis.__lxUnhandledRejection(error));
        return next;
      };
    })();
  `, sandbox);

  const script = new vm.Script(code, { filename: fileName });
  process.on('unhandledRejection', onUnhandledRejection);
  try {
    script.runInContext(sandbox, { timeout: 5000 });

    if (!sourceApi && hasModuleExports(sandbox)) sourceApi = sandbox.module.exports;

    if (!sourceApi) {
      await Promise.race([
        inited,
        new Promise(resolve => setTimeout(resolve, initTimeoutMs))
      ]);
    }

    if (!sourceApi) {
      if (hasModuleExports(sandbox)) sourceApi = sandbox.module.exports;
      else if (sandbox.exports) sourceApi = sandbox.exports;
    }

    if (!sourceApi && asyncErrors.length) throw asyncErrors[0];
    return normalizeResult({
      ...(sourceApi || {}),
      __lxListeners: listeners,
      __asyncErrors: asyncErrors.map(error => error.message),
      __scriptInfo: currentScriptInfo,
      __updateAlerts: updateAlerts
    });
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
};
