import Stripe from 'stripe';

const ALLOWED_ORIGINS = ['https://joinfitr.com', 'https://www.joinfitr.com', 'https://sell.joinfitr.com'];

function securityHeaders(res, origin) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  securityHeaders(res, origin);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  const { uid, email, brandName } = req.body || {};
  if (!uid || !email) return res.status(400).json({ error: 'Missing uid or email.' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  const priceId = process.env.BRAND_PLAN_PRICE_ID;
  if (!priceId) return res.status(500).json({ error: 'Brand plan not configured.' });

  try {
    // Find or create Stripe customer linked to this Firebase user
    const existing = await stripe.customers.list({ email: email.toLowerCase(), limit: 1 });
    let customer = existing.data[0];
    if (!customer) {
      customer = await stripe.customers.create({
        email: email.toLowerCase(),
        name: brandName || '',
        metadata: { firebaseUid: uid },
      });
    } else if (!customer.metadata?.firebaseUid) {
      await stripe.customers.update(customer.id, { metadata: { firebaseUid: uid } });
    }

    const baseUrl = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://www.joinfitr.com';

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `https://sell.joinfitr.com?subscribed=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/brand-auth?canceled=true`,
      metadata: { firebaseUid: uid },
      subscription_data: { metadata: { firebaseUid: uid } },
      allow_promotion_codes: true,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Brand checkout error:', err.message);
    res.status(500).json({ error: 'Could not start subscription. Please try again.' });
  }
}
