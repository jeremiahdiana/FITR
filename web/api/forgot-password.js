import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGINS = [
  'https://joinfitr.com',
  'https://www.joinfitr.com',
  'http://localhost:3000',
  'http://localhost:5000',
];

function initAdmin() {
  if (getApps().length) return;
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

async function sendBrevo(key, payload) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isMobile = !origin;

  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  } else if (!isMobile) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const email = (req.body?.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  // Always return 200 — never reveal if the email exists
  res.status(200).json({ ok: true });

  // Generate reset link + send via Brevo in background (after response sent)
  try {
    initAdmin();
    const link = await getAuth().generatePasswordResetLink(email);

    await sendBrevo(process.env.BREVO_API_KEY, {
      sender:  { name: 'FITR', email: 'no-reply@joinfitr.com' },
      to:      [{ email }],
      subject: 'Reset your FITR password',
      htmlContent: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;">
          <div style="text-align:center;margin-bottom:32px;">
            <span style="font-size:28px;font-weight:900;letter-spacing:4px;color:#00C9A7;">FITR</span>
          </div>
          <h2 style="font-size:22px;font-weight:800;color:#111111;margin:0 0 12px;">Reset your password</h2>
          <p style="color:#555555;font-size:15px;line-height:1.6;margin:0 0 28px;">
            We received a request to reset the password for your FITR account.
            Click the button below to choose a new password.
          </p>
          <div style="text-align:center;margin-bottom:28px;">
            <a href="${link}" style="display:inline-block;background:#00C9A7;color:#080f18;font-weight:800;font-size:15px;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.3px;">
              Reset Password
            </a>
          </div>
          <p style="color:#888888;font-size:13px;line-height:1.6;margin:0 0 8px;">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0;" />
          <p style="color:#aaaaaa;font-size:12px;text-align:center;margin:0;">
            FITR &mdash; <a href="https://joinfitr.com" style="color:#00C9A7;text-decoration:none;">joinfitr.com</a>
          </p>
        </div>
      `,
    });
  } catch (e) {
    // Silent — user already got 200, don't leak errors
    console.error('forgot-password error:', e.message);
  }
}
