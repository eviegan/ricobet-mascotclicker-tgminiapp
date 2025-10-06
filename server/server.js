// server/server.js
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// 1) Ensure DB tables exist on startup (runs initTables in db.js)
import "./lib/db.js";

// 2) API routes
import game from "./routes/game.js";

const app = express();
app.set("trust proxy", 1);

// 3) CORS (comma-separated list in env, e.g. "https://your.vercel.app,https://t.me")
const allowList = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow mobile apps / curl
      if (allowList.length === 0 || allowList.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// 4) JSON parsing
app.use(express.json());

// 5) Health check
app.get("/healthz", (req, res) => res.send("ok"));

// 6) Telegram webhook (ACK only for now)
app.post("/tg/webhook", (req, res) => {
  // You can inspect req.body here if you want to react to updates.
  res.json({ ok: true });
});

// 7) Mount game API
app.use("/api", game);

// 8) Serve frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.join(__dirname, "../frontend");

app.use(express.static(FRONTEND_DIR));
app.get("/", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));

// SPA fallback: any unknown route -> index.html
app.get("*", (req, res) => res.sendFile(path.join(FRONTEND_DIR, "index.html")));

// 9) Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
});
