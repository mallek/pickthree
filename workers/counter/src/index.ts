/**
 * PickThree hit counter. One integer, Geocities style.
 *
 *   POST /hit    increments and returns { count }
 *   GET  /count  returns { count }
 *
 * Nothing else is stored: no IPs, no user agents, no collection data. The counter lives in a
 * single Durable Object so increments are atomic.
 */
import { DurableObject } from 'cloudflare:workers';

export interface Env {
  COUNTER: DurableObjectNamespace<Counter>;
  ALLOWED_ORIGINS: string;
}

export class Counter extends DurableObject<Env> {
  async get(): Promise<number> {
    return (await this.ctx.storage.get<number>('count')) ?? 0;
  }

  async increment(): Promise<number> {
    const next = (await this.get()) + 1;
    await this.ctx.storage.put('count', next);
    return next;
  }
}

function cors(origin: string | null, allowed: string[]): Record<string, string> {
  const ok = origin !== null && allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
    if (request.method === 'GET' && url.pathname === '/count') {
      return Response.json({ count: await stub.get() }, { headers });
    }
    if (request.method === 'POST' && url.pathname === '/hit') {
      const origin = request.headers.get('Origin');
      if (origin === null || !allowed.includes(origin)) {
        return Response.json({ error: 'origin not allowed' }, { status: 403, headers });
      }
      return Response.json({ count: await stub.increment() }, { headers });
    }
    return Response.json({ error: 'not found' }, { status: 404, headers });
  },
} satisfies ExportedHandler<Env>;
