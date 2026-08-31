import React, { useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity,
  StyleSheet, Animated, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, sp, r, shadow, type } from '../theme';

const CARD_WIDTH = 176;
const IMAGE_SIZE = CARD_WIDTH; // 1:1

function StarRow({ rating = 5, reviews = '0' }) {
  const filled = Math.round(rating);
  return (
    <View style={s.starRow}>
      <View style={s.starsWrap}>
        {[1,2,3,4,5].map(i => (
          <Ionicons
            key={i}
            name={i <= filled ? 'star' : 'star-outline'}
            size={11}
            color={i <= filled ? colors.star : colors.border}
          />
        ))}
      </View>
      <Text style={s.reviewCount}>({reviews})</Text>
    </View>
  );
}

export default function ProductCard({ product, onPress, onAddToCart }) {
  const btnScale = useRef(new Animated.Value(1)).current;

  const discount = product.old && product.old > product.price
    ? Math.round(((product.old - product.price) / product.old) * 100)
    : null;

  const lowStock = product.stock > 0 && product.stock <= 5;

  function pressIn() {
    Animated.spring(btnScale, { toValue: 0.94, useNativeDriver: true, speed: 30 }).start();
  }
  function pressOut() {
    Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
  }

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => onPress(product)}
      activeOpacity={0.95}
    >
      {/* Image */}
      <View style={s.imageWrap}>
        {product.img ? (
          <Image
            source={{ uri: product.img }}
            style={s.image}
            resizeMode="cover"
          />
        ) : (
          <View style={s.imagePlaceholder}>
            <Ionicons name="image-outline" size={32} color={colors.border} />
          </View>
        )}

        {/* Discount badge — top right */}
        {discount !== null && (
          <View style={s.discountBadge}>
            <Text style={s.discountText}>-{discount}%</Text>
          </View>
        )}

        {/* Low stock badge — top left */}
        {lowStock && (
          <View style={s.stockBadge}>
            <Text style={s.stockText}>Only {product.stock} left</Text>
          </View>
        )}

        {/* New badge */}
        {product.isNew && !discount && !lowStock && (
          <View style={s.newBadge}>
            <Text style={s.newBadgeText}>New</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={s.info}>
        {/* Brand + verified */}
        <View style={s.brandRow}>
          <Text style={s.brandText} numberOfLines={1}>{product.brand}</Text>
          <Ionicons name="checkmark-circle" size={11} color={colors.brand} />
        </View>

        {/* Product name */}
        <Text style={s.nameText} numberOfLines={2}>{product.name}</Text>

        {/* Stars */}
        <StarRow rating={product.rating} reviews={product.reviews} />

        {/* Price */}
        <View style={s.priceRow}>
          <Text style={s.priceText}>${product.price.toFixed(2)}</Text>
          {product.old && (
            <Text style={s.oldPriceText}>${product.old.toFixed(2)}</Text>
          )}
        </View>

        {/* Shipping estimate */}
        <Text style={s.shippingText}>Arrives in 2–4 days</Text>

        {/* Add to Cart button with press animation */}
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <Pressable
            style={s.addBtn}
            onPressIn={pressIn}
            onPressOut={pressOut}
            onPress={() => onAddToCart(product)}
          >
            <Text style={s.addBtnText}>Add to Cart</Text>
          </Pressable>
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.bgCard,
    borderRadius: r.lg,
    marginRight: sp.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  imageWrap: {
    width: CARD_WIDTH,
    height: IMAGE_SIZE,
    backgroundColor: '#F8F9FA',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountBadge: {
    position: 'absolute',
    top: sp.sm,
    right: sp.sm,
    backgroundColor: colors.sale,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: r.sm,
  },
  discountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  stockBadge: {
    position: 'absolute',
    top: sp.sm,
    left: sp.sm,
    backgroundColor: 'rgba(192,57,43,0.9)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: r.sm,
  },
  stockText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  newBadge: {
    position: 'absolute',
    top: sp.sm,
    left: sp.sm,
    backgroundColor: colors.brand,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: r.sm,
  },
  newBadgeText: {
    color: '#080f18',
    fontSize: 10,
    fontWeight: '800',
  },
  info: {
    padding: sp.md,
    gap: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  brandText: {
    ...type.productBrand,
    flex: 1,
  },
  nameText: {
    ...type.productName,
    marginBottom: 4,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  starsWrap: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewCount: {
    fontSize: 11,
    color: colors.textDim,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: sp.sm,
    marginBottom: 2,
  },
  priceText: {
    ...type.price,
  },
  oldPriceText: {
    ...type.priceOld,
  },
  shippingText: {
    fontSize: 11,
    color: colors.textDim,
    marginBottom: sp.sm,
  },
  addBtn: {
    backgroundColor: colors.brand,
    borderRadius: r.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addBtnText: {
    color: '#080f18',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
