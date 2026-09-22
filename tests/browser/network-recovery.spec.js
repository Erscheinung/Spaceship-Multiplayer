import { test, expect } from '@playwright/test';

// Real PeerJS/WebRTC with deterministic delivery impairment at the receiving
// application boundary. This is not a claim of testing a corporate firewall.
test('disposable state tolerates jitter/loss and the same pilots recover a closed transport', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['local-network-access'] });
  await context.route('**/api/ice', route => route.fulfill({ json: { iceServers: [] } }));
  await context.route('**/network-harness', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Network harness</title>' }));
  await context.route(/\/@id\/.*env\/dynamic\/public/, route => route.fulfill({ contentType: 'application/javascript', body: 'export const env = { PUBLIC_PEER_HOST: "127.0.0.1", PUBLIC_PEER_PORT: "9000", PUBLIC_PEER_PATH: "/", PUBLIC_PEER_SECURE: "false" };' }));
  const host = await context.newPage(), guest = await context.newPage();
  const errors = [];
  for (const page of [host, guest]) page.on('pageerror', error => errors.push(error.message));
  try {
    for (const page of [host, guest]) {
      await page.goto('/network-harness');
      await page.evaluate(async () => {
        const { PeerSession } = await import('/src/lib/net/PeerSession.js');
        window.received = []; window.starts = 0; window.recoveries = []; window.failures = []; window.pauseFlags = [];
        window.session = new PeerSession({
          connected: () => { if (!session.host) session.ready(); },
          start: () => starts++, snapshot: state => received.push(state.time),
          pause: flags => { pauseFlags = flags; }, recovery: active => recoveries.push(active),
          error: message => failures.push(message), status: message => { window.lastStatus = message; }
        });
      });
    }
    const code = await host.evaluate(async () => { await session.create(); return session.code; });
    await guest.evaluate(code => session.join(code), code);
    await expect.poll(() => host.evaluate(() => starts)).toBe(1);
    await expect.poll(() => guest.evaluate(() => starts)).toBe(1);
    await expect.poll(() => guest.evaluate(() => session.streamChannel?.readyState)).toBe('open');
    await expect.poll(() => host.evaluate(() => session.streamChannel?.readyState)).toBe('open');
    expect(await guest.evaluate(() => ({ ordered: session.streamChannel.ordered, retries: session.streamChannel.maxRetransmits }))).toEqual({ ordered: false, retries: 0 });
    await guest.evaluate(() => {
      const receive = session.receive.bind(session); let n = 0;
      session.receive = message => {
        if (message.type !== 'snapshot') return receive(message);
        n++; if (n % 4 === 0) return;
        setTimeout(() => receive(message), n % 3 === 0 ? 220 : 35);
      };
    });
    await host.evaluate(() => {
      window.tick = 0;
      window.pump = setInterval(() => session.send({ type: 'snapshot', state: { time: ++tick, players: [] } }), 50);
    });
    await expect.poll(() => guest.evaluate(() => received.at(-1) ?? 0)).toBeGreaterThan(20);
    await guest.evaluate(() => session.setPaused(true));
    await expect.poll(() => host.evaluate(() => pauseFlags)).toEqual([false, true]);
    await guest.evaluate(() => session.setPaused(false));
    await expect.poll(() => host.evaluate(() => pauseFlags)).toEqual([false, false]);
    const before = await guest.evaluate(() => received.at(-1));
    await guest.evaluate(() => session.connection.peerConnection.close());
    await expect.poll(() => guest.evaluate(() => recoveries.includes(true))).toBe(true);
    await expect.poll(() => guest.evaluate(() => recoveries.includes(false)), { timeout: 20000 }).toBe(true);
    await expect.poll(() => guest.evaluate(() => received.at(-1) ?? 0), { timeout: 15000 }).toBeGreaterThan(before + 5);
    expect(await guest.evaluate(() => starts)).toBe(1);
    expect(await host.evaluate(() => starts)).toBe(1);
    expect(await guest.evaluate(() => received.every((value, index) => !index || value > received[index - 1]))).toBe(true);
    expect(await guest.evaluate(() => failures)).toEqual([]);
    expect(await host.evaluate(() => failures)).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await host.evaluate(() => { clearInterval(window.pump); window.session?.destroy(); }).catch(() => {});
    await guest.evaluate(() => window.session?.destroy()).catch(() => {});
    await context.close();
  }
});
