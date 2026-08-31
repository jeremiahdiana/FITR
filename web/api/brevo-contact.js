// Rate limiting store (in-memory, resets on cold start)
const rateLimitMap = new Map();
const RATE_LIMIT = 5;        // max requests
const RATE_WINDOW_MS = 60 * 60 * 1000; // per hour
const ALLOWED_ORIGINS = ['https://joinfitr.com', 'https://www.joinfitr.com'];
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function sanitizeText(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen).replace(/[\r\n]{3,}/g, '\n\n');
}

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_WINDOW_MS;
  }
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

  // Method check
  if (req.method !== 'POST') return res.status(405).end();

  // Origin check — only accept requests from joinfitr.com
  const origin = req.headers.origin || '';
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.setHeader('Access-Control-Allow-Origin', origin);

  // Rate limiting by IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  // Input validation + sanitization
  const firstname = sanitizeText(req.body?.firstname, 100);
  const lastname = sanitizeText(req.body?.lastname, 100);
  const email = sanitizeText(req.body?.email, 254).toLowerCase();
  const contactType = sanitizeText(req.body?.contactType, 50);
  const details = sanitizeText(req.body?.details, 2000);

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  if (!firstname || !details) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const key = process.env.BREVO_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server configuration error.' });

  try {
    // Save contact to Brevo list
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: firstname,
          LASTNAME: lastname,
          CONTACT_TYPE: contactType,
        },
        listIds: [4],
        updateEnabled: true,
      }),
    });

    // Send notification email — ALL user-supplied values escaped
    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({
        sender: { name: 'FITR Contact Form', email: 'app@joinfitr.com' },
        to: [{ email: 'app@joinfitr.com', name: 'Jeremiah' }],
        subject: `New contact inquiry — FITR`,
        htmlContent: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
            <h2 style="color:#00C9A7;">New Contact Inquiry</h2>
            <p><b>Name:</b> ${escapeHtml(firstname)} ${escapeHtml(lastname)}</p>
            <p><b>Email:</b> ${escapeHtml(email)}</p>
            <p><b>Type:</b> ${escapeHtml(contactType)}</p>
            <p><b>Message:</b></p>
            <p style="white-space:pre-wrap;">${escapeHtml(details)}</p>
            <hr style="margin-top:24px;border:none;border-top:1px solid #eee;">
            <p style="color:#999;font-size:12px;">Submitted via joinfitr.com/contact</p>
          </div>`,
      }),
    });

    // Auto-reply confirmation to the sender
    fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': key },
      body: JSON.stringify({
        sender: { name: 'FITR', email: 'app@joinfitr.com' },
        to: [{ email, name: firstname }],
        subject: `We got your message — FITR`,
        htmlContent: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
            <div style="background:#111;padding:28px 32px;text-align:center;">
              <span style="color:#00C9A7;font-size:24px;font-weight:900;letter-spacing:-1px;">FITR</span>
            </div>
            <div style="padding:32px;">
              <h2 style="margin:0 0 8px;color:#111;">Thanks for reaching out, ${escapeHtml(firstname)}!</h2>
              <p style="color:#555;line-height:1.6;">We received your message and will get back to you within 1–2 business days.</p>
              <div style="margin-top:20px;padding:16px;background:#f7f8fa;border-radius:8px;">
                <p style="margin:0;color:#888;font-size:13px;font-style:italic;">"${escapeHtml(details.slice(0, 200))}${details.length > 200 ? '…' : ''}"</p>
              </div>
              <p style="margin-top:24px;color:#555;">In the meantime, browse the latest fitness products at <a href="https://joinfitr.com" style="color:#00C9A7;">joinfitr.com</a>.</p>
            </div>
            <div style="padding:16px 32px;background:#f7f8fa;text-align:center;">
              <p style="margin:0;font-size:11px;color:#aaa;">FITR · <a href="mailto:app@joinfitr.com" style="color:#00C9A7;">app@joinfitr.com</a></p>
            </div>
          </div>`,
      }),
    }).catch(() => {}); // non-fatal

    // Don't leak upstream error details
    res.status(emailRes.ok ? 200 : 500).json({ ok: emailRes.ok });
  } catch {
    res.status(500).json({ error: 'An error occurred. Please try again.' });
  }
}
