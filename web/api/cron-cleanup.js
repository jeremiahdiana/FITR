import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Only allow calls from Vercel's cron scheduler (via the CRON_SECRET env var)
// and the Admin SDK (bypasses Firestore rules entirely).
const CRON_SECRET = process.env.CRON_SECRET;

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
  // Vercel sends the secret as a Bearer token in Authorization header
  if (CRON_SECRET) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).end();
  }

  initAdmin();
  const db = getFirestore();

  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

  let released = 0;
  let deleted  = 0;
  const errors = [];

  try {
    const staleSnap = await db.collection('pending_orders')
      .where('createdAt', '<', cutoff)
      .get();

    if (staleSnap.empty) {
      return res.status(200).json({ ok: true, released: 0, deleted: 0 });
    }

    await Promise.all(staleSnap.docs.map(async (pendingDoc) => {
      const data  = pendingDoc.data();
      const items = data.items || [];

      // Release reservedStock for each product in this pending order
      await Promise.all(items.map(async (item) => {
        if (!item.productRef || !item.qty) return;
        try {
          const ref = db.doc(item.productRef);
          await db.runTransaction(async (t) => {
            const snap = await t.get(ref);
            if (!snap.exists) return;
            const d = snap.data();
            t.update(ref, {
              reservedStock: Math.max(0, (d.reservedStock ?? 0) - item.qty),
            });
          });
          released++;
        } catch (err) {
          errors.push(`Reserve release failed for ${item.productRef}: ${err.message}`);
        }
      }));

      // Delete the stale pending_order doc
      try {
        await pendingDoc.ref.delete();
        deleted++;
      } catch (err) {
        errors.push(`Delete failed for pending_order ${pendingDoc.id}: ${err.message}`);
      }
    }));

    console.log(`cron-cleanup: released=${released} deleted=${deleted} errors=${errors.length}`);
    return res.status(200).json({ ok: true, released, deleted, errors });
  } catch (err) {
    console.error('cron-cleanup fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
