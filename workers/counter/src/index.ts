/**
 * PickThree hit counter and anonymous error log. Geocities style.
 *
 *   POST /hit     increments and returns { count }
 *   GET  /count   returns { count }
 *   POST /error   records { build, stage, message, ua } (rolling 200, no identifiers)
 *   GET  /errors  returns the log; needs Authorization: Bearer <ERRORS_READ_TOKEN>
 *
 * Nothing else is stored: no IPs, no collection data. Everything lives in a single Durable
 * Object so writes are atomic.
 */
import { DurableObject } from 'cloudflare:workers';
import { parseReport, type ErrorReport } from './report.js';

export interface Env {
  COUNTER: DurableObjectNamespace<Counter>;
  ALLOWED_ORIGINS: string;
  ERRORS_READ_TOKEN?: string;
}

const MAX_ERRORS = 200;

export class Counter extends DurableObject<Env> {
  async get(): Promise<number> {
    return (await this.ctx.storage.get<number>('count')) ?? 0;
  }

  async increment(): Promise<number> {
    const next = (await this.get()) + 1;
    await this.ctx.storage.put('count', next);
    return next;
  }

  async errors(): Promise<ErrorReport[]> {
    return (await this.ctx.storage.get<ErrorReport[]>('errors')) ?? [];
  }

  async recordError(r: ErrorReport): Promise<number> {
    const next = [r, ...(await this.errors())].slice(0, MAX_ERRORS);
    await this.ctx.storage.put('errors', next);
    return next.length;
  }
}

function cors(origin: string | null, allowed: string[]): Record<string, string> {
  const ok = origin !== null && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const allowed = env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    const headers = cors(request.headers.get('Origin'), allowed);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }
    const stub = env.COUNTER.getByName('pick3');
    const originOk = (): boolean => {
      const origin = request.headers.get('Origin');
      return origin !== null && allowed.includes(origin);
    };
    if (request.method === 'GET' && url.pathname === '/count') {
      return Response.json({ count: await stub.get() }, { headers });
    }
    if (request.method === 'POST' && url.pathname === '/hit') {
      if (!originOk()) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      return Response.json({ count: await stub.increment() }, { headers });
    }
    if (request.method === 'POST' && url.pathname === '/error') {
      if (!originOk()) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      const text = await request.text();
      if (text.length > 2048) {
        return Response.json({ error: 'too large' }, { status: 413, headers });
      }
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return Response.json({ error: 'bad json' }, { status: 400, headers });
      }
      const report = parseReport(body);
      if (!report) {
        return Response.json({ error: 'bad report' }, { status: 400, headers });
      }
      return Response.json({ stored: await stub.recordError(report) }, { headers });
    }
    if (request.method === 'GET' && url.pathname === '/errors') {
      const auth = request.headers.get('Authorization') ?? '';
      if (!env.ERRORS_READ_TOKEN || auth !== `Bearer ${env.ERRORS_READ_TOKEN}`) {
        return Response.json({ error: 'unauthorized' }, { status: 401, headers });
      }
      return Response.json({ errors: await stub.errors() }, { headers });
    }
    return Response.json({ error: 'not found' }, { status: 404, headers });
  },
} satisfies ExportedHandler<Env>;
