import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGINS = [
  'https://joinfitr.com', 'https://www.joinfitr.com',
  'http://localhost:3000', 'http://localhost:5000',
];

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

async function deleteSubcollection(db, parentRef, subcollection) {
  try {
    const snap = await parentRef.collection(subcollection).limit(100).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    // Recurse if there were 100 docs (there may be more)
    if (snap.size === 100) await deleteSubcollection(db, parentRef, subcollection);
  } catch (e) {
    console.warn(`Failed to delete subcollection ${subcollection}:`, e.message);
  }
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const isMobile = !origin; // native app has no Origin header
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!isMobile && !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'Forbidden' });

  // Require Firebase ID token
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return res.status(401).json({ error: 'Unauthorized.' });

  try {
    initAdmin();
    const db   = getFirestore();
    const auth = getAuth();

    // Verify token
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    // Read user doc to confirm scheduled deletion has passed
    const userRef  = db.collection('users').doc(uid);
    const userSnap = await userRef.get();

    if (userSnap.exists) {
      const data = userSnap.data();
      if (data.pendingDeletion && data.scheduledDeletionAt) {
        const deletionDate = data.scheduledDeletionAt.toDate();
        if (deletionDate > new Date()) {
          // 30 days haven't passed yet — refuse
          return res.status(403).json({ error: 'Deletion date has not been reached yet.' });
        }
      } else if (!data.pendingDeletion) {
        // Not scheduled for deletion — refuse (safety guard)
        return res.status(400).json({ error: 'Account is not scheduled for deletion.' });
      }
    }

    // Delete all user subcollections
    const subcollections = ['cart', 'wishlist', 'savedForLater', 'notifications', 'orders'];
    await Promise.all(subcollections.map(sub => deleteSubcollection(db, userRef, sub)));

    // Delete user document
    await userRef.delete().catch(() => {});

    // Delete Firebase Auth account
    await auth.deleteUser(uid).catch(e => console.warn('Auth delete failed:', e.message));

    console.log('User purged:', uid);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('purge-user error:', err.message);
    return res.status(500).json({ error: 'Could not purge account.' });
  }
}
