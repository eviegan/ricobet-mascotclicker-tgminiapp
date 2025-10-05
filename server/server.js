// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

import { game } from "./routes/game.js";
import { pool } from "./lib/db.js";

dotenv.config();

const app = express();
app.use(express.json());

// ---------- CORS ----------
const origins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Allow Telegram webview (no Origin header) + your configured origins
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // Telegram in-app webview often omits Origin
      if (origins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

// ---------- Static frontend ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
app.use(express.static(FRONTEND_DIR));

// ---------- Health ----------
app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ---------- API (game) ----------
app.use("/api", game);

// ---------- Telegram webhook ----------
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SHORT_NAME = process.env.TELEGRAM_GAME_SHORT_NAME || "ricobetmascotclicker";
const FRONTEND_URL =
  process.env.FRONTEND_URL || // prefer env (e.g., Vercel)
  process.env.RENDER_EXTERNAL_URL || // Render will set this sometimes
  ""; // fallback to same host root

async function tg(method, body) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

// 1) /start or /play -> send Game card
// 2) Play button -> callback_query with game_short_name -> answer with URL
app.post("/tg/webhook", async (req, res) => {
  try {
    const update = req.body;

    // A) Handle chat messages (/start or /play)
    if (update.message && update.message.text && /^\/(start|play)/i.test(update.message.text)) {
      await tg("sendGame", {
        chat_id: update.message.chat.id,
        game_short_name: SHORT_NAME,
      });
      return res.sendStatus(200);
    }

    // B) Handle Play button
    if (update.callback_query && update.callback_query.game_short_name === SHORT_NAME) {
      const cq = update.callback_query;

      // Build URL for the game (prefer FRONTEND_URL; if empty, serve from current backend "/")
      const base = FRONTEND_URL && FRONTEND_URL.trim().length > 0
        ? FRONTEND_URL
        : `${req.protocol}://${req.get("host")}/`;

      // Pass IDs to frontend so it can call /api/set-score later
      const qs = new URLSearchParams();
      if (cq.message) {
        qs.set("chat_id", cq.message.chat.id);
        qs.set("message_id", cq.message.message_id);
      }
      if (cq.inline_message_id) {
        qs.set("inline_message_id", cq.inline_message_id);
      }
      const url = base + (base.includes("?") ? "&" : (base.endsWith("/") ? "" : "/") + "?") + qs.toString();

      await tg("answerCallbackQuery", {
        callback_query_id: cq.id,
        url,
      });
      return res.sendStatus(200);
    }

    // Ignore other updates
    return res.sendStatus(200);
  } catch (e) {
    console.error("Webhook error:", e);
    return res.sendStatus(200); // Always 200 to Telegram
  }
});

// ---------- Fallback to index.html (opens your game in a normal browser too) ----------
app.get("*", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// ---------- Start ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server listening on", PORT));
