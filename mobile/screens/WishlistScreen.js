import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { colors } from '../theme';
import { useCart } from '../hooks/useCart';

function emojiFor(cat) {
  const s = (cat || '').toLowerCase();
  if (s.includes('protein'))   return '🥛';
  if (s.includes('pre'))       return '⚡';
  if (s.includes('creatine'))  return '💪';
  if (s.includes('vitamin'))   return '🌿';
  if (s.includes('hydration')) return '💧';
  if (s.includes('equipment')) return '🏋️';
  if (s.includes('apparel'))   return '👕';
  if (s.includes('recovery'))  return '🧊';
  return '📦';
}

export default function WishlistScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid]       = useState(auth.currentUser?.uid ?? null);
  const { addToCart }       = useCart();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    loadWishlist(uid);
  }, [uid]);

  async function loadWishlist(userId) {
    setLoading(true);
    try {
      const q    = query(collection(db, 'users', userId, 'wishlist'), orderBy('addedAt', 'desc'));
      const snap = await getDocs(q);
      setItems(snap.docs.map(d => ({ docId: d.id, ...d.data() })));
    } catch (e) {
      console.warn('Wishlist load error:', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(docId) {
    if (!uid) return;
    try {
      await deleteDoc(doc(db, 'users', uid, 'wishlist', docId));
      setItems(prev => prev.filter(i => i.docId !== docId));
    } catch (e) {
      Alert.alert('Error', 'Could not remove item.');
    }
  }

  function handleAddToCart(item) {
    addToCart({
      id:      item.productId || item.docId,
      name:    item.name,
      brand:   item.brand || 'FITR Seller',
      brandId: item.brandId || '',
      price:   item.price,
      img:     item.img || '',
      cat:     item.category || '',
    });
    Alert.alert('Added!', `${item.name} added to cart.`, [{ text: 'OK' }]);
  }

  function handleViewProduct(item) {
    navigation.navigate('Main', {
      screen: 'HomeTab',
      params: {
        screen: 'ProductDetail',
        params: {
          product: {
            id:       item.productId || item.docId,
            name:     item.name,
            brand:    item.brand || 'FITR Seller',
            brandId:  item.brandId || '',
            price:    item.price,
            img:      item.img || '',
            category: item.category || '',
            cat:      item.category || '',
            stock:    999,
          },
        },
      },
    });
  }

  if (!uid) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>♡</Text>
        <Text style={styles.emptyTitle}>Sign in to view your wishlist</Text>
        <TouchableOpacity style={styles.signInBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={styles.signInBtnText}>Log In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.loadingText}>Loading wishlist…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wishlist</Text>
        <View style={{ width: 40 }} />
      </View>

      {items.length > 0 && (
        <Text style={styles.countText}>{items.length} item{items.length !== 1 ? 's' : ''}</Text>
      )}

      <FlatList
        data={items}
        keyExtractor={item => item.docId}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>♡</Text>
            <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
            <Text style={styles.emptySub}>
              Tap ♡ on any product to save it here.
            </Text>
            <TouchableOpacity
              style={styles.shopBtn}
              onPress={() => navigation.navigate('Main')}
            >
              <Text style={styles.shopBtnText}>Browse Products</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            {/* Image */}
            <TouchableOpacity style={styles.cardImg} onPress={() => handleViewProduct(item)}>
              {item.img ? (
                <Image source={{ uri: item.img }} style={styles.cardImgInner} resizeMode="cover" />
              ) : (
                <Text style={styles.cardEmoji}>{emojiFor(item.category)}</Text>
              )}
            </TouchableOpacity>

            {/* Info */}
            <View style={styles.cardBody}>
              <Text style={styles.cardBrand} numberOfLines={1}>{item.brand || 'FITR Seller'}</Text>
              <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.cardPrice}>${parseFloat(item.price || 0).toFixed(2)}</Text>

              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.btnView} onPress={() => handleViewProduct(item)}>
                  <Text style={styles.btnViewText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnCart} onPress={() => handleAddToCart(item)}>
                  <Text style={styles.btnCartText}>+ Cart</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnRemove} onPress={() => handleRemove(item.docId)}>
                  <Text style={styles.btnRemoveText}>♥</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  centered: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  loadingText: { color: colors.textMuted, fontSize: 14, marginTop: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backBtnText: { color: colors.brand, fontSize: 28, fontWeight: '300', lineHeight: 30 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },

  countText: { color: colors.textMuted, fontSize: 13, paddingHorizontal: 16, paddingTop: 12 },

  list: { padding: 16, paddingBottom: 40 },

  card: {
    flexDirection: 'row', gap: 14,
    backgroundColor: colors.bgPanel,
    borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 14,
  },

  cardImg: {
    width: 90, height: 90, borderRadius: 12,
    backgroundColor: colors.bgInput,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', flexShrink: 0,
  },
  cardImgInner: { width: '100%', height: '100%' },
  cardEmoji:    { fontSize: 36 },

  cardBody: { flex: 1, justifyContent: 'space-between' },
  cardBrand: { fontSize: 10, fontWeight: '700', color: colors.brand, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  cardName:  { fontSize: 14, fontWeight: '700', color: colors.text, lineHeight: 19, marginBottom: 4 },
  cardPrice: { fontSize: 17, fontWeight: '900', color: colors.text, marginBottom: 10 },

  cardActions: { flexDirection: 'row', gap: 8 },

  btnView: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: colors.brand, alignItems: 'center',
  },
  btnViewText: { color: '#080f18', fontSize: 12, fontWeight: '800' },

  btnCart: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: colors.text, alignItems: 'center',
  },
  btnCartText: { color: colors.text, fontSize: 12, fontWeight: '700' },

  btnRemove: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff5f5', borderWidth: 1.5, borderColor: '#e6394650',
    alignItems: 'center', justifyContent: 'center',
  },
  btnRemoveText: { color: '#e63946', fontSize: 16 },

  emptyWrap:  { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 52, color: '#e63946' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  emptySub:   { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  shopBtn: {
    marginTop: 8, backgroundColor: colors.brand,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28,
  },
  shopBtnText: { color: '#080f18', fontWeight: '800', fontSize: 15 },

  signInBtn: {
    marginTop: 20, backgroundColor: colors.brand,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40,
  },
  signInBtnText: { color: '#080f18', fontWeight: '800', fontSize: 15 },
});
