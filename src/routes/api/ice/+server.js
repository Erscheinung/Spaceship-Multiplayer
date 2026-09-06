import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import { createHmac, randomBytes } from 'node:crypto';

// coturn's REST authentication: the shared secret never reaches a browser.
export function GET() {
  const urls = (env.TURN_URLS || '').split(',').map(s => s.trim()).filter(s => /^turns?:/.test(s));
  if (!env.TURN_SECRET || !urls.length) return json({ iceServers: [] }, { headers: { 'Cache-Control': 'no-store' } });
  const username = `${Math.floor(Date.now()/1000)+600}:${randomBytes(8).toString('hex')}`;
  const credential = createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
  return json({ iceServers: [{ urls, username, credential }] }, { headers: { 'Cache-Control': 'no-store' } });
}
