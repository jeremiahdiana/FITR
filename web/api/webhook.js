import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { sendOrderConfirmation, sendSellerNewOrderAlert, sendRefundNotification } from './send-order-emails.js';

async function sendExpoPush(token, title, body) {
  if (!token || !token.startsWith('ExponentPushToken')) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  }).catch(() => {});
}

// Disable body parsing — Stripe needs the raw body to verify the signature
export const config = { api: { bodyParser: false } };

const SELLER_RATE = 0.88;

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

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sanitize(str, max) {
  return String(str || '').replace(/[<>"']/g, '').slice(0, max || 200);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const secretKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    console.error('Webhook: missing env vars');
    return res.status(500).end();
  }

  const sig     = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch(err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  initAdmin();
  const db = getFirestore();

  // Handle Stripe-initiated refunds (e.g. via dashboard or charge.refunded)
  if (event.type === 'charge.refunded') {
    const charge   = event.data.object;
    const piId     = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    const refundObj = (charge.refunds?.data || [])[0];
    const refundAmount = refundObj ? refundObj.amount / 100 : charge.amount_refunded / 100;
    if (piId) {
      try {
        // Find the order across all brands using stripePaymentIntentId
        const processedSnap = await db.collection('processed_payments').doc(piId).get();
        const orderNumber = processedSnap.exists ? processedSnap.data().orderNumber : null;
        if (orderNumber) {
          // Update all brand orders with this payment intent
          const brandOrdersSnap = await db.collectionGroup('orders')
            .where('stripePaymentIntentId', '==', piId).get().catch(() => null);
          if (brandOrdersSnap && !brandOrdersSnap.empty) {
            const batch = db.batch();
            let buyerUid = null, buyerEmail = null, buyerName = null;
            brandOrdersSnap.docs.forEach(d => {
              batch.update(d.ref, { status: 'refunded', refundAmount, refundedAt: FieldValue.serverTimestamp() });
              if (!buyerUid) buyerUid = d.data().buyerUid;
              if (!buyerEmail) buyerEmail = d.data().email;
              if (!buyerName) buyerName = d.data().customerName;
            });
            await batch.commit();
            // Sync user order
            if (buyerUid) {
              const userOrdersSnap = await db.collection('users').doc(buyerUid)
                .collection('orders').where('orderNumber', '==', orderNumber).limit(1).get();
              if (!userOrdersSnap.empty) {
                await userOrdersSnap.docs[0].ref.update({ status: 'refunded', refundAmount, refundedAt: FieldValue.serverTimestamp() });
              }
              // In-app notification
              db.collection('users').doc(buyerUid).collection('notifications').add({
                title: 'Refund processed', body: `$${refundAmount.toFixed(2)} refund for order ${orderNumber} is on its way.`,
                link: '/orders.html', type: 'refund', read: false, orderNumber, createdAt: FieldValue.serverTimestamp(),
              }).catch(() => {});
              // Push + email
              db.collection('users').doc(buyerUid).get().then(snap => {
                const token = snap.data()?.expoPushToken;
                if (token) sendExpoPush(token, 'Refund processed 💸', `$${refundAmount.toFixed(2)} refund for order ${orderNumber} is on its way.`);
              }).catch(() => {});
            }
            if (buyerEmail) {
              sendRefundNotification({
                key: process.env.BREVO_API_KEY,
                email: buyerEmail, customerName: buyerName,
                orderNumber, refundAmount,
              }).catch(() => {});
            }
          }
        }
      } catch(e) { console.error('charge.refunded handler error:', e.message); }
    }
    return res.status(200).json({ received: true });
  }

  // Release stock reservations on payment failure or cancellation
  if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
    const failedPiId = event.data.object.id;
    try {
      const pendingSnap = await db.collection('pending_orders').doc(failedPiId).get();
      if (pendingSnap.exists) {
        const pendingItems = pendingSnap.data().items || [];
        await Promise.all(pendingItems.map(async (pItem) => {
          if (!pItem.productRef) return;
          const ref = db.doc(pItem.productRef);
          await db.runTransaction(async (t) => {
            const snap = await t.get(ref);
            if (!snap.exists) return;
            const d = snap.data();
            t.update(ref, { reservedStock: Math.max(0, (d.reservedStock ?? 0) - pItem.qty) });
          });
        }));
        await db.collection('pending_orders').doc(failedPiId).delete();
      }
    } catch(err) {
      console.error('Reservation release error:', err.message);
    }
    return res.status(200).json({ received: true });
  }

  // Only handle successful payments beyond this point
  if (event.type !== 'payment_intent.succeeded') {
    return res.status(200).json({ received: true });
  }

  const pi   = event.data.object;
  const piId = pi.id;

  // Idempotency check — skip if save-order.js already handled this payment
  const processedSnap = await db.collection('processed_payments').doc(piId).get();
  if (processedSnap.exists) {
    return res.status(200).json({ received: true, skipped: 'already_processed' });
  }

  // Read pending order written by create-payment-intent.js
  const pendingSnap = await db.collection('pending_orders').doc(piId).get();
  if (!pendingSnap.exists) {
    // Could be a subscription payment or already cleaned up — safe to ignore
    return res.status(200).json({ received: true, skipped: 'no_pending_order' });
  }

  const pending      = pendingSnap.data();
  const items        = pending.items || [];
  const customerEmail = pending.email || pi.receipt_email || '';
  const customerName  = pending.customerName || '';

  // Group items by brand
  const brandGroups = {};
  for (const item of items) {
    const brandId = sanitize(item.brandId, 128);
    if (!brandId) continue;
    if (!brandGroups[brandId]) brandGroups[brandId] = [];
    brandGroups[brandId].push({
      productId: sanitize(item.productId, 128),
      name:      sanitize(item.name, 120),
      brand:     sanitize(item.brand, 80),
      price:     Math.max(0, parseFloat(item.price) || 0),
      qty:       Math.max(1, parseInt(item.qty, 10) || 1),
    });
  }

  const orderNumber = 'FITR-WH-' + Math.floor(100000 + Math.random() * 900000);

  const orderBase = {
    orderNumber,
    stripePaymentIntentId: piId,
    subtotal:  parseFloat(pending.subtotal) || 0,
    fee:       parseFloat(pending.fee) || 0,
    shipping:  parseFloat(pending.shipping) || 0,
    total:     parseFloat(pending.total) || 0,
    status:    'processing',
    source:    'webhook',
    createdAt: FieldValue.serverTimestamp(),
  };

  const brandEntries  = Object.entries(brandGroups);
  const stripe        = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  try {
    // Write one order doc per brand
    const writes = brandEntries.map(([brandId, brandItems]) => {
      const brandTotal = brandItems.reduce((s, i) => s + i.price * i.qty, 0);
      return db.collection('brands').doc(brandId).collection('orders').add({
        ...orderBase,
        items:      brandItems,
        brandTotal: parseFloat(brandTotal.toFixed(2)),
        payoutStatus: 'pending',
      });
    });
    const orderDocs = await Promise.all(writes);

    // Fire transfers to each seller's Connect account
    const chargeId = pi.latest_charge || (typeof pi.charges?.data?.[0]?.id === 'string' ? pi.charges.data[0].id : null);

    if (chargeId) {
      const transferPromises = brandEntries.map(async ([brandId, brandItems], idx) => {
        const brandTotal   = brandItems.reduce((s, i) => s + i.price * i.qty, 0);
        const sellerAmount = parseFloat((brandTotal * SELLER_RATE).toFixed(2));
        const sellerCents  = Math.round(sellerAmount * 100);

        const brandSnap    = await db.collection('brands').doc(brandId).get();
        const privateSnap  = await db.collection('brands').doc(brandId).collection('private').doc('stripe').get();
        const connectId    = (privateSnap.exists && privateSnap.data().connectAccountId)
          ? privateSnap.data().connectAccountId
          : brandSnap.data()?.stripeConnectAccountId;
        const orderRef  = orderDocs[idx];

        if (!connectId) {
          await orderRef.update({ payoutStatus: 'pending_connect', payoutAmount: sellerAmount });
          return;
        }

        // Check seller's payout schedule preference
        const payoutSchedule = privateSnap.exists && privateSnap.data().payoutSchedule
          ? privateSnap.data().payoutSchedule
          : 'auto';
        if (payoutSchedule !== 'auto') {
          await orderRef.update({ payoutStatus: 'scheduled', payoutAmount: sellerAmount, payoutSchedule });
          return;
        }

        try {
          const transfer = await stripe.transfers.create({
            amount:             sellerCents,
            currency:           'usd',
            destination:        connectId,
            source_transaction: chargeId,
            transfer_group:     orderNumber,
            metadata:           { brandId, orderNumber, sellerAmount: sellerAmount.toFixed(2) },
          });
          await orderRef.update({
            payoutStatus:     'paid',
            payoutAmount:     sellerAmount,
            stripeTransferId: transfer.id,
            paidAt:           FieldValue.serverTimestamp(),
          });
        } catch(err) {
          console.error(`Webhook transfer failed for brand ${brandId}:`, err.message);
          await orderRef.update({ payoutStatus: 'failed', payoutAmount: sellerAmount, payoutError: err.message });
        }
      });

      await Promise.all(transferPromises);
    }

    // Mark as processed, decrement stock, and clean up reservation
    await db.collection('processed_payments').doc(piId).set({
      processedAt: FieldValue.serverTimestamp(),
      source:      'webhook',
      orderNumber,
    });

    // Decrement stock and release reservation atomically per product
    await Promise.all(items.map(async (pItem) => {
      if (!pItem.productRef) return;
      const ref = db.doc(pItem.productRef);
      await db.runTransaction(async (t) => {
        const snap = await t.get(ref);
        if (!snap.exists) return;
        const d = snap.data();
        t.update(ref, {
          stock:         Math.max(0, (d.stock ?? 0) - pItem.qty),
          reservedStock: Math.max(0, (d.reservedStock ?? 0) - pItem.qty),
        });
      });
    })).catch(err => console.error('Webhook stock decrement error (non-fatal):', err.message));

    await db.collection('pending_orders').doc(piId).delete();

    // ── NOTIFICATIONS & EMAILS (non-blocking) ──
    const brevoKey = process.env.BREVO_API_KEY;
    const allItems = Object.values(brandGroups).flat();

    // Lookup buyer uid for in-app notification
    let buyerUid = null;
    if (customerEmail) {
      try { buyerUid = (await getAuth().getUserByEmail(customerEmail)).uid; } catch(_) {}
    }

    // Buyer: order confirmation email
    sendOrderConfirmation({
      key:          brevoKey,
      email:        customerEmail,
      customerName,
      orderNumber,
      items:        allItems,
      subtotal:     pending.subtotal || 0,
      fee:          pending.fee || 0,
      shipping:     pending.shipping || 0,
      total:        pending.total || 0,
    }).catch(e => console.error('Webhook buyer email:', e.message));

    // Buyer: in-app notification + push
    if (buyerUid) {
      db.collection('users').doc(buyerUid).collection('notifications').add({
        title: 'Order confirmed', body: `Order ${orderNumber} is being processed.`,
        link: '/orders.html', type: 'order_confirmed', read: false,
        orderNumber,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(e => console.error('Webhook buyer notif:', e.message));

      db.collection('users').doc(buyerUid).get().then(snap => {
        const token = snap.data()?.expoPushToken;
        if (token) sendExpoPush(token, 'Order confirmed! ✅', `Order ${orderNumber} is being processed.`);
      }).catch(() => {});
    }

    // Per-brand: seller emails + dashboard notifications
    for (const [brandId, brandItems] of brandEntries) {
      const brandTotal = brandItems.reduce((s, i) => s + i.price * i.qty, 0);
      const bSnap = await db.collection('brands').doc(brandId).get().catch(() => null);
      const bData = bSnap?.data() || {};
      const sellerEmail = bData.email || bData.contactEmail || null;
      if (sellerEmail) {
        sendSellerNewOrderAlert({
          key: brevoKey, sellerEmail, brandName: bData.brandName || 'Your Store',
          orderNumber, items: brandItems, brandTotal,
        }).catch(e => console.error('Webhook seller email:', e.message));
      }
      db.collection('brands').doc(brandId).collection('notifications').add({
        title: 'New order received', body: `Order ${orderNumber} — $${brandTotal.toFixed(2)}`,
        link: '#orders', type: 'new_order', read: false, createdAt: FieldValue.serverTimestamp(),
      }).catch(e => console.error('Webhook seller notif:', e.message));
    }

    return res.status(200).json({ received: true });
  } catch(err) {
    console.error('Webhook order processing error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
