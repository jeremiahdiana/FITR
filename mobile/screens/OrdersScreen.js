import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ScrollView,
  TouchableOpacity, ActivityIndicator, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { colors } from '../theme';

const STATUS_COLORS = {
  processing: { bg: '#fff8e1', text: '#f59e0b' },
  shipped:    { bg: '#e8f4fd', text: '#3b82f6' },
  delivered:  { bg: '#e8faf7', text: '#00C9A7' },
  canceled:   { bg: '#fff0f0', text: '#e63946' },
  cancelled:  { bg: '#fff0f0', text: '#e63946' },
  refunded:   { bg: '#fff0f0', text: '#e63946' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || { bg: colors.bgPanel, text: colors.textMuted };
  return (
    <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
      <Text style={[styles.statusText, { color: s.text }]}>
        {(status || 'processing').toUpperCase()}
      </Text>
    </View>
  );
}

function formatDate(ts) {
  if (!ts) return '';
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function OrdersScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uid, setUid]             = useState(auth.currentUser?.uid ?? null);
  const [expandedId, setExpandedId] = useState(null);
  const [suggested, setSuggested] = useState([]);
  const highlightOrderNumber = route?.params?.orderNumber || null;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    loadOrders(uid);
  }, [uid]);

  useEffect(() => {
    loadSuggested();
  }, []);

  async function loadOrders(userId) {
    setLoading(true);
    try {
      const q    = query(collection(db, 'users', userId, 'orders'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setOrders(loaded);
      // Auto-expand the order that was tapped in notifications
      if (highlightOrderNumber) {
        const match = loaded.find(o => o.orderNumber === highlightOrderNumber);
        if (match) setExpandedId(match.id);
      }
    } catch (e) {
      console.warn('Could not load orders:', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSuggested() {
    try {
      const snap = await getDocs(query(collection(db, 'products'), limit(10)));
      setSuggested(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { /* silent */ }
  }

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  if (!uid) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyIcon}>📦</Text>
        <Text style={styles.emptyTitle}>Sign in to view orders</Text>
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
        <Text style={styles.loadingText}>Loading orders…</Text>
      </View>
    );
  }

  const renderOrder = ({ item: order }) => {
    const expanded = expandedId === order.id;
    const addr = order.shippingAddress || {};
    const addrLine = [addr.address || addr.street, addr.city, addr.state, addr.zip]
      .filter(Boolean).join(', ');

    return (
      <TouchableOpacity
        style={styles.orderCard}
        onPress={() => toggleExpand(order.id)}
        activeOpacity={0.85}
      >
        {/* Header row */}
        <View style={styles.orderCardHeader}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.orderNumber}>
              {order.orderNumber || `#${order.id.slice(0, 8).toUpperCase()}`}
            </Text>
            <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <StatusBadge status={order.status} />
            <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
          </View>
        </View>

        {/* Collapsed: quick summary */}
        {!expanded && (
          <View>
            {(order.items || []).slice(0, 2).map((line, i) => (
              <View key={i} style={styles.lineItem}>
                <Text style={styles.lineItemDot}>•</Text>
                <Text style={styles.lineItemName} numberOfLines={1}>
                  {line.name}{line.qty > 1 ? ` × ${line.qty}` : ''}
                </Text>
                <Text style={styles.lineItemPrice}>${(line.price * line.qty).toFixed(2)}</Text>
              </View>
            ))}
            {(order.items || []).length > 2 && (
              <Text style={styles.moreItems}>+{order.items.length - 2} more item{order.items.length - 2 > 1 ? 's' : ''} — tap to view</Text>
            )}
            <View style={styles.orderCardFooter}>
              <Text style={styles.orderTotal}>
                Total: <Text style={styles.orderTotalAmount}>${(order.total || 0).toFixed(2)}</Text>
              </Text>
            </View>
          </View>
        )}

        {/* Expanded: full details */}
        {expanded && (
          <View>
            <Divider />

            {/* Items */}
            <Text style={styles.sectionLabel}>Items Ordered</Text>
            {(order.items || []).map((line, i) => {
              const variants = line.selectedVariants ? Object.entries(line.selectedVariants) : [];
              return (
                <View key={i} style={styles.expandedItem}>
                  <View style={styles.expandedItemRow}>
                    <Text style={styles.expandedItemName} numberOfLines={2}>
                      {line.name}{line.qty > 1 ? ` × ${line.qty}` : ''}
                    </Text>
                    <Text style={styles.expandedItemPrice}>${(line.price * line.qty).toFixed(2)}</Text>
                  </View>
                  {line.brand ? <Text style={styles.expandedItemBrand}>{line.brand}</Text> : null}
                  {variants.length > 0 && (
                    <View style={styles.variantTags}>
                      {variants.map(([k, v]) => (
                        <View key={k} style={styles.variantTag}>
                          <Text style={styles.variantTagText}>{k}: {v}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            <Divider />

            {/* Shipping address */}
            {addrLine ? (
              <View style={styles.detailSection}>
                <Text style={styles.sectionLabel}>Shipping Address</Text>
                {addr.name ? <Text style={styles.detailText}>{addr.name}</Text> : null}
                <Text style={styles.detailText}>{addrLine}</Text>
              </View>
            ) : null}

            <Divider />

            {/* Totals */}
            <Text style={styles.sectionLabel}>Order Summary</Text>
            <View style={styles.totalsBox}>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalVal}>${(order.subtotal || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Taxes, services & other fees</Text>
                <Text style={styles.totalVal}>${(order.fee || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Shipping</Text>
                <Text style={styles.totalVal}>${(order.shipping || 0).toFixed(2)}</Text>
              </View>
              <View style={[styles.totalRow, styles.grandRow]}>
                <Text style={styles.grandLabel}>Total</Text>
                <Text style={styles.grandVal}>${(order.total || 0).toFixed(2)}</Text>
              </View>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const ListFooter = () => (
    <View style={styles.suggestedWrap}>
      <Text style={styles.suggestedTitle}>More items you'd like</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestedRow}>
        {suggested.map(p => (
          <TouchableOpacity
            key={p.id}
            style={styles.suggestedCard}
            onPress={() => navigation.navigate('Main', {
              screen: 'HomeTab',
              params: {
                screen: 'ProductDetail',
                params: {
                  product: {
                    id:    p.id,
                    name:  p.name || '',
                    brand: p.brandName || 'FITR Brand',
                    price: parseFloat(p.price || 0),
                    img:   p.imageUrl || '',
                    stock: p.stock ?? 999,
                  },
                },
              },
            })}
          >
            {p.imageUrl || (p.images && p.images[0]) ? (
              <Image
                source={{ uri: p.imageUrl || p.images[0] }}
                style={styles.suggestedImg}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.suggestedImg, styles.suggestedImgPlaceholder]}>
                <Text style={{ fontSize: 28 }}>📦</Text>
              </View>
            )}
            <Text style={styles.suggestedName} numberOfLines={2}>{p.name}</Text>
            <Text style={styles.suggestedPrice}>${(p.price || 0).toFixed(2)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Orders</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={orders}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={suggested.length > 0 ? <ListFooter /> : null}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🛍</Text>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySub}>Your order history will appear here.</Text>
            <TouchableOpacity style={styles.shopBtn} onPress={() => navigation.navigate('Main')}>
              <Text style={styles.shopBtnText}>Start Shopping</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={renderOrder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingText: { color: colors.textMuted, fontSize: 14, marginTop: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backBtnText: { color: colors.brand, fontSize: 28, fontWeight: '300', lineHeight: 30 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },

  list: { padding: 16, paddingBottom: 40 },

  orderCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 16,
  },
  orderCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12,
  },
  orderNumber: { fontSize: 14, fontWeight: '800', color: colors.text },
  orderDate:   { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  chevron:     { fontSize: 10, color: colors.textDim },

  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:  { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  lineItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  lineItemDot:   { color: colors.textMuted, fontSize: 14, marginRight: 6 },
  lineItemName:  { color: colors.text, fontSize: 13, flex: 1 },
  lineItemPrice: { color: colors.text, fontSize: 13, fontWeight: '600', marginLeft: 8 },
  moreItems:     { color: colors.brand, fontSize: 12, marginBottom: 6 },

  orderCardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.border, marginTop: 10, paddingTop: 10,
  },
  orderTotal:       { color: colors.textMuted, fontSize: 13 },
  orderTotalAmount: { color: colors.brand, fontWeight: '900', fontSize: 15 },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: 14 },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
    textTransform: 'uppercase', color: colors.textMuted, marginBottom: 10,
  },

  expandedItem: {
    backgroundColor: colors.bg, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
    padding: 12, marginBottom: 8,
  },
  expandedItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  expandedItemName:  { fontSize: 13, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 },
  expandedItemPrice: { fontSize: 13, fontWeight: '700', color: colors.text },
  expandedItemBrand: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  variantTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  variantTag:  { backgroundColor: colors.brand + '15', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.brand + '40' },
  variantTagText: { fontSize: 11, fontWeight: '600', color: colors.brand },

  detailSection: { marginBottom: 4 },
  detailText: { fontSize: 13, color: colors.text, marginBottom: 3, lineHeight: 20 },

  totalsBox: { backgroundColor: colors.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12 },
  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  totalLabel:{ fontSize: 13, color: colors.textMuted },
  totalVal:  { fontSize: 13, fontWeight: '600', color: colors.text },
  grandRow:  { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, marginTop: 4, marginBottom: 0 },
  grandLabel:{ fontSize: 15, fontWeight: '800', color: colors.text },
  grandVal:  { fontSize: 16, fontWeight: '900', color: colors.brand },

  suggestedWrap: { marginTop: 8, marginBottom: 8 },
  suggestedTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 12 },
  suggestedRow:   { gap: 12, paddingRight: 16 },
  suggestedCard: {
    width: 130, backgroundColor: colors.bgPanel,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  suggestedImg: { width: '100%', height: 110 },
  suggestedImgPlaceholder: { backgroundColor: colors.bgPanel, alignItems: 'center', justifyContent: 'center' },
  suggestedName:  { fontSize: 12, fontWeight: '600', color: colors.text, padding: 8, paddingBottom: 2, lineHeight: 16 },
  suggestedPrice: { fontSize: 12, fontWeight: '800', color: colors.brand, paddingHorizontal: 8, paddingBottom: 10 },

  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  emptySub:   { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  shopBtn: { marginTop: 8, backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  shopBtnText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
  signInBtn: { marginTop: 20, backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  signInBtnText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
});
