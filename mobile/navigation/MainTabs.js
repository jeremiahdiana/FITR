import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useCart } from '../hooks/useCart';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';

import HomeScreen from '../screens/HomeScreen';
import SearchScreen from '../screens/SearchScreen';
import CartScreen from '../screens/CartScreen';
import AccountScreen from '../screens/AccountScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import BrandScreen from '../screens/BrandScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="Brand" component={BrandScreen} />
    </Stack.Navigator>
  );
}

function SearchStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SearchMain" component={SearchScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="Brand" component={BrandScreen} />
    </Stack.Navigator>
  );
}

function useUnreadNotifications() {
  const [count, setCount] = useState(0);
  const [uid, setUid] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u ? u.uid : null));
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) { setCount(0); return; }
    const q = query(collection(db, 'users', uid, 'notifications'), where('read', '==', false));
    const unsub = onSnapshot(q, snap => {
      setCount(snap.size);
    }, () => {});
    return unsub;
  }, [uid]);

  return count;
}

export default function MainTabs() {
  const { itemCount } = useCart();
  const notifCount = useUnreadNotifications();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bgPanel,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 83,
          paddingBottom: 26,
          paddingTop: 10,
        },
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
      })}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <View style={styles.iconWrap}>
              <Ionicons name="home-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchStack}
        options={{
          tabBarIcon: ({ color, size }) => (
            <View style={styles.iconWrap}>
              <Ionicons name="search-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="CartTab"
        component={CartScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <View style={styles.iconWrap}>
              <Ionicons name="cart-outline" size={24} color={color} />
              {itemCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{itemCount > 99 ? '99+' : itemCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="NotifTab"
        component={NotificationsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <View style={styles.iconWrap}>
              <Ionicons name="notifications-outline" size={24} color={color} />
              {notifCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{notifCount > 99 ? '99+' : notifCount}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="AccountTab"
        component={AccountScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <View style={styles.iconWrap}>
              <Ionicons name="person-outline" size={24} color={color} />
            </View>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -7,
    backgroundColor: colors.brand,
    borderRadius: 8,
    minWidth: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#080f18', fontSize: 8, fontWeight: '800' },
});
