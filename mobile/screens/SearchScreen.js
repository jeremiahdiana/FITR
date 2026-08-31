import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, ScrollView,
  TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Ionicons } from '@expo/vector-icons';
import { colors, sp, r } from '../theme';
import { useCart } from '../hooks/useCart';
import ProductCard from '../components/ProductCard';

const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'deals',    label: 'Deals' },
  { key: 'new',      label: 'New' },
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

function toAppProduct(id, p) {
  const hasDiscount = p.comparePrice && parseFloat(p.comparePrice) > parseFloat(p.price);
  const now = Date.now();
  const createdMs = p.createdAt?.seconds ? p.createdAt.seconds * 1000 : 0;
  const isNew = createdMs > now - 30 * 24 * 60 * 60 * 1000;
  return {
    id,
    name:     p.name || '',
    brand:    p.brandName || 'FITR Seller',
    brandId:  p.brandId || '',
    price:    parseFloat(p.price || 0),
    old:      hasDiscount ? parseFloat(p.comparePrice) : null,
    img:      p.imageUrl || '',
    emoji:    emojiFor(p.category),
    cat:      catMap(p.category),
    badge:    hasDiscount ? 'SALE' : null,
    isNew,
    rating:   5,
    reviews:  '0',
    stock:    p.stock ?? 999,
    description: p.description || '',
    category: p.category || '',
    productId: p.productId || id,
  };
}

export default function SearchScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [queryText, setQueryText]   = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [products, setProducts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const { addToCart }               = useCart();

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const q    = query(collection(db, 'products'), where('status', '==', 'active'));
      const snap = await getDocs(q);
      const loaded = [];
      snap.forEach(d => loaded.push(toAppProduct(d.id, d.data())));
      setProducts(loaded);
    } catch (e) {
      console.warn('Search: could not load products:', e.message);
    } finally {
      setLoading(false);
    }
  }

  const results = useMemo(() => {
    let list = [...products];
    if (activeFilter === 'deals') list = list.filter(p => p.badge === 'SALE');
    else if (activeFilter === 'new') list = list.filter(p => p.isNew);
    else if (activeFilter !== 'all') list = list.filter(p => p.cat === activeFilter);

    if (queryText.trim()) {
      const q = queryText.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)
      );
    }
    return list;
  }, [queryText, activeFilter, products]);

  function handleAddToCart(product) {
    addToCart(product);
    Alert.alert('Added!', `${product.name} added to cart.`, [{ text: 'OK' }]);
  }

  return (
    <View style={styles.container}>
      {/* Search input */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.inputWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textDim} />
          <TextInput
            style={styles.input}
            placeholder="Search supplements, gear, brands…"
            placeholderTextColor={colors.textDim}
            value={queryText}
            onChangeText={setQueryText}
            autoFocus
            returnKeyType="search"
          />
          {queryText.length > 0 && (
            <TouchableOpacity onPress={() => setQueryText('')}>
              <Ionicons name="close-circle" size={18} color={colors.textDim} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filters}
        contentContainerStyle={styles.filtersContent}
      >
        {FILTERS.map(item => (
          <TouchableOpacity
            key={item.key}
            style={[styles.chip, activeFilter === item.key && styles.chipActive]}
            onPress={() => setActiveFilter(item.key)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, activeFilter === item.key && styles.chipTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        <>
          <Text style={styles.resultsCount}>{results.length} products</Text>

          <FlatList
            data={results}
            keyExtractor={item => String(item.id)}
            numColumns={2}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={48} color={colors.border} />
                <Text style={styles.emptyText}>No products found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.cardWrap}>
                <ProductCard
                  product={item}
                  onPress={p => navigation.navigate('ProductDetail', { product: p })}
                  onAddToCart={handleAddToCart}
                />
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 8,
  },
  searchIcon: { fontSize: 14 },
  input: { flex: 1, color: colors.text, fontSize: 15 },
  clearBtn: { color: colors.textMuted, fontSize: 14, paddingHorizontal: 4 },

  filters: { borderBottomWidth: 1, borderBottomColor: colors.border, flexGrow: 0 },
  filtersContent: { paddingHorizontal: sp.md, paddingVertical: 10, gap: sp.sm, alignItems: 'center' },
  chip: {
    paddingHorizontal: sp.md,
    paddingVertical: 8,
    borderRadius: r.full,
    backgroundColor: colors.bgPanel,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#080f18', fontWeight: '700' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  resultsCount: {
    color: colors.textMuted,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  grid: { paddingHorizontal: sp.md, paddingBottom: sp.xl },
  row: { justifyContent: 'space-between', marginBottom: sp.md },
  cardWrap: { flex: 1, maxWidth: 200 },

  empty: { alignItems: 'center', paddingTop: 60, gap: sp.md },
  emptyText: { color: colors.textMuted, fontSize: 15 },
});
