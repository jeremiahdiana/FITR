import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const ALLOWED_ORIGINS = ['https://joinfitr.com', 'https://www.joinfitr.com'];

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

function setCors(res, origin, method) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isMobile = !origin;
  setCors(res, origin, req.method);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'DELETE') return res.status(405).end();
  if (!isMobile && !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  // Verify Firebase ID token
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const idToken = authHeader.slice(7);

  initAdmin();
  const db = getFirestore();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  let uid;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Get Stripe Customer ID from Firestore
  const userSnap = await db.collection('users').doc(uid).get();
  const customerId = userSnap.exists ? userSnap.data().stripeCustomerId : null;

  if (!customerId) {
    // No customer yet means no saved methods
    if (req.method === 'GET') return res.status(200).json({ paymentMethods: [] });
    return res.status(404).json({ error: 'No payment methods found' });
  }

  if (req.method === 'GET') {
    try {
      const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
      const methods = list.data.map(pm => ({
        id:       pm.id,
        brand:    pm.card.brand,
        last4:    pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear:  pm.card.exp_year,
      }));
      return res.status(200).json({ paymentMethods: methods });
    } catch (err) {
      console.error('Stripe list error:', err.message);
      return res.status(500).json({ error: 'Could not load payment methods.' });
    }
  }

  if (req.method === 'DELETE') {
    const pmId = req.body?.pmId || req.query?.pmId;
    if (!pmId || typeof pmId !== 'string') return res.status(400).json({ error: 'Missing pmId' });
    try {
      // Verify the PM belongs to this customer before detaching
      const pm = await stripe.paymentMethods.retrieve(pmId);
      if (pm.customer !== customerId) return res.status(403).json({ error: 'Forbidden' });
      await stripe.paymentMethods.detach(pmId);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Stripe detach error:', err.message);
      return res.status(500).json({ error: 'Could not remove payment method.' });
    }
  }
}
