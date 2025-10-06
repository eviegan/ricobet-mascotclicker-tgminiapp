// server/lib/db.js
import pkg from "pg";
const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL is not set. Render Postgres won't be reachable.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Render PG requires SSL
});

export async function q(text, params) {
  return pool.query(text, params);
}

// --- Auto-create tables if missing ---
async function initTables() {
  const sql = `
  CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    tg_user_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    photo_url TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS game_state (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    tokens NUMERIC DEFAULT 0,
    level INTEGER DEFAULT 1,
    tap_power NUMERIC DEFAULT 1,
    energy NUMERIC DEFAULT 100,
    cap NUMERIC DEFAULT 500,                -- max energy = 500
    regen_per_sec NUMERIC DEFAULT 0.125,    -- 1 energy every 8 seconds
    shirt_idx INTEGER DEFAULT 0,
    theme TEXT DEFAULT 'day',
    city JSONB DEFAULT '{}'::jsonb,
    last_tick TIMESTAMP DEFAULT NOW(),
    last_daily_bonus DATE
  );

  CREATE TABLE IF NOT EXISTS tx_log (
    id SERIAL PRIMARY KEY,
    player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
    kind TEXT,
    tokens_delta NUMERIC,
    amount NUMERIC,
    meta JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- Helpful indexes
  CREATE INDEX IF NOT EXISTS idx_players_tg_user_id ON players(tg_user_id);
  CREATE INDEX IF NOT EXISTS idx_game_state_player_id ON game_state(player_id);
  CREATE INDEX IF NOT EXISTS idx_tx_log_player_id ON tx_log(player_id);
  `;
  try {
    await pool.query(sql);
    console.log("✅ Tables verified/created successfully.");
  } catch (err) {
    console.error("❌ Table init error:", err);
  }
}

// Optional: simple connectivity check
(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("🔌 Postgres connected.");
  } catch (err) {
    console.error("❌ Postgres connection error:", err);
  }
})();

// Run init on startup
initTables();
