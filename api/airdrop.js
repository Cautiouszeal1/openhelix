// PHELIX airdrop registration.
// POST /api/airdrop  {telegram, address}            -> register
// GET  /api/airdrop                                   -> {open, count, opens, closes, drop}
// GET  /api/airdrop?export=csv&key=AIRDROP_ADMIN_KEY  -> CSV of all entries (admin only)
//
// Storage: Upstash Redis (Vercel Marketplace). Uses KV_REST_API_URL / KV_REST_API_TOKEN
// or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
// Optional: AIRDROP_CHAT_ID (+ TELEGRAM_BOT_TOKEN) posts each new entry to a Telegram chat.

const OPENS = Date.parse('2026-09-25T00:00:00Z');
const CLOSES = Date.parse('2026-12-15T23:59:59Z');
const DROP = '2026-12-16';

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(cmds) {
  const r = await fetch(URL_.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('storage ' + r.status);
  const out = await r.json();
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

const TG_RE = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const csvCell = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';

async function notify(entry, n) {
  const bot = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.AIRDROP_CHAT_ID;
  if (!bot || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: `New airdrop entry #${n}\n@${entry.telegram}\n${entry.address}` }),
    });
  } catch (_) { /* notification is best effort */ }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  const now = Date.now();
  const open = now >= OPENS && now <= CLOSES;

  if (!URL_ || !TOKEN) {
    return res.status(503).json({ ok: false, error: 'Registration is not available right now. Please try again later.' });
  }

  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.export) {
        if (!process.env.AIRDROP_ADMIN_KEY || q.key !== process.env.AIRDROP_ADMIN_KEY) {
          return res.status(403).json({ ok: false, error: 'Forbidden' });
        }
        const [all] = await redis([['HGETALL', 'airdrop:entries']]);
        const rows = [];
        for (let i = 0; i < (all || []).length; i += 2) rows.push(JSON.parse(all[i + 1]));
        rows.sort((a, b) => a.ts - b.ts);
        const csv = ['#,telegram,evm_address,registered_utc']
          .concat(rows.map((r, i) => [i + 1, '@' + r.telegram, r.address, new Date(r.ts).toISOString()].map(csvCell).join(',')))
          .join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="phelix-airdrop-entries.csv"');
        return res.status(200).send(csv);
      }
      const [count] = await redis([['HLEN', 'airdrop:entries']]);
      return res.status(200).json({ ok: true, open, count, opens: OPENS, closes: CLOSES, drop: DROP });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    if (!open) {
      return res.status(403).json({ ok: false, error: now < OPENS ? 'Registration has not opened yet.' : 'Registration is closed.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (body.website) return res.status(200).json({ ok: true }); // honeypot
    const telegram = String(body.telegram || '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
    const address = String(body.address || '').trim();
    if (!TG_RE.test(telegram)) return res.status(400).json({ ok: false, error: 'Enter a valid Telegram username (5–32 letters, numbers or _).' });
    if (!ADDR_RE.test(address)) return res.status(400).json({ ok: false, error: 'Enter a valid EVM wallet address (0x followed by 40 characters).' });

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const [hits] = await redis([['INCR', 'airdrop:rl:' + ip], ['EXPIRE', 'airdrop:rl:' + ip, 3600]]);
    if (hits > 20) return res.status(429).json({ ok: false, error: 'Too many attempts. Please try again later.' });

    const addrKey = address.toLowerCase();
    const tgKey = telegram.toLowerCase();
    const [tgOwner] = await redis([['HGET', 'airdrop:tg', tgKey]]);
    if (tgOwner && tgOwner !== addrKey) {
      return res.status(409).json({ ok: false, error: 'This Telegram username is already registered with another wallet.' });
    }
    const entry = { telegram, address, ts: now };
    const [added] = await redis([['HSETNX', 'airdrop:entries', addrKey, JSON.stringify(entry)]]);
    if (!added) return res.status(409).json({ ok: false, error: 'This wallet is already registered.' });
    const [, n] = await redis([['HSETNX', 'airdrop:tg', tgKey, addrKey], ['HLEN', 'airdrop:entries']]);
    await notify(entry, n);
    return res.status(200).json({ ok: true, count: n });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}
