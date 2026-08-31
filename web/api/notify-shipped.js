import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { sendShippingNotification } from './send-order-emails.js';

async function sendExpoPush(token, title, body) {
  if (!token || !token.startsWith('ExponentPushToken')) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  }).catch(() => {});
}

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
  if (!idToken) return res.status(401).json({ error: 'Unauthorized.' });

  const {
    brandId, orderId, orderNumber, customerEmail, customerName,
    trackingNumber, carrier,
  } = req.body || {};

  if (!brandId || !orderId) {
    return res.status(400).json({ error: 'Missing brandId or orderId.' });
  }

  try {
    initAdmin();
    const db = getFirestore();

    // Verify token belongs to this brand's seller
    const decoded = await getAuth().verifyIdToken(idToken);
    if (decoded.uid !== sanitize(brandId, 128)) {
      return res.status(403).json({ error: 'You can only update your own orders.' });
    }

    // Verify the order belongs to this brand
    const orderRef  = db.collection('brands').doc(sanitize(brandId, 128)).collection('orders').doc(sanitize(orderId, 128));
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderSnap.data();

    const safeTracking = sanitize(trackingNumber, 100) || null;
    const safeCarrier  = sanitize(carrier, 60) || null;

    // Update brand order status to shipped
    await orderRef.update({
      status:         'shipped',
      shippedAt:      FieldValue.serverTimestamp(),
      trackingNumber: safeTracking,
      carrier:        safeCarrier,
    });

    // Sync status to buyer's users/{uid}/orders so app Orders screen updates
    if (order.buyerUid && order.orderNumber) {
      try {
        const userOrdersSnap = await db.collection('users').doc(order.buyerUid)
          .collection('orders')
          .where('orderNumber', '==', order.orderNumber)
          .limit(1)
          .get();
        if (!userOrdersSnap.empty) {
          await userOrdersSnap.docs[0].ref.update({
            status:         'shipped',
            shippedAt:      FieldValue.serverTimestamp(),
            trackingNumber: safeTracking,
            carrier:        safeCarrier,
          });
        }
      } catch(e) { console.error('User order sync failed:', e.message); }
    }

    const brevoKey     = process.env.BREVO_API_KEY;
    const email        = customerEmail || order.email || '';
    const name         = customerName  || order.customerName || '';
    const orderNum     = orderNumber   || order.orderNumber || orderId;
    const buyerUid     = order.buyerUid || null;

    // Send shipping email to buyer
    if (email) {
      sendShippingNotification({
        key:           brevoKey,
        email,
        customerName:  name,
        orderNumber:   orderNum,
        trackingNumber: sanitize(trackingNumber, 100),
        carrier:       sanitize(carrier, 60),
      }).catch(e => console.error('Shipping email failed:', e.message));
    }

    // In-app notification to buyer (web bell)
    if (buyerUid) {
      db.collection('users').doc(buyerUid).collection('notifications').add({
        title:     'Order shipped!',
        body:      `Order ${orderNum} is on its way.${trackingNumber ? ' Tracking: ' + sanitize(trackingNumber, 60) : ''}`,
        link:      '/orders.html',
        type:      'order_shipped',
        read:      false,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(e => console.error('Shipped buyer notif failed:', e.message));
    }

    // Look up buyer uid from email if not on order
    let resolvedUid = buyerUid;
    if (!resolvedUid && email) {
      try {
        const authUser = await getAuth().getUserByEmail(email);
        resolvedUid = authUser.uid;
        db.collection('users').doc(resolvedUid).collection('notifications').add({
          title: 'Order shipped!', body: `Order ${orderNum} is on its way.`,
          link: '/orders.html', type: 'order_shipped', read: false,
          createdAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      } catch(_) {}
    }

    // Mobile push
    if (resolvedUid) {
      db.collection('users').doc(resolvedUid).get().then(snap => {
        const token = snap.data()?.expoPushToken;
        if (token) sendExpoPush(token, 'Order shipped! 📦', `Order ${orderNum} is on its way.${trackingNumber ? ' Tracking: ' + sanitize(String(trackingNumber), 60) : ''}`);
      }).catch(() => {});
    }

    return res.status(200).json({ ok: true });
  } catch(err) {
    console.error('notify-shipped error:', err.message);
    return res.status(500).json({ error: 'Could not process notification.' });
  }
}
