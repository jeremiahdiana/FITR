import Stripe from 'stripe';

const ALLOWED_ORIGINS = ['https://joinfitr.com', 'https://www.joinfitr.com'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { session_id } = req.query;
  if (!session_id || typeof session_id !== 'string' || session_id.length > 200) {
    return res.status(400).json({ error: 'Missing or invalid session_id.' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription'],
    });

    const sub = session.subscription;
    if (!sub) return res.status(400).json({ error: 'No subscription found for this session.' });

    res.status(200).json({
      subscriptionStatus: sub.status,
      subscriptionId: sub.id,
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
      currentPeriodEnd: sub.current_period_end,
    });
  } catch (err) {
    console.error('Verify subscription error:', err.message);
    res.status(500).json({ error: 'Could not verify subscription.' });
  }
}
