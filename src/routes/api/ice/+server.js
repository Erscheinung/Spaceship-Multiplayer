import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { createHmac, randomBytes } from 'node:crypto';

const headers = { 'Cache-Control': 'no-store' };
let cached, expires = 0, pending;
const validIceUrl = value => typeof value === 'string' && /^(?:stun|turn|turns):[^\s,]+$/i.test(value);
const urlsOf = value => [value].flat().filter(v => typeof v === 'string').map(v => v.trim()).filter(validIceUrl);
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
    const valid = servers.filter(s => s && typeof s === 'object').map(s => ({ ...s, urls: urlsOf(s.urls) })).filter(s => s.urls.length);
    if (!valid.some(s => s.urls.some(u => /^turns?:/i.test(u)) && s.username && s.credential)) throw new Error('No relay returned');
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
  // TURN_URLS may contain UDP, TCP and TLS entries from the same provider,
  // for example `turn:relay.example:3478?transport=udp,turn:relay.example:80?transport=tcp,turns:relay.example:443?transport=tcp`.
  // Keep the configured host as the source of truth; never invent a relay or
  // expose a secret in the response.
  const urls = urlsOf((env.TURN_URLS || '').split(',')).filter(u => /^turns?:/i.test(u));
  if (!env.TURN_SECRET || !urls.length) return json({ iceServers: [], error: 'This deployment has no TURN relay configured. Set METERED_DOMAIN and METERED_API_KEY in Vercel and redeploy.' }, { status: 503, headers });
  const username = `${Math.floor(Date.now()/1000)+600}:${randomBytes(8).toString('hex')}`;
  const credential = createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
  return json({ iceServers: [{ urls, username, credential }] }, { headers });
}
