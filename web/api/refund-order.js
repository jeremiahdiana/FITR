import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { sendRefundNotification } from './send-order-emails.js';

const ALLOWED_ORIGINS = ['https://joinfitr.com', 'https://www.joinfitr.com', 'https://sell.joinfitr.com', 'http://localhost:3000', 'http://localhost:5000'];

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

function sanitize(str, max) {
  return String(str || '').replace(/[<>"']/g, '').slice(0, max || 200);
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

  // Verify seller Firebase ID token
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Unauthorized' });

  const { brandId, orderId, reason } = req.body || {};
  if (!brandId || !orderId) return res.status(400).json({ error: 'Missing brandId or orderId.' });

  try {
    initAdmin();
    const db     = getFirestore();
    const auth   = getAuth();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    // Verify the token belongs to this brand's seller
    const decoded = await auth.verifyIdToken(idToken);
    if (decoded.uid !== sanitize(brandId, 128)) {
      return res.status(403).json({ error: 'You can only refund your own orders.' });
    }

    // Fetch the order
    const orderRef  = db.collection('brands').doc(sanitize(brandId, 128)).collection('orders').doc(sanitize(orderId, 128));
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) return res.status(404).json({ error: 'Order not found.' });

    const order = orderSnap.data();
    if (order.refundStatus === 'refunded') {
      return res.status(400).json({ error: 'Order already refunded.' });
    }
    if (!order.stripePaymentIntentId) {
      return res.status(400).json({ error: 'No payment intent on this order.' });
    }

    // Retrieve the charge from the payment intent
    const pi = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId, {
      expand: ['latest_charge'],
    });
    const chargeId = pi.latest_charge?.id;
    if (!chargeId) return res.status(400).json({ error: 'No charge found for this payment.' });

    // Issue full refund (seller's portion only — FITR fee not returned by default)
    // For simplicity, refund the full charge amount
    const refundAmountCents = Math.round((order.brandTotal || order.total || 0) * 100);
    const refund = await stripe.refunds.create({
      charge: chargeId,
      amount: refundAmountCents,
      reason: 'requested_by_customer',
      metadata: { brandId, orderId, orderNumber: order.orderNumber || '' },
    });

    const refundAmount = refund.amount / 100;

    // Update brand order
    await orderRef.update({
      refundStatus: 'refunded',
      refundId:     refund.id,
      refundAmount,
      refundedAt:   FieldValue.serverTimestamp(),
      refundReason: sanitize(reason, 200) || null,
      status:       'refunded',
    });

    // Sync to buyer's users/{uid}/orders
    if (order.buyerUid && order.orderNumber) {
      try {
        const userOrdersSnap = await db.collection('users').doc(order.buyerUid)
          .collection('orders')
          .where('orderNumber', '==', order.orderNumber)
          .limit(1)
          .get();
        if (!userOrdersSnap.empty) {
          await userOrdersSnap.docs[0].ref.update({
            status:       'refunded',
            refundAmount,
            refundedAt:   FieldValue.serverTimestamp(),
          });
        }
      } catch(e) { console.error('User order sync failed:', e.message); }
    }

    // In-app notification to buyer
    if (order.buyerUid) {
      db.collection('users').doc(order.buyerUid).collection('notifications').add({
        title:     'Refund processed',
        body:      `$${refundAmount.toFixed(2)} refund for order ${order.orderNumber || orderId} is on its way.`,
        link:      '/orders.html',
        type:      'refund',
        read:      false,
        orderNumber: order.orderNumber || null,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(() => {});
    }

    // Refund email to buyer
    const email = order.email || '';
    if (email) {
      sendRefundNotification({
        key:          process.env.BREVO_API_KEY,
        email,
        customerName: order.customerName || '',
        orderNumber:  order.orderNumber || orderId,
        refundAmount,
      }).catch(e => console.error('Refund email failed:', e.message));
    }

    return res.status(200).json({ ok: true, refundId: refund.id, refundAmount });
  } catch(err) {
    console.error('refund-order error:', err.message);
    return res.status(500).json({ error: err.message || 'Refund failed.' });
  }
}
