import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, FlatList,
  TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebase';
import { colors, sp, r, shadow } from '../theme';
import { useCart } from '../hooks/useCart';
import ProductCard from '../components/ProductCard';

function catMap(c) {
  const s = (c || '').toLowerCase();
  if (s.match(/supplement|protein|pre.?workout|creatine|vitamin|hydration/)) return 'supps';
  if (s.match(/equipment|accessory|accessories/)) return 'gear';
  if (s.match(/apparel/)) return 'apparel';
  if (s.match(/recovery/)) return 'recovery';
  return 'supps';
}

export default function BrandScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { brandId, brandName } = route.params || {};

  const [brand, setBrand]       = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);

  const { addToCart } = useCart();

  useEffect(() => {
    if (!brandId) { setLoading(false); return; }
    Promise.all([loadBrand(), loadProducts()]).finally(() => setLoading(false));
  }, [brandId]);

  async function loadBrand() {
    try {
      const snap = await getDoc(doc(db, 'brands', brandId));
      if (snap.exists()) setBrand(snap.data());
    } catch(e) {}
  }

  async function loadProducts() {
    try {
      const snap = await getDocs(
        query(collection(db, 'products'), where('brandId', '==', brandId), where('status', '==', 'active'))
      );
      const loaded = snap.docs.map(d => {
        const p = d.data();
        const hasDiscount = p.comparePrice && parseFloat(p.comparePrice) > parseFloat(p.price);
        return {
          id:      d.id,
          name:    p.name || '',
          brand:   p.brandName || brandName || 'FITR Brand',
          brandId: p.brandId || brandId,
          price:   parseFloat(p.price || 0),
          old:     hasDiscount ? parseFloat(p.comparePrice) : null,
          img:     p.imageUrl || '',
          cat:     catMap(p.category),
          badge:   hasDiscount ? 'SALE' : null,
          stock:   p.stock ?? 999,
          rating:  p.rating || 5,
          reviews: p.reviewCount ? String(p.reviewCount) : '0',
          description: p.description || '',
          category: p.category || '',
        };
      });
      setProducts(loaded);
    } catch(e) {}
  }

  function handleAddToCart(product) {
    addToCart(product);
    Alert.alert('Added to cart', product.name, [{ text: 'OK' }], { cancelable: true });
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  const displayName = brand?.brandName || brandName || 'Brand';

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{displayName}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Brand hero */}
        <View style={s.hero}>
          <View style={s.avatarWrap}>
            {brand?.logoUrl ? (
              <Image
                source={{ uri: brand.logoUrl }}
                style={s.avatar}
                resizeMode="cover"
              />
            ) : (
              <View style={s.avatarPlaceholder}>
                <Text style={s.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <Text style={s.brandName}>{displayName}</Text>
          <View style={s.verifiedRow}>
            <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
            <Text style={s.verified}>FITR Verified Seller</Text>
          </View>
          {brand?.bio ? (
            <Text style={s.bio}>{brand.bio}</Text>
          ) : null}
        </View>

        {/* Products */}
        <View style={s.productsSection}>
          <Text style={s.sectionTitle}>
            {products.length > 0 ? `${products.length} Product${products.length !== 1 ? 's' : ''}` : 'No products yet'}
          </Text>
          {products.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="storefront-outline" size={48} color={colors.border} />
              <Text style={s.emptyText}>Products coming soon</Text>
            </View>
          ) : (
            <FlatList
              data={products}
              numColumns={2}
              keyExtractor={item => String(item.id)}
              scrollEnabled={false}
              columnWrapperStyle={s.grid}
              renderItem={({ item }) => (
                <ProductCard
                  product={item}
                  onPress={() => navigation.navigate('ProductDetail', { product: item })}
                  onAddToCart={handleAddToCart}
                />
              )}
              contentContainerStyle={s.gridContent}
            />
          )}
        </View>

        <View style={{ height: sp.xl }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: sp.md,
    paddingBottom: sp.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: sp.xs },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text, flex: 1, textAlign: 'center' },

  hero: {
    alignItems: 'center',
    paddingVertical: sp.xl,
    paddingHorizontal: sp.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: sp.sm,
  },
  avatarWrap: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: colors.brand,
    overflow: 'hidden',
    marginBottom: sp.xs,
    ...shadow.card,
  },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#080f18', fontSize: 36, fontWeight: '900' },
  brandName: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: -0.3 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verified: { fontSize: 13, color: colors.brand, fontWeight: '600' },
  bio: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21, maxWidth: 300 },

  productsSection: { padding: sp.md },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: sp.md,
    letterSpacing: -0.2,
  },
  grid: { justifyContent: 'space-between', marginBottom: sp.sm },
  gridContent: { gap: sp.sm },

  emptyWrap: { alignItems: 'center', padding: sp.xl, gap: sp.sm },
  emptyText: { color: colors.textMuted, fontSize: 14 },
});
