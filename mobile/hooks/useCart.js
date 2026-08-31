import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, onSnapshot,
  setDoc, deleteDoc, updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { navigationRef } from '../navigationRef';

const MAX_QTY = 99;
const MAX_PRICE = 10000;

function requireAuth() {
  if (navigationRef.isReady()) {
    navigationRef.navigate('Login');
  }
}

// Validate product object before writing to Firestore
function isValidProduct(product) {
  return (
    product &&
    typeof product.id !== 'undefined' &&
    typeof product.price === 'number' &&
    product.price > 0 &&
    product.price < MAX_PRICE &&
    typeof product.name === 'string' &&
    product.name.length > 0 &&
    typeof product.brand === 'string'
  );
}

export function useCart() {
  const [cartItems, setCartItems] = useState([]);
  const [uid, setUid] = useState(auth.currentUser?.uid ?? null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) { setCartItems([]); return; }
    const ref = collection(db, 'users', uid, 'cart');
    const unsub = onSnapshot(ref, (snap) => {
      setCartItems(snap.docs.map(d => ({ cartId: d.id, ...d.data() })));
    });
    return unsub;
  }, [uid]);

  async function addToCart(product, selectedVariants = {}) {
    if (!uid) { requireAuth(); return; }
    if (!isValidProduct(product)) return;

    const safeVariants = Object.fromEntries(
      Object.entries(selectedVariants)
        .filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
        .map(([k, v]) => [k.slice(0, 50), v.slice(0, 100)])
    );

    // Build a cart key that includes variant selections so the same product
    // with different variants becomes a separate cart entry.
    const variantKey = Object.entries(safeVariants)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
    const cartKey = variantKey ? `${product.id}__${variantKey}` : String(product.id);

    const ref = doc(db, 'users', uid, 'cart', cartKey);
    const existing = cartItems.find(i => i.cartId === cartKey);
    const newQty = (existing?.qty ?? 0) + 1;
    if (newQty > MAX_QTY) return;

    if (existing) {
      await updateDoc(ref, { qty: newQty });
    } else {
      const safeProduct = {
        id: product.id,
        name: String(product.name).slice(0, 200),
        brand: String(product.brand).slice(0, 100),
        brandId: String(product.brandId || '').slice(0, 128),
        price: product.price,
        img: product.img || '',
        cat: product.cat || '',
        badge: product.badge || null,
        old: product.old || null,
        rating: product.rating || 0,
        reviews: product.reviews || '',
        variations: Array.isArray(product.variations) ? product.variations : [],
      };
      await setDoc(ref, { product: safeProduct, qty: 1, selectedVariants: safeVariants });
    }
  }

  async function removeFromCart(cartId) {
    if (!uid) { requireAuth(); return; }
    await deleteDoc(doc(db, 'users', uid, 'cart', String(cartId)));
  }

  async function updateQty(cartId, qty) {
    if (!uid) { requireAuth(); return; }
    const safeQty = Math.max(0, Math.min(MAX_QTY, parseInt(qty, 10)));
    if (isNaN(safeQty) || safeQty <= 0) { removeFromCart(cartId); return; }
    await updateDoc(doc(db, 'users', uid, 'cart', String(cartId)), { qty: safeQty });
  }

  async function clearCart() {
    if (!uid) return;
    await Promise.all(
      cartItems.map(item => deleteDoc(doc(db, 'users', uid, 'cart', String(item.cartId))))
    );
  }

  const itemCount = cartItems.reduce((sum, i) => sum + i.qty, 0);
  // NOTE: Totals here are display-only. Final totals MUST be recalculated
  // server-side at checkout using authoritative product prices from Firestore.
  const subtotal  = cartItems.reduce((sum, i) => sum + i.product.price * i.qty, 0);
  const fee       = parseFloat((subtotal * 0.12).toFixed(2));
  const shipping  = subtotal >= 250 ? 0 : subtotal > 0 ? 7.99 : 0;
  const total     = parseFloat((subtotal + fee + shipping).toFixed(2));

  return {
    cartItems, itemCount, subtotal, fee, shipping, total,
    addToCart, removeFromCart, updateQty, clearCart,
    isLoggedIn: !!uid,
  };
}
