import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, FlatList, Image,
  TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, getDocs, getDoc, query, where, limit,
  onSnapshot, setDoc, deleteDoc, updateDoc, doc, orderBy,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { colors, sp, r, shadow } from '../theme';
import { useCart } from '../hooks/useCart';
import { auth, db } from '../firebase';
import ProductCard from '../components/ProductCard';

const TABS = [
  { key: 'cart',         label: 'Cart' },
  { key: 'lists',        label: 'Lists' },
  { key: 'buyAgain',     label: 'Buy Again' },
  { key: 'keepShopping', label: 'Keep Shopping For' },
];

export default function CartScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const {
    cartItems, itemCount, subtotal, fee, shipping, total,
    updateQty, removeFromCart, addToCart, isLoggedIn,
  } = useCart();

  const [activeTab, setActiveTab]         = useState('cart');
  const [uid, setUid]                     = useState(auth.currentUser?.uid ?? null);
  const [savedItems, setSavedItems]       = useState([]);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [buyAgainItems, setBuyAgainItems] = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [suggested, setSuggested]         = useState([]);

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
    return unsub;
  }, []);

  // Save for Later — real-time Firestore
  useEffect(() => {
    if (!uid) { setSavedItems([]); return; }
    const unsub = onSnapshot(
      collection(db, 'users', uid, 'savedForLater'),
      snap => setSavedItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return unsub;
  }, [uid]);

  // Lists (wishlist) — real-time Firestore
  useEffect(() => {
    if (!uid) { setWishlistItems([]); return; }
    const unsub = onSnapshot(
      collection(db, 'users', uid, 'wishlist'),
      snap => setWishlistItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    return unsub;
  }, [uid]);

  // Buy Again — past order items
  useEffect(() => {
    if (!uid) { setBuyAgainItems([]); return; }
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'users', uid, 'orders'), orderBy('createdAt', 'desc'), limit(10))
        );
        const seen = new Set();
        const items = [];
        snap.docs.forEach(d => {
          (d.data().items || []).forEach(item => {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              items.push(item);
            }
          });
        });
        setBuyAgainItems(items.slice(0, 20));
      } catch(e) {}
    })();
  }, [uid]);

  // Recently viewed — AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem('fitr_recently_viewed').then(raw => {
      if (raw) setRecentlyViewed(JSON.parse(raw));
    }).catch(() => {});
  }, []);

  // Suggested products — load once
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'products'), where('status', '==', 'active'), limit(30))
        );
        const cartIds = new Set(cartItems.map(i => String(i.product.id)));
        const all = snap.docs
          .map(d => {
            const p = d.data();
            return {
              id:      d.id,
              name:    p.name || '',
              brand:   p.brandName || 'FITR',
              brandId: p.brandId || '',
              price:   parseFloat(p.price || 0),
              old:     p.comparePrice ? parseFloat(p.comparePrice) : null,
              img:     p.imageUrl || '',
              cat:     p.category || '',
              stock:   p.stock ?? 999,
              rating:  p.rating || 5,
              reviews: p.reviewCount ? String(p.reviewCount) : '0',
            };
          })
          .filter(p => !cartIds.has(String(p.id)) && p.price > 0);
        setSuggested(all);
      } catch(e) {}
    })();
  }, []);

  // ── Actions ──────────────────────────────────────────────
  async function saveForLater(cartItem) {
    if (!uid) return;
    try {
      await setDoc(doc(db, 'users', uid, 'savedForLater', String(cartItem.cartId)), {
        productId: cartItem.product.id,
        name:      cartItem.product.name,
        brand:     cartItem.product.brand,
        brandId:   cartItem.product.brandId || '',
        price:     cartItem.product.price,
        img:       cartItem.product.img || '',
        cat:       cartItem.product.cat || '',
        savedAt:   new Date(),
      });
      removeFromCart(cartItem.cartId);
    } catch(e) {
      Alert.alert('Error', 'Could not save item. Please try again.');
    }
  }

  async function moveToCart(savedItem) {
    if (!uid) return;
    try {
      await addToCart({
        id:      savedItem.productId || savedItem.id,
        name:    savedItem.name,
        brand:   savedItem.brand,
        brandId: savedItem.brandId || '',
        price:   savedItem.price,
        img:     savedItem.img || '',
        cat:     savedItem.cat || '',
        rating:  savedItem.rating || 0,
        reviews: savedItem.reviews || '0',
      });
      await deleteDoc(doc(db, 'users', uid, 'savedForLater', String(savedItem.productId || savedItem.id)));
    } catch(e) {
      Alert.alert('Error', 'Could not move item to cart. Please try again.');
    }
  }

  async function removeSaved(savedItem) {
    if (!uid) return;
    await deleteDoc(doc(db, 'users', uid, 'savedForLater', String(savedItem.productId || savedItem.id)));
  }

  function confirmRemove(cartId, name) {
    Alert.alert('Remove item?', `Remove "${name}" from your cart?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFromCart(cartId) },
    ]);
  }

  function handleAddToCart(product) {
    addToCart(product);
    Alert.alert('Added to cart', product.name, [{ text: 'OK' }], { cancelable: true });
  }

  function goToProduct(product) {
    navigation.navigate('HomeTab', { screen: 'ProductDetail', params: { product } });
  }

  // ── Guest state ───────────────────────────────────────────
  if (!isLoggedIn) {
    return (
      <View style={s.guest}>
        <Ionicons name="cart-outline" size={56} color={colors.border} />
        <Text style={s.guestTitle}>Sign in to view your cart</Text>
        <Text style={s.guestSub}>Your cart saves across all your devices once you're signed in.</Text>
        <TouchableOpacity style={s.guestBtn} onPress={() => navigation.navigate('Login')}>
          <Text style={s.guestBtnText}>Log In</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.guestBtnSecondary} onPress={() => navigation.navigate('Signup')}>
          <Text style={s.guestBtnSecondaryText}>Create Account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Derived data ──────────────────────────────────────────
  const cartCats = new Set(cartItems.map(i => i.product.cat));
  const related  = suggested.filter(p => cartCats.has(p.cat)).slice(0, 10);
  const topPicks = suggested.filter(p => !cartCats.has(p.cat)).slice(0, 10);
  const freeShipping = subtotal >= 250;

  const [checkingOut, setCheckingOut] = useState(false);
  // { cartId: [{varName: value}, ...] } — per-unit variant selections
  const [itemVariations, setItemVariations] = useState({}); // { cartId: [{name,options}] }

  // Fetch authoritative variations from Firestore once per unique set of cart items
  const cartKey = cartItems.map(i => i.cartId).join(',');
  useEffect(() => {
    if (!cartItems.length) return;
    Promise.all(cartItems.map(async item => {
      try {
        const snap = await getDoc(doc(db, 'products', String(item.product.id)));
        return [item.cartId, snap.exists() ? (snap.data().variations || []) : []];
      } catch { return [item.cartId, item.product.variations || []]; }
    })).then(entries => setItemVariations(Object.fromEntries(entries)));
  }, [cartKey]);

  // Update one unit's variant selection and persist to Firestore
  async function updateUnitVariant(cartId, unitIndex, varName, value) {
    if (!uid) return;
    const item = cartItems.find(i => i.cartId === cartId);
    if (!item) return;
    const base = item.selectedVariants || {};
    const existing = item.variantsByUnit && item.variantsByUnit.length === item.qty
      ? item.variantsByUnit
      : Array.from({ length: item.qty }, () => ({ ...base }));
    const updated = existing.map((u, idx) => idx === unitIndex ? { ...u, [varName]: value } : u);
    await updateDoc(doc(db, 'users', uid, 'cart', cartId), {
      variantsByUnit: updated,
      selectedVariants: updated[0],
    }).catch(() => {});
  }

  function unitNeedsVariants(unitSV, variations) {
    return variations.some(v => !unitSV[v.name]);
  }

  function itemNeedsVariants(item, variations) {
    if (!variations.length) return false;
    const units = (item.variantsByUnit && item.variantsByUnit.length === item.qty)
      ? item.variantsByUnit
      : Array.from({ length: item.qty }, () => item.selectedVariants || {});
    return units.some(u => unitNeedsVariants(u, variations));
  }

  // Quick local check for warning banner (uses cached Firestore variations)
  const anyMissingVariants = cartItems.some(item => {
    const vars = itemVariations[item.cartId] || item.product.variations || [];
    return itemNeedsVariants(item, vars);
  });

  async function handleCheckout() {
    if (checkingOut) return;
    setCheckingOut(true);
    try {
      // Re-fetch variations from Firestore for authoritative check
      const checks = await Promise.all(cartItems.map(async item => {
        try {
          const snap = await getDoc(doc(db, 'products', String(item.product.id)));
          const variations = snap.exists() ? (snap.data().variations || []) : [];
          return { item, variations };
        } catch {
          return { item, variations: itemVariations[item.cartId] || item.product.variations || [] };
        }
      }));

      const missing = checks.filter(({ item, variations }) => itemNeedsVariants(item, variations));
      if (missing.length > 0) {
        const names = missing.map(({ item }) => item.product.name).join(', ');
        Alert.alert(
          'Options Required',
          `Select all options for:\n\n${names}\n\nEach unit needs its own selection.`,
          [{ text: 'OK' }]
        );
        return;
      }
      navigation.navigate('Checkout');
    } finally {
      setCheckingOut(false);
    }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <View style={s.container}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Text style={s.headerTitle}>Cart</Text>
        {activeTab === 'cart' && itemCount > 0 && (
          <Text style={s.headerCount}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
        )}
      </View>

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.tabBar}
        contentContainerStyle={s.tabBarContent}
      >
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[s.tab, activeTab === tab.key && s.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.75}
          >
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── CART TAB ── */}
      {activeTab === 'cart' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

          {/* Checkout button — top */}
          {cartItems.length > 0 && (
            <View style={s.checkoutBlock}>
              {anyMissingVariants && (
                <View style={s.variantWarningBanner}>
                  <Text style={s.variantWarningText}>
                    ⚠ Some items need options selected (e.g. size) before you can checkout. Tap the item to choose.
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={[s.checkoutBtn, checkingOut && s.checkoutBtnDisabled]}
                onPress={handleCheckout}
                activeOpacity={0.85}
                disabled={checkingOut}
              >
                {checkingOut
                  ? <ActivityIndicator size="small" color={colors.bg} />
                  : <>
                      <Ionicons name="lock-closed" size={15} color={colors.bg} />
                      <Text style={s.checkoutText}>Checkout · ${total.toFixed(2)}</Text>
                    </>
                }
              </TouchableOpacity>
              {!freeShipping && (
                <Text style={s.shippingNudge}>
                  Add ${(250 - subtotal).toFixed(2)} more for free shipping
                </Text>
              )}
              {freeShipping && (
                <Text style={s.shippingFree}>
                  Free shipping applied
                </Text>
              )}
            </View>
          )}

          {/* Empty cart */}
          {cartItems.length === 0 && (
            <View style={s.emptyWrap}>
              <Ionicons name="cart-outline" size={56} color={colors.border} />
              <Text style={s.emptyTitle}>Your cart is empty</Text>
              <Text style={s.emptySub}>Add some products to get started</Text>
              <TouchableOpacity style={s.shopBtn} onPress={() => navigation.navigate('HomeTab')}>
                <Text style={s.shopBtnText}>Shop Now</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Cart items */}
          {cartItems.map(item => {
            const variations = itemVariations[item.cartId] || item.product.variations || [];
            const hasVariations = variations.length > 0;
            const base = item.selectedVariants || {};
            const unitVariants = (item.variantsByUnit && item.variantsByUnit.length === item.qty)
              ? item.variantsByUnit
              : Array.from({ length: item.qty }, () => ({ ...base }));
            const needsAny = hasVariations && unitVariants.some(u => unitNeedsVariants(u, variations));

            return (
              <View key={item.cartId} style={s.cartItem}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('HomeTab', { screen: 'ProductDetail', params: { product: item.product } })}
                >
                  <Image
                    source={{ uri: item.product.img }}
                    style={s.itemImage}
                    resizeMode="contain"
                  />
                </TouchableOpacity>
                <View style={s.itemInfo}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('HomeTab', { screen: 'ProductDetail', params: { product: item.product } })}
                  >
                    <Text style={s.itemBrand}>{item.product.brand}</Text>
                    <Text style={s.itemName} numberOfLines={2}>{item.product.name}</Text>
                    <Text style={s.itemPrice}>${item.product.price.toFixed(2)}</Text>
                  </TouchableOpacity>

                  {/* Per-unit variant selectors */}
                  {hasVariations && unitVariants.map((unitSV, unitIdx) => {
                    const missing = unitNeedsVariants(unitSV, variations);
                    return (
                      <View key={unitIdx} style={s.unitBlock}>
                        <Text style={[s.unitLabel, missing && { color: '#f59e0b' }]}>
                          {item.qty > 1 ? `Unit ${unitIdx + 1}` : 'Options'}
                          {missing ? ' ⚠ Required' : ''}
                        </Text>
                        {variations.map(v => (
                          <View key={v.name} style={s.unitVarGroup}>
                            <Text style={s.unitVarName}>{v.name}:</Text>
                            <View style={s.unitVarOptions}>
                              {(v.options || []).filter(o => o.value).map(o => {
                                const isSel = unitSV[v.name] === o.value;
                                return (
                                  <TouchableOpacity
                                    key={o.value}
                                    style={[s.unitVarBtn, isSel && s.unitVarBtnSel]}
                                    onPress={() => updateUnitVariant(item.cartId, unitIdx, v.name, o.value)}
                                  >
                                    <Text style={[s.unitVarBtnText, isSel && s.unitVarBtnTextSel]}>
                                      {o.value}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })}

                  {/* Warning if any unit still needs variants */}
                  {needsAny && (
                    <Text style={s.variantNeeded}>⚠ Select options for all units above</Text>
                  )}

                  <View style={s.qtyRow}>
                    <TouchableOpacity
                      style={s.qtyBtn}
                      onPress={() => updateQty(item.cartId, item.qty - 1)}
                    >
                      <Text style={s.qtyBtnText}>−</Text>
                    </TouchableOpacity>
                    <Text style={s.qty}>{item.qty}</Text>
                    <TouchableOpacity
                      style={s.qtyBtn}
                      onPress={() => updateQty(item.cartId, item.qty + 1)}
                    >
                      <Text style={s.qtyBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.itemActions}>
                    <TouchableOpacity onPress={() => saveForLater(item)}>
                      <Text style={s.actionLink}>Save for later</Text>
                    </TouchableOpacity>
                    <Text style={s.actionDivider}>|</Text>
                    <TouchableOpacity onPress={() => confirmRemove(item.cartId, item.product.name)}>
                      <Text style={s.actionRemove}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}

          {/* Order summary */}
          {cartItems.length > 0 && (
            <View style={s.summary}>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Subtotal ({itemCount} item{itemCount !== 1 ? 's' : ''})</Text>
                <Text style={s.summaryValue}>${subtotal.toFixed(2)}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Taxes, services &amp; other fees</Text>
                <Text style={s.summaryValue}>${fee.toFixed(2)}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Shipping</Text>
                <Text style={[s.summaryValue, freeShipping && { color: colors.brand }]}>
                  {freeShipping ? 'FREE' : '$7.99'}
                </Text>
              </View>
              <View style={[s.summaryRow, s.totalRow]}>
                <Text style={s.totalLabel}>Estimated Total</Text>
                <Text style={s.totalValue}>${total.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {/* Saved for Later */}
          {savedItems.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Saved for Later ({savedItems.length})</Text>
              {savedItems.map(item => (
                <View key={item.id} style={s.savedItem}>
                  <Image
                    source={{ uri: item.img }}
                    style={s.savedImage}
                    resizeMode="contain"
                  />
                  <View style={s.itemInfo}>
                    <Text style={s.itemBrand}>{item.brand}</Text>
                    <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
                    <Text style={s.itemPrice}>${item.price?.toFixed(2)}</Text>
                    <View style={s.itemActions}>
                      <TouchableOpacity onPress={() => moveToCart(item)}>
                        <Text style={s.actionLink}>Move to Cart</Text>
                      </TouchableOpacity>
                      <Text style={s.actionDivider}>|</Text>
                      <TouchableOpacity onPress={() => removeSaved(item)}>
                        <Text style={s.actionRemove}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Related Products */}
          {related.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Related Products</Text>
              <FlatList
                data={related}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => String(item.id)}
                renderItem={({ item }) => (
                  <ProductCard
                    product={item}
                    onPress={() => goToProduct(item)}
                    onAddToCart={handleAddToCart}
                  />
                )}
                contentContainerStyle={s.carouselPad}
              />
            </View>
          )}

          {/* Top Picks */}
          {topPicks.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Top Picks For You</Text>
              <FlatList
                data={topPicks}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => String(item.id)}
                renderItem={({ item }) => (
                  <ProductCard
                    product={item}
                    onPress={() => goToProduct(item)}
                    onAddToCart={handleAddToCart}
                  />
                )}
                contentContainerStyle={s.carouselPad}
              />
            </View>
          )}

          <View style={{ height: sp.xl }} />
        </ScrollView>
      )}

      {/* ── LISTS TAB ── */}
      {activeTab === 'lists' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <Text style={s.tabHeading}>Your Lists</Text>
          {wishlistItems.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="heart-outline" size={56} color={colors.border} />
              <Text style={s.emptyTitle}>No saved items yet</Text>
              <Text style={s.emptySub}>Tap the heart on any product to save it to your list</Text>
            </View>
          ) : (
            wishlistItems.map(item => (
              <View key={item.id} style={s.savedItem}>
                <Image source={{ uri: item.img }} style={s.savedImage} resizeMode="contain" />
                <View style={s.itemInfo}>
                  <Text style={s.itemBrand}>{item.brand}</Text>
                  <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
                  <Text style={s.itemPrice}>${item.price?.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={s.addToCartSmall}
                    onPress={() => {
                      addToCart({
                        id:      item.productId || item.id,
                        name:    item.name,
                        brand:   item.brand,
                        brandId: item.brandId || '',
                        price:   item.price,
                        img:     item.img || '',
                        cat:     item.cat || '',
                        rating:  item.rating || 0,
                        reviews: item.reviews || '0',
                      });
                      Alert.alert('Added to cart', item.name, [{ text: 'OK' }], { cancelable: true });
                    }}
                  >
                    <Text style={s.addToCartSmallText}>Add to Cart</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <View style={{ height: sp.xl }} />
        </ScrollView>
      )}

      {/* ── BUY AGAIN TAB ── */}
      {activeTab === 'buyAgain' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <Text style={s.tabHeading}>Buy Again</Text>
          {buyAgainItems.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="refresh-outline" size={56} color={colors.border} />
              <Text style={s.emptyTitle}>No past orders yet</Text>
              <Text style={s.emptySub}>Items from your order history will appear here</Text>
            </View>
          ) : (
            buyAgainItems.map((item, idx) => (
              <View key={String(item.id) + idx} style={s.savedItem}>
                <Image source={{ uri: item.image || '' }} style={s.savedImage} resizeMode="contain" />
                <View style={s.itemInfo}>
                  <Text style={s.itemBrand}>{item.brand}</Text>
                  <Text style={s.itemName} numberOfLines={2}>{item.name}</Text>
                  <Text style={s.itemPrice}>${item.price?.toFixed(2)}</Text>
                  <TouchableOpacity
                    style={s.addToCartSmall}
                    onPress={() => {
                      addToCart({
                        id:      item.id,
                        name:    item.name,
                        brand:   item.brand,
                        brandId: item.brandId || '',
                        price:   item.price,
                        img:     item.image || '',
                        cat:     '',
                        rating:  0,
                        reviews: '0',
                      });
                      Alert.alert('Added to cart', item.name, [{ text: 'OK' }], { cancelable: true });
                    }}
                  >
                    <Text style={s.addToCartSmallText}>Buy Again</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          <View style={{ height: sp.xl }} />
        </ScrollView>
      )}

      {/* ── KEEP SHOPPING FOR TAB ── */}
      {activeTab === 'keepShopping' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
          <Text style={s.tabHeading}>Keep Shopping For</Text>

          {recentlyViewed.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Recently Viewed</Text>
              <FlatList
                data={recentlyViewed}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => String(item.id)}
                renderItem={({ item }) => (
                  <ProductCard
                    product={item}
                    onPress={() => goToProduct(item)}
                    onAddToCart={handleAddToCart}
                  />
                )}
                contentContainerStyle={s.carouselPad}
              />
            </View>
          )}

          {suggested.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>More to Explore</Text>
              <FlatList
                data={suggested.slice(0, 15)}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => String(item.id)}
                renderItem={({ item }) => (
                  <ProductCard
                    product={item}
                    onPress={() => goToProduct(item)}
                    onAddToCart={handleAddToCart}
                  />
                )}
                contentContainerStyle={s.carouselPad}
              />
            </View>
          )}

          {recentlyViewed.length === 0 && suggested.length === 0 && (
            <View style={s.emptyWrap}>
              <Ionicons name="search-outline" size={56} color={colors.border} />
              <Text style={s.emptyTitle}>Nothing here yet</Text>
              <Text style={s.emptySub}>Browse products to see recommendations</Text>
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
    paddingBottom: sp.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  headerCount: { color: colors.textMuted, fontSize: 14, marginBottom: 2 },

  // Tabs
  tabBar: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexGrow: 0,
    flexShrink: 0,
  },
  tabBarContent: {
    paddingHorizontal: sp.sm,
    paddingTop: 2,
  },
  tab: {
    paddingHorizontal: sp.md,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.brand,
  },
  tabText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  tabTextActive: { color: colors.brand, fontWeight: '700' },

  scroll: { paddingBottom: sp.xl },

  // Checkout block
  checkoutBlock: {
    padding: sp.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: sp.xs,
  },
  checkoutBtn: {
    backgroundColor: colors.brand,
    borderRadius: r.md,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: sp.sm,
  },
  checkoutText: { color: colors.bg, fontWeight: '900', fontSize: 17 },
  checkoutBtnDisabled: { opacity: 0.55 },
  shippingNudge: { color: colors.textMuted, fontSize: 12, textAlign: 'center' },
  shippingFree: { color: colors.brand, fontSize: 12, textAlign: 'center', fontWeight: '600' },
  variantWarningBanner: {
    backgroundColor: '#fff8e1',
    borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: '#f59e0b40',
    marginBottom: 8,
  },
  variantWarningText: { color: '#92400e', fontSize: 12, lineHeight: 18 },
  variantTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4, marginTop: 2 },
  variantTag: {
    backgroundColor: colors.brand + '15', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.brand + '40',
  },
  variantTagText: { fontSize: 11, fontWeight: '600', color: colors.brand },
  variantNeeded: { color: '#f59e0b', fontSize: 11, fontWeight: '600', marginBottom: 4, marginTop: 2 },

  unitBlock: {
    marginTop: 8, padding: 8, borderRadius: 8,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
  },
  unitLabel: { fontSize: 10, fontWeight: '800', color: colors.brand, letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  unitVarGroup: { marginBottom: 6 },
  unitVarName: { fontSize: 11, fontWeight: '600', color: colors.textMuted, marginBottom: 4 },
  unitVarOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  unitVarBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.bgPanel,
  },
  unitVarBtnSel: { borderColor: colors.brand, backgroundColor: colors.brand + '15' },
  unitVarBtnText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  unitVarBtnTextSel: { color: colors.brand },

  // Cart item
  cartItem: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: sp.md,
    paddingVertical: sp.md,
    gap: sp.md,
  },
  itemImage: {
    width: 90,
    height: 90,
    borderRadius: r.sm,
    backgroundColor: colors.bgPanel,
  },
  itemInfo: { flex: 1, gap: 4 },
  itemBrand: {
    fontSize: 10,
    color: colors.brand,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  itemName: { fontSize: 14, fontWeight: '600', color: colors.text, lineHeight: 19 },
  itemPrice: { fontSize: 16, fontWeight: '800', color: colors.text },

  // Qty controls
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: sp.sm, marginTop: 2 },
  qtyBtn: {
    width: 30,
    height: 30,
    borderRadius: r.sm,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnText: { color: colors.text, fontSize: 18, fontWeight: '700', lineHeight: 22 },
  qty: { color: colors.text, fontSize: 15, fontWeight: '700', minWidth: 22, textAlign: 'center' },

  // Item action links (Save for later, Remove)
  itemActions: { flexDirection: 'row', alignItems: 'center', gap: sp.sm, marginTop: 4 },
  actionLink: { color: colors.brand, fontSize: 13, fontWeight: '600' },
  actionDivider: { color: colors.border, fontSize: 14 },
  actionRemove: { color: colors.sale, fontSize: 13, fontWeight: '600' },

  // Summary
  summary: {
    marginHorizontal: sp.md,
    marginVertical: sp.md,
    backgroundColor: colors.bgPanel,
    borderRadius: r.md,
    padding: sp.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { color: colors.textMuted, fontSize: 14 },
  summaryValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 4,
  },
  totalLabel: { color: colors.text, fontSize: 16, fontWeight: '800' },
  totalValue: { color: colors.brand, fontSize: 18, fontWeight: '900' },

  // Sections
  section: { marginTop: sp.lg },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
    paddingHorizontal: sp.md,
    marginBottom: sp.sm,
  },
  carouselPad: { paddingLeft: sp.md, paddingRight: sp.xs },

  // Saved / wishlist / buy-again rows
  savedItem: {
    flexDirection: 'row',
    paddingHorizontal: sp.md,
    paddingVertical: sp.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: sp.md,
  },
  savedImage: {
    width: 80,
    height: 80,
    borderRadius: r.sm,
    backgroundColor: colors.bgPanel,
  },

  // Small add-to-cart button (Lists / Buy Again)
  addToCartSmall: {
    marginTop: sp.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.brand,
    borderRadius: r.sm,
    paddingHorizontal: sp.md,
    paddingVertical: 7,
  },
  addToCartSmallText: { color: colors.bg, fontWeight: '700', fontSize: 13 },

  // Tab heading
  tabHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    paddingHorizontal: sp.md,
    paddingTop: sp.md,
    paddingBottom: sp.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: sp.sm,
  },

  // Empty states
  emptyWrap: {
    alignItems: 'center',
    padding: sp.xxl,
    gap: sp.sm,
    marginTop: sp.lg,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  shopBtn: {
    marginTop: sp.sm,
    backgroundColor: colors.brand,
    borderRadius: r.md,
    paddingHorizontal: sp.xl,
    paddingVertical: 13,
  },
  shopBtnText: { color: colors.bg, fontWeight: '800', fontSize: 15 },

  // Guest
  guest: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: sp.xl,
    gap: sp.sm,
  },
  guestTitle: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  guestSub: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: sp.md },
  guestBtn: {
    width: '100%',
    backgroundColor: colors.brand,
    borderRadius: r.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  guestBtnText: { color: colors.bg, fontWeight: '800', fontSize: 16 },
  guestBtnSecondary: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: r.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  guestBtnSecondaryText: { color: colors.text, fontWeight: '700', fontSize: 16 },
});
