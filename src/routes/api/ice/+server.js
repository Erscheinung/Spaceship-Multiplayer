import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { createHmac, randomBytes } from 'node:crypto';

const headers = { 'Cache-Control': 'no-store' };
let cached, expires = 0, pending;
async function metered() {
  if (cached && Date.now() < expires) return cached;
  if (pending) return pending;
  pending = (async () => {
    const url = new URL('/api/v1/turn/credentials', `https://${env.METERED_DOMAIN}`);
    url.searchParams.set('apiKey', env.METERED_API_KEY);
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('Relay credential service unavailable');
    const servers = await response.json();
    if (!Array.isArray(servers)) throw new Error('Invalid relay response');
    const valid = servers.filter(s => s && [s.urls].flat().every(u => typeof u === 'string' && /^(stun|turn|turns):/.test(u)));
    if (!valid.some(s => [s.urls].flat().some(u => /^turns?:/.test(u)))) throw new Error('No relay returned');
    cached = valid.map(({ urls, username, credential }) => ({ urls, username, credential }));
    expires = Date.now() + 60000;
    return cached;
  })();
  try { return await pending; } finally { pending = null; }
}
export async function GET() {
  if (env.METERED_DOMAIN && env.METERED_API_KEY) {
    try { return json({ iceServers: await metered(), provider: 'metered' }, { headers }); }
    catch { return json({ iceServers: [], error: 'Relay credentials unavailable. Retry in a moment.' }, { status: 503, headers }); }
  }
  const urls = (env.TURN_URLS || '').split(',').map(s => s.trim()).filter(s => /^turns?:/.test(s));
  if (!env.TURN_SECRET || !urls.length) return json({ iceServers: [] }, { headers });
  const username = `${Math.floor(Date.now()/1000)+600}:${randomBytes(8).toString('hex')}`;
  const credential = createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
  return json({ iceServers: [{ urls, username, credential }] }, { headers });
}
