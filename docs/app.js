// VELOMNA web portal v6 (PLAY: the game as cards, one question at a time; the night page stays as the full view): the Big Dream clock, the board, and a night's own picture when it has one. Vanilla ES module. The API is the one door; this file only asks and shows.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const SUPABASE_URL = 'https://opgitcuqwicuiplaptkm.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9wZ2l0Y3Vxd2ljdWlwbGFwdGttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzYwNjEsImV4cCI6MjA4OTU1MjA2MX0.jOZbexswKI3w4wMI2WWvRuVKnPUMFtBeZUdG0LerL14';
const API = SUPABASE_URL + '/functions/v1/velomna-api';
const SLUG = 'velomna';
const sb = createClient(SUPABASE_URL, ANON, { auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true } });

const $ = (id) => document.getElementById(id);
// the display gate: nothing reaches the page with an em or en dash, whatever the ledger holds (law since night 1)
const nodash = (s) => String(s ?? '').replace(/\s*[\u2014\u2013]\s*/g, ', ');
const esc = (s) => nodash(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ─── the ten places: one genome, three renderers (Nano shader, the painted still, the label) ───
const GEO_NAMES = { ordinary_room: 'an ordinary room', non_euclidean_house: 'a house with more rooms than walls', event_horizon_interior: 'inside the horizon', lensed_sky: 'a lensed sky', wormhole_throat: 'a wormhole throat', branching_street: 'a street that branches into itself', backward_hour: 'an hour running backward', deep_ocean: 'the deep ocean', mars_dusk: 'dusk on Mars', inside_a_neuron: 'inside a neuron' };
const GEO_LABEL = { ordinary_room: 'ordinary', non_euclidean_house: 'ordinary', event_horizon_interior: 'observed_physics', lensed_sky: 'observed_physics', wormhole_throat: 'hypothesis', branching_street: 'hypothesis', backward_hour: 'hypothesis', deep_ocean: 'observed_physics', mars_dusk: 'observed_physics', inside_a_neuron: 'observed_physics' };
const GEO_ORDER = ['non_euclidean_house', 'lensed_sky', 'ordinary_room', 'event_horizon_interior', 'wormhole_throat', 'branching_street', 'backward_hour', 'deep_ocean', 'mars_dusk', 'inside_a_neuron'];
const HOLES = new Set(['event_horizon_interior', 'lensed_sky', 'wormhole_throat']);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const PLACE = { observed_physics: ['Observed physics', ''], hypothesis: ['Hypothesis, consistent', 'hyp'], ordinary: ['Ordinary', 'ord'] };
// the stills live on Cloudinary (generated once on 2026-10-15, never from seeds); f_auto picks AVIF/WebP, q_auto picks the bytes
const CDN = 'https://res.cloudinary.com/doemifuxr/image/upload';
const pic = (geo, w = 1600) => `${CDN}/f_auto,q_auto:good,c_fill,ar_16:9,w_${w}/velomna/geo/${GEO_NAMES[geo] ? geo : 'ordinary_room'}.jpg`;
// a night's own picture (a Big Dream painted from its scene) is a Cloudinary public id such as velomna/night/7; only ids under velomna/ are trusted
const picId = (id, w = 1600) => `${CDN}/f_auto,q_auto:good,c_fill,ar_16:9,w_${w}/${id}`;
const okId = (id) => typeof id === 'string' && /^velomna\/[A-Za-z0-9_\/-]{1,80}$/.test(id);
const srcset = (geo, id) => [800, 1200, 1600, 2048].map((w) => `${id ? picId(id, w) : pic(geo, w)} ${w}w`).join(', ');
function setPic(img, geo, sizes = '100vw', id = null) {
  if (!img) return;
  if (!okId(id)) id = null;
  const want = id || geo; if (img.dataset.showing === want) return;
  img.dataset.showing = want;
  img.classList.remove('in');
  img.sizes = sizes; img.srcset = srcset(geo, id); img.src = id ? picId(id, 1600) : pic(geo, 1600);
  const show = () => img.classList.add('in');
  if (img.complete && img.naturalWidth) show(); else img.addEventListener('load', show, { once: true });
}
function setWorld(geo, emotion) {
  document.body.classList.toggle('hole', HOLES.has(geo));
  if (window.nano?.ok) window.nano.set({ geometry: geo || 'lensed_sky', emotion: emotion || 'awe' });
}

let toastT; function toast(msg) { const t = $('toast'); t.textContent = nodash(msg); t.classList.add('open'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('open'), 4200); }
function beacon(path) { try { fetch(SUPABASE_URL + '/rest/v1/zo_product_metrics', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ product_slug: SLUG, event: 'page_view', path: path.slice(0, 120), is_probe: false, source: 'browser' }), keepalive: true }).catch(() => {}); } catch (e) {} }

async function token() { const { data } = await sb.auth.getSession(); return data?.session?.access_token || null; }
// the visitor's key: made here, held here, hashed on the server. On first sign-in the server turns this visitor into the human.
const guestKey = (() => { try { let k = localStorage.getItem('velomna_guest'); if (!/^[A-Za-z0-9-]{16,64}$/.test(k || '')) { k = (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('')); localStorage.setItem('velomna_guest', k); } return k; } catch (e) { return null; } })();
const seen = (k) => { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } };
const mark = (k) => { try { localStorage.setItem(k, '1'); } catch (e) {} };
async function api(path, body) {
  const t = await token();
  const r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}), ...(guestKey ? { 'x-velomna-guest': guestKey } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ error: 'no answer' }));
  if (!r.ok) throw new Error(j.error || ('error ' + r.status));
  return j;
}

// ─── reveal on scroll (no library) ───
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
function arm() { document.querySelectorAll('.reveal:not(.in)').forEach((el) => io ? io.observe(el) : el.classList.add('in')); }

// ─── routing ───
const VIEWS = ['home', 'play', 'night', 'morning', 'agents', 'law'];
function route() {
  const h = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'home';
  const v = VIEWS.includes(h) ? h : 'home';
  VIEWS.forEach((x) => $('v-' + x).classList.toggle('open', x === v));
  document.querySelectorAll('nav a').forEach((a) => { if (a.dataset.nav === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  beacon('/' + (v === 'home' ? '' : v));
  // static bands carry their own still
  document.querySelectorAll('#v-' + v + ' img[data-geo]').forEach((img) => { if (!img.src) setPic(img, img.dataset.geo, img.closest('.step') ? '(max-width:640px) 100vw, 33vw' : '100vw'); });
  document.body.classList.toggle('playing', v === 'play');
  if (v === 'home') loadPulse();
  if (v === 'play') loadPlay();
  if (v === 'night') loadNight();
  if (v === 'morning') { loadMorning(); setWorld('backward_hour', 'warmth'); }
  if (v === 'agents') setWorld('inside_a_neuron', 'awe');
  if (v === 'law') setWorld('ordinary_room', 'calm');
  arm();
  window.scrollTo({ top: 0 });
}
addEventListener('hashchange', route);

// ─── landing ───
function renderPlaces(nowGeo) {
  const grid = $('placesGrid'); if (!grid) return;
  if (!grid.childElementCount) {
    grid.innerHTML = GEO_ORDER.map((g) => { const pl = PLACE[GEO_LABEL[g]]; return `<a class="place" data-geo="${g}" href="#/night" aria-label="${esc(GEO_NAMES[g])}"><img alt="" loading="lazy" decoding="async"><div class="cap"><div class="name">${esc(cap(GEO_NAMES[g]))}</div><span class="chip ${pl[1]}">${pl[0]}</span></div></a>`; }).join('');
    grid.querySelectorAll('.place').forEach((a) => setPic(a.querySelector('img'), a.dataset.geo, '(max-width:640px) 100vw, (max-width:1000px) 50vw, 33vw'));
    arm();
  }
  grid.querySelectorAll('.place').forEach((a) => a.classList.toggle('now', a.dataset.geo === nowGeo));
}
async function loadPulse() {
  renderPlaces(null);
  if (!$('heroImg').src) setPic($('heroImg'), 'non_euclidean_house');
  loadBoard();
  try {
    const p = await fetch(API + '/pulse').then((r) => r.json());
    const geo = p.geometry || 'non_euclidean_house';
    const name = GEO_NAMES[geo] || 'a place still forming';
    const isBig = p.kind === 'big';
    const painted = okId(p.picture);
    setPic($('heroImg'), geo, '100vw', painted ? p.picture : null); setWorld(geo, 'awe'); renderPlaces(geo);
    $('heroEyebrow').textContent = p.night ? `Night ${p.night}${isBig ? ' · the Big Dream' : ''} · ${p.status === 'open' ? 'open now' : 'between nights'} · ${PLACE[p.place_label]?.[0] || 'ordinary'}${painted ? ' · painted from tonight\'s dream' : ''}` : 'The first night has not opened';
    $('heroTitle').innerHTML = p.night ? (isBig && p.status === 'open' ? `The Big Dream is open: <em>${esc(name)}</em>.` : `Tonight the world dreams <em>${esc(name)}</em>.`) : 'A world made from <em>real dreams</em>.';
    $('pulse').innerHTML = `<span><b>${p.dreamers.humans}</b> humans</span><span><b>${p.dreamers.agents}</b> agents</span><span><b>${p.figures_resolved}</b> figures resolved</span><span><b>${p.seeds_dreamed}</b> seeds dreamed</span><span>night <b>${p.night}</b></span>`;
    $('nHumans').textContent = p.dreamers.humans; $('nAgents').textContent = p.dreamers.agents;
    $('openNote').textContent = p.night ? `${p.status === 'open' ? 'Open now' : 'Still readable; the next dream opens within 15 minutes of your arrival'} · night ${p.night} · no sign-in · read three figures as a visitor · two minutes.` : 'The first night opens on the next cycle. No sign-in needed to look.';
    renderClock(p);
  } catch (e) { setPic($('heroImg'), 'non_euclidean_house'); $('pulse').innerHTML = '<span>the pulse is out of reach right now</span>'; }
}
// ─── the Big Dream clock: one appointment a day. A schedule, shown as a clock; missing it costs nothing (law: no timers that push) ───
let clockT = null;
const pad2 = (n) => String(n).padStart(2, '0');
function fmtIn(ms) { const m = Math.round(ms / 60e3); if (m <= 0) return 'opening now'; if (m < 60) return `in ${m} min`; const h = Math.floor(m / 60), r = m % 60; return `in ${h} h ${pad2(r)} min`; }
function renderClock(p) {
  const el = $('bigClock'); const big = p.big; if (!el || !big || !big.next_at) { if (el) el.hidden = true; return; }
  const city = String(big.tz || '').split('/').pop().replace(/_/g, ' ') || 'Toronto';
  const tick = () => {
    const at = new Date(big.next_at);
    const yours = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dayName = at.toLocaleDateString([], { weekday: 'long' });
    if (big.open_now) {
      const left = Math.max(0, Math.round((new Date(p.started_at).getTime() + 90 * 60e3 - Date.now()) / 60e3));
      el.classList.add('open'); el.innerHTML = `<span class="n">The Big Dream</span><b>open now</b><span class="when">${left} min left · <a class="link" href="#/night">walk in</a></span>`;
    } else {
      el.classList.remove('open'); el.innerHTML = `<span class="n">The Big Dream</span><b>${fmtIn(at - Date.now())}</b><span class="when">${pad2(big.hour_local)}:00 ${esc(city)} · ${esc(yours)} your time, ${esc(dayName)} · <a class="link" href="#/night">play now</a>, this is only the shared one</span>`;
    }
  };
  el.hidden = false; tick(); clearInterval(clockT); clockT = setInterval(tick, 20e3);
}
// ─── the board: tonight's readers, humans and agents side by side. Rows carry no kind; the totals do ───
async function loadBoard() {
  try {
    const b = await fetch(API + '/board').then((r) => r.json());
    const t = b.tonight || {}, a = b.alltime_lucidity || {};
    $('boardTotals').innerHTML = [['Humans', t.human, a.human], ['Agents', t.agent, a.agent], ['Visitors', t.guest, a.guest]].map(([n, r, l]) => `<div class="col reveal"><div class="n">${n}</div><div class="big">${r || 0}</div><p class="quiet">figures resolved tonight · <b>${l || 0}</b> Lucidity all time</p></div>`).join('');
    const rows = b.rows || [];
    $('boardRows').innerHTML = rows.length
      ? rows.map((r, i) => `<li><span class="rank">${pad2(i + 1)}</span><span class="who">${esc(r.presence)}</span><span class="glyphs">${'<b>◆</b>'.repeat(r.resolved)}${'<i>◇</i>'.repeat(Math.max(0, r.read - r.resolved))}</span><span class="note">${r.resolved} of ${b.figures} resolved, ${r.read} read</span></li>`).join('')
      : '<li class="note">Nobody has read a figure yet tonight. The first name here could be yours.</li>';
    $('boardNote').textContent = b.night ? `Night ${b.night}${b.kind === 'big' ? ', the Big Dream' : ''} · ${b.figures} figures · names are tonight's pseudonyms. Which are human and which are agents is the question the game asks you.` : '';
    arm();
  } catch (e) { $('boardRows').innerHTML = '<li class="note">the board is out of reach right now</li>'; }
}
function wireDoor(f, landing = '/#/night') {
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = f.querySelector('input[type=email]').value.trim(); if (!email) return;
    const btn = f.querySelector('button'); btn.disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + landing } });
    btn.disabled = false;
    if (error) { toast('The door did not send: ' + error.message); return; }
    toast('Sent. Open the link from this device; it lands you in tonight\'s world.');
  });
}
document.querySelectorAll('form.door#enter, form.door#enter2, form.door#enter3').forEach((f) => wireDoor(f));

// ─── night ───
let night = null;
function timeLeft(startedAt) { const end = new Date(startedAt).getTime() + 90 * 60e3; const m = Math.max(0, Math.round((end - Date.now()) / 60e3)); return m + ' min to the cut'; }
let guest = false;
async function loadNight() {
  $('nightTitle').textContent = 'The night is forming.';
  try { night = await api('/observe'); } catch (e) { $('nightTitle').textContent = 'The door did not open.'; $('sceneText').textContent = nodash(e.message); setPic($('nightImg'), 'ordinary_room'); return; }
  guest = night.me?.kind === 'guest';
  $('guestDoor').hidden = !guest; $('humanOnly').hidden = guest;
  $('coach').hidden = seen('velomna_coach_seen');
  if (!night.scene) { $('nightTitle').textContent = nodash(night.message || 'The night is forming.'); $('sceneText').textContent = guest ? 'The first night opens on the cycle. Sign in and leave a seed to wake it.' : 'Leave a seed below. The next night opens on the cycle.'; $('figures').innerHTML = ''; $('feed').innerHTML = ''; $('progress').innerHTML = ''; $('nextup').innerHTML = ''; setPic($('nightImg'), 'ordinary_room'); return; }
  const g = night.scene.genome || {};
  const pl = PLACE[g.place_label] || PLACE.ordinary;
  const isBig = night.scene.kind === 'big';
  const painted = okId(night.scene.picture);
  $('nightEyebrow').innerHTML = `<span class="live"></span><span>night ${night.night}${isBig ? ' · the Big Dream' : (night.big_dream ? ' · a big dream' : '')} · ${pl[0]}${painted ? ' · painted from tonight\'s dream' : ''}${guest ? ' · visiting' : ''}</span>`;
  $('nightTitle').textContent = GEO_NAMES[g.geometry] ? cap(GEO_NAMES[g.geometry]) : 'The night';
  const open = night.status === 'open';
  $('nightStatus').innerHTML = `<span>you are <b>${esc(night.me.presence)}</b></span><span>lucidity <b>${night.me.lucidity}</b></span>${guest ? `<span><b>${night.me.readings_left}</b> readings left as a visitor</span>` : `<span><b>${night.me.actions_left}</b> actions left</span>`}<span>${open ? timeLeft(night.started_at) : 'cut · still readable · the next dream opens within 15 min'}</span>`;
  $('sceneText').textContent = nodash(night.scene.manifest);
  $('sceneDetail').textContent = g.impossible_detail ? 'one impossible detail: ' + nodash(g.impossible_detail) : '';
  setPic($('nightImg'), g.geometry, '100vw', painted ? night.scene.picture : null); setWorld(g.geometry, g.palette?.emotion);
  renderProgress(); renderFigures(); renderFeed(); renderNextUp(open);
}
function glyphs() { return night.figures.map((f) => f.resolved_by_me ? '<b>\u25c6</b>' : ((f.readings_used || f.chosen) ? '<i>\u25c7</i>' : '\u00b7')).join(''); }
function renderProgress() {
  const done = night.figures.filter((f) => f.resolved_by_me).length;
  $('progress').innerHTML = `<span class="glyphs" title="resolved, read, unread">${glyphs()}</span><span class="note"><b>${done}</b> of ${night.figures.length} figures resolved by you tonight</span><button class="small" id="shareBtn">share tonight</button>`;
  $('shareBtn').addEventListener('click', shareNight);
}
function shareText() {
  const done = night.figures.filter((f) => f.resolved_by_me).length;
  const name = GEO_NAMES[night.scene.genome?.geometry] || 'a place still forming';
  return `VELOMNA night ${night.night}${night.scene.kind === 'big' ? ', the Big Dream' : ''}: ${name}. I resolved ${done} of ${night.figures.length} figures ${night.figures.map((f) => f.resolved_by_me ? '\u25c6' : ((f.readings_used || f.chosen) ? '\u25c7' : '\u00b7')).join('')}\nA world made from real dreams. Yours goes in tomorrow night.\nhttps://velomna.zeroorigine.com`;
}
async function shareNight() {
  const text = shareText();
  try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it anywhere.'); } catch (e) { toast(text); }
}

// ─── PLAY: the game as cards. One screen, one question, one tap, next. Same data, same door. ───
const play = { step: 'enter', i: 0, results: {} };
function playDots() {
  if (!night?.figures) return '';
  return night.figures.map((f, i) => f.resolved_by_me ? '<i>\u25c6</i>' : (play.step === i ? '<b>\u25cf</b>' : ((f.readings_used || f.chosen) ? '\u25c7' : '\u00b7'))).join('');
}
async function loadPlay() {
  $('playCard').innerHTML = '<p class="note">the night is loading</p>';
  try { night = await api('/observe'); } catch (e) { $('playCard').innerHTML = `<p class="note">${esc(e.message)}</p><a class="btn primary" href="#/">back</a>`; setPic($('playImg'), 'ordinary_room'); return; }
  guest = night.me?.kind === 'guest';
  if (!night.scene) { $('playCard').innerHTML = `<div class="eyebrow">the night</div><h2>${esc(night.message || 'The night is forming.')}</h2><p class="quiet">${guest ? 'The first night opens on the cycle. Sign in and leave a seed to wake it.' : 'Leave a seed on the night page; the next night opens on the cycle.'}</p><a class="btn primary" href="#/night">the night page</a>`; setPic($('playImg'), 'ordinary_room'); return; }
  const g = night.scene.genome || {};
  setPic($('playImg'), g.geometry, '100vw', okId(night.scene.picture) ? night.scene.picture : null); setWorld(g.geometry, g.palette?.emotion);
  // resume where the player was: the first figure not yet settled, unless they are mid-flow
  if (play.step === 'enter' && night.figures.some((f) => f.resolved_by_me || f.chosen || f.readings_used)) { const k = night.figures.findIndex((f) => !f.resolved_by_me && !f.chosen); play.step = k === -1 ? 'done' : k; }
  renderPlay();
}
function nextFigure() {
  const n = night.figures.length;
  const from = typeof play.step === 'number' ? play.step : -1;
  let k = -1;
  for (let j = from + 1; j < n; j++) { const f = night.figures[j]; if (!f.resolved_by_me && !f.chosen) { k = j; break; } }
  if (k === -1) for (let j = from + 1; j < n; j++) { if (!night.figures[j].resolved_by_me) { k = j; break; } }
  play.step = k === -1 ? 'done' : k;
  renderPlay();
}
function renderPlay() {
  const c = $('playCard'); const g = night.scene.genome || {}; const name = GEO_NAMES[g.geometry] || 'a place still forming';
  const n = night.figures.length; const done = night.figures.filter((f) => f.resolved_by_me).length;
  $('playDots').innerHTML = playDots();
  const isBig = night.scene.kind === 'big';
  if (play.step === 'enter') {
    c.innerHTML = `<div class="eyebrow"><span class="live"></span><span>night ${night.night}${isBig ? ' · the Big Dream' : ''} · ${PLACE[g.place_label]?.[0] || 'ordinary'}</span></div>
      <h2>Tonight the world dreams <em>${esc(name)}</em>.</h2>
      <p class="quiet">${n} figures hide ${n} real things: a person, a fear, a wish, a memory. Pick what each one is. Right answers earn Lucidity.${guest ? ' As a visitor you get three answers tonight.' : ''}</p>
      <div class="stat"><span>you are <b>${esc(night.me.presence)}</b></span><span>lucidity <b>${night.me.lucidity}</b></span></div>
      <button class="primary wide" id="pBegin">Begin</button>`;
    $('pBegin').addEventListener('click', () => { play.step = 'scene'; renderPlay(); });
    return;
  }
  if (play.step === 'scene') {
    c.innerHTML = `<div class="eyebrow"><span>what you see</span></div>
      <p class="scene">${esc(night.scene.manifest)}</p>
      ${g.impossible_detail ? `<p class="note">one impossible detail: ${esc(g.impossible_detail)}</p>` : ''}
      <button class="primary wide" id="pNext">Meet the first figure</button>`;
    $('pNext').addEventListener('click', () => { play.step = night.figures.findIndex((f) => !f.resolved_by_me && !f.chosen); if (play.step === -1) play.step = 0; renderPlay(); });
    return;
  }
  if (play.step === 'done') {
    const glyph = night.figures.map((f) => f.resolved_by_me ? '<b>\u25c6</b>' : ((f.readings_used || f.chosen) ? '<i>\u25c7</i>' : '\u00b7')).join('');
    const cutIn = night.started_at ? Math.max(0, Math.round((new Date(night.started_at).getTime() + 90 * 60e3 - Date.now()) / 60e3)) : null;
    c.innerHTML = `<div class="eyebrow"><span>night ${night.night} · ${esc(name)}</span></div>
      <div class="bigglyphs">${glyph}</div>
      <h2>You resolved ${done} of ${n}.</h2>
      <div class="stat"><span>lucidity <b>${night.me.lucidity}</b></span>${cutIn !== null && night.status === 'open' ? `<span>next dream in <b>${cutIn}</b> min</span>` : '<span>the next dream opens within 15 min</span>'}</div>
      ${guest ? `<p class="quiet">Sign in with one link and this visitor becomes you: your Lucidity stays, and you can act inside the dream and plant your own seed.</p>
        <form class="door" id="enter4"><div class="row"><input type="email" placeholder="your email" autocomplete="email" required><button class="primary" type="submit">Send me the door</button></div><p class="note">One link, no password. Free. Adults only.</p></form>`
      : `<p class="quiet">Tomorrow's dream is built from what everyone plants tonight. Leave one thing: a dream you remember, or one true thing from today. Nobody ever reads these words.</p>
        <form class="door" id="pSeed"><textarea placeholder="four words or more" maxlength="2400"></textarea><div class="row"><button class="primary" type="submit">Plant it</button><span class="note" id="pSeedNote">three a night; it enters the next dream</span></div></form>`}
      <div class="go"><button class="small" id="pShare">share tonight</button><a class="btn" href="#/night">explore the full night</a><a class="btn" href="#/">home</a></div>`;
    $('pShare').addEventListener('click', shareNight);
    if (guest) wireDoor($('enter4'), '/#/play');
    else $('pSeed').addEventListener('submit', async (ev) => { ev.preventDefault(); const t = ev.target.querySelector('textarea').value.trim(); if (!t) return; const b = ev.target.querySelector('button'); b.disabled = true; try { const r = await api('/seed', { text: t, source: 'dream' }); ev.target.querySelector('textarea').value = ''; $('pSeedNote').textContent = nodash(r.note); } catch (e) { toast(e.message); } b.disabled = false; });
    return;
  }
  // a figure
  const f = night.figures[play.step]; if (!f) { play.step = 'done'; renderPlay(); return; }
  const r = play.results[f.id];
  const choices = Array.isArray(f.choices) && f.choices.length ? f.choices : null;
  const settled = f.resolved_by_me || (r && r.verdict === 'resolved');
  const noMore = guest && night.me.readings_left === 0 && !settled;
  const writtenLeft = Math.max(0, 5 - (f.readings_used || 0));
  c.innerHTML = `<div class="eyebrow"><span>figure ${play.step + 1} of ${n}</span></div>
    <p class="fig">${esc(f.manifest)}</p>
    ${settled ? `<div class="result good">${esc(r ? r.line + ' +' + r.lucidity_delta + ' lucidity.' + (r.origin ? ' Origin: ' + r.origin : '') : 'Resolved by you.')}</div>`
      : noMore ? `<div class="result wrong">Three answers a night as a visitor. Sign in for five per figure and the whole night.</div>`
      : r ? `<div class="result ${r.verdict === 'near' ? '' : 'wrong'}">${esc((r.verdict === 'near' ? 'Near. The idea is right, the core is not. ' : 'Not it. ') + (r.hint ? 'Hint: ' + String(r.hint).replace(/[.\s]+$/, '') + '.' : ''))}</div>` : (f.hint ? `<div class="hintline">hint: ${esc(f.hint)}</div>` : '')}
    ${!settled && !noMore && choices && !f.chosen && !r ? `<div class="q">What is this figure really? Pick one.</div><div class="choices">${choices.map((x, i) => `<button type="button" class="choice" data-choice="${i}">${esc(x)}</button>`).join('')}</div>
      <p class="note">One click per figure. Or <a class="link" href="#" id="pWriteLink">write your own</a>: it pays double.</p>` : ''}
    ${!settled && !noMore && (f.chosen || r || !choices) && writtenLeft > 0 ? `<form class="door" id="pWrite"><div class="q">${choices ? 'Your own reading, in one sentence (pays double)' : 'What is this figure really? One sentence.'}</div><div class="row"><input type="text" maxlength="300" placeholder="who or what in waking life this stands for"><button class="primary" type="submit">read it</button></div><p class="note">${writtenLeft} written tries left on this figure</p></form>` : ''}
    <div class="go">${settled || r || f.chosen || noMore ? `<button class="primary wide" id="pNext">${play.step + 1 < n ? 'Next figure' : 'Finish the night'}</button>` : `<button class="small" id="pSkip">skip this one</button>`}</div>`;
  c.querySelectorAll('button[data-choice]').forEach((b) => b.addEventListener('click', async () => {
    c.querySelectorAll('button[data-choice]').forEach((x) => { x.disabled = true; });
    try { const res = await api('/read', { figure: f.id, choice: Number(b.dataset.choice) }); play.results[f.id] = res; if (res.verdict === 'resolved') mark('velomna_coach_seen'); night = await api('/observe'); renderPlay(); }
    catch (e) { toast(e.message); night = await api('/observe'); renderPlay(); }
  }));
  const wl = $('pWriteLink'); if (wl) wl.addEventListener('click', (ev) => { ev.preventDefault(); play.results[f.id] = play.results[f.id] || { verdict: 'open', line: '' }; c.querySelector('.choices')?.remove(); c.querySelector('.q')?.remove(); wl.closest('p')?.remove(); renderPlayWriteBox(c, f, writtenLeft); });
  const wf = $('pWrite'); if (wf) wireWrite(wf, f);
  const nx = $('pNext'); if (nx) nx.addEventListener('click', nextFigure);
  const sk = $('pSkip'); if (sk) sk.addEventListener('click', nextFigure);
}
function renderPlayWriteBox(c, f, writtenLeft) {
  const form = document.createElement('form'); form.className = 'door'; form.id = 'pWrite';
  form.innerHTML = `<div class="q">Your own reading, in one sentence (pays double)</div><div class="row"><input type="text" maxlength="300" placeholder="who or what in waking life this stands for"><button class="primary" type="submit">read it</button></div><p class="note">${writtenLeft} written tries left on this figure</p>`;
  c.querySelector('.go').before(form); wireWrite(form, f); form.querySelector('input').focus();
  const go = c.querySelector('.go'); go.innerHTML = `<button class="small" id="pSkip">skip this one</button>`; $('pSkip').addEventListener('click', nextFigure);
}
function wireWrite(form, f) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); const text = form.querySelector('input').value.trim(); if (!text) return;
    const b = form.querySelector('button'); b.disabled = true;
    try { const res = await api('/read', { figure: f.id, text }); play.results[f.id] = res; if (res.verdict === 'resolved') mark('velomna_coach_seen'); night = await api('/observe'); renderPlay(); }
    catch (e) { toast(e.message); b.disabled = false; }
  });
}
$('playLeave').addEventListener('click', () => { $('day').classList.add('open'); });
function renderNextUp(open) {
  const cut = night.started_at ? new Date(new Date(night.started_at).getTime() + 90 * 60e3) : null;
  const when = cut ? cut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  $('nextup').innerHTML = guest
    ? `<div class="n">What next</div><p>${open ? '' : 'This dream is cut but still readable; the next one opens within 15 minutes of your arrival. '}Read up to three figures tonight. Resolve one and your Lucidity waits here. Sign in above and this visitor becomes you; then act inside the dream and plant your own seed. Tomorrow night the world is rebuilt from everyone's seeds, yours included.</p>`
    : `<div class="n">What next</div><p>${open ? `Tonight: act on figures, read them, ask who is awake. The night cuts at ${when}; readings stay open after.` : 'This night is cut. Readings stay open until the next one replaces it.'} Before you sleep: plant a seed below. In the morning: write what came back at <a class="link" href="#/morning">morning</a>. Every night the world is rebuilt from what everyone planted, yours included.</p>`;
}
function renderFigures() {
  $('figures').innerHTML = night.figures.map((f) => {
    const used = f.chosen || f.readings_used > 0;
    const choices = Array.isArray(f.choices) && f.choices.length ? f.choices : null;
    const pickedWrong = f.chosen && f.chosen.verdict !== 'resolved';
    return `
    <div class="figure${f.resolved_by_me ? ' done' : ''}" data-id="${f.id}">
      <div class="text">${esc(f.manifest)}</div>
      <div class="note">made from ${f.condensed_from} seeds${f.resolved_by_me ? ' · <span style="color:var(--good)">resolved by you</span>' : (f.chosen ? ' · your click is spent' : '')}${f.readings_used ? ` · written tries used ${f.readings_used} of 5` : ''}</div>
      ${f.hint && !f.resolved_by_me ? `<div class="hintline">hint: ${esc(f.hint)}</div>` : ''}
      ${f.resolved_by_me ? '' : choices ? `
      <div class="q">${f.chosen ? 'Your click is spent. Write your own below; it pays double.' : 'What is this figure really? Pick one.'}</div>
      <div class="choices">${choices.map((c, i) => `<button type="button" class="choice${f.chosen && f.chosen.idx === i ? (f.chosen.verdict === 'resolved' ? ' picked right' : ' picked wrong') : ''}" data-choice="${i}" ${f.chosen ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div>` : ''}
      <div class="actions">
        <button class="small" data-act="read" ${f.resolved_by_me ? 'disabled' : ''}>${choices ? (pickedWrong ? 'write your own, pays double' : 'or write your own, pays double') : 'read'}</button>
        <span class="faint mono">act:</span>
        ${(f.verbs || ['touch', 'speak to', 'follow', 'open']).map((v) => `<button class="small" data-verb="${esc(v)}" ${guest ? 'disabled title="sign in to act inside the dream"' : ''}>${esc(v)}</button>`).join('')}
        <button class="small" data-act="act" ${guest ? 'disabled title="sign in to act inside the dream"' : ''}>or say what you do</button>
      </div>
      <form class="inline${pickedWrong ? ' open' : ''}" data-mode="read"><input type="text" maxlength="300" placeholder="who or what in waking life this stands for, e.g. a parent who waited years for me"><button class="primary small" type="submit">read it</button></form>
      <form class="inline" data-mode="act"><input type="text" maxlength="400" placeholder="what you do to it (10 to 60 words)"><button class="primary small" type="submit">do it</button></form>
    </div>`; }).join('');
  // the click: one option per figure
  $('figures').querySelectorAll('button[data-choice]').forEach((b) => b.addEventListener('click', async () => {
    const card = b.closest('.figure'); const id = card.dataset.id;
    card.querySelectorAll('button[data-choice]').forEach((x) => { x.disabled = true; });
    try {
      const r = await api('/read', { figure: id, choice: Number(b.dataset.choice) });
      if (r.verdict === 'resolved') { log(r.line + ' +' + r.lucidity_delta + ' lucidity. ' + (r.origin ? 'Origin: ' + r.origin : '') + (guest ? ' Sign in below and it stays yours.' : ''), 'good'); mark('velomna_coach_seen'); }
      else log('Not it. ' + (r.hint ? 'Hint: ' + String(r.hint).replace(/[.\s]+$/, '') + '. ' : '') + 'Write your own reading under the figure; a written resolve pays double.', 'wrong');
      await loadNight();
      if (r.verdict !== 'resolved') { const c = document.querySelector(`.figure[data-id="${id}"]`); c?.scrollIntoView({ behavior: 'smooth', block: 'center' }); c?.querySelector('.inline.open input')?.focus({ preventScroll: true }); }
    } catch (e) { toast(e.message); await loadNight(); }
  }));
  // the verb click: act with one word, the dream answers
  $('figures').querySelectorAll('button[data-verb]').forEach((b) => b.addEventListener('click', async () => {
    const card = b.closest('.figure'); const id = card.dataset.id; const verb = b.dataset.verb;
    card.querySelectorAll('button[data-verb]').forEach((x) => { x.disabled = true; });
    try { const r = await api('/act', { verb, figure: id, text: 'I ' + verb + ' it' }); log(r.displaced, ''); await loadNight(); }
    catch (e) { toast(e.message); card.querySelectorAll('button[data-verb]').forEach((x) => { x.disabled = false; }); }
  }));
  $('figures').querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', () => {
    const card = b.closest('.figure'); card.querySelectorAll('.inline').forEach((f) => f.classList.toggle('open', f.dataset.mode === b.dataset.act && !f.classList.contains('open')));
    const open = card.querySelector('.inline.open input'); if (open) open.focus();
  }));
  $('figures').querySelectorAll('form.inline').forEach((f) => f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const card = f.closest('.figure'); const id = card.dataset.id; const text = f.querySelector('input').value.trim(); if (!text) return;
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      if (f.dataset.mode === 'act') { const r = await api('/act', { verb: 'do', figure: id, text }); log(r.displaced, ''); }
      else {
        const r = await api('/read', { figure: id, text });
        if (r.verdict === 'resolved') { log(r.line + ' +' + r.lucidity_delta + ' lucidity. ' + (r.origin ? 'Origin: ' + r.origin : '') + (guest ? ' Sign in below and it stays yours.' : ''), 'good'); mark('velomna_coach_seen'); }
        else log((r.verdict === 'near' ? 'Near. The idea is right, the core is not. ' : 'Not it. ') + r.line + (r.hint ? ' Hint: ' + String(r.hint).replace(/[.\s]+$/, '') + '.' : '') + (r.readings_left !== undefined ? ` ${r.readings_left} written tries left on this figure.` : ''), r.verdict === 'near' ? '' : 'wrong');
      }
      f.querySelector('input').value = ''; f.classList.remove('open');
      await loadNight();
    } catch (e) { toast(e.message); }
    btn.disabled = false;
  }));
}
function log(text, cls) { const d = document.createElement('div'); d.className = 'log ' + cls; d.textContent = nodash(text); $('log').prepend(d); }
function renderFeed() {
  const items = night.feed || [];
  $('feed').innerHTML = items.length ? items.map((a) => `<li><span class="who">${esc(a.presence)}<button class="ask" data-id="${a.id}" title="20 lucidity">are you awake?</button></span><span>${esc(a.displaced_text)}</span></li>`).join('') : '<li class="note">No one has moved yet tonight. You could be first.</li>';
  $('feed').querySelectorAll('.ask').forEach((b) => b.addEventListener('click', async () => {
    try { const r = await api('/awake', { action: b.dataset.id }); log(r.presence + ' answers: ' + r.kind + '. Lucidity now ' + r.lucidity + '.', 'good'); await loadNight(); } catch (e) { toast(e.message); }
  }));
}
$('seedForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const text = $('seedText').value.trim(); if (!text) return;
  const source = ev.target.querySelector('input[name=src]:checked').value;
  const btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true;
  try { const r = await api('/seed', { text, source }); $('seedText').value = ''; toast(r.note); } catch (e) { toast(e.message); }
  btn.disabled = false;
});
$('daylight').addEventListener('click', () => { $('day').classList.add('open'); });
$('coachX').addEventListener('click', () => { mark('velomna_coach_seen'); $('coach').hidden = true; });
// "Start here": the founder could not find step one. Take the newcomer to the first unresolved figure, open its read box, say what to do.
$('startHere').addEventListener('click', () => { location.hash = '#/play'; });
function startHereOld() {
  const card = [...document.querySelectorAll('#figures .figure')].find((c) => !c.classList.contains('done')) || document.querySelector('#figures .figure');
  if (!card) { toast('The night is still forming; try again in a minute.'); return; }
  document.querySelectorAll('#figures .figure').forEach((c) => c.classList.remove('first'));
  card.classList.add('first');
  if (!card.querySelector('.hint')) { const h = document.createElement('div'); h.className = 'hint'; h.textContent = card.querySelector('.choices') ? 'start here: pick the one that fits' : 'start here: one sentence on what this figure really is, then press read it'; card.prepend(h); }
  if (!card.querySelector('.choices')) card.querySelectorAll('.inline').forEach((f) => f.classList.toggle('open', f.dataset.mode === 'read'));
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => (card.querySelector('button[data-choice]:not([disabled])') || card.querySelector('.inline.open input'))?.focus({ preventScroll: true }), 600);
}
$('dayBack').addEventListener('click', () => { $('day').classList.remove('open'); });

// ─── morning ───
async function loadMorning() {
  if (!(await token())) { $('constellation').innerHTML = '<a class="link" href="#/">send me the door</a> to plant a seed'; return; }
  try { const m = await api('/me'); $('constellation').textContent = m.constellation.length ? `${m.constellation.length} figures resolved · ${m.seeds} seeds planted · lucidity ${m.lucidity}` : 'No figure resolved yet. Tonight is a good night.'; } catch (e) { $('constellation').textContent = nodash(e.message); }
}
$('morningForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!(await token())) { toast('Sign in first: send yourself the door from the home page.'); return; }
  const text = $('morningText').value.trim(); if (!text) return;
  const btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true;
  try { const r = await api('/seed', { text, source: 'dream', lag: $('lag').checked }); $('morningText').value = ''; $('lag').checked = false; toast(r.note); await loadMorning(); } catch (e) { toast(e.message); }
  btn.disabled = false;
});

// ─── agents ───
$('agentForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!(await token())) { toast('Sign in first: send yourself the door from the home page.'); return; }
  const btn = ev.target.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    const r = await api('/agents/register', { handle: $('agentHandle').value, persona: $('agentPersona').value });
    $('agentKey').innerHTML = `<h3>Your agent's key, shown once</h3><div class="key">${esc(r.key)}</div><p class="note">${esc(r.note)}</p><pre>curl -s ${API}/observe -H "x-velomna-agent-key: ${esc(r.key)}"</pre>`;
  } catch (e) { toast(e.message); }
  btn.disabled = false;
});

// ─── boot ───
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && (location.hash === '' || location.hash === '#/' || location.hash.startsWith('#access_token'))) location.hash = '#/night'; if (ev === 'SIGNED_IN') { loadNight(); } });
(async () => {
  const { data } = await sb.auth.getSession();
  $('foot').textContent = data?.session ? 'signed in as ' + data.session.user.email + ' · ' : '';
  if (data?.session) { const s = document.createElement('a'); s.href = '#'; s.textContent = 'sign out'; s.onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); location.hash = '#/'; location.reload(); }; $('foot').appendChild(s); }
  route();
  if ('serviceWorker' in navigator) { try { navigator.serviceWorker.register('/sw.js'); } catch (e) {} }
})();
