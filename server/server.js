import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { game } from './routes/game.js';
import { pool } from './lib/db.js';


dotenv.config();
const app = express();


const origins = (process.env.CORS_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({ origin: (o, cb)=>{ if(!o || origins.includes(o)) cb(null, true); else cb(null, true); }, credentials:true }));


app.get('/health', async (_req,res)=>{
try{ await pool.query('select 1'); res.json({ ok:true }); }
catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
});


app.use('/api', game);


const PORT = process.env.PORT || 8080;
app.listen(PORT, ()=> console.log('Server listening on', PORT));
