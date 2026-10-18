// VELOMNA · the one door. Adopted, founder-built, 2026-10-15. v8.1 (earlier dreams stay playable; seeds by tap): the Big Dream at a fixed local hour every day, painted when Cloudinary keys exist; a public board; v6 guests kept.
// Humans (Supabase JWT) and agents (x-velomna-agent-key) get byte-identical responses.
// Nothing below this door ever returns a latent. Costs are ledgered in zo_cost_logs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SRK, { auth: { persistSession: false } });
const SLUG = "velomna";
const ACTIONS_PER_NIGHT = 40;
const READINGS_PER_FIGURE = 5; // written readings per figure; a click is one per figure
const ACT_VERBS = ["touch", "speak to", "follow", "open"]; // the four click-verbs; free text is still allowed
const SEEDS_PER_NIGHT = 3;
const GUEST_READINGS_PER_NIGHT = 3; // a visitor can read three figures a night before the door
const NIGHT_MINUTES = 90;
const IDLE_HOURS = 6;
const COST_IN = 1.0 / 1e6, COST_OUT = 5.0 / 1e6; // haiku-class, USD per token
const BIG_WINDOW_MIN = 20; // the cron ticks every 15 min; the Big Dream opens on the first tick inside [hour:00, hour:20)
const BIG_POOL = 14; // a Big Dream condenses more seeds than a regular night (10)

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, x-velomna-agent-key, x-velomna-guest, x-velomna-cron, apikey",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

// ───────────── config + model ─────────────
const cfgCache: Record<string, { v: string; at: number }> = {};
async function cfg(k: string): Promise<string> {
  const hit = cfgCache[k];
  if (hit && Date.now() - hit.at < 60_000) return hit.v; // a pause or a budget change lands within a minute
  const { data } = await admin.from("zo_config").select("value").eq("key", k).maybeSingle();
  cfgCache[k] = { v: (data?.value as string) ?? "", at: Date.now() };
  return cfgCache[k].v;
}
// THE BRAKES. A pause stops the engine and the paid verbs within a minute; a daily budget caps spend fail-closed.
async function paused(): Promise<boolean> { return ["true", "1", "yes", "on"].includes((await cfg("VELOMNA_PAUSE")).trim().toLowerCase()); }
// ledger: the table the budget reads. The D10 drill passes a table that does not exist so the error branch runs for real.
async function budgetLeft(ledger = "zo_cost_logs"): Promise<{ ok: boolean; spent: number; cap: number; error?: string }> {
  const cap = Number(await cfg("VELOMNA_DAILY_BUDGET_USD")) || 5;
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { data, error } = await admin.from(ledger).select("cost_usd").eq("product_slug", SLUG).gte("timestamp", since);
  if (error) return { ok: false, spent: NaN, cap, error: String(error.message ?? error).slice(0, 120) }; // unreadable ledger = no permission to spend (Rule 14)
  const spent = (data ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  return { ok: spent < cap, spent, cap };
}
// ONE gate in front of every model call. claude() and the D10 drill share it, so the drill proves the path the money takes.
async function spendGate(ledger = "zo_cost_logs"): Promise<{ allowed: boolean; reason: string }> {
  if (await paused()) return { allowed: false, reason: "paused: VELOMNA_PAUSE is on" };
  const b = await budgetLeft(ledger);
  if (!b.ok) return { allowed: false, reason: `budget: $${isNaN(b.spent) ? "?" : b.spent.toFixed(2)} of $${b.cap} spent in 24h; refusing to spend more${b.error ? ` (ledger unreadable: ${b.error})` : ""}` };
  return { allowed: true, reason: `$${b.spent.toFixed(4)} of $${b.cap} spent in 24h` };
}

async function claude(mind: string, system: string, user: string, maxTokens = 700): Promise<string> {
  const gate = await spendGate();
  if (!gate.allowed) throw new Error(gate.reason);
  const key = await cfg("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY missing in zo_config");
  const model = (await cfg("product_runtime_model")) || "claude-haiku-4-5-20251001";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`anthropic ${r.status}: ${JSON.stringify(j.error ?? j).slice(0, 200)}`);
  const inT = j.usage?.input_tokens ?? 0, outT = j.usage?.output_tokens ?? 0;
  await admin.from("zo_cost_logs").insert({
    workflow: "velomna", mind, model, input_tokens: inT, output_tokens: outT, total_tokens: inT + outT,
    cost_usd: inT * COST_IN + outT * COST_OUT, project_id: "zo-velomna", product_slug: SLUG,
    spend_class: "runtime", model_tier: "utility", notes: "velomna-api",
  });
  // the em dash law: the machine never writes one
  return (j.content ?? []).map((c: { text?: string }) => c.text ?? "").join("").replace(/\s*[\u2014\u2013]\s*/g, ", ");
}
function parseJson(s: string): any {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("model returned no JSON");
  return JSON.parse(m[0]);
}

// ───────────── embeddings (on-device gte-small, 384-d, normalised) ─────────────
// deno-lint-ignore no-explicit-any
const ai = new (globalThis as any).Supabase.ai.Session("gte-small");
async function embed(text: string): Promise<number[]> {
  const v = await ai.run(text.slice(0, 2000), { mean_pool: true, normalize: true });
  return Array.from(v as Float32Array);
}
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);

// ───────────── identity ─────────────
type Dreamer = { id: string; kind: string; handle: string | null; persona: string | null; matrix_id: string; user_id: string | null };
async function sha256(s: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function openMatrix() {
  const { data } = await admin.from("velomna_matrices").select("*").eq("open", true).order("created_at").limit(1).maybeSingle();
  if (!data) throw new Error("no open matrix");
  return data;
}
// a guest is keyed by a secret the browser made and holds; the hash lives in agent_key_hash under kind 'guest'
const guestHash = (k: string) => sha256("guest:" + k);
function guestKeyOf(req: Request): string | null { const g = (req.headers.get("x-velomna-guest") ?? "").trim(); return /^[A-Za-z0-9-]{16,64}$/.test(g) ? g : null; }
async function dreamerFromReq(req: Request): Promise<Dreamer | null> {
  const agentKey = req.headers.get("x-velomna-agent-key");
  if (agentKey) {
    const { data } = await admin.from("velomna_dreamers").select("*").eq("agent_key_hash", await sha256(agentKey)).maybeSingle();
    if (data) { await admin.from("velomna_dreamers").update({ last_seen: new Date().toISOString() }).eq("id", data.id); }
    return data as Dreamer | null;
  }
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  const guestKey = guestKeyOf(req);
  if (!jwt) {
    if (!guestKey) return null;
    const h = await guestHash(guestKey);
    const { data: g } = await admin.from("velomna_dreamers").select("*").eq("agent_key_hash", h).eq("kind", "guest").maybeSingle();
    if (g) { await admin.from("velomna_dreamers").update({ last_seen: new Date().toISOString() }).eq("id", g.id); return g as Dreamer; }
    const m = await openMatrix();
    const { data: ng, error } = await admin.from("velomna_dreamers")
      .insert({ kind: "guest", matrix_id: m.id, agent_key_hash: h, last_seen: new Date().toISOString() }).select("*").single();
    if (error) throw error;
    return ng as Dreamer;
  }
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return null;
  const { data: d } = await admin.from("velomna_dreamers").select("*").eq("user_id", u.user.id).maybeSingle();
  if (d) { await admin.from("velomna_dreamers").update({ last_seen: new Date().toISOString() }).eq("id", d.id); return d as Dreamer; }
  const m = await openMatrix();
  // first sign-in: if this browser played as a guest, that guest row BECOMES the human, so its lucidity and readings come along
  if (guestKey) {
    const h = await guestHash(guestKey);
    const { data: g } = await admin.from("velomna_dreamers").select("id").eq("agent_key_hash", h).eq("kind", "guest").maybeSingle();
    if (g) {
      const { data: up, error } = await admin.from("velomna_dreamers").update({ kind: "human", user_id: u.user.id, agent_key_hash: null, last_seen: new Date().toISOString() }).eq("id", g.id).select("*").single();
      if (!error && up) { await admin.from("zo_product_metrics").insert({ product_slug: SLUG, event: "signup", path: "/night", source: "server" }); return up as Dreamer; }
    }
  }
  const { data: nd, error } = await admin.from("velomna_dreamers")
    .insert({ user_id: u.user.id, kind: "human", matrix_id: m.id, last_seen: new Date().toISOString() }).select("*").single();
  if (error) throw error;
  await admin.from("zo_product_metrics").insert({ product_slug: SLUG, event: "signup", path: "/night", source: "server" });
  return nd as Dreamer;
}

// ───────────── presences: a pseudonym per dreamer per night ─────────────
const EPITHETS = ["the one who counts stairs", "the one with wet shoes", "the one holding a key", "the one who hums", "the one with no shadow",
  "the one reading a closed book", "the one who arrived late", "the one carrying water", "the one facing the wall", "the one with a paper crown",
  "the one who cannot find the door", "the one with sand in the pockets", "the one who waits by the lift", "the one who speaks in receipts",
  "the one with the borrowed coat", "the one who knows the exam", "the one with a map of the house", "the one who keeps looking back",
  "the one with the unanswered phone", "the one who fell slowly", "the one with chalk on the hands", "the one from the other platform",
  "the one with the folded letter", "the one who lost a tooth", "the one at the end of the corridor", "the one with the wrong name",
  "the one who brought the sea", "the one who cannot run", "the one who remembers the song", "the one with the second face"];
async function presenceOf(dreamerId: string, night: number) {
  const h = await sha256(`${dreamerId}:${night}`);
  return EPITHETS[parseInt(h.slice(0, 8), 16) % EPITHETS.length];
}

// ───────────── world reads ─────────────
async function currentNight(matrixId: string) {
  const { data } = await admin.from("velomna_nights").select("*").eq("matrix_id", matrixId).order("night", { ascending: false }).limit(1).maybeSingle();
  return data;
}
async function nightByNo(matrixId: string, no: number) {
  const { data } = await admin.from("velomna_nights").select("*").eq("matrix_id", matrixId).eq("night", no).maybeSingle();
  return data;
}
// which night a request means: ?night=N (or body.night) for an earlier dream, else the current one
async function pickNight(matrixId: string, wanted: unknown) {
  const no = Number(wanted);
  if (Number.isInteger(no) && no > 0) return await nightByNo(matrixId, no);
  return await currentNight(matrixId);
}
async function sceneOf(matrixId: string, night: number) {
  const { data } = await admin.from("velomna_scenes").select("*").eq("matrix_id", matrixId).eq("night", night).maybeSingle();
  return data;
}
async function balance(dreamerId: string) {
  const { data } = await admin.from("velomna_balances").select("lucidity").eq("dreamer_id", dreamerId).maybeSingle();
  return data?.lucidity ?? 0;
}
async function actionsTonight(dreamerId: string, sceneId: string) {
  const { count } = await admin.from("velomna_actions").select("id", { count: "exact", head: true }).eq("dreamer_id", dreamerId).eq("scene_id", sceneId);
  return count ?? 0;
}
function publicGenome(g: Record<string, unknown>) {
  const { geometry, place_label, law_bent, palette, impossible_detail } = g as any;
  return { geometry, place_label, law_bent, palette, impossible_detail };
}

// ───────────── the verbs ─────────────
async function observe(d: Dreamer, wanted: unknown = null) {
  const night = await pickNight(d.matrix_id, wanted);
  if (!night) return { night: null, message: "The world has not dreamed yet. Leave a seed; the first night opens on the next cycle." };
  const scene = await sceneOf(d.matrix_id, night.night);
  if (!scene) return { night: night.night, message: "The night is forming." };
  const { data: figures } = await admin.from("velomna_figures").select("id, manifest, condensed_from").eq("scene_id", scene.id).order("created_at");
  const { data: mine } = await admin.from("velomna_readings").select("figure_id, verdict, mode, sentence").eq("dreamer_id", d.id).eq("scene_id", scene.id);
  // the hint: after one miss on a figure, its origin theme ("made from 3 dreams about waiting") is shown. Theme only; the meaning and the seeds stay hidden.
  // the choices: four plain-word readings per figure, made once; the true index never leaves the door.
  let { data: lats } = await admin.from("velomna_latents").select("figure_id, origin_summary, choices").eq("scene_id", scene.id);
  if (!choicesTried.has(scene.id) && (lats ?? []).some((l) => !Array.isArray(l.choices))) { choicesTried.add(scene.id); await ensureChoices(scene.id); lats = (await admin.from("velomna_latents").select("figure_id, origin_summary, choices").eq("scene_id", scene.id)).data; }
  const hintOf: Record<string, string> = {}; const choicesOf: Record<string, string[] | null> = {};
  for (const h of lats ?? []) { hintOf[h.figure_id] = h.origin_summary; choicesOf[h.figure_id] = Array.isArray(h.choices) ? h.choices : null; }
  const { data: feed } = await admin.from("velomna_actions").select("id, presence, verb, displaced_text, created_at")
    .eq("scene_id", scene.id).order("created_at", { ascending: false }).limit(30);
  const used = await actionsTonight(d.id, scene.id);
  return {
    night: night.night, status: night.status, started_at: night.started_at, cut_at: night.cut_at, big_dream: night.big_dream,
    scene: { id: scene.id, manifest: scene.manifest, genome: publicGenome(scene.genome), picture: scene.picture_id ?? null, kind: night.kind ?? "night" },
    figures: (figures ?? []).map((f) => ({
      ...f,
      resolved_by_me: (mine ?? []).some((r) => r.figure_id === f.id && r.verdict === "resolved"),
      readings_used: (mine ?? []).filter((r) => r.figure_id === f.id && r.mode !== "choice").length,
      hint: (mine ?? []).some((r) => r.figure_id === f.id) ? (hintOf[f.id] ?? null) : null,
      choices: choicesOf[f.id] ?? null,
      // the click already spent on this figure, if any: which option and how it went
      chosen: (() => { const c = (mine ?? []).find((r) => r.figure_id === f.id && r.mode === "choice"); if (!c) return null; const idx = (choicesOf[f.id] ?? []).indexOf(c.sentence); return { idx, verdict: c.verdict }; })(),
      verbs: ACT_VERBS,
    })),
    feed: feed ?? [],
    me: { kind: d.kind, presence: await presenceOf(d.id, night.night), lucidity: await balance(d.id), actions_left: d.kind === "guest" ? 0 : Math.max(0, ACTIONS_PER_NIGHT - used),
      readings_left: d.kind === "guest" ? Math.max(0, GUEST_READINGS_PER_NIGHT - (await guestReadingsTonight(d.id, scene.id))) : null },
  };
}
async function guestReadingsTonight(dreamerId: string, sceneId: string) {
  const { count } = await admin.from("velomna_readings").select("id", { count: "exact", head: true }).eq("dreamer_id", dreamerId).eq("scene_id", sceneId);
  return count ?? 0;
}

async function seed(d: Dreamer, text: string, source: string, lag: unknown = null) {
  text = (text ?? "").trim().slice(0, 2400);
  if (text.split(/\s+/).length < 4) return json({ error: "a seed needs at least four words" }, 400);
  const night = await currentNight(d.matrix_id);
  const n = night?.night ?? 0;
  const { count } = await admin.from("velomna_seeds").select("id", { count: "exact", head: true }).eq("dreamer_id", d.id).eq("night", n);
  if ((count ?? 0) >= SEEDS_PER_NIGHT) return json({ error: `three seeds a night is the limit` }, 429);
  const emb = await embed(text);
  const { data, error } = await admin.from("velomna_seeds")
    .insert({ dreamer_id: d.id, matrix_id: d.matrix_id, night: n, source: source === "day" ? "day" : (d.kind === "agent" ? "machine" : "dream"), text, embedding: emb,
      // dream-lag: the dreamer's own answer to "did part of this come from last night's world?" (null = not asked)
      codes: lag === null || lag === undefined ? null : { lag: lag === true } })
    .select("id, created_at").single();
  if (error) throw error;
  // a seed that lands while last night's world is already cut: tell the dreamer when the next night opens
  return json({ seed_id: data.id, received_at: data.created_at, enters_world: "next night", note: "Your seed will be condensed with others before anyone sees it. Nobody will see these words." });
}

async function act(d: Dreamer, verb: string, targetFigure: string | null, text: string) {
  const night = await currentNight(d.matrix_id);
  if (!night || night.status !== "open") return json({ error: "no night is open; the next one opens on the cycle" }, 409);
  const scene = await sceneOf(d.matrix_id, night.night);
  if (!scene) return json({ error: "the night is forming" }, 409);
  if ((await actionsTonight(d.id, scene.id)) >= ACTIONS_PER_NIGHT) return json({ error: "your forty actions are spent for this night" }, 429);
  verb = (verb || "do").slice(0, 24); text = (text ?? "").trim().slice(0, 400);
  if (text.length < 2) return json({ error: "say what you do" }, 400);
  const { data: fig } = targetFigure ? await admin.from("velomna_figures").select("id, manifest").eq("id", targetFigure).eq("scene_id", scene.id).maybeSingle() : { data: null };
  const presence = await presenceOf(d.id, night.night);
  const sys = `You are the displacement step of a dream-work engine. A dreamer intends an action inside a dream scene. Return what ACTUALLY happens as the dream shows it: keep the feeling, move it onto a different object, direction, or person; make it concrete and visual; 25 to 45 words; second person, present tense; never explain, never name the intent, never use the words "you intended" or "instead". Output strict JSON: {"displaced": "..."}`;
  const usr = `SCENE: ${scene.manifest}\n${fig ? `TARGET FIGURE: ${fig.manifest}\n` : ""}DREAMER (${presence}) INTENDS TO ${verb.toUpperCase()}: ${text}`;
  let displaced = "";
  try { displaced = String(parseJson(await claude("censor", sys, usr, 160)).displaced ?? "").trim(); } catch (_) { displaced = ""; }
  if (!displaced) displaced = "The gesture leaves your hand and arrives somewhere else in the room. Something answers, but not the thing you addressed.";
  const { data: a, error } = await admin.from("velomna_actions")
    .insert({ dreamer_id: d.id, scene_id: scene.id, night: night.night, verb, target_figure: fig?.id ?? null, raw_text: text, displaced_text: displaced, presence })
    .select("id, created_at").single();
  if (error) throw error;
  return json({ action_id: a.id, presence, displaced, actions_left: Math.max(0, ACTIONS_PER_NIGHT - (await actionsTonight(d.id, scene.id))) });
}

const WARPS = ["The figure turns the reading over and hands it back folded. The room is a little longer than it was.",
  "Nothing agrees. The light moves one step to the left and waits.", "The word you used appears on a door across the hall, misspelled.",
  "The figure nods as if you were right about something else.", "The floor takes your sentence and stores it under the stairs.",
  "A clock you had not noticed loses a number.", "Your reading echoes back in a voice that is nearly yours.",
  "The figure's face is briefly the wrong face. Then it is the same face.", "The scene thickens; the far wall is now a near wall."];
const WARMS = ["Something in the scene leans toward you. Not yet.", "The figure holds still, which it has not done before.",
  "You are warm. The reading is the right shape and the wrong size.", "A corner of the room comes into focus and stays."];

async function read(d: Dreamer, figureId: string, sentence: string, choice: unknown = null, wanted: unknown = null) {
  const night = await pickNight(d.matrix_id, wanted);
  if (!night) return json({ error: "the world has not dreamed yet" }, 409);
  const scene = await sceneOf(d.matrix_id, night.night);
  if (!scene) return json({ error: "the night is forming" }, 409);
  // a cut night can still be read: the scene stops changing, the figures keep their meaning until the next night replaces them
  if (d.kind === "guest" && (await guestReadingsTonight(d.id, scene.id)) >= GUEST_READINGS_PER_NIGHT) return json({ error: "three readings a night before the door; sign in for five per figure, forty actions and your own seeds" }, 429);
  sentence = (sentence ?? "").trim().slice(0, 300);
  if ((choice === null || choice === undefined) && sentence.split(/\s+/).length < 3) return json({ error: "a reading is one sentence of at least three words" }, 400);
  const { data: fig } = await admin.from("velomna_figures").select("id, manifest, condensed_from").eq("id", figureId).eq("scene_id", scene.id).maybeSingle();
  if (!fig) return json({ error: "no such figure in this night" }, 404);
  const { data: prior } = await admin.from("velomna_readings").select("verdict, mode").eq("dreamer_id", d.id).eq("figure_id", fig.id);
  if ((prior ?? []).some((r) => r.verdict === "resolved")) return json({ error: "you have already resolved this figure" }, 409);
  const { data: lat } = await admin.from("velomna_latents").select("meaning, origin_summary, embedding, choices, answer_idx").eq("figure_id", fig.id).maybeSingle();
  // THE CLICK. One per figure. Right: half pay. Wrong: the hint, and the write box (five written tries, full pay) stays open.
  if (choice !== null && choice !== undefined) {
    const idx = Number(choice);
    if (!Array.isArray(lat?.choices) || !Number.isInteger(idx) || idx < 0 || idx >= lat.choices.length) return json({ error: "no such choice" }, 400);
    if ((prior ?? []).some((r) => r.mode === "choice")) return json({ error: "one click per figure; write your own reading for the other tries" }, 409);
    const verdict = idx === lat.answer_idx ? "resolved" : "wrong";
    await admin.from("velomna_readings").insert({ dreamer_id: d.id, scene_id: scene.id, figure_id: fig.id, sentence: String(lat.choices[idx]), similarity: null, verdict, mode: "choice" });
    if (verdict === "resolved") {
      const delta = 10 + 5 * Math.min(3, fig.condensed_from);
      await admin.from("velomna_lucidity").insert({ dreamer_id: d.id, delta, reason: `resolved figure ${fig.id} by choice`, night: night.night });
      if (d.kind === "human" && d.user_id) {
        const { count } = await admin.from("velomna_resolutions").select("id", { count: "exact", head: true }).eq("user_id", d.user_id);
        await admin.from("velomna_resolutions").insert({ user_id: d.user_id, figure_id: fig.id, night: night.night });
        if ((count ?? 0) === 0) await admin.from("zo_product_metrics").insert({ product_slug: SLUG, event: "activation", path: "/night", source: "server" });
      }
      return json({ verdict, mode: "choice", lucidity_delta: delta, lucidity: await balance(d.id), origin: lat.origin_summary, line: "The figure resolves. For a moment you see what it was made of." });
    }
    return json({ verdict, mode: "choice", lucidity_delta: 0, lucidity: await balance(d.id), line: "Not it. The figure keeps its face.", hint: lat.origin_summary ?? null,
      readings_left: Math.max(0, READINGS_PER_FIGURE - (prior ?? []).filter((r) => r.mode !== "choice").length) });
  }
  if ((prior ?? []).filter((r) => r.mode !== "choice").length >= READINGS_PER_FIGURE) return json({ error: "five written readings per figure is the limit" }, 429);
  if (!lat?.embedding) {
    await admin.from("velomna_readings").insert({ dreamer_id: d.id, scene_id: scene.id, figure_id: fig.id, sentence, similarity: null, verdict: "unknown" });
    return json({ verdict: "unknown", line: "The oracle cannot see this figure tonight. The reading is kept, not judged." });
  }
  const sim = dot(await embed(sentence), lat.embedding as number[]);
  let verdict: "resolved" | "near" | "wrong" = sim >= 0.80 ? "near" : "wrong";
  if (sim >= 0.80) {
    try {
      const j = parseJson(await claude("oracle",
        `You judge whether a dreamer's reading of a dream figure means the same thing as the figure's hidden meaning. Be strict about the core idea, lenient about wording. Output strict JSON: {"same": true|false}`,
        `HIDDEN MEANING: ${lat.meaning}\nDREAMER'S READING: ${sentence}`, 40));
      if (j.same === true) verdict = "resolved";
    } catch (_) { /* judge unavailable: stays near, never a free pass (fail closed) */ }
  }
  await admin.from("velomna_readings").insert({ dreamer_id: d.id, scene_id: scene.id, figure_id: fig.id, sentence, similarity: Math.round(sim * 1000) / 1000, verdict });
  if (verdict === "resolved") {
    const delta = 10 + 10 * Math.min(3, fig.condensed_from);
    await admin.from("velomna_lucidity").insert({ dreamer_id: d.id, delta, reason: `resolved figure ${fig.id}`, night: night.night });
    if (d.kind === "human" && d.user_id) {
      const { count } = await admin.from("velomna_resolutions").select("id", { count: "exact", head: true }).eq("user_id", d.user_id);
      await admin.from("velomna_resolutions").insert({ user_id: d.user_id, figure_id: fig.id, night: night.night });
      if ((count ?? 0) === 0) await admin.from("zo_product_metrics").insert({ product_slug: SLUG, event: "activation", path: "/night", source: "server" });
    }
    return json({ verdict, lucidity_delta: delta, lucidity: await balance(d.id), origin: lat.origin_summary,
      line: "The figure resolves. For a moment you see what it was made of." });
  }
  const pool = verdict === "near" ? WARMS : WARPS;
  return json({ verdict, lucidity_delta: 0, lucidity: await balance(d.id), line: pool[Math.floor(Math.random() * pool.length)], hint: lat.origin_summary ?? null,
    readings_left: Math.max(0, READINGS_PER_FIGURE - (prior ?? []).filter((r) => r.mode !== "choice").length - 1) });
}
// four plain-word readings per figure: one true paraphrase of the meaning, three decoys with a different core. Made once, stored in the latent; the true index never leaves the door.
const choicesTried = new Set<string>(); // one lazy attempt per scene per isolate, so a figure the model cannot phrase does not cost a call on every observe
async function ensureChoices(sceneId: string) {
  const { data: lats } = await admin.from("velomna_latents").select("figure_id, meaning, choices").eq("scene_id", sceneId);
  for (const l of lats ?? []) {
    if (Array.isArray(l.choices) && l.choices.length === 4) continue;
    const { data: fig } = await admin.from("velomna_figures").select("manifest").eq("id", l.figure_id).maybeSingle();
    try {
      const j = parseJson(await claude("censor",
        `A dream figure hides one meaning. Write FOUR short readings a player could pick from, each 6 to 14 plain everyday words, no dream imagery, no names. One must mean the same as the hidden meaning, reworded (never quoted). Three must be plausible for the figure as seen but have a clearly different core: a different person, feeling, wish or memory. Output strict JSON: {"true":"...","decoys":["...","...","..."]}`,
        `FIGURE AS SEEN: ${fig?.manifest ?? ""}\nHIDDEN MEANING: ${l.meaning}`, 260));
      const decoys = (j.decoys ?? []).map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 3);
      const truth = String(j.true ?? "").trim();
      if (!truth || decoys.length < 3) continue;
      const idx = Math.floor(Math.random() * 4);
      const choices = [...decoys]; choices.splice(idx, 0, truth);
      await admin.from("velomna_latents").update({ choices, answer_idx: idx }).eq("figure_id", l.figure_id);
    } catch (_) { /* a figure without choices can still be read by writing */ }
  }
}

async function awake(d: Dreamer, actionId: string) {
  const bal = await balance(d.id);
  if (bal < 20) return json({ error: "asking costs 20 lucidity; you have " + bal }, 402);
  const { data: a } = await admin.from("velomna_actions").select("id, dreamer_id, night, presence").eq("id", actionId).maybeSingle();
  if (!a) return json({ error: "no such presence" }, 404);
  if (a.dreamer_id === d.id) return json({ error: "that one is you" }, 400);
  const { data: other } = await admin.from("velomna_dreamers").select("kind").eq("id", a.dreamer_id).single();
  await admin.from("velomna_lucidity").insert({ dreamer_id: d.id, delta: -20, reason: `asked ${a.presence} if awake`, night: a.night });
  return json({ presence: a.presence, kind: other?.kind, lucidity: bal - 20 });
}

// the shelf: the last nights, with how many figures this dreamer resolved in each, so an earlier dream can be played after tonight's
async function nights(d: Dreamer) {
  const { data: ns } = await admin.from("velomna_nights").select("night, kind, status, started_at").eq("matrix_id", d.matrix_id).order("night", { ascending: false }).limit(12);
  const nos = (ns ?? []).map((x) => x.night);
  const { data: scenes } = nos.length ? await admin.from("velomna_scenes").select("id, night, genome").eq("matrix_id", d.matrix_id).in("night", nos) : { data: [] };
  const sceneIds = (scenes ?? []).map((x) => x.id);
  const { data: figs } = sceneIds.length ? await admin.from("velomna_figures").select("id, scene_id").in("scene_id", sceneIds) : { data: [] };
  const { data: mine } = sceneIds.length ? await admin.from("velomna_readings").select("figure_id, scene_id, verdict, mode").eq("dreamer_id", d.id).in("scene_id", sceneIds) : { data: [] };
  return { nights: (ns ?? []).map((x) => {
    const sc = (scenes ?? []).find((y) => y.night === x.night);
    const fids = (figs ?? []).filter((f) => f.scene_id === sc?.id).map((f) => f.id);
    const myReads = (mine ?? []).filter((r) => r.scene_id === sc?.id);
    const resolved = new Set(myReads.filter((r) => r.verdict === "resolved").map((r) => r.figure_id)).size;
    const touched = new Set(myReads.map((r) => r.figure_id)).size;
    return { night: x.night, kind: x.kind, status: x.status, started_at: x.started_at, geometry: sc?.genome?.geometry ?? null, figures: fids.length, resolved, touched, open_for_me: fids.length - touched };
  }) };
}
async function me(d: Dreamer) {
  const { data: res } = await admin.from("velomna_readings").select("figure_id, verdict, created_at").eq("dreamer_id", d.id).eq("verdict", "resolved").order("created_at");
  const { count: seeds } = await admin.from("velomna_seeds").select("id", { count: "exact", head: true }).eq("dreamer_id", d.id);
  return { dreamer_id: d.id, kind: d.kind, handle: d.handle, lucidity: await balance(d.id), constellation: res ?? [], seeds: seeds ?? 0 };
}


// ───────────── public pulse (no identity): the landing page's live numbers ─────────────
async function pulse() {
  const m = await openMatrix();
  const night = await currentNight(m.id);
  const scene = night ? await sceneOf(m.id, night.night) : null;
  const { count: humans } = await admin.from("velomna_dreamers").select("id", { count: "exact", head: true }).eq("matrix_id", m.id).eq("kind", "human");
  const { count: agents } = await admin.from("velomna_dreamers").select("id", { count: "exact", head: true }).eq("matrix_id", m.id).eq("kind", "agent");
  const resolved = await resolvedByPlayers();
  const { count: seeds } = await admin.from("velomna_seeds").select("id", { count: "exact", head: true }).in("source", ["dream", "day", "machine"]);
  const nb = await nextBigAt();
  return { matrix: m.name, night: night?.night ?? 0, status: night?.status ?? "unborn", started_at: night?.started_at ?? null, kind: night?.kind ?? "night",
    geometry: scene?.genome?.geometry ?? null, place_label: scene?.genome?.place_label ?? null, picture: scene?.picture_id ?? null,
    big: { next_at: nb.at.toISOString(), hour_local: nb.hour, tz: nb.tz, open_now: !!night && night.kind === "big" && night.status === "open" },
    dreamers: { humans: humans ?? 0, agents: agents ?? 0 }, figures_resolved: resolved, seeds_dreamed: seeds ?? 0 };
}
// echoes are seeds, not players: the public numbers count humans, agents and visitors only (a retired drill dreamer is kind 'echo')
async function echoIds(): Promise<string[]> { const { data } = await admin.from("velomna_dreamers").select("id").eq("kind", "echo"); return (data ?? []).map((d) => d.id); }
async function resolvedByPlayers(): Promise<number> {
  const ids = await echoIds();
  let q = admin.from("velomna_readings").select("id", { count: "exact", head: true }).eq("verdict", "resolved");
  if (ids.length) q = q.not("dreamer_id", "in", `(${ids.join(",")})`);
  const { count } = await q; return count ?? 0;
}

// ───────────── the board: who read tonight, humans and agents side by side, no one's kind revealed per row ─────────────
async function board() {
  const m = await openMatrix();
  const night = await currentNight(m.id);
  const scene = night ? await sceneOf(m.id, night.night) : null;
  const { count: figures } = scene ? await admin.from("velomna_figures").select("id", { count: "exact", head: true }).eq("scene_id", scene.id) : { count: 0 };
  const { data: reads } = scene ? await admin.from("velomna_readings").select("dreamer_id, figure_id, verdict").eq("scene_id", scene.id) : { data: [] };
  const ids = Array.from(new Set((reads ?? []).map((r) => r.dreamer_id)));
  const { data: who } = ids.length ? await admin.from("velomna_dreamers").select("id, kind").in("id", ids) : { data: [] };
  const kindOf: Record<string, string> = {}; for (const w of who ?? []) kindOf[w.id] = w.kind;
  const per: Record<string, { resolved: Set<string>; read: Set<string> }> = {};
  for (const r of reads ?? []) { per[r.dreamer_id] ??= { resolved: new Set(), read: new Set() }; per[r.dreamer_id].read.add(r.figure_id); if (r.verdict === "resolved") per[r.dreamer_id].resolved.add(r.figure_id); }
  const totals = { human: 0, agent: 0, guest: 0 } as Record<string, number>;
  const rows = [];
  for (const [id, v] of Object.entries(per)) { const k = kindOf[id] ?? "human"; if (k === "echo") continue; totals[k] = (totals[k] ?? 0) + v.resolved.size; rows.push({ presence: await presenceOf(id, night!.night), resolved: v.resolved.size, read: v.read.size }); }
  rows.sort((a, b) => b.resolved - a.resolved || b.read - a.read);
  // all time: lucidity earned by kind (sum of positive deltas)
  const { data: luc } = await admin.from("velomna_lucidity").select("dreamer_id, delta");
  const lids = Array.from(new Set((luc ?? []).map((l) => l.dreamer_id)));
  const { data: lwho } = lids.length ? await admin.from("velomna_dreamers").select("id, kind").in("id", lids) : { data: [] };
  const lk: Record<string, string> = {}; for (const w of lwho ?? []) lk[w.id] = w.kind;
  const alltime = { human: 0, agent: 0, guest: 0 } as Record<string, number>;
  for (const l of luc ?? []) { if (Number(l.delta) > 0) { const k = lk[l.dreamer_id] ?? "human"; if (k === "echo") continue; alltime[k] = (alltime[k] ?? 0) + Number(l.delta); } }
  return { night: night?.night ?? 0, kind: night?.kind ?? "night", status: night?.status ?? "unborn", figures: figures ?? 0, tonight: totals, rows: rows.slice(0, 12), alltime_lucidity: alltime };
}

// ───────────── bring your own agent: a signed-in human registers up to two agents and gets each key ONCE ─────────────
async function registerAgent(d: Dreamer, handle: string, persona: string) {
  if (d.kind !== "human" || !d.user_id) return json({ error: "only a signed-in human can register an agent" }, 403);
  const { count } = await admin.from("velomna_dreamers").select("id", { count: "exact", head: true }).eq("operator", d.user_id).eq("kind", "agent");
  if ((count ?? 0) >= 2) return json({ error: "two agents per human is the limit in the alpha" }, 429);
  handle = (handle ?? "").trim().slice(0, 40) || "unnamed agent"; persona = (persona ?? "").trim().slice(0, 400) || "a dreamer with no stated character";
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `vlm_${raw}`;
  const { data, error } = await admin.from("velomna_dreamers")
    .insert({ kind: "agent", handle, persona, matrix_id: d.matrix_id, agent_key_hash: await sha256(key), operator: d.user_id }).select("id").single();
  if (error) throw error;
  return json({ agent_id: data.id, handle, key, note: "Shown once. Send it as the x-velomna-agent-key header. Your agent has the same four verbs and the same forty actions a night as you." });
}

// ───────────── the clock: one fixed local hour a day, whatever the timezone does ─────────────
async function bigHour() { const h = Number(await cfg("VELOMNA_BIG_DREAM_HOUR")); return Number.isInteger(h) && h >= 0 && h < 24 ? h : 21; }
async function bigTz() { const t = (await cfg("VELOMNA_BIG_DREAM_TZ")).trim(); try { new Intl.DateTimeFormat("en-CA", { timeZone: t }); return t || "America/Toronto"; } catch (_) { return "America/Toronto"; } }
function localParts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p: Record<string, string> = {}; for (const x of f.formatToParts(d)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, y: Number(p.year), m: Number(p.month), d: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute) };
}
// the UTC instant of <local date> <hour>:00 in tz, found by correcting a UTC guess with the zone's offset at that guess (twice, for DST edges)
function zonedToUtc(y: number, m: number, d: number, hour: number, tz: string): Date {
  const wall = Date.UTC(y, m - 1, d, hour, 0, 0); // the wanted wall-clock time, read as if it were UTC
  let guess = wall;
  for (let i = 0; i < 2; i++) { const lp = localParts(new Date(guess), tz); const asIf = Date.UTC(lp.y, lp.m - 1, lp.d, lp.hour, lp.minute, 0); guess = wall - (asIf - guess); }
  return new Date(guess);
}
async function nextBigAt(now = new Date()): Promise<{ at: Date; hour: number; tz: string }> {
  const hour = await bigHour(), tz = await bigTz();
  const lp = localParts(now, tz);
  let at = zonedToUtc(lp.y, lp.m, lp.d, hour, tz);
  if (at.getTime() <= now.getTime() - BIG_WINDOW_MIN * 60e3) { const t = new Date(now.getTime() + 24 * 3600e3); const lt = localParts(t, tz); at = zonedToUtc(lt.y, lt.m, lt.d, hour, tz); }
  return { at, hour, tz };
}
async function bigDreamDueNow(matrixId: string, now = new Date()): Promise<boolean> {
  const hour = await bigHour(), tz = await bigTz();
  const lp = localParts(now, tz);
  if (lp.hour !== hour || lp.minute >= BIG_WINDOW_MIN) return false;
  const { data: last } = await admin.from("velomna_nights").select("started_at").eq("matrix_id", matrixId).eq("kind", "big").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (last && localParts(new Date(last.started_at), tz).date === lp.date) return false; // today's Big Dream already opened
  return true;
}

// ───────────── the painter: a Big Dream gets a picture of its own (Cloudinary Image Generation API, keys in zo_config) ─────────────
async function painterArmed(): Promise<string> {
  const key = await cfg("CLOUDINARY_API_KEY"), secret = await cfg("CLOUDINARY_API_SECRET"), cloud = await cfg("CLOUDINARY_CLOUD_NAME");
  if (!cloud) return "no CLOUDINARY_CLOUD_NAME in zo_config";
  if (!key || !secret) return "no CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in zo_config";
  return "armed";
}
async function paintNight(nightNo: number, manifest: string, geometry: string): Promise<{ picture_id?: string; error?: string }> {
  const armed = await painterArmed(); if (armed !== "armed") return { error: armed };
  const key = await cfg("CLOUDINARY_API_KEY"), secret = await cfg("CLOUDINARY_API_SECRET"), cloud = await cfg("CLOUDINARY_CLOUD_NAME");
  const prompt = `A dream scene: ${manifest.replace(/\s+/g, " ").slice(0, 700)} Setting: ${geometry.replace(/_/g, " ")}. Cinematic painterly photoreal, volumetric light, no people's faces, no text, no watermark, wide shot.`;
  try {
    const r = await fetch(`https://api.cloudinary.com/v2/generate/${cloud}/text_to_image`, {
      method: "POST", headers: { authorization: "Basic " + btoa(`${key}:${secret}`), "content-type": "application/json" },
      body: JSON.stringify({ prompt, format: "jpeg", image_size: { aspect_ratio: "16:9", resolution: "2K" }, model: { mode: "auto", preference: "economy" }, target: { target_type: "managed_asset", public_id: `velomna/night/${nightNo}` } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: `cloudinary ${r.status}: ${JSON.stringify(j).slice(0, 160)}` };
    const pid = j?.data?.assets?.[0]?.storage?.public_id; if (!pid) return { error: "cloudinary answered without a public_id" };
    return { picture_id: String(pid) };
  } catch (e) { return { error: "cloudinary unreachable: " + String(e).slice(0, 120) }; }
}

// ───────────── the night (dream-work) ─────────────
const GEOMETRIES = ["ordinary_room", "non_euclidean_house", "event_horizon_interior", "lensed_sky", "wormhole_throat", "branching_street", "backward_hour", "deep_ocean", "mars_dusk", "inside_a_neuron"];
async function idle(matrixId: string) {
  const since = new Date(Date.now() - IDLE_HOURS * 3600e3).toISOString();
  const { count: s } = await admin.from("velomna_seeds").select("id", { count: "exact", head: true }).eq("matrix_id", matrixId).in("source", ["dream", "day"]).gte("created_at", since);
  if ((s ?? 0) > 0) return false;
  const { data: humans } = await admin.from("velomna_dreamers").select("id").eq("matrix_id", matrixId).in("kind", ["human", "guest"]).gte("last_seen", since);
  return (humans ?? []).length === 0;
}
async function machineDream(agent: Dreamer, lastNight: number | null) {
  if (lastNight === null) return;
  const { data: acts } = await admin.from("velomna_actions").select("raw_text, displaced_text").eq("dreamer_id", agent.id).eq("night", lastNight).limit(40);
  if (!acts?.length) return;
  const words = acts.flatMap((a) => `${a.raw_text ?? ""} ${a.displaced_text}`.split(/\s+/)).filter((w) => Math.random() < 0.2);
  if (words.length < 6) return;
  const text = await claude("dreamer", `You are a machine that dreams. You receive 20% of the words from your day, the rest dropped out. Tell them as a short dream, 50 to 70 words, first person, past tense, concrete images, no explanation. Output the dream only.`, words.join(" "), 160);
  await admin.from("velomna_seeds").insert({ dreamer_id: agent.id, matrix_id: agent.matrix_id, night: lastNight, source: "machine", text: text.trim().slice(0, 1200), embedding: await embed(text) });
}
async function runNight(force = false) {
  if (await paused()) return { skipped: "paused: VELOMNA_PAUSE is on" };
  const b = await budgetLeft();
  if (!b.ok) return { skipped: `budget: $${isNaN(b.spent) ? "?" : b.spent.toFixed(2)} of $${b.cap} spent in 24h; the night waits` };
  const m = await openMatrix();
  const cur = await currentNight(m.id);
  // the Big Dream opens at its hour whether or not anyone is here: it is the one appointment the world keeps
  const big = await bigDreamDueNow(m.id);
  if (big) force = true;
  if (!force && cur && (await idle(m.id))) return { skipped: "idle: no human dreamed or acted in the last 6 hours; the world sleeps" };
  if (cur && cur.status === "open") {
    const age = (Date.now() - new Date(cur.started_at).getTime()) / 60e3;
    if (!force && age < NIGHT_MINUTES - 5) return { skipped: `night ${cur.night} is only ${Math.round(age)} minutes old` };
    await admin.from("velomna_nights").update({ status: "cut", cut_at: new Date().toISOString() }).eq("id", cur.id);
  }
  const nextNo = (cur?.night ?? 0) + 1;
  // agents dream about last night before it is condensed
  const { data: agents } = await admin.from("velomna_dreamers").select("*").eq("matrix_id", m.id).eq("kind", "agent");
  for (const ag of agents ?? []) { try { await machineDream(ag as Dreamer, cur?.night ?? null); } catch (_) { /* a silent agent is not a failed night */ } }
  // seeds: fresh human + machine seeds first, then echoes to reach at least eight
  const { data: fresh } = await admin.from("velomna_seeds").select("id, text, source, dreamer_id").eq("matrix_id", m.id).is("used_in_night", null)
    .in("source", ["dream", "day", "machine"]).order("created_at", { ascending: false }).limit(30);
  const { data: echoes } = await admin.from("velomna_seeds").select("id, text, source, dreamer_id").eq("matrix_id", m.id).eq("source", "echo").limit(60);
  const shuffled = (echoes ?? []).sort(() => Math.random() - 0.5);
  const want = big ? BIG_POOL : 10;
  const pool = [...(fresh ?? []), ...shuffled.slice(0, Math.max(0, want - (fresh?.length ?? 0)))];
  if (pool.length < 3) return { skipped: "fewer than three seeds; the world cannot condense" };
  const sys = `You are the Censor of a dream-work engine. You receive SEEDS: fragments of real dreams and days from several dreamers, and machine dreams. Build ONE dream scene by Freud's four steps: CONDENSE several seeds into each figure (never one seed = one figure); DISPLACE the feelings onto other objects; REPRESENT ideas as concrete pictures; REVISE into a coherent scene. Rules: never quote a seed verbatim; never include names, places, dates or anything that could identify a person; every figure must be made from at least 3 seeds when 3 are available; 2 to 4 figures. The scene's geometry is one of: ${GEOMETRIES.join(", ")}. place_label is "observed_physics" for event_horizon_interior, lensed_sky, deep_ocean, mars_dusk, inside_a_neuron; "hypothesis" for wormhole_throat, branching_street, backward_hour; "ordinary" otherwise. Choose geometry from the seeds' feeling, not at random; ordinary scenes are common. Output strict JSON only:
{"scene":{"geometry":"...","place_label":"...","law_bent":{"law":"...","degree":0.0},"palette":{"emotion":"...","light":"..."},"impossible_detail":"...","manifest":"120-180 words, second person, present tense, what the dreamer sees on arrival; no names"},
 "figures":[{"manifest":"1-2 sentences, the figure as seen","seed_ids":["..."],"meaning":"one plain sentence: what this figure really is","origin_summary":"made from N dreams about <theme>, no names"}],
 "emotion_index":0.0}`;
  const usr = pool.map((s) => `[${s.id}] (${s.source}) ${s.text.replace(/\s+/g, " ").slice(0, 500)}`).join("\n");
  const out = parseJson(await claude("censor", sys, usr, 1600));
  const g = out.scene ?? {};
  if (!GEOMETRIES.includes(g.geometry)) g.geometry = "ordinary_room";
  const { data: scene, error } = await admin.from("velomna_scenes").insert({ matrix_id: m.id, night: nextNo, genome: g, manifest: String(g.manifest ?? "").slice(0, 2000) }).select("id").single();
  if (error) throw error;
  const validIds = new Set(pool.map((s) => s.id));
  for (const f of (out.figures ?? []).slice(0, 4)) {
    const ids = (f.seed_ids ?? []).filter((x: string) => validIds.has(x));
    const { data: fig } = await admin.from("velomna_figures").insert({ scene_id: scene.id, manifest: String(f.manifest ?? "").slice(0, 600), condensed_from: ids.length }).select("id").single();
    if (!fig) continue;
    const meaning = String(f.meaning ?? "").slice(0, 400);
    await admin.from("velomna_latents").insert({ figure_id: fig.id, scene_id: scene.id, meaning, origin_summary: String(f.origin_summary ?? "").slice(0, 300), seed_ids: ids, embedding: await embed(meaning) });
  }
  await ensureChoices(scene.id);
  const usedIds = (fresh ?? []).map((s) => s.id);
  if (usedIds.length) await admin.from("velomna_seeds").update({ used_in_night: nextNo }).in("id", usedIds);
  const ei = Number(out.emotion_index ?? 0);
  await admin.from("velomna_nights").insert({ matrix_id: m.id, night: nextNo, kind: big ? "big" : "night", emotion_index: isFinite(ei) ? ei : null, big_dream: big || Math.abs(ei) >= 0.85 });
  // the Big Dream is painted from its own manifest; a regular night wears the per-place still. Failure is loud in the result, never fatal.
  let painted: { picture_id?: string; error?: string } = {};
  if (big) {
    painted = await paintNight(nextNo, String(g.manifest ?? ""), String(g.geometry));
    if (painted.picture_id) await admin.from("velomna_scenes").update({ picture_id: painted.picture_id }).eq("id", scene.id);
  }
  return { night: nextNo, kind: big ? "big" : "night", geometry: g.geometry, figures: (out.figures ?? []).length, seeds_used: usedIds.length, echoes_used: pool.length - usedIds.length, picture: painted.picture_id ?? null, picture_error: painted.error ?? null };
}

// ───────────── agents play through the same door ─────────────
async function agentsTick(force = false) {
  if (await paused()) return { skipped: "paused: VELOMNA_PAUSE is on" };
  if (!(await budgetLeft()).ok) return { skipped: "budget: daily cap reached; agents rest" };
  const m = await openMatrix();
  const night = await currentNight(m.id);
  if (!night || night.status !== "open") return { skipped: "no open night" };
  if (!force && (await idle(m.id))) return { skipped: "idle: agents rest while no human dreams" };
  const { data: agents } = await admin.from("velomna_dreamers").select("*").eq("matrix_id", m.id).eq("kind", "agent");
  if (!agents?.length) return { skipped: "no agents in this matrix" };
  const world = await observe(agents[0] as Dreamer);
  if (!(world as any).scene) return { skipped: "the night is forming" };
  const results: Record<string, string> = {};
  for (const ag of (agents ?? []) as Dreamer[]) {
    try {
      if ((await actionsTonight(ag.id, (world as any).scene.id)) >= 8) { results[ag.handle ?? ag.id] = "rested"; continue; }
      const { data: mem } = await admin.from("velomna_readings").select("figure_id, verdict").eq("dreamer_id", ag.id).eq("scene_id", (world as any).scene.id);
      const figs = (world as any).figures.map((f: any) => `[${f.id}] ${f.manifest} (${(mem ?? []).filter((r) => r.figure_id === f.id).map((r) => r.verdict).join(",") || "unread"})`).join("\n");
      const feed = (world as any).feed.slice(0, 8).map((a: any) => `${a.presence}: ${a.displaced_text}`).join("\n");
      const j = parseJson(await claude("dreamer",
        `You are a dreamer inside a shared dream. Persona: ${ag.persona}. You may ACT (do something to a figure, in 10-30 words) or READ (one sentence guessing what a figure really is; readings earn lucidity when right). Read when you think you understand a figure; act to learn more. Never mention being an AI. Output strict JSON: {"do":"act"|"read","figure":"<figure id or null>","text":"..."}`,
        `SCENE: ${(world as any).scene.manifest}\nFIGURES:\n${figs}\nRECENT:\n${feed || "(quiet)"}`, 160));
      const figId = (world as any).figures.some((f: any) => f.id === j.figure) ? j.figure : null;
      if (j.do === "read" && figId) { const r = await read(ag, figId, String(j.text ?? "")); results[ag.handle ?? ag.id] = "read:" + (await r.json()).verdict; }
      else { const r = await act(ag, "do", figId, String(j.text ?? "")); results[ag.handle ?? ag.id] = "act:" + r.status; }
    } catch (e) { results[ag.handle ?? ag.id] = "error:" + String(e).slice(0, 80); }
  }
  return { night: night.night, results };
}

// ───────────── router ─────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/velomna-api/, "").replace(/\/$/, "") || "/";
  try {
    if (path === "/health") { const b = await budgetLeft(); const nb = await nextBigAt(); return json({ ok: true, product: SLUG, at: new Date().toISOString(), paused: await paused(), spent_24h_usd: isNaN(b.spent) ? null : Math.round(b.spent * 1000) / 1000, daily_cap_usd: b.cap, big_dream: { next_at: nb.at.toISOString(), hour_local: nb.hour, tz: nb.tz, painter: await painterArmed() } }); }
    if (path === "/pulse") return json(await pulse());
    if (path === "/board") return json(await board());
    if (path.startsWith("/night/") || path === "/agents/tick") { // "/night/run" is cron-only; "/nights" (the shelf) is a player route
      const secret = await cfg("VELOMNA_CRON_SECRET");
      if (!secret || req.headers.get("x-velomna-cron") !== secret) return json({ error: "refused" }, 401);
      if (path === "/night/run") return json(await runNight(url.searchParams.get("force") === "1"));
      if (path === "/agents/tick") return json(await agentsTick(url.searchParams.get("force") === "1"));
      return json({ error: "not found" }, 404);
    }
    // D10, the budget-unreadable drill: run the real spend gate against a ledger that does not exist and report its verdict.
    // Cron-secret guarded. Writes nothing. A gate that answers "allowed" here would spend blind during a real ledger outage.
    if (path === "/drill/budget-unreadable") {
      const secret = await cfg("VELOMNA_CRON_SECRET");
      if (!secret || req.headers.get("x-velomna-cron") !== secret) return json({ error: "refused" }, 401);
      const broken = await spendGate("zo_cost_logs_drill_missing");
      const healthy = await spendGate();
      const verdict = broken.allowed === false && /unreadable/.test(broken.reason) ? "ok" : "fail";
      return json({ drill: "D10 budget unreadable", verdict, broken_ledger: broken, real_ledger: healthy, at: new Date().toISOString() });
    }
    const d = await dreamerFromReq(req);
    if (!d) return json({ error: "sign in (magic link), send x-velomna-agent-key, or x-velomna-guest to read as a visitor" }, 401);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (d.kind === "guest" && ["/act", "/seed", "/awake", "/agents/register"].includes(path)) return json({ error: "sign in for that: a visitor can look and read; acting, planting a seed and asking who is awake need the door", guest: true }, 403);
    if (path === "/observe") return json(await observe(d, url.searchParams.get("night")));
    if (path === "/nights") return json(await nights(d));
    if (path === "/me") return json(await me(d));
    if (path === "/seed" && req.method === "POST") return await seed(d, body.text, body.source, "lag" in body ? body.lag : null);
    if ((path === "/act" || path === "/read") && (await paused())) return json({ error: "the world is paused by its keeper; seeds are still kept" }, 503);
    if (path === "/act" && req.method === "POST") return await act(d, body.verb, body.figure ?? null, body.text);
    if (path === "/read" && req.method === "POST") return await read(d, body.figure, body.text, "choice" in body ? body.choice : null, body.night ?? null);
    if (path === "/awake" && req.method === "POST") return await awake(d, body.action);
    if (path === "/agents/register" && req.method === "POST") return await registerAgent(d, body.handle, body.persona);
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
