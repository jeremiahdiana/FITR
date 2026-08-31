import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../theme';

export default function OrderConfirmedScreen({ route, navigation }) {
  const orderNum = route.params?.orderNum || 'FITR-' + Math.floor(100000 + Math.random() * 900000);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🎉</Text>
      <Text style={styles.title}>ORDER PLACED!</Text>
      <Text style={styles.sub}>Your order is confirmed and on its way.</Text>

      <View style={styles.orderBox}>
        <Text style={styles.orderLabel}>ORDER NUMBER</Text>
        <Text style={styles.orderNum}>{orderNum}</Text>
      </View>

      <Text style={styles.note}>
        You'll receive a confirmation email shortly.{'\n'}
        Returns accepted within 14 days of delivery (unopened).
      </Text>

      <TouchableOpacity
        style={styles.shopBtn}
        onPress={() => navigation.navigate('Main')}
      >
        <Text style={styles.shopBtnText}>Keep Shopping</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  icon: { fontSize: 72, marginBottom: 16 },
  title: {
    fontSize: 36, fontWeight: '900', color: colors.brand,
    letterSpacing: 3, marginBottom: 8,
  },
  sub: {
    fontSize: 16, color: colors.textMuted,
    textAlign: 'center', lineHeight: 24, marginBottom: 32,
  },
  orderBox: {
    backgroundColor: colors.bgPanel,
    borderWidth: 1, borderColor: '#00C9A733',
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32,
    alignItems: 'center', marginBottom: 24,
  },
  orderLabel: {
    fontSize: 10, color: colors.textDim,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6,
  },
  orderNum: {
    fontSize: 24, fontWeight: '900', color: colors.brand,
    letterSpacing: 3,
  },
  note: {
    fontSize: 12, color: colors.textDim,
    textAlign: 'center', lineHeight: 20, marginBottom: 40,
  },
  shopBtn: {
    backgroundColor: colors.brand,
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48,
  },
  shopBtnText: { color: colors.bg, fontWeight: '900', fontSize: 16 },
});
