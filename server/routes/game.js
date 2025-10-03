// server/routes/game.js
import express from "express";
import { q } from "../lib/db.js";
import { verifyInitData, parseUser } from "../lib/verifyInitData.js";
import fetch from "node-fetch";

export const game = express.Router();

// ---- Config ----
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SHORT_NAME = process.env.TELEGRAM_GAME_SHORT_NAME;

// ---- Auth: verify Telegram WebApp initData ----
function auth(req, res, next) {
  const initData = req.get("x-telegram-init") || req.query.initData || req.body?.initData;
  if (!initData || !verifyInitData(initData, BOT_TOKEN)) {
    return res.status(401).json({ ok: false, error: "INVALID_INITDATA" });
  }
  req.tgUser = parseUser(initData);
  return next();
}

// ---- Helpers ----
async function applyTick(state) {
  const last = new Date(state.last_tick).getTime();
  const now = Date.now();
  const dt = (now - last) / 1000;
  if (dt > 0) {
    state.energy = Math.min(
      state.cap,
      Number(state.energy) + Number(state.regen_per_sec) * dt
    );
    state.last_tick = new Date(now).toISOString();
  }
  return state;
}

async function getOrCreatePlayer(tg) {
  const u = await q("select * from players where tg_user_id=$1", [tg.id]);
  if (u.rowCount) return u.rows[0];

  const ins = await q(
    "insert into players (tg_user_id, username, first_name, last_name, photo_url) values ($1,$2,$3,$4,$5) returning *",
    [tg.id, tg.username, tg.first_name, tg.last_name, tg.photo_url]
  );
  const player = ins.rows[0];
  await q("insert into game_state (player_id) values ($1)", [player.id]);
  return player;
}

async function getState(playerId) {
  const r = await q("select * from game_state where player_id=$1", [playerId]);
  return r.rows[0];
}

async function saveState(playerId, s) {
  const sql = `
    update game_state
       set tokens=$1, level=$2, tap_power=$3, energy=$4, cap=$5,
           regen_per_sec=$6, shirt_idx=$7, theme=$8, city=$9, last_tick=$10, last_daily_bonus=$11
     where player_id=$12
  `;
  await q(sql, [
    s.tokens,
    s.level,
    s.tap_power,
    s.energy,
    s.cap,
    s.regen_per_sec,
    s.shirt_idx,
    s.theme,
    s.city,
    s.last_tick,
    s.last_daily_bonus || null,
    playerId,
  ]);
}

// ---- Routes ----

// GET profile/state
game.get("/state", auth, async (req, res) => {
  const player = await getOrCreatePlayer(req.tgUser);
  let st = await getState(player.id);
  st = await applyTick(st);
  await saveState(player.id, st);
  res.json({ ok: true, player: { id: player.id, tg: req.tgUser }, state: st });
});

// POST tap (spends 1 energy per tap)
game.post("/tap", auth, express.json(), async (req, res) => {
  const n = Math.max(1, Math.min(50, Number(req.body?.taps || 1)));
  const player = await getOrCreatePlayer(req.tgUser);
  let st = await getState(player.id);
  st = await applyTick(st);

  const cost = n;
  if (Number(st.energy) < cost) {
    return res.json({ ok: false, error: "NO_ENERGY", energy: st.energy });
  }

  st.energy = Number(st.energy) - cost;
  st.tokens = Number(st.tokens) + n * Number(st.tap_power);

  const target = st.level * 500;
  if (Number(st.tokens) >= target) st.level += 1;

  await saveState(player.id, st);
  res.json({ ok: true, state: st });
});

// POST buy upgrade
// body: { kind: 'tap'|'cap'|'regen'|'shirt'|'bg' }
const prices = { tap: 50, cap: 80, regen: 120, shirt: 30, bg: 60 };

game.post("/buy", auth, express.json(), async (req, res) => {
  const kind = req.body?.kind;
  if (!prices[kind]) return res.status(400).json({ ok: false, error: "BAD_KIND" });

  const player = await getOrCreatePlayer(req.tgUser);
  let st = await getState(player.id);
  st = await applyTick(st);

  const cost = prices[kind];
  if (Number(st.tokens) < cost) {
    return res.json({ ok: false, error: "NOT_ENOUGH_TOKENS" });
  }

  st.tokens = Number(st.tokens) - cost;

  if (kind === "tap") st.tap_power += 1;
  if (kind === "cap") st.cap += 50;
  if (kind === "regen") st.regen_per_sec = Math.min(10, Number(st.regen_per_sec) + 0.5);
  if (kind === "shirt") st.shirt_idx = (st.shirt_idx + 1) % 5;
  if (kind === "bg")
    st.theme = st.theme === "day" ? "night" : st.theme === "night" ? "auto" : "day";

  await q("insert into tx_log (player_id, kind, tokens_delta) values ($1,$2,$3)", [
    player.id,
    kind,
    -cost,
  ]);
  await saveState(player.id, st);

  res.json({ ok: true, state: st });
});

// POST daily bonus (once per UTC day)
game.post("/daily", auth, express.json(), async (req, res) => {
  const player = await getOrCreatePlayer(req.tgUser);
  let st = await getState(player.id);
  st = await applyTick(st);

  const today = new Date().toISOString().slice(0, 10);
  const last = st.last_daily_bonus
    ? new Date(st.last_daily_bonus).toISOString().slice(0, 10)
    : null;

  if (last === today) return res.json({ ok: false, error: "ALREADY_CLAIMED" });

  const reward = 100;
  st.tokens = Number(st.tokens) + reward;
  st.last_daily_bonus = today;

  await q(
    "insert into tx_log (player_id, kind, tokens_delta, amount) values ($1,$2,$3,$4)",
    [player.id, "bonus", reward, reward]
  );
  await saveState(player.id, st);

  res.json({ ok: true, reward, state: st });
});

// POST build city
// body: { building: 'house'|'shop'|'tower' }
const buildingCosts = { house: 150, shop: 400, tower: 1200 };

game.post("/build", auth, express.json(), async (req, res) => {
  const b = req.body?.building;
  if (!buildingCosts[b]) return res.status(400).json({ ok: false, error: "BAD_BUILDING" });

  const player = await getOrCreatePlayer(req.tgUser);
  let st = await getState(player.id);
  st = await applyTick(st);

  const cost = buildingCosts[b];
  if (Number(st.tokens) < cost) {
    return res.json({ ok: false, error: "NOT_ENOUGH_TOKENS" });
  }

  st.tokens = Number(st.tokens) - cost;
  const city = st.city || { buildings: [], population: 0 };
  city.buildings.push({ type: b, at: new Date().toISOString() });
  city.population = (city.population || 0) + (b === "house" ? 3 : b === "shop" ? 6 : 12);
  st.city = city;

  await q(
    "insert into tx_log (player_id, kind, tokens_delta, meta) values ($1,$2,$3,$4)",
    [player.id, "build", -cost, { building: b }]
  );
  await saveState(player.id, st);

  res.json({ ok: true, state: st });
});

// ---- Telegram score / leaderboard (optional) ----
async function callBot(method, body) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

game.post("/set-score", auth, express.json(), async (req, res) => {
  const score = Math.max(0, Math.floor(req.body?.score || 0));
  const payload = {
    user_id: req.tgUser.id,
    score,
    force: true,
    disable_edit_message: false,
  };

  if (req.body.inline_message_id) {
    payload.inline_message_id = req.body.inline_message_id;
  } else {
    payload.chat_id = req.body.chat_id;
    payload.message_id = req.body.message_id;
  }

  try {
    const r = await callBot("setGameScore", payload);
    res.json(r);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default game;
