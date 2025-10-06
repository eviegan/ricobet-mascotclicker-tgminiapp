// server/lib/db.js
import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function q(text, params) {
  const res = await pool.query(text, params);
  return res;
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
    cap NUMERIC DEFAULT 100,
    regen_per_sec NUMERIC DEFAULT 1,
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
  `;
  try {
    await pool.query(sql);
    console.log("✅ Tables verified/created successfully.");
  } catch (err) {
    console.error("❌ Table init error:", err);
  }
}

// Run init on startup
initTables();
