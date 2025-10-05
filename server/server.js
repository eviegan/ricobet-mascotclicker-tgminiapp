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

// ---------- Env ----------
const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const SHORT_NAME  = process.env.TELEGRAM_GAME_SHORT_NAME; // e.g. ricobetmascotclicker
// You can point this to either Vercel OR your Render domain (since we serve frontend too)
const FRONTEND    = process.env.FRONTEND_URL || "";       // e.g. https://ricobet-...vercel.app
const origins     = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// ---------- CORS ----------
app.use(
  cors({
    origin: (origin, cb) => {
      // allow same-origin or preflight with no origin
      if (!origin || origins.includes(origin)) return cb(null, true);
      // also allow our own Render host implicitly
      if (process.env.RENDER_EXTERNAL_URL && origin?.startsWith(`https://${process.env.RENDER_EXTERNAL_URL}`))
        return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

// ---------- Body parser for JSON (webhook & APIs) ----------
app.use(express.json());

// ---------- Serve Frontend (from /frontend) ----------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, "../frontend");
app.use(express.static(FRONTEND_DIR));

// Root → serve the game page
app.get("/", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// ---------- Health ----------
app.get("/health", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ---------- Game API ----------
app.use("/api", game);

// ---------- Telegram helpers ----------
async function tg(method, body) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ---------- Telegram webhook ----------
app.post("/tg/webhook", async (req, res) => {
  try {
    const update = req.body;

    // 1) /start or /play → send the Game message
    if (update.message && typeof update.message.text === "string") {
      const text = update.message.text.trim();
      if (/^\/(start|play)/i.test(text)) {
        await tg("sendGame", {
          chat_id: update.message.chat.id,
          game_short_name: SHORT_NAME,
        });
        res.sendStatus(200);
        return;
      }
    }

    // 2) User tapped "Play" on the Game → callback_query with game_short_name
    if (update.callback_query && update.callback_query.game_short_name === SHORT_NAME) {
      const cq = update.callback_query;

      // Build URL parameters so the web app can later call /api/set-score
      const params = new URLSearchParams();
      if (cq.message) {
        params.set("chat_id", cq.message.chat.id);
        params.set("message_id", cq.message.message_id);
      }
      if (cq.inline_message_id) {
        params.set("inline_message_id", cq.inline_message_id);
      }

      // Decide where to open the game:
      // - Prefer FRONTEND env if provided (e.g., Vercel)
      // - Otherwise open the Render-served index.html at our own root
      const base = FRONTEND || `https://${process.env.RENDER_EXTERNAL_URL || "localhost"}`;
      const url = base + (base.includes("?") ? "&" : "?") + params.toString();

      await tg("answerCallbackQuery", {
        callback_query_id: cq.id,
        url,
      });

      res.sendStatus(200);
      return;
    }

    // Ignore other update types
    res.sendStatus(200);
  } catch (e) {
    console.error("Webhook error:", e);
    res.sendStatus(200); // Always 200 to Telegram
  }
});

// ---------- Start ----------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server listening on", PORT);
});
