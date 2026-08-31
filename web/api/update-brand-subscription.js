import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ALLOWED_ORIGINS = ['https://joinfitr.com', 'https://www.joinfitr.com', 'https://sell.joinfitr.com'];

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

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  const { uid, session_id } = req.body || {};

  if (
    !uid || !session_id ||
    typeof uid !== 'string' || typeof session_id !== 'string' ||
    uid.length > 128 || session_id.length > 300
  ) {
    return res.status(400).json({ error: 'Missing or invalid fields.' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription'],
    });

    // Verify the session was created for this exact Firebase user
    if (session.metadata?.firebaseUid !== uid) {
      return res.status(403).json({ error: 'Session does not belong to this account.' });
    }

    const sub = session.subscription;
    if (!sub || typeof sub === 'string') {
      return res.status(400).json({ error: 'No subscription found for this session.' });
    }

    // Write subscription status server-side — client cannot forge this
    initAdmin();
    const db = getFirestore();
    await db.collection('brands').doc(uid).set({
      subscriptionStatus:  sub.status,
      subscriptionId:      sub.id,
      stripeCustomerId:    typeof session.customer === 'string' ? session.customer : session.customer?.id,
      currentPeriodEnd:    sub.current_period_end,
      updatedAt:           FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(200).json({ ok: true, status: sub.status });
  } catch (err) {
    console.error('update-brand-subscription error:', err.message);
    res.status(500).json({ error: 'Could not verify subscription. Please contact app@joinfitr.com' });
  }
}
