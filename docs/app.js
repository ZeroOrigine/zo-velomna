// VELOMNA web portal v3: a visitor can read tonight's dream before the door. Vanilla ES module. The API is the one door; this file only asks and shows.
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
const srcset = (geo) => [800, 1200, 1600, 2048].map((w) => `${pic(geo, w)} ${w}w`).join(', ');
function setPic(img, geo, sizes = '100vw') {
  if (!img) return;
  img.classList.remove('in');
  img.sizes = sizes; img.srcset = srcset(geo); img.src = pic(geo, 1600);
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
const VIEWS = ['home', 'night', 'morning', 'agents', 'law'];
function route() {
  const h = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'home';
  const v = VIEWS.includes(h) ? h : 'home';
  VIEWS.forEach((x) => $('v-' + x).classList.toggle('open', x === v));
  document.querySelectorAll('nav a').forEach((a) => { if (a.dataset.nav === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  beacon('/' + (v === 'home' ? '' : v));
  // static bands carry their own still
  document.querySelectorAll('#v-' + v + ' img[data-geo]').forEach((img) => { if (!img.src) setPic(img, img.dataset.geo, img.closest('.step') ? '(max-width:640px) 100vw, 33vw' : '100vw'); });
  if (v === 'home') loadPulse();
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
  try {
    const p = await fetch(API + '/pulse').then((r) => r.json());
    const geo = p.geometry || 'non_euclidean_house';
    const name = GEO_NAMES[geo] || 'a place still forming';
    setPic($('heroImg'), geo); setWorld(geo, 'awe'); renderPlaces(geo);
    $('heroEyebrow').textContent = p.night ? `Night ${p.night} · ${p.status === 'open' ? 'open now' : 'between nights'} · ${PLACE[p.place_label]?.[0] || 'ordinary'}` : 'The first night has not opened';
    $('heroTitle').innerHTML = p.night ? `Tonight the world dreams <em>${esc(name)}</em>.` : 'A world made from <em>real dreams</em>.';
    $('pulse').innerHTML = `<span><b>${p.dreamers.humans}</b> humans</span><span><b>${p.dreamers.agents}</b> agents</span><span><b>${p.figures_resolved}</b> figures resolved</span><span><b>${p.seeds_dreamed}</b> seeds dreamed</span><span>night <b>${p.night}</b></span>`;
    $('nHumans').textContent = p.dreamers.humans; $('nAgents').textContent = p.dreamers.agents;
  } catch (e) { setPic($('heroImg'), 'non_euclidean_house'); $('pulse').innerHTML = '<span>the pulse is out of reach right now</span>'; }
}
document.querySelectorAll('form.door#enter, form.door#enter2, form.door#enter3').forEach((f) => f.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = f.querySelector('input[type=email]').value.trim(); if (!email) return;
  const btn = f.querySelector('button'); btn.disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/#/night' } });
  btn.disabled = false;
  if (error) { toast('The door did not send: ' + error.message); return; }
  toast('Sent. Open the link from this device; it lands you in tonight\'s world.');
}));

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
  $('nightEyebrow').innerHTML = `<span class="live"></span><span>night ${night.night}${night.big_dream ? ' · a big dream' : ''} · ${pl[0]}${guest ? ' · visiting' : ''}</span>`;
  $('nightTitle').textContent = GEO_NAMES[g.geometry] ? cap(GEO_NAMES[g.geometry]) : 'The night';
  const open = night.status === 'open';
  $('nightStatus').innerHTML = `<span>you are <b>${esc(night.me.presence)}</b></span><span>lucidity <b>${night.me.lucidity}</b></span>${guest ? `<span><b>${night.me.readings_left}</b> readings left as a visitor</span>` : `<span><b>${night.me.actions_left}</b> actions left</span>`}<span>${open ? timeLeft(night.started_at) : 'cut · readings still open'}</span>`;
  $('sceneText').textContent = nodash(night.scene.manifest);
  $('sceneDetail').textContent = g.impossible_detail ? 'one impossible detail: ' + nodash(g.impossible_detail) : '';
  setPic($('nightImg'), g.geometry); setWorld(g.geometry, g.palette?.emotion);
  renderProgress(); renderFigures(); renderFeed(); renderNextUp(open);
}
function glyphs() { return night.figures.map((f) => f.resolved_by_me ? '<b>\u25c6</b>' : (f.readings_used ? '<i>\u25c7</i>' : '\u00b7')).join(''); }
function renderProgress() {
  const done = night.figures.filter((f) => f.resolved_by_me).length;
  $('progress').innerHTML = `<span class="glyphs" title="resolved, read, unread">${glyphs()}</span><span class="note"><b>${done}</b> of ${night.figures.length} figures resolved by you tonight</span><button class="small" id="shareBtn">share tonight</button>`;
  $('shareBtn').addEventListener('click', async () => {
    const name = GEO_NAMES[night.scene.genome?.geometry] || 'a place still forming';
    const text = `VELOMNA night ${night.night}: ${name}. I resolved ${done} of ${night.figures.length} figures ${night.figures.map((f) => f.resolved_by_me ? '\u25c6' : (f.readings_used ? '\u25c7' : '\u00b7')).join('')}\nA world made from real dreams. Yours goes in tomorrow night.\nhttps://velomna.zeroorigine.com`;
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('Copied. Paste it anywhere.'); } catch (e) { toast(text); }
  });
}
function renderNextUp(open) {
  const cut = night.started_at ? new Date(new Date(night.started_at).getTime() + 90 * 60e3) : null;
  const when = cut ? cut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  $('nextup').innerHTML = guest
    ? `<div class="n">What next</div><p>Read up to three figures tonight. Resolve one and your Lucidity waits here. Sign in above and this visitor becomes you; then act inside the dream and plant your own seed. Tomorrow night the world is rebuilt from everyone's seeds, yours included.</p>`
    : `<div class="n">What next</div><p>${open ? `Tonight: act on figures, read them, ask who is awake. The night cuts at ${when}; readings stay open after.` : 'This night is cut. Readings stay open until the next one replaces it.'} Before you sleep: plant a seed below. In the morning: write what came back at <a class="link" href="#/morning">morning</a>. Every night the world is rebuilt from what everyone planted, yours included.</p>`;
}
function renderFigures() {
  $('figures').innerHTML = night.figures.map((f) => `
    <div class="figure${f.resolved_by_me ? ' done' : ''}" data-id="${f.id}">
      <div class="text">${esc(f.manifest)}</div>
      <div class="note">made from ${f.condensed_from} seeds · readings used ${f.readings_used} of 5${f.resolved_by_me ? ' · <span style="color:var(--good)">resolved by you</span>' : ''}</div>
      <div class="actions">
        <button class="small" data-act="act" ${guest ? 'disabled title="sign in to act inside the dream"' : ''}>act</button>
        <button class="small" data-act="read" ${f.resolved_by_me ? 'disabled' : ''}>read</button>
      </div>
      <form class="inline" data-mode="act"><input type="text" maxlength="400" placeholder="what you do to it (10 to 60 words)"><button class="primary small" type="submit">do it</button></form>
      <form class="inline" data-mode="read"><input type="text" maxlength="300" placeholder="one sentence: what this figure really is"><button class="primary small" type="submit">read it</button></form>
    </div>`).join('');
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
        else log(r.line, r.verdict === 'near' ? '' : 'wrong');
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
