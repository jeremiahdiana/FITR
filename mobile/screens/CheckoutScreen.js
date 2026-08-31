import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStripe } from '@stripe/stripe-react-native';
import { doc, getDoc } from 'firebase/firestore';
import { colors } from '../theme';
import { useCart } from '../hooks/useCart';
import { auth, db } from '../firebase';

const API_BASE = 'https://www.joinfitr.com';
const PAYMENT_INTENT_URL = `${API_BASE}/api/create-payment-intent`;

export default function CheckoutScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { cartItems, subtotal, fee, shipping, total, clearCart } = useCart();

  const [loading, setLoading] = useState(true);
  const [paymentReady, setPaymentReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const initialized = useRef(false);
  const clientSecretRef = useRef(null); // store so handlePay can extract PI ID

  const [address, setAddress] = useState({
    name: '', street: '', city: '', state: '', zip: '',
  });
  const [focusedField, setFocusedField] = useState(null);
  // Pre-fill address from user's saved billing address in Firestore
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      setAddress(prev => ({
        name:   prev.name || user.displayName || '',
        street: d.billing?.street || prev.street || '',
        city:   d.billing?.city   || prev.city   || '',
        state:  d.billing?.state  || prev.state  || '',
        zip:    d.billing?.zip    || prev.zip     || '',
      }));
    }).catch(() => {});
  }, []);

  const addressValid =
    address.name.trim().length > 0 &&
    address.street.trim().length > 0 &&
    address.city.trim().length > 0 &&
    address.state.trim().length > 0 &&
    address.zip.trim().length >= 5;

  const variantsValid = cartItems.every(item => {
    const variations = item.product.variations || [];
    if (!variations.length) return true;
    const selected = item.selectedVariants || {};
    return variations.every(v => v.name && selected[v.name]);
  });

  const initializePayment = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      const items = cartItems.map(item => ({
        id:      item.product.id,
        brandId: item.product.brandId || '',
        qty:     item.qty,
      }));

      // Get (or create) Stripe Customer + ephemeral key for saved payment methods
      let customerId = null;
      let ephemeralKeySecret = null;
      const user = auth.currentUser;
      if (user) {
        try {
          const idToken = await user.getIdToken();
          const custRes = await fetch(`${API_BASE}/api/stripe-customer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          });
          if (custRes.ok) {
            const custData = await custRes.json();
            customerId        = custData.customerId;
            ephemeralKeySecret = custData.ephemeralKeySecret;
          }
        } catch { /* non-fatal — payment still works without customer */ }
      }

      const res = await fetch(PAYMENT_INTENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, customerId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Could not initialize payment.');
      }

      // Store so handlePay can extract the payment intent ID
      clientSecretRef.current = data.clientSecret;

      const sheetParams = {
        paymentIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'FITR',
        appearance: {
          colors: {
            primary: '#00C9A7',
            background: '#ffffff',
            componentBackground: '#f7f8fa',
            componentBorder: '#d5d9d9',
            componentDivider: '#e3e6e8',
            primaryText: '#111111',
            secondaryText: '#555555',
            componentText: '#111111',
            placeholderText: '#aaaaaa',
            icon: '#00C9A7',
          },
        },
        defaultBillingDetails: {},
      };
      if (customerId && ephemeralKeySecret) {
        sheetParams.customerId             = customerId;
        sheetParams.customerEphemeralKeySecret = ephemeralKeySecret;
      }

      const { error } = await initPaymentSheet(sheetParams);

      if (error) {
        throw new Error(error.message);
      }

      setPaymentReady(true);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [cartItems, initPaymentSheet]);

  // Wait for cartItems to load from Firestore (onSnapshot is async),
  // then initialize payment exactly once.
  useEffect(() => {
    if (initialized.current) return;
    if (cartItems.length > 0) {
      initialized.current = true;
      initializePayment();
    }
  }, [cartItems]);

  // Safety fallback: if cart never loads after 5s, stop the spinner
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!initialized.current) setLoading(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  async function handlePay() {
    if (!paymentReady || !addressValid) return;

    const { error } = await presentPaymentSheet();

    if (error) {
      if (error.code !== 'Canceled') {
        Alert.alert('Payment Failed', error.message);
      }
      return;
    }

    // Extract the payment intent ID from the client secret (pi_xxx_secret_xxx → pi_xxx)
    const paymentIntentId = clientSecretRef.current?.split('_secret_')[0] || '';

    const user = auth.currentUser;
    const orderNum = 'FITR-' + Math.floor(100000 + Math.random() * 900000);

    // Route orders to each seller's brands/{uid}/orders via save-order API
    // (also writes to users/{uid}/orders for buyer's order history, triggers Stripe payouts)
    try {
      await fetch(`${API_BASE}/api/save-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber:            orderNum,
          stripePaymentIntentId:  paymentIntentId,
          // Expand items with per-unit variants into separate line items
          items: cartItems.flatMap(item => {
            const units = (item.variantsByUnit && item.variantsByUnit.length === item.qty)
              ? item.variantsByUnit
              : null;
            if (units) {
              // Group identical variant combos together to reduce line items
              const groups = {};
              units.forEach(sv => {
                const key = JSON.stringify(sv);
                if (!groups[key]) groups[key] = { sv, count: 0 };
                groups[key].count++;
              });
              return Object.values(groups).map(({ sv, count }) => ({
                id:               item.product.id,
                brandId:          item.product.brandId || '',
                name:             item.product.name,
                brand:            item.product.brand,
                price:            item.product.price,
                qty:              count,
                image:            item.product.img || '',
                selectedVariants: sv,
              }));
            }
            return [{
              id:               item.product.id,
              brandId:          item.product.brandId || '',
              name:             item.product.name,
              brand:            item.product.brand,
              price:            item.product.price,
              qty:              item.qty,
              image:            item.product.img || '',
              selectedVariants: item.selectedVariants || {},
            }];
          }),
          subtotal, fee, shipping, total,
          customerName: user?.displayName || user?.email || 'Mobile Customer',
          email:        user?.email || '',
          shippingAddress: {
            name:    address.name.trim(),
            address: address.street.trim(),
            city:    address.city.trim(),
            state:   address.state.trim().toUpperCase(),
            zip:     address.zip.trim(),
            country: 'United States',
          },
        }),
      });
    } catch(e) {
      console.warn('save-order API failed (non-fatal):', e.message);
    }

    clearCart().catch(() => {});
    navigation.replace('OrderConfirmed', { orderNum });
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
        <Text style={styles.loadingText}>Setting up secure checkout…</Text>
      </View>
    );
  }

  if (errorMsg) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>{errorMsg}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={initializePayment}>
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>← Back to Cart</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Cart</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Lock badge */}
        <View style={styles.secureBadge}>
          <Text style={styles.secureBadgeText}>🔒  Secure checkout powered by Stripe</Text>
        </View>

        {/* Shipping address */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Shipping Address</Text>
          {[
            { key: 'name',   label: 'Full Name',      placeholder: 'Jane Smith',       caps: 'words',      kb: 'default' },
            { key: 'street', label: 'Street Address',  placeholder: '123 Main St',      caps: 'words',      kb: 'default' },
            { key: 'city',   label: 'City',            placeholder: 'Miami',            caps: 'words',      kb: 'default' },
            { key: 'state',  label: 'State',           placeholder: 'FL',               caps: 'characters', kb: 'default' },
            { key: 'zip',    label: 'ZIP Code',        placeholder: '33101',            caps: 'none',       kb: 'numeric' },
          ].map(field => (
            <View key={field.key} style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>{field.label}</Text>
              <TextInput
                style={[styles.fieldInput, focusedField === field.key && styles.fieldInputFocused]}
                placeholder={field.placeholder}
                placeholderTextColor={colors.textDim}
                value={address[field.key]}
                onChangeText={v => setAddress(prev => ({ ...prev, [field.key]: v }))}
                onFocus={() => setFocusedField(field.key)}
                onBlur={() => setFocusedField(null)}
                autoCapitalize={field.caps}
                autoCorrect={false}
                keyboardType={field.kb}
                returnKeyType="next"
                maxLength={field.key === 'state' ? 2 : field.key === 'zip' ? 10 : 100}
              />
            </View>
          ))}
        </View>

        {/* Selected product options — read-only confirmation */}
        {cartItems.some(item => Object.keys(item.selectedVariants || {}).length > 0) && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Product Options</Text>
            {cartItems.map(item => {
              const sv = item.selectedVariants || {};
              const pairs = Object.entries(sv);
              if (!pairs.length) return null;
              return (
                <View key={item.cartId} style={styles.variantItem}>
                  <Text style={styles.variantItemName} numberOfLines={1}>{item.product.name}</Text>
                  <View style={styles.variantOptions}>
                    {pairs.map(([k, v]) => (
                      <View key={k} style={styles.variantBtnSelected}>
                        <Text style={styles.variantBtnTextSelected}>{k}: {v}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Order summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order Summary</Text>
          {cartItems.map(item => (
            <View key={item.cartId} style={styles.summaryRow}>
              <Text style={styles.summaryItemName} numberOfLines={1}>
                {item.product.name}{item.qty > 1 ? ` × ${item.qty}` : ''}
              </Text>
              <Text style={styles.summaryItemPrice}>
                ${(item.product.price * item.qty).toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Taxes, services & other fees</Text>
            <Text style={styles.summaryValue}>${fee.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Shipping</Text>
            <Text style={styles.summaryValue}>${shipping.toFixed(2)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
        </View>

        {/* Legal disclosure */}
        <Text style={styles.legal}>
          By placing this order you agree to FITR's Terms of Service and Privacy Policy.
          Taxes, services & other fees are included in your order total. Items may be returned within
          14 days of delivery (unopened). Shipping $7.99 (free over $250).
        </Text>

      </ScrollView>

      {/* Pay button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.payBtn, (!paymentReady || !addressValid || !variantsValid) && styles.payBtnDisabled]}
          onPress={handlePay}
          disabled={!paymentReady || !addressValid || !variantsValid}
        >
          <Text style={styles.payBtnText}>🔒  Pay ${total.toFixed(2)}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  centered: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  loadingText: { color: colors.textMuted, fontSize: 14, marginTop: 16 },
  errorIcon: { fontSize: 40, marginBottom: 12 },
  errorText: { color: '#ff6b6b', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  retryBtn: {
    backgroundColor: colors.brand, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 32, marginBottom: 12,
  },
  retryText: { color: colors.bg, fontWeight: '800', fontSize: 15 },
  backLink: { padding: 8 },
  backLinkText: { color: colors.textMuted, fontSize: 14 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 60 },
  backBtnText: { color: colors.brand, fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },

  scroll: { padding: 20, paddingBottom: 40 },

  secureBadge: {
    backgroundColor: '#e8faf7',
    borderWidth: 1, borderColor: '#00C9A755',
    borderRadius: 10, padding: 10,
    alignItems: 'center', marginBottom: 20,
  },
  secureBadgeText: { color: colors.brand, fontSize: 13, fontWeight: '600' },

  sectionCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16, fontWeight: '800', color: colors.text,
    marginBottom: 14,
  },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 12, fontWeight: '600', color: colors.textMuted,
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  fieldInput: {
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.text,
  },
  fieldInputFocused: {
    borderColor: colors.brand,
  },

  summaryCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 16, fontWeight: '800', color: colors.text,
    marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  summaryItemName: { color: colors.text, fontSize: 13, flex: 1, marginRight: 12 },
  summaryItemPrice: { color: colors.text, fontSize: 13, fontWeight: '600' },
  divider: {
    height: 1, backgroundColor: colors.border,
    marginVertical: 12,
  },
  summaryLabel: { color: colors.textMuted, fontSize: 14 },
  summaryValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  totalRow: {
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: 12, marginTop: 4, marginBottom: 0,
  },
  totalLabel: { color: colors.text, fontSize: 16, fontWeight: '800' },
  totalValue: { color: colors.brand, fontSize: 20, fontWeight: '900' },

  legal: {
    fontSize: 11, color: colors.textDim,
    lineHeight: 18, textAlign: 'center',
  },

  variantItem: { marginBottom: 16 },
  variantItemName: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 10 },
  variantGroup: { marginBottom: 10 },
  variantGroupLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  variantRequired: { color: '#e63946' },
  variantOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  variantBtn: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14,
    backgroundColor: colors.bg,
  },
  variantBtnSelected: { borderColor: colors.brand, backgroundColor: colors.brand + '15' },
  variantBtnText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  variantBtnTextSelected: { color: colors.brand },

  footer: {
    padding: 16, paddingBottom: 36,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  payBtn: {
    backgroundColor: colors.brand,
    borderRadius: 14, paddingVertical: 18,
    alignItems: 'center',
  },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { color: colors.bg, fontWeight: '900', fontSize: 17 },
});
