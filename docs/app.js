// VELOMNA web portal. Vanilla ES module. The API is the one door; this file only asks and shows.
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
const GEO_NAMES = { ordinary_room: 'an ordinary room', non_euclidean_house: 'a house with more rooms than walls', event_horizon_interior: 'inside the horizon', lensed_sky: 'a lensed sky', wormhole_throat: 'a wormhole throat', branching_street: 'a street that branches into itself', backward_hour: 'an hour running backward', deep_ocean: 'the deep ocean', mars_dusk: 'dusk on Mars', inside_a_neuron: 'inside a neuron' };
const PLACE = { observed_physics: ['Observed physics', ''], hypothesis: ['Hypothesis, consistent', 'hyp'], ordinary: ['Ordinary', 'ord'] };

let toastT; function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('open'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('open'), 4200); }
function beacon(path) { try { fetch(SUPABASE_URL + '/rest/v1/zo_product_metrics', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ product_slug: SLUG, event: 'page_view', path: path.slice(0, 120), is_probe: false, source: 'browser' }), keepalive: true }).catch(() => {}); } catch (e) {} }

async function token() { const { data } = await sb.auth.getSession(); return data?.session?.access_token || null; }
async function api(path, body) {
  const t = await token();
  const r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ error: 'no answer' }));
  if (!r.ok) throw new Error(j.error || ('error ' + r.status));
  return j;
}

// ─── routing ───
const VIEWS = ['home', 'night', 'morning', 'agents', 'law'];
function route() {
  const h = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'home';
  const v = VIEWS.includes(h) ? h : 'home';
  VIEWS.forEach((x) => $('v-' + x).classList.toggle('open', x === v));
  document.querySelectorAll('nav a').forEach((a) => { if (a.dataset.nav === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  beacon('/' + (v === 'home' ? '' : v));
  if (v === 'home') loadPulse();
  if (v === 'night') loadNight();
  if (v === 'morning') loadMorning();
  if (v === 'agents') loadAgents();
  window.scrollTo({ top: 0 });
}
addEventListener('hashchange', route);

// ─── landing ───
async function loadPulse() {
  try {
    const p = await fetch(API + '/pulse').then((r) => r.json());
    const geo = GEO_NAMES[p.geometry] || 'forming';
    $('pulse').innerHTML = `<span>night <b>${p.night}</b></span><span>${esc(geo)}</span><span><b>${p.dreamers.humans}</b> humans, <b>${p.dreamers.agents}</b> agents</span><span><b>${p.figures_resolved}</b> figures resolved</span><span><b>${p.seeds_dreamed}</b> seeds dreamed</span>`;
    if (window.nano?.ok) window.nano.set({ geometry: p.geometry || 'lensed_sky', emotion: 'awe' });
  } catch (e) { $('pulse').innerHTML = '<span>the pulse is out of reach right now</span>'; }
}
$('enter').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('email').value.trim(); if (!email) return;
  const btn = ev.target.querySelector('button'); btn.disabled = true;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + '/#/night' } });
  btn.disabled = false;
  if (error) { toast('The door did not send: ' + error.message); return; }
  toast('Sent. Open the link from this device; it lands you in tonight\'s world.');
});

// ─── night ───
let night = null;
function timeLeft(startedAt) { const end = new Date(startedAt).getTime() + 90 * 60e3; const m = Math.max(0, Math.round((end - Date.now()) / 60e3)); return m + ' min to the cut'; }
async function loadNight() {
  if (!(await token())) { $('nightTitle').textContent = 'Sign in to enter.'; $('nightStatus').innerHTML = '<a class="link" href="#/">send me the door</a>'; $('sceneText').textContent = ''; return; }
  $('nightTitle').textContent = 'The night is forming.';
  try { night = await api('/observe'); } catch (e) { $('nightTitle').textContent = 'The door did not open.'; $('sceneText').textContent = e.message; return; }
  if (!night.scene) { $('nightTitle').textContent = night.message || 'The night is forming.'; $('sceneText').textContent = 'Leave a seed below. The next night opens on the cycle.'; $('figures').innerHTML = ''; $('feed').innerHTML = ''; return; }
  const g = night.scene.genome || {};
  const pl = PLACE[g.place_label] || PLACE.ordinary;
  $('nightEyebrow').textContent = 'night ' + night.night + (night.big_dream ? ' · a big dream' : '');
  $('nightTitle').textContent = GEO_NAMES[g.geometry] ? GEO_NAMES[g.geometry].replace(/^(a|an|the) /, (m) => m[0].toUpperCase() + m.slice(1)) : 'The night';
  $('nightStatus').innerHTML = `<span class="chip ${pl[1]}">${pl[0]}</span><span>you are <b>${esc(night.me.presence)}</b></span><span>lucidity <b>${night.me.lucidity}</b></span><span>${night.me.actions_left} actions left</span><span>${night.status === 'open' ? timeLeft(night.started_at) : 'cut'}</span>`;
  $('sceneText').textContent = nodash(night.scene.manifest);
  $('sceneDetail').textContent = g.impossible_detail ? 'one impossible detail: ' + nodash(g.impossible_detail) : '';
  if (window.nano?.ok) window.nano.set({ geometry: g.geometry, emotion: g.palette?.emotion });
  renderFigures(); renderFeed();
}
function renderFigures() {
  $('figures').innerHTML = night.figures.map((f) => `
    <div class="figure" data-id="${f.id}">
      <div class="text">${esc(f.manifest)}</div>
      <div class="note">made from ${f.condensed_from} seeds · readings used ${f.readings_used} of 5${f.resolved_by_me ? ' · <span style="color:var(--good)">resolved by you</span>' : ''}</div>
      <div class="actions">
        <button class="small" data-act="act">act</button>
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
        if (r.verdict === 'resolved') { log(r.line + ' +' + r.lucidity_delta + ' lucidity. ' + (r.origin ? 'Origin: ' + r.origin : ''), 'good'); }
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
$('dayBack').addEventListener('click', () => { $('day').classList.remove('open'); });

// ─── morning ───
async function loadMorning() {
  if (!(await token())) { $('constellation').innerHTML = '<a class="link" href="#/">send me the door</a> to plant a seed'; return; }
  try { const m = await api('/me'); $('constellation').textContent = m.constellation.length ? `${m.constellation.length} figures resolved · ${m.seeds} seeds planted · lucidity ${m.lucidity}` : 'No figure resolved yet. Tonight is a good night.'; } catch (e) { $('constellation').textContent = e.message; }
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
async function loadAgents() {}
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
