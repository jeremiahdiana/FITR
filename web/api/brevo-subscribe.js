const rateLimitMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const ALLOWED_ORIGINS = ['https://joinfitr.com', 'https://www.joinfitr.com'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE_WINDOW_MS; }
  entry.count += 1;
  rateLimitMap.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

export default async function handler(req, res) {
  securityHeaders(res);

  if (req.method !== 'POST') return res.status(405).end();

  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });
  res.setHeader('Access-Control-Allow-Origin', origin);

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests.' });

  const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 254);
  const name = String(req.body?.name || '').trim().slice(0, 100);

  if (!EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'Invalid email address.' });

  // Whitelist allowed list IDs — never accept arbitrary list IDs from client
  const ALLOWED_LIST_IDS = [3, 4];
  const listIds = ALLOWED_LIST_IDS;

  const key = process.env.BREVO_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server configuration error.' });

  try {
    const body = { email, listIds, updateEnabled: true };
    if (name) body.attributes = { FIRSTNAME: name };

    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify(body),
    });

    const ok = response.status === 204 || response.ok;
    res.status(ok ? 200 : 500).json({ ok });
  } catch {
    res.status(500).json({ error: 'An error occurred. Please try again.' });
  }
}
