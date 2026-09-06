<script>
  import { onMount } from 'svelte';
  import { SHIP_COLORS, DIFFICULTIES } from '$lib/game/settings.js';
  import { TiltInput } from '$lib/game/TiltInput.js';
  let canvas, engine, network, Engine, PeerSession;
  let screen = 'menu', code = '', room = '', status = '', error = '', busy = false, ready = false, solo = false, host = true;
  let difficulty='normal', shipColor='cyan', controlMode='drag', sensitivity=1, tilt, controlMessage='', boostHeld=false, liftHeld=false, stick={x:0,z:0};
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
    tilt=new TiltInput((value,message)=>{if(message){controlMessage=message;controlMode='drag';}if(value&&playing&&!paused&&controlMode==='tilt'&&engine)engine.touch={x:value.x*sensitivity,z:value.z*sensitivity};});
    return () => { disposed = true; tilt?.disable(); engine?.destroy(); network?.destroy(); };

  });
  function initEngine() {
    try { engine = new Engine(canvas, { onHud: s => { hud = s; }, onPause: togglePause, onError: fail }); ready = true; }
    catch (e) { ready = false; error = `WebGL could not start. Enable hardware acceleration and reload. ${e.message}`; }
  }
  function fail(message) { error = message; busy = false; status = ''; if (playing) { flags = [true, true]; engine?.setPaused(true); releaseFlightControls(); } }
  function start(settings = {difficulty, colors:[shipColor,'coral']}) { busy = false; screen = 'game'; hud = null; flags = [false, false]; engine.start({ host, solo, network, settings });boostHeld=false;liftHeld=false;stick={x:0,z:0};tilt?.calibrate(); if (document.hidden) togglePause(true); }
  async function connect(create) {
    if (busy || !ready) return;
    error = ''; busy = true; host = create; solo = false; status = create ? 'Opening a frequency…' : 'Finding your wingmate…';
    network?.destroy();
    const session = new PeerSession({
      room: value => { room = value; screen = 'lobby'; busy = false; status = 'Waiting for a wingmate'; },
      connected: () => { status = 'Wingmate connected. Launching…'; if (!create) session.ready(); },
      start,
      input: input => engine.receiveInput(input), snapshot: state => engine.receiveSnapshot(state),
      pause: value => { flags = value; if(flags.some(Boolean))releaseFlightControls(); engine.setPaused(flags.some(Boolean) || Boolean(hud?.over)); },
      error: fail, status: value => status=value
    }, {difficulty,colors:[shipColor,'coral']});
    network = session;
    try { if (create) await session.create(); else { room = code.toUpperCase(); await session.join(room); } }
    catch (e) { if (network === session) { fail(e.message); session.destroy(); } }
  }
  function practice() { if (!ready || busy || screen !== 'menu') return; network?.destroy(); network=null; solo = true; host = true; error = ''; room = 'SOLO'; start(); }
  function togglePause(force = false) {
    if (!playing || hud?.over || error) return;
    const next = force === true ? true : !flags[me];
    flags = flags.map((v, i) => i === me ? next : v);
    // Freeze immediately on the requesting peer; host acknowledgement reconciles it.
    engine.setPaused(flags.some(Boolean));releaseFlightControls();
    if (!solo) network.setPaused(next);
  }
  function menu() {
    network?.destroy(); network = null; engine?.destroy(); engine = null;
    screen = 'menu'; flags = [false, false]; hud = null; error = ''; busy = false; status = ''; initEngine();
  }
  async function copy() { try { await navigator.clipboard.writeText(room); copied = true; setTimeout(() => copied = false, 1500); } catch { status = 'Select and copy the room code below.'; } }
  async function changeControls(value) {
    controlMessage='';releaseFlightControls();tilt?.disable();controlMode=value;
    if(value==='tilt')try{await tilt.enable();controlMessage='Hold comfortably, then tilt to steer. Recalibrate after rotating.';}catch(e){controlMode='drag';controlMessage=e.message;}
  }
  function releaseFlightControls(){boostHeld=false;liftHeld=false;stick={x:0,z:0};if(engine){engine.touch={x:0,z:0};engine.actions={boost:false,lift:false};}}
  function holdAction(e,action){if(paused)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);engine.actions[action]=true;if(action==='boost')boostHeld=true;else liftHeld=true;}
  function releaseAction(action){if(engine)engine.actions[action]=false;if(action==='boost')boostHeld=false;else liftHeld=false;}
  function releaseSteering(){stick={x:0,z:0};if(engine&&controlMode==='drag')engine.touch=stick;}
  function touchMove(e) {
    if(paused||controlMode==='tilt')return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect(); e.currentTarget.setPointerCapture(e.pointerId);
    stick = { x: Math.max(-1, Math.min(1, (e.clientX - rect.left - rect.width / 2) / (rect.width / 2))), z: Math.max(-1, Math.min(1, (e.clientY - rect.top - rect.height / 2) / (rect.height / 2))) };
    engine.touch={x:stick.x*sensitivity,z:stick.z*sensitivity};
  }
  function focusModal(node) {
    node.focus();
    const trap = e => {
      if (e.key !== 'Tab') return;
      const buttons = [...node.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), summary')];
      const first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === node)) { e.preventDefault(); first?.focus(); }
    };
    node.addEventListener('keydown', trap);
    return { destroy() { node.removeEventListener('keydown', trap); } };
  }
</script>

<svelte:window onkeydown={e => { if (e.code === 'Space' && !e.repeat && screen === 'menu' && !e.target?.closest?.('input, textarea, select, button, a, summary, [contenteditable]')) { e.preventDefault(); practice(); } }} />

<svelte:head><title>NEON WING — The scenic route</title><meta name="description" content="An illustrated 3D city flight game. Two pilots. One frequency. Dodge towers and fly together through a winding pastel city." /></svelte:head>

<div class="game-canvas" bind:this={canvas}></div>
<div class="vignette" class:playing></div>
<div class:in-game={playing} class="shell">
  <header>
    <a href="/" class="brand" aria-label="Neon Wing home"><span class="brand-icon">⋈</span> NEON<span>WING</span></a>
    <div class="header-right"><span class="live-dot"></span> {playing ? `${solo ? 'PRACTICE' : 'P2P LINK'} / ${room}` : 'CO-OP SURVIVAL'} <span class="version">SKYWAY / 04</span></div>
  </header>

  {#if !playing}
    <main class="menu-layout">
      <section class="hero">
        <p class="eyebrow"><span></span> TWO PILOTS. ONE FREQUENCY.</p>
        <h1>TAKE THE<br /><em>SCENIC ROUTE.</em></h1>
        {#if screen === 'menu'}<button class="quick-start" onclick={practice} disabled={!ready || busy}><span class="desktop-start">PRESS SPACE TO START</span><span class="phone-start">TAP TO START</span><small>SOLO PRACTICE ↗</small></button>{/if}
        <p class="intro">A little altitude. A lot of close calls.<br />Find your wingmate and thread the waking city.</p>
        <div class="hero-tags"><span>01 — EVADE</span><span>02 — EVOLVE</span><span>03 — ENDURE</span></div>
      </section>

      <section class="launch-panel" aria-label="Flight controls">
        <div class="panel-top"><span>FLIGHT TERMINAL</span><span class="terminal-bars">▂ ▄ ▆ █</span></div>
        {#if screen !== 'lobby'}
          <div class="flight-setup">
            <label for="difficulty">FLIGHT DIFFICULTY {screen === 'join' ? '— HOST DECIDES' : ''}</label>
            <select id="difficulty" bind:value={difficulty} disabled={busy || screen === 'join'}>{#each Object.entries(DIFFICULTIES) as [key,value]}<option value={key}>{value.label}</option>{/each}</select>
            <p class="setup-note">{difficulty==='brutal' ? 'No aim assist. Line up in height and direction. Double damage.' : difficulty==='easy' ? 'A gentler flight with assisted aim.' : 'Faster threats, assisted aim. Stay on the move.'}</p>
            <label for="ship-color">YOUR SHIP COLOR</label>
            <select id="ship-color" bind:value={shipColor} style:border-left={`6px solid ${SHIP_COLORS[shipColor]}`} onchange={e=>engine?.applyColors([e.currentTarget.value,'coral'])} disabled={busy}>{#each Object.keys(SHIP_COLORS) as color}<option value={color}>{color.toUpperCase()}</option>{/each}</select>
          </div>
        {/if}
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
        {#if (busy || screen === 'lobby') && !error}<div class="connection-progress" role="status"><div class="link-orbit"><span>✦</span><i></i><span>✦</span></div><p>{status}</p><small>Find room → negotiate route → launch together</small></div>{/if}
        {#if error}<p class="error" role="alert">{error}</p>{/if}
<details class="control-details"><summary>Control settings</summary><div class="control-settings"><label for="steering">PHONE STEERING</label><select id="steering" value={controlMode} onchange={e=>changeControls(e.currentTarget.value)}><option value="drag">Drag pad</option><option value="tilt">Tilt device</option></select><label for="sensitivity">STEERING SENSITIVITY</label><input id="sensitivity" type="range" min="0.5" max="1.8" step="0.1" bind:value={sensitivity}/>{#if controlMessage}<p class="setup-note" role="status">{controlMessage}</p>{/if}</div></details>
        <div class="panel-bottom"><span class="live-dot"></span> WEBRTC DIRECT LINK <span>2 PLAYERS MAX</span></div>
      </section>

      <div class="flight-guide"><div><span class="guide-number">01</span><p><strong>Find your flow</strong><small><kbd>W A S D</kbd> or arrow keys to move</small></p></div><div><span class="guide-number">02</span><p><strong>Let it rain</strong><small>Auto-fire targets the nearest threat</small></p></div><div><span class="guide-number">03</span><p><strong>Chase the glow</strong><small>SHIFT to boost · Hold SPACE to climb</small></p></div></div>
    </main>
    <footer><span>POSTCARDS FROM THE FAST LANE.</span><span><i class="cyan"></i> YOUR COLOR <i class="pink"></i> YOUR WINGMATE</span><span>HEADPHONES OFF. THRUSTERS ON.</span></footer>
  {:else}
    <div class="hud">
      <div class="pilot-card"><span class="eyebrow">{(hud?.settings?.colors[me] ?? shipColor).toUpperCase()} / YOU</span><div class="health" style:--ship-color={SHIP_COLORS[hud?.settings?.colors[me] ?? shipColor]}>{#each Array(5) as _, i}<span class:empty={i >= (hud?.players[me]?.hp ?? 5)}></span>{/each}</div><small>RATE {hud?.players[me]?.rate ?? 0} <b>/</b> SPREAD {1 + (hud?.players[me]?.spread ?? 0) * 2}</small></div>
      <div class="run-stats"><span>SECTOR {String(hud?.wave ?? 1).padStart(2, '0')}</span><strong>{time(hud?.time)}</strong><small>{String(hud?.score ?? 0).padStart(6, '0')} PTS</small></div>
      <button class="pause-button" onclick={() => togglePause()} disabled={!!hud?.over || !!error}>Ⅱ <span>ESC / PAUSE</span></button>
    </div>
    {#if !solo}<div class="wingmate-status">WINGMATE <span class:down={hud?.players[1-me]?.hp === 0}>{hud?.players[1-me]?.hp === 0 ? 'SIGNAL LOST — KEEP FLYING' : `${hud?.players[1-me]?.hp ?? 5}/5 HULL`}</span></div>{/if}
    <div class="flight-instruments"><span>SPD <b data-testid="speed">{Math.round((14+(hud?.players[me]?.boost ?? 0))*3.6)}</b> km/h</span><span>ALT <b data-testid="altitude">{Math.round((hud?.players[me]?.y ?? 0)+4)}</b> m</span><span>{(hud?.settings?.difficulty ?? difficulty).toUpperCase()}</span></div>
    <div class="route-label"><span>SHIFT / BOOST · SPACE / CLIMB</span><strong>The Afterlight Skyway</strong></div>
    <div class="game-hint">BANK THROUGH THE SKYWAY <span>◇</span> COLLECT UPGRADE CORES <span>◇</span> {hud?.settings?.difficulty==='brutal' ? 'ALIGN YOUR SHOTS' : 'WEAPONS AUTO-FIRE'}</div>
    <div class="touch-controls">
      {#if controlMode==='drag'}<button aria-label="Drag to steer" class="touch-pad" onpointerdown={touchMove} onpointermove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))touchMove(e);}} onpointerup={releaseSteering} onpointercancel={releaseSteering} onlostpointercapture={releaseSteering}><span style:transform={`translate(${stick.x*28}px,${stick.z*28}px)`}>✥</span></button>{:else}<button class="calibrate" onclick={()=>tilt.calibrate()}>◎<br/>CALIBRATE TILT</button>{/if}
      <span>{controlMode==='drag'?'DRAG TO STEER':'TILT TO STEER'}</span>
    </div>
    <div class="flight-actions">
      <button aria-label="Hold to climb" class:held={liftHeld} onpointerdown={e=>holdAction(e,'lift')} onpointerup={()=>releaseAction('lift')} onpointercancel={()=>releaseAction('lift')} onlostpointercapture={()=>releaseAction('lift')}>↑<small>CLIMB</small></button>
      <button aria-label="Hold to boost" class:held={boostHeld} onpointerdown={e=>holdAction(e,'boost')} onpointerup={()=>releaseAction('boost')} onpointercancel={()=>releaseAction('boost')} onlostpointercapture={()=>releaseAction('boost')}>»<small>BOOST</small></button>
    </div>
    {#if paused || hud?.over || error}
      <div class="overlay"><div class="pause-panel" role="dialog" aria-modal="true" aria-label={hud?.over ? 'Run complete' : 'Flight paused'} tabindex="-1" use:focusModal>
        <p class="eyebrow">{error ? 'LINK INTERRUPTED' : hud?.over ? 'END OF TRANSMISSION' : 'FREQUENCY ON HOLD'}</p>
        <h2>{error ? 'Signal lost.' : hud?.over ? 'Into the afterlight.' : 'Catch your breath.'}</h2>
        <p>{error || (hud?.over ? 'The city takes this one. Your next run is waiting.' : solo ? 'Your run is paused.' : 'Both ships are paused. Each pilot must clear their own pause to resume.')}</p>
<div class="control-settings"><label for="pause-steering">PHONE STEERING</label><select id="pause-steering" value={controlMode} onchange={e=>changeControls(e.currentTarget.value)}><option value="drag">Drag pad</option><option value="tilt">Tilt device</option></select><label for="pause-sensitivity">STEERING SENSITIVITY</label><input id="pause-sensitivity" type="range" min="0.5" max="1.8" step="0.1" bind:value={sensitivity}/>{#if controlMessage}<p class="setup-note" role="status">{controlMessage}</p>{/if}</div>
        <div class="end-stats"><div><small>SURVIVED</small><strong>{time(hud?.time)}</strong></div><div><small>TEAM SCORE</small><strong>{hud?.score ?? 0}</strong></div></div>
        {#if !hud?.over && !error}<button class="primary full" onclick={() => togglePause()} disabled={!flags[me]}>{flags[me] ? 'RESUME FLIGHT' : 'WAITING FOR WINGMATE'} <span>→</span></button>{/if}
        <button class="secondary full" onclick={menu}>RETURN TO TERMINAL</button>
      </div></div>
    {/if}
  {/if}
</div>
