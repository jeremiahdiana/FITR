import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ALLOWED_ORIGINS = ['https://joinfitr.com', 'https://www.joinfitr.com'];
const PLATFORM_FEE_RATE = 0.12;
const SHIPPING_RATE = 7.99;
const FREE_SHIPPING_THRESHOLD = 250;

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
  // No Origin header = native mobile app (not a browser); allow it.
  const isMobile = !origin;
  securityHeaders(res, origin);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!isMobile && !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Payment service not configured.' });

  const items      = req.body?.items;
  const customerId = typeof req.body?.customerId === 'string' ? req.body.customerId : null;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  // Validate item shape
  for (const item of items) {
    if (
      typeof item.id !== 'string' || item.id.length > 128 ||
      typeof item.brandId !== 'string' || item.brandId.length > 128 ||
      !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99
    ) {
      return res.status(400).json({ error: 'Invalid cart item.' });
    }
  }

  // Look up authoritative prices from Firestore — client cannot set prices
  // Uses a transaction to atomically check and reserve stock, preventing overselling
  initAdmin();
  const db = getFirestore();
  let subtotal = 0;
  const lineItems = [];

  try {
    await db.runTransaction(async (t) => {
      // Phase 1: all reads (transactions require reads before writes)
      const readOps = await Promise.all(items.map(async (item) => {
        const brandRef = item.brandId
          ? db.collection('brands').doc(item.brandId).collection('products').doc(item.id)
          : null;
        const topRef = db.collection('products').doc(item.id);

        let snap = brandRef ? await t.get(brandRef) : null;
        let ref  = brandRef;
        if (!snap || !snap.exists) {
          snap = await t.get(topRef);
          ref  = topRef;
        }
        return { item, snap, ref };
      }));

      // Phase 2: validate all items before writing anything
      subtotal = 0;
      lineItems.length = 0;

      for (const { item, snap, ref } of readOps) {
        if (!snap.exists) {
          const e = new Error(`Product not found: ${item.id}`); e.status = 400; throw e;
        }
        const p = snap.data();
        if (p.status !== 'active') {
          const e = new Error(`Product is no longer available: ${p.name}`); e.status = 400; throw e;
        }
        if (typeof p.price !== 'number' || p.price <= 0 || p.price > 10000) {
          const e = new Error(`Invalid price for product: ${p.name}`); e.status = 400; throw e;
        }
        const available = (p.stock ?? 999) - (p.reservedStock ?? 0);
        if (available < item.qty) {
          const e = new Error(`Insufficient stock for: ${p.name}`); e.status = 400; throw e;
        }

        // Phase 3: queue reservation writes
        t.update(ref, { reservedStock: FieldValue.increment(item.qty) });

        subtotal += p.price * item.qty;
        lineItems.push({
          productId:  item.id,
          brandId:    item.brandId,
          productRef: ref.path,   // stored so webhook/save-order can release reservation
          name:       p.name,
          brand:      p.brandName || '',
          qty:        item.qty,
          price:      p.price,
        });
      }
    });
  } catch(err) {
    if (err.status === 400) return res.status(400).json({ error: err.message });
    console.error('Firestore reservation error:', err.message);
    return res.status(500).json({ error: 'Could not verify product prices. Please try again.' });
  }

  const fee        = parseFloat((subtotal * PLATFORM_FEE_RATE).toFixed(2));
  const shipping   = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_RATE;
  const total      = parseFloat((subtotal + fee + shipping).toFixed(2));
  const totalCents = Math.round(total * 100);

  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
    const piParams = {
      amount:   totalCents,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      metadata: {
        subtotal:     subtotal.toFixed(2),
        platform_fee: fee.toFixed(2),
        shipping:     shipping.toFixed(2),
      },
    };
    if (customerId) {
      piParams.customer            = customerId;
      piParams.setup_future_usage  = 'on_session';
    }
    const paymentIntent = await stripe.paymentIntents.create(piParams);

    // Store pending order so the webhook can process it if the client disconnects
    await db.collection('pending_orders').doc(paymentIntent.id).set({
      items:    lineItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      fee:      parseFloat(fee.toFixed(2)),
      shipping,
      total,
      createdAt: FieldValue.serverTimestamp(),
    });

    res.status(200).json({
      clientSecret:   paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
      subtotal,
      fee,
      shipping,
      total,
    });
  } catch(err) {
    console.error('Stripe error:', err.message);
    // Release stock reservations since payment never started
    await Promise.all(lineItems.map(async (pItem) => {
      if (!pItem.productRef) return;
      try {
        const ref = db.doc(pItem.productRef);
        await db.runTransaction(async (t) => {
          const snap = await t.get(ref);
          if (!snap.exists) return;
          const d = snap.data();
          t.update(ref, { reservedStock: Math.max(0, (d.reservedStock ?? 0) - pItem.qty) });
        });
      } catch(releaseErr) {
        console.error('Reservation release error:', releaseErr.message);
      }
    }));
    res.status(500).json({ error: 'Could not initialize payment. Please try again.' });
  }
}
