import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGINS = ['https://sell.joinfitr.com'];

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  // Require a Firebase ID token in the Authorization header
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Unauthorized.' });

  const { uid } = req.body || {};
  if (!uid || typeof uid !== 'string' || uid.length > 128) {
    return res.status(400).json({ error: 'Invalid uid.' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Payment service not configured.' });

  try {
    initAdmin();
    const db = getFirestore();

    // Verify token belongs to this seller
    const decoded = await getAuth().verifyIdToken(idToken);
    if (decoded.uid !== uid) {
      return res.status(403).json({ error: 'Token does not match uid.' });
    }
    const brandRef = db.collection('brands').doc(uid);
    const brandSnap = await brandRef.get();

    if (!brandSnap.exists) {
      return res.status(404).json({ error: 'Brand not found.' });
    }

    const brand = brandSnap.data();
    const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

    // Read Connect account ID from private subcollection (never exposed publicly)
    const privateRef = db.collection('brands').doc(uid).collection('private').doc('stripe');
    const privateSnap = await privateRef.get();
    let connectAccountId = privateSnap.exists ? privateSnap.data().connectAccountId : null;

    // Fallback: migrate from old public field if present
    if (!connectAccountId && brand.stripeConnectAccountId) {
      connectAccountId = brand.stripeConnectAccountId;
      await privateRef.set({ connectAccountId }, { merge: true });
      await brandRef.update({ stripeConnectAccountId: FieldValue.delete() }).catch(() => {});
    }

    // Create a new Stripe Express account if seller doesn't have one
    if (!connectAccountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: brand.email || undefined,
        business_type: 'individual',
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        metadata: { fitrUid: uid, brandName: brand.brandName || '' },
      });
      connectAccountId = account.id;
      await privateRef.set({ connectAccountId }, { merge: true });
    }

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: connectAccountId,
      refresh_url: 'https://sell.joinfitr.com/dashboard?connect=refresh',
      return_url:  'https://sell.joinfitr.com/dashboard?connect=success',
      type: 'account_onboarding',
    });

    res.status(200).json({ url: accountLink.url });
  } catch (err) {
    console.error('stripe-connect-onboard error:', err.message);
    res.status(500).json({ error: 'Could not start Stripe Connect onboarding.' });
  }
}
