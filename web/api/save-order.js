import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { sendOrderConfirmation, sendSellerNewOrderAlert } from './send-order-emails.js';

async function sendExpoPush(token, title, body) {
  if (!token || !token.startsWith('ExponentPushToken')) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, title, body, sound: 'default' }),
  }).catch(() => {});
}

const ALLOWED_ORIGINS = ['https://joinfitr.com', 'https://www.joinfitr.com'];
const SELLER_RATE = 0.88; // seller keeps 88%, FITR takes 12%

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
  // No Origin header = native mobile app (not a browser); allow it.
  const isMobile = !origin;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!isMobile && !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  const {
    orderNumber, stripePaymentIntentId, items,
    subtotal, fee, shipping, total,
    shippingAddress, customerName, email,
  } = req.body || {};

  // Validate
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'No items.' });
  }
  if (!orderNumber || typeof orderNumber !== 'string' || orderNumber.length > 30) {
    return res.status(400).json({ error: 'Invalid order number.' });
  }
  if (!stripePaymentIntentId || typeof stripePaymentIntentId !== 'string') {
    return res.status(400).json({ error: 'Invalid payment intent.' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  // Verify the payment intent actually succeeded before writing anything
  if (secretKey) {
    try {
      const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
      const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId);
      if (pi.status !== 'succeeded') {
        return res.status(402).json({ error: 'Payment not completed.' });
      }
    } catch(stripeVerifyErr) {
      console.error('PI verification error:', stripeVerifyErr.message);
      return res.status(400).json({ error: 'Could not verify payment.' });
    }
  }

  try {
    initAdmin();
    const db = getFirestore();

    // Idempotency check — if this PI was already processed, return success immediately
    const piDocId = sanitize(stripePaymentIntentId, 100);
    const existingPi = await db.collection('processed_payments').doc(piDocId).get();
    if (existingPi.exists) {
      console.log('Duplicate save-order call for PI:', piDocId, '— skipping.');
      return res.status(200).json({ ok: true, orderNumber: existingPi.data().orderNumber || orderNumber });
    }

    // Group items by brandId
    const brandGroups = {};
    for (const item of items) {
      const brandId = sanitize(item.brandId, 128);
      const productId = sanitize(item.id, 128);
      if (!brandId || !productId) continue;
      if (!brandGroups[brandId]) brandGroups[brandId] = [];
      const sanitizedEntry = {
        productId,
        name:             sanitize(item.name, 120),
        brand:            sanitize(item.brand, 80),
        price:            Math.max(0, parseFloat(item.price) || 0),
        qty:              Math.max(1, parseInt(item.qty, 10) || 1),
        image:            sanitize(item.image, 300),
        selectedVariants: (item.selectedVariants && typeof item.selectedVariants === 'object')
          ? Object.fromEntries(
              Object.entries(item.selectedVariants)
                .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
                .map(([k, v]) => [sanitize(k, 50), sanitize(v, 100)])
            )
          : {},
      };
      // Per-unit variants (website qty > 1, or app variantsByUnit)
      if (Array.isArray(item.variantsByUnit)) {
        sanitizedEntry.variantsByUnit = item.variantsByUnit.map(unitVars => {
          if (!unitVars || typeof unitVars !== 'object') return {};
          return Object.fromEntries(
            Object.entries(unitVars)
              .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
              .map(([k, v]) => [sanitize(k, 50), sanitize(v, 100)])
          );
        });
      }
      brandGroups[brandId].push(sanitizedEntry);
    }

    const orderBase = {
      orderNumber:           sanitize(orderNumber, 30),
      stripePaymentIntentId: sanitize(stripePaymentIntentId, 100),
      customerName:          sanitize(customerName, 120),
      email:                 sanitize(email, 254).toLowerCase(),
      shippingAddress: {
        name:    sanitize(shippingAddress?.name, 120),
        address: sanitize(shippingAddress?.address, 200),
        city:    sanitize(shippingAddress?.city, 80),
        state:   sanitize(shippingAddress?.state, 20),
        zip:     sanitize(shippingAddress?.zip, 10),
        country: sanitize(shippingAddress?.country || 'United States', 60),
      },
      subtotal: parseFloat(subtotal) || 0,
      fee:      parseFloat(fee) || 0,
      shipping: parseFloat(shipping) || 0,
      total:    parseFloat(total) || 0,
      status:   'processing',
      createdAt: FieldValue.serverTimestamp(),
    };

    // Look up buyer uid for in-app notifications (best-effort)
    let buyerUid = null;
    const cleanEmail = sanitize(email, 254).toLowerCase();
    if (cleanEmail) {
      try {
        const authUser = await getAuth().getUserByEmail(cleanEmail);
        buyerUid = authUser.uid;
      } catch(_) { /* guest or not found */ }
    }

    // Write one order document per brand seller
    const brandEntries = Object.entries(brandGroups);
    const writes = brandEntries.map(([brandId, brandItems]) => {
      const brandTotal = brandItems.reduce((s, i) => s + i.price * i.qty, 0);
      return db.collection('brands').doc(brandId).collection('orders').add({
        ...orderBase,
        items:        brandItems,
        brandTotal:   parseFloat(brandTotal.toFixed(2)),
        payoutStatus: 'pending',
        buyerUid:     buyerUid || null,
      });
    });

    // Write a single order record to the buyer's user subcollection (powers the app Orders screen)
    if (buyerUid) {
      const allBrandItems = Object.values(brandGroups).flat();
      db.collection('users').doc(buyerUid).collection('orders').add({
        ...orderBase,
        items: allBrandItems,
      }).catch(e => console.error('Buyer order record failed:', e.message));
    }

    // Guest order record — lets guests look up their orders by email
    if (!buyerUid && cleanEmail) {
      db.collection('guest_orders').add({
        email:       cleanEmail,
        orderNumber: sanitize(orderNumber, 30),
        stripePaymentIntentId: sanitize(stripePaymentIntentId, 100),
        subtotal:    parseFloat(subtotal) || 0,
        fee:         parseFloat(fee) || 0,
        shipping:    parseFloat(shipping) || 0,
        total:       parseFloat(total) || 0,
        status:      'processing',
        createdAt:   FieldValue.serverTimestamp(),
      }).catch(e => console.error('Guest order record failed:', e.message));
    }

    // Idempotency lock — write now so webhook knows this PI was handled by client
    await db.collection('processed_payments').doc(piDocId).set({
      processedAt: FieldValue.serverTimestamp(),
      source: 'client',
      orderNumber: sanitize(orderNumber, 30),
    });

    // Read pending order to get productRef paths, then decrement stock and release reservations
    try {
      const pendingSnap = await db.collection('pending_orders').doc(piDocId).get();
      if (pendingSnap.exists) {
        const pendingItems = pendingSnap.data().items || [];
        await Promise.all(pendingItems.map(async (pItem) => {
          if (!pItem.productRef) return;
          const ref = db.doc(pItem.productRef);
          let newStock = null;
          await db.runTransaction(async (t) => {
            const snap = await t.get(ref);
            if (!snap.exists) return;
            const d = snap.data();
            newStock = Math.max(0, (d.stock ?? 0) - pItem.qty);
            t.update(ref, {
              stock:         newStock,
              reservedStock: Math.max(0, (d.reservedStock ?? 0) - pItem.qty),
            });
          });
          // Low-stock alert to seller when stock hits 5 or below
          if (newStock !== null && newStock <= 5) {
            const productSnap = await ref.get().catch(() => null);
            const productData = productSnap?.data() || {};
            const brandId = productData.brandId || pItem.brandId;
            if (brandId) {
              db.collection('brands').doc(brandId).collection('notifications').add({
                title:     newStock === 0 ? '⚠️ Out of stock' : `⚠️ Low stock: ${newStock} left`,
                body:      `${productData.name || 'A product'} is ${newStock === 0 ? 'out of stock' : `running low (${newStock} remaining)`}. Update inventory in your dashboard.`,
                link:      '#products',
                type:      'low_stock',
                read:      false,
                productId: ref.id,
                createdAt: FieldValue.serverTimestamp(),
              }).catch(() => {});
            }
          }
        }));
        await db.collection('pending_orders').doc(piDocId).delete();
      }
    } catch(stockErr) {
      console.error('Stock decrement error (non-fatal):', stockErr.message);
    }

    const orderDocs = await Promise.all(writes);

    // ── STRIPE AUTOMATIC PAYOUTS ──
    // Retrieve the charge ID from the PaymentIntent (needed for transfers)
    if (secretKey) {
      try {
        const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });
        const pi = await stripe.paymentIntents.retrieve(stripePaymentIntentId, {
          expand: ['latest_charge'],
        });
        const chargeId = pi.latest_charge?.id;

        if (chargeId) {
          // For each brand, attempt a Stripe transfer if they have a Connect account
          const transferPromises = brandEntries.map(async ([brandId, brandItems], idx) => {
            const brandTotal = brandItems.reduce((s, i) => s + i.price * i.qty, 0);
            const sellerAmount = parseFloat((brandTotal * SELLER_RATE).toFixed(2));
            const sellerCents = Math.round(sellerAmount * 100);

            // Look up seller's Connect account (private subcollection, with fallback)
            const brandSnap = await db.collection('brands').doc(brandId).get();
            const brandData = brandSnap.data() || {};
            const privateSnap = await db.collection('brands').doc(brandId).collection('private').doc('stripe').get();
            const connectId = (privateSnap.exists && privateSnap.data().connectAccountId)
              ? privateSnap.data().connectAccountId
              : brandData.stripeConnectAccountId;

            const orderDocRef = orderDocs[idx];

            if (!connectId) {
              // No Connect account yet — mark payout as pending so we can pay manually
              await orderDocRef.update({
                payoutStatus: 'pending_connect',
                payoutAmount: sellerAmount,
                payoutNote: 'Seller has not connected Stripe account.',
              });
              return;
            }

            // Check seller's payout schedule preference
            const payoutSchedule = privateSnap.exists && privateSnap.data().payoutSchedule
              ? privateSnap.data().payoutSchedule
              : 'auto';
            if (payoutSchedule !== 'auto') {
              await orderDocRef.update({
                payoutStatus: 'scheduled',
                payoutAmount: sellerAmount,
                payoutSchedule,
              });
              return;
            }

            try {
              const transfer = await stripe.transfers.create({
                amount:      sellerCents,
                currency:    'usd',
                destination: connectId,
                source_transaction: chargeId,
                transfer_group: orderNumber,
                metadata: {
                  brandId,
                  orderNumber,
                  sellerAmount: sellerAmount.toFixed(2),
                },
              });

              await orderDocRef.update({
                payoutStatus:     'paid',
                payoutAmount:     sellerAmount,
                stripeTransferId: transfer.id,
                paidAt:           FieldValue.serverTimestamp(),
              });
            } catch (transferErr) {
              console.error(`Transfer failed for brand ${brandId}:`, transferErr.message);
              await orderDocRef.update({
                payoutStatus: 'failed',
                payoutAmount: sellerAmount,
                payoutError:  transferErr.message,
              });
            }
          });

          await Promise.all(transferPromises);
        }
      } catch (stripeErr) {
        // Don't fail the whole request if payouts error — orders are already saved
        console.error('Payout error (non-fatal):', stripeErr.message);
      }
    }

    // ── NOTIFICATIONS & EMAILS ──
    const brevoKey = process.env.BREVO_API_KEY;
    const allItems = Object.values(brandGroups).flat();

    // Buyer: order confirmation email
    sendOrderConfirmation({
      key:          brevoKey,
      email:        cleanEmail,
      customerName: sanitize(customerName, 120),
      orderNumber:  sanitize(orderNumber, 30),
      items:        allItems,
      subtotal:     parseFloat(subtotal) || 0,
      fee:          parseFloat(fee) || 0,
      shipping:     parseFloat(shipping) || 0,
      total:        parseFloat(total) || 0,
    }).catch(e => console.error('Buyer email failed:', e.message));

    // Buyer: in-app notification (web bell + app) + push
    if (buyerUid) {
      const orderNum = sanitize(orderNumber, 30);
      db.collection('users').doc(buyerUid).collection('notifications').add({
        title: 'Order confirmed', body: `Order ${orderNum} is being processed.`,
        link: '/orders.html', type: 'order_confirmed', read: false,
        orderNumber: orderNum,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(e => console.error('Buyer notif failed:', e.message));

      // Mobile push
      db.collection('users').doc(buyerUid).get().then(snap => {
        const token = snap.data()?.expoPushToken;
        if (token) sendExpoPush(token, 'Order confirmed! ✅', `Order ${orderNum} is being processed.`);
      }).catch(() => {});
    }

    // Per-brand: seller new order alert email + dashboard notification
    for (let idx = 0; idx < brandEntries.length; idx++) {
      const [brandId, brandItems] = brandEntries[idx];
      const brandTotal = brandItems.reduce((s, i) => s + i.price * i.qty, 0);
      const brandSnap  = await db.collection('brands').doc(brandId).get().catch(() => null);
      const bData      = brandSnap?.data() || {};
      const sellerEmail = bData.email || bData.contactEmail || null;
      const brandName   = bData.brandName || 'Your Store';

      // Seller: new order email
      if (sellerEmail) {
        sendSellerNewOrderAlert({
          key:         brevoKey,
          sellerEmail,
          brandName,
          orderNumber: sanitize(orderNumber, 30),
          items:       brandItems,
          brandTotal,
        }).catch(e => console.error('Seller email failed:', e.message));
      }

      // Seller: dashboard notification
      db.collection('brands').doc(brandId).collection('notifications').add({
        title:     'New order received',
        body:      `Order ${sanitize(orderNumber, 30)} — $${brandTotal.toFixed(2)}`,
        link:      '#orders',
        type:      'new_order',
        read:      false,
        createdAt: FieldValue.serverTimestamp(),
      }).catch(e => console.error('Seller notif failed:', e.message));
    }

    res.status(200).json({ ok: true, orderNumber });
  } catch(err) {
    console.error('save-order error:', err.message);
    res.status(500).json({ error: 'Could not save order.' });
  }
}
