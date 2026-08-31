import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc,
  query, orderBy, limit, serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { colors } from '../theme';
import { useCart } from '../hooks/useCart';

function starsStr(n) {
  const s = Math.max(0, Math.min(5, Math.round(n)));
  return '★'.repeat(s) + '☆'.repeat(5 - s);
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProductDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const passedProduct = route.params?.product;
  const productId = passedProduct?.id || passedProduct?.productId;

  const [product, setProduct] = useState(passedProduct || null);
  const [brand, setBrand]     = useState(null);
  const [reviews, setReviews] = useState([]);
  const [avgRating, setAvgRating] = useState(5);
  const [loadingProduct, setLoadingProduct] = useState(!passedProduct);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [selectedRating, setSelectedRating] = useState(0);
  const [reviewText, setReviewText]   = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [isWishlisted, setIsWishlisted]       = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  const { addToCart } = useCart();
  const [selectedVariants, setSelectedVariants] = useState({});

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setCurrentUser(u);
      if (u && productId) loadWishlistStatus(u.uid, productId);
    });
    return unsub;
  }, [productId]);

  // Track recently viewed in AsyncStorage
  useEffect(() => {
    if (!product) return;
    const entry = {
      id:      product.id,
      name:    product.name,
      brand:   product.brand,
      brandId: product.brandId || '',
      price:   product.price,
      old:     product.old || null,
      img:     product.img || '',
      cat:     product.cat || product.category || '',
      stock:   product.stock ?? 999,
      rating:  product.rating || 5,
      reviews: String(product.reviews || '0'),
    };
    AsyncStorage.getItem('fitr_recently_viewed').then(raw => {
      const prev = raw ? JSON.parse(raw) : [];
      const filtered = prev.filter(p => String(p.id) !== String(entry.id));
      const updated = [entry, ...filtered].slice(0, 10);
      AsyncStorage.setItem('fitr_recently_viewed', JSON.stringify(updated)).catch(() => {});
    }).catch(() => {});
  }, [product?.id]);

  // Load full product from Firestore if not already loaded
  useEffect(() => {
    if (!productId) return;
    Promise.all([
      loadProduct(),
      loadReviews(),
    ]);
  }, [productId]);

  // Load brand when product has brandId
  useEffect(() => {
    if (product?.brandId) loadBrand(product.brandId);
  }, [product?.brandId]);

  async function loadProduct() {
    if (passedProduct && !setLoadingProduct) return;
    try {
      const snap = await getDoc(doc(db, 'products', productId));
      if (snap.exists()) {
        const p = snap.data();
        setProduct({
          id:          snap.id,
          name:        p.name || '',
          brand:       p.brandName || 'FITR Seller',
          brandId:     p.brandId || '',
          price:       parseFloat(p.price || 0),
          old:         p.comparePrice ? parseFloat(p.comparePrice) : null,
          img:         p.imageUrl || '',
          cat:         p.category || '',
          description: p.description || '',
          stock:       p.stock ?? 999,
          category:    p.category || '',
          variations:  Array.isArray(p.variations) ? p.variations : [],
        });
      }
    } catch(e) {
      console.warn('Product load error:', e.message);
    } finally {
      setLoadingProduct(false);
    }
  }

  async function loadWishlistStatus(uid, pid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'wishlist', pid));
      setIsWishlisted(snap.exists());
    } catch(e) { /* silent */ }
  }

  async function toggleWishlist() {
    if (!currentUser) { navigation.navigate('Login'); return; }
    if (wishlistLoading) return;
    setWishlistLoading(true);
    try {
      const ref = doc(db, 'users', currentUser.uid, 'wishlist', productId);
      if (isWishlisted) {
        await deleteDoc(ref);
        setIsWishlisted(false);
      } else {
        await setDoc(ref, {
          productId: product.id,
          name:      product.name,
          brand:     product.brand,
          brandId:   product.brandId || '',
          price:     product.price,
          img:       product.img || '',
          category:  product.category || '',
          addedAt:   serverTimestamp(),
        });
        setIsWishlisted(true);
      }
    } catch(e) {
      Alert.alert('Error', 'Could not update wishlist. Please try again.');
    } finally {
      setWishlistLoading(false);
    }
  }

  async function loadBrand(brandId) {
    try {
      const snap = await getDoc(doc(db, 'brands', brandId));
      if (snap.exists()) setBrand(snap.data());
    } catch(e) { /* silent */ }
  }

  async function loadReviews() {
    setLoadingReviews(true);
    try {
      const q    = query(collection(db, 'products', productId, 'reviews'), orderBy('createdAt', 'desc'), limit(50));
      const snap = await getDocs(q);
      const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setReviews(loaded);
      if (loaded.length) {
        const avg = loaded.reduce((s, r) => s + (r.rating || 5), 0) / loaded.length;
        setAvgRating(avg);
      }
      // Check if current user already reviewed
      const uid = auth.currentUser?.uid;
      if (uid) setAlreadyReviewed(snap.docs.some(d => d.data().uid === uid));
    } catch(e) {
      console.warn('Reviews load error:', e.message);
    } finally {
      setLoadingReviews(false);
    }
  }

  function handleAddToCart() {
    if (!product) return;
    const variations = product.variations || [];
    if (variations.length > 0) {
      const missing = variations.filter(v => !selectedVariants[v.name]);
      if (missing.length > 0) {
        Alert.alert('Select Options', `Please select: ${missing.map(v => v.name).join(', ')}`);
        return;
      }
    }
    addToCart({
      id:         product.id,
      name:       product.name,
      brand:      product.brand,
      brandId:    product.brandId,
      price:      product.price,
      img:        product.img || '',
      cat:        product.cat || '',
      variations: product.variations || [],
    }, selectedVariants);
    Alert.alert('Added to cart!', `${product.name} is in your cart.`, [
      { text: 'Continue Shopping', style: 'cancel' },
      { text: 'View Cart', onPress: () => navigation.navigate('CartTab') },
    ]);
  }

  async function handleSubmitReview() {
    if (!selectedRating) { Alert.alert('Select a star rating first.'); return; }
    if (!currentUser)    { Alert.alert('Sign in to leave a review.'); return; }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'products', productId, 'reviews'), {
        uid:             currentUser.uid,
        displayName:     currentUser.displayName || currentUser.email?.split('@')[0] || 'Customer',
        rating:          selectedRating,
        text:            reviewText.replace(/[<>"]/g, '').trim(),
        createdAt:       serverTimestamp(),
        verifiedPurchase: false,
      });
      setReviewText('');
      setSelectedRating(0);
      setAlreadyReviewed(true);
      Alert.alert('Review submitted!', 'Thank you for your feedback.');
      await loadReviews();
    } catch(e) {
      Alert.alert('Error', 'Could not submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingProduct) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Product not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const discount = product.old && product.old > product.price
    ? Math.round(((product.old - product.price) / product.old) * 100)
    : null;

  const stockStatus = product.stock === 0
    ? { text: '✗ Out of Stock', color: '#ef4444' }
    : product.stock <= 10
    ? { text: `⚠ Only ${product.stock} left`, color: '#f59e0b' }
    : { text: '✓ In Stock', color: '#22c55e' };

  const bullets = (product.description || '')
    .split(/\n+|;\s*/)
    .map(s => s.trim().replace(/^[-•·]\s*/, ''))
    .filter(s => s.length > 2);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Back + Wishlist header row */}
        <View style={[styles.topRow, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.wishlistBtn, isWishlisted && styles.wishlistBtnActive]}
            onPress={toggleWishlist}
            disabled={wishlistLoading}
          >
            <Text style={[styles.wishlistBtnText, isWishlisted && styles.wishlistBtnTextActive]}>
              {isWishlisted ? '♥' : '♡'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Image */}
        <View style={styles.imageWrap}>
          {product.img ? (
            <Image source={{ uri: product.img }} style={styles.image} resizeMode="cover" />
          ) : (
            <Text style={styles.emojiPlaceholder}>📦</Text>
          )}
          {discount && (
            <View style={styles.saleBadge}>
              <Text style={styles.saleBadgeText}>SAVE {discount}%</Text>
            </View>
          )}
        </View>

        <View style={styles.details}>
          {/* Brand */}
          <Text style={styles.brandLabel}>{product.brand}</Text>
          <Text style={styles.productName}>{product.name}</Text>

          {/* Rating */}
          <View style={styles.ratingRow}>
            <Text style={styles.stars}>{starsStr(avgRating)}</Text>
            <Text style={styles.ratingNum}>{avgRating.toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({reviews.length} review{reviews.length !== 1 ? 's' : ''})</Text>
          </View>

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={styles.price}>${product.price.toFixed(2)}</Text>
            {product.old && (
              <Text style={styles.oldPrice}>${product.old.toFixed(2)}</Text>
            )}
          </View>

          {/* Stock */}
          <Text style={[styles.stock, { color: stockStatus.color }]}>{stockStatus.text}</Text>

          {/* Variant selectors */}
          {(product.variations || []).length > 0 && (
            <View style={styles.variantsSection}>
              {product.variations.map(v => (
                <View key={v.name} style={styles.variantGroup}>
                  <Text style={styles.variantLabel}>
                    {v.name}
                    {!selectedVariants[v.name] && (
                      <Text style={styles.variantRequired}> * required</Text>
                    )}
                  </Text>
                  <View style={styles.variantOptions}>
                    {(v.options || []).filter(o => o.value).map(o => {
                      const isSel = selectedVariants[v.name] === o.value;
                      return (
                        <TouchableOpacity
                          key={o.value}
                          style={[styles.variantBtn, isSel && styles.variantBtnSelected]}
                          onPress={() => setSelectedVariants(prev => ({ ...prev, [v.name]: o.value }))}
                        >
                          <Text style={[styles.variantBtnText, isSel && styles.variantBtnTextSelected]}>
                            {o.value}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Fee note */}
          <View style={styles.feeNote}>
            <Text style={styles.feeText}>
              Taxes, services &amp; other fees + $7.99 shipping applied at checkout.
            </Text>
          </View>

          {/* Description bullets */}
          {bullets.length > 0 && (
            <View style={styles.aboutSection}>
              <Text style={styles.sectionTitle}>About This Product</Text>
              {bullets.map((b, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Category tag */}
          {product.category ? (
            <View style={styles.catTag}>
              <Text style={styles.catTagText}>{product.category.toUpperCase()}</Text>
            </View>
          ) : null}

          {/* Brand section */}
          {brand && (
            <View style={styles.brandSection}>
              <Text style={styles.sectionTitle}>About the Brand</Text>
              <TouchableOpacity
                style={styles.brandCard}
                onPress={() => navigation.navigate('Brand', {
                  brandId: product.brandId,
                  brandName: brand.brandName || product.brand,
                })}
                activeOpacity={0.8}
              >
                <View style={styles.brandAvatar}>
                  {brand.logoUrl ? (
                    <Image
                      source={{ uri: brand.logoUrl }}
                      style={{ width: '100%', height: '100%', borderRadius: 24 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.brandAvatarText}>
                      {(brand.brandName || 'B').charAt(0).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={styles.brandInfo}>
                  <Text style={styles.brandName}>{brand.brandName || 'Brand'}</Text>
                  <Text style={styles.brandVerified}>✓ FITR Verified Seller</Text>
                  {brand.bio ? <Text style={styles.brandBio}>{brand.bio}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
              </TouchableOpacity>
            </View>
          )}

          {/* REVIEWS */}
          <View style={styles.reviewsSection}>
            <Text style={styles.sectionTitle}>Customer Reviews</Text>

            {loadingReviews ? (
              <ActivityIndicator size="small" color={colors.brand} style={{ marginVertical: 16 }} />
            ) : reviews.length === 0 ? (
              <Text style={styles.noReviews}>No reviews yet — be the first!</Text>
            ) : (
              reviews.map(r => (
                <View key={r.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <View style={styles.reviewAvatar}>
                      <Text style={styles.reviewAvatarText}>
                        {(r.displayName || 'C').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewAuthor}>{r.displayName || 'Customer'}</Text>
                      <Text style={styles.reviewDate}>{fmtDate(r.createdAt)}</Text>
                    </View>
                  </View>
                  <Text style={styles.reviewStars}>{starsStr(r.rating || 5)}</Text>
                  {r.text ? <Text style={styles.reviewText}>{r.text}</Text> : null}
                  {r.verifiedPurchase && (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>✓ Verified Purchase</Text>
                    </View>
                  )}
                </View>
              ))
            )}

            {/* Review form */}
            {!currentUser ? (
              <TouchableOpacity style={styles.loginPrompt} onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginPromptText}>Sign in to leave a review →</Text>
              </TouchableOpacity>
            ) : alreadyReviewed ? (
              <View style={styles.alreadyReviewed}>
                <Text style={styles.alreadyReviewedText}>✓ You've already reviewed this product.</Text>
              </View>
            ) : (
              <View style={styles.reviewForm}>
                <Text style={styles.reviewFormTitle}>Write a Review</Text>
                <View style={styles.starPicker}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setSelectedRating(star)}
                      style={styles.starBtn}
                    >
                      <Text style={[styles.starBtnText, selectedRating >= star && styles.starActive]}>
                        ★
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.reviewInput}
                  placeholder="Share your experience…"
                  placeholderTextColor={colors.textDim}
                  value={reviewText}
                  onChangeText={setReviewText}
                  multiline
                  maxLength={1000}
                />
                <TouchableOpacity
                  style={[styles.submitBtn, (submitting || !selectedRating) && styles.submitBtnDisabled]}
                  onPress={handleSubmitReview}
                  disabled={submitting || !selectedRating}
                >
                  <Text style={styles.submitBtnText}>
                    {submitting ? 'Submitting…' : 'Submit Review'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sticky footer */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerPriceLabel}>Price</Text>
          <Text style={styles.footerPrice}>${product.price.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, product.stock === 0 && styles.addBtnDisabled]}
          onPress={handleAddToCart}
          disabled={product.stock === 0}
        >
          <Text style={styles.addBtnText}>
            {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
          </Text>
        </TouchableOpacity>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: colors.textMuted, fontSize: 16, marginBottom: 16 },

  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 4,
  },
  backBtn: { padding: 0 },
  backText: { color: colors.brand, fontSize: 15, fontWeight: '600' },

  wishlistBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e3e6e8',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  wishlistBtnActive: { backgroundColor: '#fff5f5', borderColor: '#e63946' },
  wishlistBtnText:   { fontSize: 20, color: '#ccc' },
  wishlistBtnTextActive: { color: '#e63946' },

  imageWrap: { width: '100%', height: 300, backgroundColor: '#f0f2f5', position: 'relative' },
  image: { width: '100%', height: '100%' },
  emojiPlaceholder: { fontSize: 80, textAlign: 'center', lineHeight: 300 },
  saleBadge: {
    position: 'absolute', top: 16, left: 16,
    backgroundColor: '#e63946', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  saleBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  details: { padding: 20 },

  brandLabel: { fontSize: 12, color: colors.brand, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  productName: { fontSize: 24, fontWeight: '800', color: colors.text, lineHeight: 30, marginBottom: 12 },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  stars: { color: '#f59e0b', fontSize: 16 },
  ratingNum: { fontSize: 14, fontWeight: '700', color: colors.text },
  reviewCount: { fontSize: 13, color: colors.brand },

  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  price: { fontSize: 30, fontWeight: '900', color: colors.text },
  oldPrice: { fontSize: 16, color: colors.textMuted, textDecorationLine: 'line-through' },

  stock: { fontSize: 13, fontWeight: '600', marginBottom: 14 },

  variantsSection: { marginBottom: 16 },
  variantGroup: { marginBottom: 14 },
  variantLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 8 },
  variantRequired: { color: '#e63946', fontWeight: '600' },
  variantOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  variantBtn: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.bgPanel,
  },
  variantBtnSelected: { borderColor: colors.brand, backgroundColor: colors.brand + '15' },
  variantBtnText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  variantBtnTextSelected: { color: colors.brand },

  feeNote: { backgroundColor: colors.bgPanel, borderRadius: 8, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: colors.border },
  feeText: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12 },

  aboutSection: { marginBottom: 20 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  bulletDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.brand, marginTop: 6, flexShrink: 0 },
  bulletText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, flex: 1 },

  catTag: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.borderLight, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 20 },
  catTagText: { color: colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1 },

  brandSection: { marginBottom: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border },
  brandCard: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  brandAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  brandAvatarText: { color: colors.bg, fontSize: 20, fontWeight: '900' },
  brandInfo: { flex: 1 },
  brandName: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 2 },
  brandVerified: { fontSize: 12, color: colors.brand, fontWeight: '600', marginBottom: 6 },
  brandBio: { fontSize: 13, color: colors.textMuted, lineHeight: 20 },

  reviewsSection: { paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border },
  noReviews: { color: colors.textMuted, fontSize: 14, marginBottom: 20 },
  reviewCard: { backgroundColor: colors.bgPanel, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#00C9A720', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reviewAvatarText: { color: colors.brand, fontSize: 14, fontWeight: '800' },
  reviewAuthor: { fontSize: 13, fontWeight: '700', color: colors.text },
  reviewDate: { fontSize: 11, color: colors.textMuted },
  reviewStars: { color: '#f59e0b', fontSize: 15, marginBottom: 6 },
  reviewText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  verifiedBadge: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#00C9A715', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  verifiedText: { fontSize: 11, color: colors.brand, fontWeight: '700' },

  loginPrompt: { backgroundColor: colors.bgPanel, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginTop: 12 },
  loginPromptText: { color: colors.brand, fontSize: 14, fontWeight: '700' },
  alreadyReviewed: { backgroundColor: '#00C9A715', borderRadius: 10, padding: 14, marginTop: 12 },
  alreadyReviewedText: { color: colors.brand, fontSize: 14, fontWeight: '600' },

  reviewForm: { marginTop: 20, backgroundColor: colors.bgPanel, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: colors.border },
  reviewFormTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 14 },
  starPicker: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  starBtn: { padding: 2 },
  starBtnText: { fontSize: 32, color: '#ddd' },
  starActive: { color: '#f59e0b' },
  reviewInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12,
    fontSize: 14, color: colors.text, minHeight: 88, textAlignVertical: 'top', marginBottom: 12,
  },
  submitBtn: { backgroundColor: colors.text, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: colors.bg, fontWeight: '800', fontSize: 15 },

  footer: {
    flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 32,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg, gap: 16,
  },
  footerPriceLabel: { color: colors.textMuted, fontSize: 11 },
  footerPrice: { color: colors.text, fontSize: 22, fontWeight: '900' },
  addBtn: { flex: 1, backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  addBtnDisabled: { backgroundColor: colors.border },
  addBtnText: { color: colors.bg, fontWeight: '800', fontSize: 16 },
});
