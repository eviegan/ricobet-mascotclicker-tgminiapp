// Verifies Telegram WebApp initData (recommended for WebApp auth)
// Docs: https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
import crypto from 'crypto';


export function verifyInitData(initData, botToken){
const urlSearchParams = new URLSearchParams(initData);
const hash = urlSearchParams.get('hash');
urlSearchParams.delete('hash');
const dataCheckArr = [];
urlSearchParams.sort();
urlSearchParams.forEach((v, k)=>{ dataCheckArr.push(`${k}=${v}`); });
const dataCheckString = dataCheckArr.join('\n');
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
const calcHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
return crypto.timingSafeEqual(Buffer.from(calcHash, 'hex'), Buffer.from(hash, 'hex'));
}


export function parseUser(initData){
const p = new URLSearchParams(initData);
const rawUser = p.get('user');
return rawUser ? JSON.parse(rawUser) : null;
}
