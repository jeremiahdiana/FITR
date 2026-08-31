import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, FlatList, Alert, ActivityIndicator,
  Animated, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { colors, sp, r, shadow, type } from '../theme';
import { useCart } from '../hooks/useCart';
import ProductCard from '../components/ProductCard';

const CATEGORIES = [
  { key: 'all',      label: 'All' },
  { key: 'supps',    label: 'Supplements' },
  { key: 'gear',     label: 'Gear' },
  { key: 'apparel',  label: 'Apparel' },
  { key: 'recovery', label: 'Recovery' },
];

function catMap(c) {
  const s = (c || '').toLowerCase();
  if (s.match(/supplement|protein|pre.?workout|creatine|vitamin|hydration/)) return 'supps';
  if (s.match(/equipment|accessory|accessories/)) return 'gear';
  if (s.match(/apparel/)) return 'apparel';
  if (s.match(/recovery/)) return 'recovery';
  return 'supps';
}

function toAppProduct(id, p) {
  const hasDiscount = p.comparePrice && parseFloat(p.comparePrice) > parseFloat(p.price);
  const now = Date.now();
  const createdMs = p.createdAt?.seconds ? p.createdAt.seconds * 1000 : 0;
  const isNew = createdMs > now - 30 * 24 * 60 * 60 * 1000;
  return {
    id,
    name:        p.name || '',
    brand:       p.brandName || 'FITR Brand',
    brandId:     p.brandId || '',
    price:       parseFloat(p.price || 0),
    old:         hasDiscount ? parseFloat(p.comparePrice) : null,
    img:         p.imageUrl || '',
    cat:         catMap(p.category),
    badge:       hasDiscount ? 'SALE' : null,
    isNew,
    rating:      p.rating || 5,
    reviews:     p.reviewCount ? String(p.reviewCount) : '0',
    stock:       p.stock ?? 999,
    description: p.description || '',
    category:    p.category || '',
    productId:   p.productId || id,
  };
}

const SECTIONS = [
  { key: 'deals',    label: "Today's Deals",    filter: p => p.badge === 'SALE' },
  { key: 'new',      label: 'New Arrivals',      filter: p => p.isNew },
  { key: 'supps',    label: 'Supplements',       filter: p => p.cat === 'supps' },
  { key: 'gear',     label: 'Gym Gear',          filter: p => p.cat === 'gear' },
  { key: 'apparel',  label: 'Apparel',           filter: p => p.cat === 'apparel' },
  { key: 'recovery', label: 'Recovery',          filter: p => p.cat === 'recovery' },
];

function SectionHeader({ label, count }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{label}</Text>
      {count > 0 && <Text style={s.sectionCount}>{count} items</Text>}
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const [activeCat, setActiveCat] = useState('all');
  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [zipCode, setZipCode]     = useState('');
  const [notifCount, setNotifCount] = useState(0);
  const { addToCart, itemCount }  = useCart();
  const bannerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadProducts();
    AsyncStorage.getItem('fitr_zip').then(z => { if (z) setZipCode(z); }).catch(() => {});
    Animated.timing(bannerAnim, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }).start();
  }, []);

  // Notification badge count
  useEffect(() => {
    let unsubSnap = null;
    const unsubAuth = onAuthStateChanged(auth, u => {
      if (unsubSnap) { unsubSnap(); unsubSnap = null; }
      if (!u) { setNotifCount(0); return; }
      const q = query(collection(db, 'users', u.uid, 'notifications'), where('read', '==', false));
      unsubSnap = onSnapshot(q, snap => {
        setNotifCount(snap.size);
      }, () => {});
    });
    return () => { unsubAuth(); if (unsubSnap) unsubSnap(); };
  }, []);

  async function loadProducts() {
    try {
      const q    = query(collection(db, 'products'), where('status', '==', 'active'));
      const snap = await getDocs(q);
      const loaded = [];
      snap.forEach(d => loaded.push(toAppProduct(d.id, d.data())));
      setProducts(loaded);
    } catch(e) {
      console.warn('Could not load products:', e.message);
    } finally {
      setLoading(false);
    }
  }

  function promptZip() {
    Alert.prompt(
      'Set your location',
      'Enter a zip code to see local availability',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (value) => {
            const zip = (value || '').replace(/\D/g, '').slice(0, 5);
            if (zip.length === 5) {
              setZipCode(zip);
              await AsyncStorage.setItem('fitr_zip', zip).catch(() => {});
            } else if (zip.length === 0) {
              setZipCode('');
              await AsyncStorage.removeItem('fitr_zip').catch(() => {});
            }
          },
        },
      ],
      'plain-text',
      zipCode,
      'number-pad'
    );
  }

  function handleAddToCart(product) {
    addToCart(product);
    Alert.alert('Added to cart', product.name, [{ text: 'OK' }], { cancelable: true });
  }

  const visibleProducts = activeCat === 'all'
    ? products
    : products.filter(p => p.cat === activeCat);

  return (
    <View style={s.container}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <View style={s.logoWrap}>
            <Image
              source={require('../assets/fitr-icon.png')}
              style={s.logoImg}
              resizeMode="contain"
            />
            <Text style={s.logoText}>FITR</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => navigation.navigate('NotifTab')}
            >
              <Ionicons name="notifications-outline" size={24} color={colors.text} />
              {notifCount > 0 && (
                <View style={s.cartBadge}>
                  <Text style={s.cartBadgeText}>{notifCount > 99 ? '99+' : notifCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => navigation.navigate('CartTab')}
            >
              <Ionicons name="cart-outline" size={26} color={colors.text} />
              {itemCount > 0 && (
                <View style={s.cartBadge}>
                  <Text style={s.cartBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <TouchableOpacity
          style={s.searchBar}
          onPress={() => navigation.navigate('SearchTab')}
          activeOpacity={0.8}
        >
          <Ionicons name="search-outline" size={18} color={colors.textDim} />
          <Text style={s.searchPlaceholder}>Search supplements, gear, apparel…</Text>
        </TouchableOpacity>

        {/* Shipping banner */}
        <Animated.View style={[s.shippingBanner, { opacity: bannerAnim }]}>
          <Ionicons name="checkmark-circle" size={13} color={colors.brand} />
          <Text style={s.shippingBannerText}>Free shipping on orders over $250</Text>
          {zipCode ? (
            <TouchableOpacity onPress={promptZip} style={s.deliveryChip}>
              <Ionicons name="location-outline" size={11} color={colors.brand} />
              <Text style={s.deliveryChipText}>{zipCode}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={promptZip} style={s.deliveryChip}>
              <Ionicons name="location-outline" size={11} color={colors.textDim} />
              <Text style={[s.deliveryChipText, { color: colors.textDim }]}>Set location</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={s.loadingText}>Loading products…</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Category pills */}
          <ScrollView
            horizontal showsHorizontalScrollIndicator={false}
            style={s.catScroll} contentContainerStyle={s.catContent}
          >
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.key}
                style={[s.catPill, activeCat === cat.key && s.catPillActive]}
                onPress={() => setActiveCat(cat.key)}
                activeOpacity={0.75}
              >
                <Text style={[s.catPillText, activeCat === cat.key && s.catPillTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* No products */}
          {products.length === 0 && (
            <View style={s.emptyWrap}>
              <Ionicons name="storefront-outline" size={56} color={colors.border} />
              <Text style={s.emptyTitle}>Products coming soon</Text>
              <Text style={s.emptySub}>Brands are setting up their stores. Check back shortly!</Text>
            </View>
          )}

          {/* All — product sections */}
          {activeCat === 'all' && SECTIONS.map(section => {
            const items = products.filter(section.filter);
            if (!items.length) return null;
            return (
              <View key={section.key} style={s.section}>
                <SectionHeader label={section.label} count={items.length} />
                <FlatList
                  data={items}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={item => String(item.id)}
                  renderItem={({ item }) => (
                    <ProductCard
                      product={item}
                      onPress={() => navigation.navigate('ProductDetail', { product: item })}
                      onAddToCart={handleAddToCart}
                    />
                  )}
                  contentContainerStyle={s.carouselPad}
                />
              </View>
            );
          })}

          {/* Single category */}
          {activeCat !== 'all' && (
            <View style={s.section}>
              <SectionHeader
                label={CATEGORIES.find(c => c.key === activeCat)?.label || ''}
                count={visibleProducts.length}
              />
              {visibleProducts.length === 0 ? (
                <Text style={s.emptyCategory}>No products in this category yet.</Text>
              ) : (
                <FlatList
                  data={visibleProducts}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={item => String(item.id)}
                  renderItem={({ item }) => (
                    <ProductCard
                      product={item}
                      onPress={() => navigation.navigate('ProductDetail', { product: item })}
                      onAddToCart={handleAddToCart}
                    />
                  )}
                  contentContainerStyle={s.carouselPad}
                />
              )}
            </View>
          )}

          <View style={{ height: sp.xl }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    paddingHorizontal: sp.md,
    paddingTop: 52,
    paddingBottom: sp.sm,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: sp.sm,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
  logoImg: { width: 32, height: 32, borderRadius: r.sm },
  logoText: { fontSize: 22, fontWeight: '900', letterSpacing: 3, color: colors.text },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: sp.sm },
  iconBtn: { padding: sp.xs, position: 'relative' },
  cartBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: colors.brand, borderRadius: r.full,
    minWidth: 17, height: 17,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  cartBadgeText: { color: '#080f18', fontSize: 10, fontWeight: '800' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgInput,
    borderRadius: r.md,
    paddingHorizontal: sp.md, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.border,
    gap: sp.sm,
  },
  searchPlaceholder: { color: colors.textDim, fontSize: 14, flex: 1 },

  shippingBanner: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  shippingBannerText: { fontSize: 12, color: colors.textMuted, flex: 1 },
  deliveryChip: {
    flexDirection: 'row', alignItems: 'center',
    gap: 3, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: colors.bgPanel,
    borderRadius: r.full, borderWidth: 1, borderColor: colors.border,
  },
  deliveryChipText: { fontSize: 11, fontWeight: '600', color: colors.brand },

  // Categories
  catScroll: { borderBottomWidth: 1, borderBottomColor: colors.border },
  catContent: { paddingHorizontal: sp.md, paddingVertical: 10, gap: sp.sm },
  catPill: {
    paddingHorizontal: sp.md, paddingVertical: 8,
    borderRadius: r.full,
    backgroundColor: colors.bgPanel,
    borderWidth: 1.5, borderColor: colors.border,
  },
  catPillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  catPillText: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  catPillTextActive: { color: '#080f18', fontWeight: '700' },

  // Sections
  section: {
    marginTop: sp.lg,
    backgroundColor: colors.bg,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: sp.md, marginBottom: sp.md,
  },
  sectionTitle: { ...type.sectionTitle },
  sectionCount: { fontSize: 13, color: colors.textDim },
  carouselPad: { paddingLeft: sp.md, paddingRight: sp.xs },

  // Loading / empty
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: sp.md },
  loadingText: { color: colors.textMuted, fontSize: 14 },
  emptyWrap: { alignItems: 'center', padding: sp.xxl, gap: sp.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyCategory: { color: colors.textMuted, fontSize: 14, paddingHorizontal: sp.md },
});
