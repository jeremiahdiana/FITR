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

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Unauthorized.' });

  const { brandId } = req.body || {};
  if (!brandId || typeof brandId !== 'string' || brandId.length > 128) {
    return res.status(400).json({ error: 'Invalid brandId.' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Payment service not configured.' });

  try {
    initAdmin();
    const db   = getFirestore();
    const auth = getAuth();

    // Verify token belongs to this brand's seller
    const decoded = await auth.verifyIdToken(idToken);
    if (decoded.uid !== brandId) {
      return res.status(403).json({ error: 'You can only request payouts for your own brand.' });
    }

    // Get Connect account ID (private subcollection first, fall back to brand doc)
    const privateSnap = await db.collection('brands').doc(brandId).collection('private').doc('stripe').get();
    const brandSnap   = await db.collection('brands').doc(brandId).get();
    const connectId   = (privateSnap.exists && privateSnap.data().connectAccountId)
      ? privateSnap.data().connectAccountId
      : brandSnap.data()?.stripeConnectAccountId;

    if (!connectId) {
      return res.status(400).json({ error: 'No Stripe account connected. Connect Stripe first.' });
    }

    // Find all scheduled orders for this brand
    const scheduledSnap = await db.collection('brands').doc(brandId).collection('orders')
      .where('payoutStatus', '==', 'scheduled')
      .get();

    if (scheduledSnap.empty) {
      return res.status(200).json({ ok: true, totalPaid: 0, ordersProcessed: 0 });
    }

    const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
    let totalPaid = 0;
    let ordersProcessed = 0;

    for (const orderDoc of scheduledSnap.docs) {
      const order = orderDoc.data();
      const sellerCents = Math.round((order.payoutAmount || 0) * 100);
      if (sellerCents <= 0) continue;

      try {
        const transferParams = {
          amount:         sellerCents,
          currency:       'usd',
          destination:    connectId,
          transfer_group: order.orderNumber || orderDoc.id,
          metadata: {
            brandId,
            orderId:     orderDoc.id,
            orderNumber: order.orderNumber || '',
            source:      'manual_payout_request',
          },
        };

        // Try to link to original charge via source_transaction
        if (order.stripePaymentIntentId) {
          try {
            const stripe2 = new Stripe(secretKey, { apiVersion: '2024-06-20' });
            const pi = await stripe2.paymentIntents.retrieve(order.stripePaymentIntentId, {
              expand: ['latest_charge'],
            });
            if (pi.latest_charge?.id) {
              transferParams.source_transaction = pi.latest_charge.id;
            }
          } catch(_) { /* proceed without source_transaction if charge is too old */ }
        }

        const transfer = await stripe.transfers.create(transferParams);

        await orderDoc.ref.update({
          payoutStatus:     'paid',
          stripeTransferId: transfer.id,
          payoutAmount:     order.payoutAmount,
          paidAt:           FieldValue.serverTimestamp(),
        });

        totalPaid += order.payoutAmount || 0;
        ordersProcessed++;
      } catch(err) {
        console.error(`Transfer failed for order ${orderDoc.id}:`, err.message);
        await orderDoc.ref.update({ payoutStatus: 'failed', payoutError: err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      totalPaid:       parseFloat(totalPaid.toFixed(2)),
      ordersProcessed,
    });
  } catch(err) {
    console.error('request-payout error:', err.message);
    return res.status(500).json({ error: 'Could not process payout.' });
  }
}
