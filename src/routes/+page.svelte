<script>
  import { onMount } from 'svelte';
  let canvas, engine, network, Engine, PeerSession;
  let screen = 'menu', code = '', room = '', status = '', error = '', busy = false, ready = false, solo = false, host = true;
  let flags = [false, false], hud = null, copied = false;
  $: paused = flags.some(Boolean);
  $: me = host ? 0 : 1;
  $: playing = screen === 'game';
  const time = seconds => `${String(Math.floor((seconds || 0) / 60)).padStart(2, '0')}:${String(Math.floor((seconds || 0) % 60)).padStart(2, '0')}`;

  onMount(() => {
    let disposed = false;
    Promise.all([import('$lib/game/Engine.js'), import('$lib/net/PeerSession.js')]).then(([game, net]) => {
      if (disposed) return; Engine = game.Engine; PeerSession = net.PeerSession; initEngine();
    }).catch(e => { error = `Unable to initialize graphics: ${e.message}`; });
    const escape = e => { if (e.code === 'Escape' && !e.repeat && playing && /BUTTON/.test(e.target?.tagName)) togglePause(); };
    window.addEventListener('keydown', escape);
    return () => { disposed = true; engine?.destroy(); network?.destroy(); window.removeEventListener('keydown', escape); };
  });
  function initEngine() {
    try { engine = new Engine(canvas, { onHud: s => { hud = s; }, onPause: togglePause, onError: fail }); ready = true; }
    catch (e) { ready = false; error = `WebGL could not start. Enable hardware acceleration and reload. ${e.message}`; }
  }
  function fail(message) { error = message; busy = false; status = ''; if (playing) { flags = [true, true]; engine?.setPaused(true); } }
  function start() { busy = false; screen = 'game'; hud = null; flags = [false, false]; engine.start({ host, solo, network }); if (document.hidden) togglePause(true); }
  async function connect(create) {
    error = ''; busy = true; host = create; solo = false; status = create ? 'Opening a frequency…' : 'Finding your wingmate…';
    network?.destroy();
    const session = new PeerSession({
      room: value => { room = value; screen = 'lobby'; busy = false; status = 'Waiting for a wingmate'; },
      connected: () => { status = 'Wingmate connected. Launching…'; if (!create) session.ready(); },
      start,
      input: input => engine.receiveInput(input), snapshot: state => engine.receiveSnapshot(state),
      pause: value => { flags = value; engine.setPaused(flags.some(Boolean) || Boolean(hud?.over)); },
      error: fail
    });
    network = session;
    try { if (create) await session.create(); else { room = code.toUpperCase(); await session.join(room); } }
    catch (e) { if (network === session) { fail(e.message); session.destroy(); } }
  }
  function practice() { solo = true; host = true; error = ''; room = 'SOLO'; start(); }
  function togglePause(force = false) {
    if (!playing || hud?.over || error) return;
    const next = force === true ? true : !flags[me];
    flags = flags.map((v, i) => i === me ? next : v);
    // Freeze immediately on the requesting peer; host acknowledgement reconciles it.
    engine.setPaused(flags.some(Boolean));
    if (!solo) network.setPaused(next);
  }
  function menu() {
    network?.destroy(); network = null; engine?.destroy(); engine = null;
    screen = 'menu'; flags = [false, false]; hud = null; error = ''; busy = false; status = ''; initEngine();
  }
  async function copy() { try { await navigator.clipboard.writeText(room); copied = true; setTimeout(() => copied = false, 1500); } catch { status = 'Select and copy the room code below.'; } }
  function touchMove(e) {
    const rect = e.currentTarget.getBoundingClientRect(); e.currentTarget.setPointerCapture(e.pointerId);
    engine.touch = { x: Math.max(-1, Math.min(1, (e.clientX - rect.left - rect.width / 2) / (rect.width / 2))), z: Math.max(-1, Math.min(1, (e.clientY - rect.top - rect.height / 2) / (rect.height / 2))) };
  }
  function focusModal(node) {
    node.focus();
    const trap = e => {
      if (e.key !== 'Tab') return;
      const buttons = [...node.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === node)) { e.preventDefault(); first?.focus(); }
    };
    node.addEventListener('keydown', trap);
    return { destroy() { node.removeEventListener('keydown', trap); } };
  }
</script>

<svelte:head><title>NEON WING — The scenic route</title><meta name="description" content="An illustrated 3D city flight game. Two pilots. One frequency. Dodge towers and fly together through a winding pastel city." /></svelte:head>

<div class="game-canvas" bind:this={canvas}></div>
<div class="vignette" class:playing></div>
<div class:in-game={playing} class="shell">
  <header>
    <a href="/" class="brand" aria-label="Neon Wing home"><span class="brand-icon">⋈</span> NEON<span>WING</span></a>
    <div class="header-right"><span class="live-dot"></span> {playing ? `${solo ? 'PRACTICE' : 'P2P LINK'} / ${room}` : 'CO-OP SURVIVAL'} <span class="version">CITY / 02</span></div>
  </header>

  {#if !playing}
    <main class="menu-layout">
      <section class="hero">
        <p class="eyebrow"><span></span> TWO PILOTS. ONE FREQUENCY.</p>
        <h1>TAKE THE<br /><em>SCENIC ROUTE.</em></h1>
        <p class="intro">A little altitude. A lot of close calls.<br />Find your wingmate and thread the waking city.</p>
        <div class="hero-tags"><span>01 — EVADE</span><span>02 — EVOLVE</span><span>03 — ENDURE</span></div>
      </section>

      <section class="launch-panel" aria-label="Flight controls">
        <div class="panel-top"><span>FLIGHT TERMINAL</span><span class="terminal-bars">▂ ▄ ▆ █</span></div>
        {#if screen === 'lobby'}
          <p class="eyebrow">TRANSMISSION OPEN</p><h2>Call your wingmate.</h2>
          <p class="panel-copy">Share this room code with a second pilot.</p>
          <button class="room-code" onclick={copy} title="Copy room code">{room}</button>
          <p class="waiting"><span class="live-dot"></span> {copied ? 'Code copied' : status}</p>
          <button class="secondary full" onclick={menu}>Cancel transmission</button>
        {:else if screen === 'join'}
          <p class="eyebrow">TUNE IN</p><h2>Find your frequency.</h2>
          <p class="panel-copy">Enter the four-character code from your host.</p>
          <form onsubmit={e => { e.preventDefault(); connect(false); }}>
            <label for="room">ROOM PASSCODE</label>
            <input id="room" maxlength="4" placeholder="A7K9" autocomplete="off" autocapitalize="characters" spellcheck="false" bind:value={code} oninput={() => code = code.toUpperCase().replace(/[^A-Z0-9]/g, '')} disabled={busy} />
            <button class="primary full" disabled={busy || code.length !== 4 || !ready}>{busy ? 'CONNECTING…' : 'CONNECT & FLY'} <span>↗</span></button>
          </form>
          <button class="text-button" onclick={menu}>← Back to terminal</button>
        {:else}
          <p class="eyebrow">READY FOR DEPARTURE</p><h2>Don’t fly alone.</h2>
          <p class="panel-copy">Host a run or join your wingmate.<br />No accounts. Just a code.</p>
          <button class="primary full" onclick={() => connect(true)} disabled={busy || !ready}>{busy ? 'OPENING ROOM…' : 'CREATE A ROOM'} <span>↗</span></button>
          <button class="secondary full" onclick={() => { screen = 'join'; error = ''; }} disabled={busy || !ready}>JOIN WITH CODE <span>⌁</span></button>
          <div class="divider"><span>OR GO OFFLINE</span></div>
          <button class="practice" onclick={practice} disabled={!ready || busy}>Solo practice <span>→</span></button>
        {/if}
        {#if error}<p class="error" role="alert">{error}</p>{:else if busy}<p class="status" role="status">{status}</p>{/if}
        <div class="panel-bottom"><span class="live-dot"></span> WEBRTC DIRECT LINK <span>2 PLAYERS MAX</span></div>
      </section>

      <div class="flight-guide"><div><span class="guide-number">01</span><p><strong>Find your flow</strong><small><kbd>W A S D</kbd> or arrow keys to move</small></p></div><div><span class="guide-number">02</span><p><strong>Let it rain</strong><small>Auto-fire targets the nearest threat</small></p></div><div><span class="guide-number">03</span><p><strong>Chase the glow</strong><small>Collect cores. Upgrade your arsenal.</small></p></div></div>
    </main>
    <footer><span>POSTCARDS FROM THE FAST LANE.</span><span><i class="cyan"></i> CYAN / HOST <i class="pink"></i> MAGENTA / WINGMATE</span><span>HEADPHONES OFF. THRUSTERS ON.</span></footer>
  {:else}
    <div class="hud">
      <div class="pilot-card"><span class="eyebrow">{host ? 'CYAN' : 'MAGENTA'} / YOU</span><div class="health" class:magenta={!host}>{#each Array(5) as _, i}<span class:empty={i >= (hud?.players[me]?.hp ?? 5)}></span>{/each}</div><small>RATE {hud?.players[me]?.rate ?? 0} <b>/</b> SPREAD {1 + (hud?.players[me]?.spread ?? 0) * 2}</small></div>
      <div class="run-stats"><span>SECTOR {String(hud?.wave ?? 1).padStart(2, '0')}</span><strong>{time(hud?.time)}</strong><small>{String(hud?.score ?? 0).padStart(6, '0')} PTS</small></div>
      <button class="pause-button" onclick={() => togglePause()} disabled={!!hud?.over || !!error}>Ⅱ <span>ESC / PAUSE</span></button>
    </div>
    {#if !solo}<div class="wingmate-status">WINGMATE <span class:down={hud?.players[1-me]?.hp === 0}>{hud?.players[1-me]?.hp === 0 ? 'SIGNAL LOST — KEEP FLYING' : `${hud?.players[1-me]?.hp ?? 5}/5 HULL`}</span></div>{/if}
    <div class="route-label"><span>LOW ALTITUDE / CITY RUN</span><strong>The Afterlight District</strong></div>
    <div class="game-hint">DODGE THE TOWERS <span>◇</span> COLLECT UPGRADE CORES <span>◇</span> WEAPONS AUTO-FIRE</div>
    <div class="touch-controls"><button aria-label="Drag to steer" class="touch-pad" onpointerdown={touchMove} onpointermove={e => { if (e.buttons) touchMove(e); }} onpointerup={() => engine.touch = { x: 0, z: 0 }} onpointercancel={() => engine.touch = { x: 0, z: 0 }}>✥</button><span>DRAG TO STEER</span></div>
    {#if paused || hud?.over || error}
      <div class="overlay"><div class="pause-panel" role="dialog" aria-modal="true" aria-label={hud?.over ? 'Run complete' : 'Flight paused'} tabindex="-1" use:focusModal>
        <p class="eyebrow">{error ? 'LINK INTERRUPTED' : hud?.over ? 'END OF TRANSMISSION' : 'FREQUENCY ON HOLD'}</p>
        <h2>{error ? 'Signal lost.' : hud?.over ? 'Into the afterlight.' : 'Catch your breath.'}</h2>
        <p>{error || (hud?.over ? 'The city takes this one. Your next run is waiting.' : solo ? 'Your run is paused.' : 'Both ships are paused. Each pilot must clear their own pause to resume.')}</p>
        <div class="end-stats"><div><small>SURVIVED</small><strong>{time(hud?.time)}</strong></div><div><small>TEAM SCORE</small><strong>{hud?.score ?? 0}</strong></div></div>
        {#if !hud?.over && !error}<button class="primary full" onclick={() => togglePause()} disabled={!flags[me]}>{flags[me] ? 'RESUME FLIGHT' : 'WAITING FOR WINGMATE'} <span>→</span></button>{/if}
        <button class="secondary full" onclick={menu}>RETURN TO TERMINAL</button>
      </div></div>
    {/if}
  {/if}
</div>
