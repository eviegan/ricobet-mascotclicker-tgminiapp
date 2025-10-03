# RicoBet Mascot Clicker — Advanced


### 1) Backend
- Create PostgreSQL DB and run `schema.sql`.
- Copy `.env.sample` → `.env` and fill values.
- `cd server && npm i && npm run dev`


### 2) Frontend
- Host `/frontend` via GitHub Pages, Vercel or Netlify.
- Edit `frontend/index.html` and set `window.API_BASE` to your backend URL.


### 3) Telegram
- In @BotFather: create a bot, copy token → `.env`.
- `/newgame` → set `TELEGRAM_GAME_SHORT_NAME` and URL of your hosted frontend.
- In WebApp, Telegram passes `initData` automatically. The backend verifies it via HMAC.


### 4) Features
- Server-authoritative energy regen & taps
- Upgrades, daily bonus, simple city building
- Optional score submit to Telegram Game leaderboard via `/api/set-score`


### 5) Production
- Deploy the backend to Render/Fly/Heroku.
- Add your frontend origin to `CORS_ORIGINS`.
