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

function setCors(res, origin) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isMobile = !origin;
  setCors(res, origin);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!isMobile && !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  // Verify Firebase ID token
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const idToken = authHeader.slice(7);

  initAdmin();
  const db = getFirestore();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  let uid;
  let userEmail;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    uid = decoded.uid;
    userEmail = decoded.email || '';
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  // Get or create Stripe Customer, storing ID in Firestore
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {};

  let customerId = userData.stripeCustomerId || null;

  try {
    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    userEmail,
        metadata: { firebaseUid: uid },
      });
      customerId = customer.id;
      await userRef.set({ stripeCustomerId: customerId }, { merge: true });
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2024-06-20' }
    );

    res.status(200).json({
      customerId,
      ephemeralKeySecret: ephemeralKey.secret,
    });
  } catch (err) {
    console.error('Stripe customer error:', err.message);
    res.status(500).json({ error: 'Could not set up payment customer.' });
  }
}
