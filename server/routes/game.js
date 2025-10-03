import express from 'express';
if(st.tokens < cost) return res.json({ ok:false, error:'NOT_ENOUGH_TOKENS' });
st.tokens -= cost;
if(kind==='tap') st.tap_power += 1;
if(kind==='cap') st.cap += 50;
if(kind==='regen') st.regen_per_sec = Math.min(10, Number(st.regen_per_sec)+0.5);
if(kind==='shirt') st.shirt_idx = (st.shirt_idx+1)%5;
if(kind==='bg') st.theme = (st.theme==='day'?'night':st.theme==='night'?'auto':'day');
await q('insert into tx_log (player_id, kind, tokens_delta) values ($1,$2,$3)', [player.id, kind, -cost]);
await saveState(player.id, st);
res.json({ ok:true, state:st });
});


// POST daily bonus (once per UTC day)
// body: {}
game.post('/daily', auth, express.json(), async (req,res)=>{
const player = await getOrCreatePlayer(req.tgUser);
let st = await getState(player.id); st = await applyTick(st);
const today = new Date().toISOString().slice(0,10);
const last = st.last_daily_bonus ? new Date(st.last_daily_bonus).toISOString().slice(0,10) : null;
if(last === today) return res.json({ ok:false, error:'ALREADY_CLAIMED' });
const reward = 100; // flat daily for now
st.tokens = Number(st.tokens) + reward;
st.last_daily_bonus = today;
await q('insert into tx_log (player_id, kind, tokens_delta, amount) values ($1,$2,$3,$4)', [player.id,'bonus', reward, reward]);
await saveState(player.id, st);
res.json({ ok:true, reward, state:st });
});


// POST build city
// body: { building: 'house'|'shop'|'tower' }
const buildingCosts = { house: 150, shop: 400, tower: 1200 };


game.post('/build', auth, express.json(), async (req,res)=>{
const b = req.body?.building;
if(!buildingCosts[b]) return res.status(400).json({ ok:false, error:'BAD_BUILDING' });
const player = await getOrCreatePlayer(req.tgUser);
let st = await getState(player.id); st = await applyTick(st);
const cost = buildingCosts[b];
if(st.tokens < cost) return res.json({ ok:false, error:'NOT_ENOUGH_TOKENS' });
st.tokens -= cost;
const city = st.city || { buildings:[], population:0 };
city.buildings.push({ type:b, at: new Date().toISOString() });
city.population = (city.population||0) + (b==='house'?3:b==='shop'?6:12);
st.city = city;
await q('insert into tx_log (player_id, kind, tokens_delta, meta) values ($1,$2,$3,$4)', [player.id, 'build', -cost, {building:b}]);
await saveState(player.id, st);
res.json({ ok:true, state:st });
});


// POST: submit score to Telegram Game (optional leaderboard in Telegram client)
// body: { score: number, chat_id?, message_id?, inline_message_id? }
// Note: You must call setGameScore via bot API.


async function callBot(method, body){
const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
return r.json();
}


game.post('/set-score', auth, express.json(), async (req,res)=>{
const score = Math.max(0, Math.floor(req.body?.score || 0));
const payload = { user_id: req.tgUser.id, score, force: true, disable_edit_message: false };
if(req.body.inline_message_id){ payload.inline_message_id = req.body.inline_message_id; }
else { payload.chat_id = req.body.chat_id; payload.message_id = req.body.message_id; }
try{
const r = await callBot('setGameScore', payload);
res.json(r);
}catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
});


export default game;
