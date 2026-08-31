import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import {
  collection, query, orderBy, limit,
  onSnapshot, writeBatch, doc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../firebase';
import { colors } from '../theme';

function timeAgo(ts) {
  if (!ts) return '';
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

const TYPE_EMOJI = {
  order_confirmed: '✅',
  order_shipped:   '📦',
  new_order:       '🛍️',
  refund:          '💰',
  low_stock:       '⚠️',
};

export default function NotificationsScreen({ navigation }) {
  const [user, setUser]     = useState(auth.currentUser);
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));

    return unsub;
  }, [user]);

  async function handleTap(item) {
    // Mark as read
    if (!item.read && user) {
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid, 'notifications', item.id), { read: true });
      batch.commit().catch(() => {});
    }
    // Navigate based on type
    const orderTypes = ['order_confirmed', 'order_shipped', 'order_delivered', 'refund'];
    if (orderTypes.includes(item.type)) {
      const orderNumber = item.orderNumber || (() => {
        const m = (item.body || '').match(/Order\s+([^\s—–]+)/);
        return m ? m[1] : null;
      })();
      navigation.navigate('Orders', orderNumber ? { orderNumber } : {});
    }
  }

  async function markAllRead() {
    if (!user || !items.length) return;
    const unread = items.filter(n => !n.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach(n => batch.update(doc(db, 'users', user.uid, 'notifications', n.id), { read: true }));
    await batch.commit().catch(() => {});
  }

  const unread = items.filter(n => !n.read).length;

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>🔔</Text>
        <Text style={styles.emptyTitle}>Sign in to see notifications</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unread > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyBody}>Order updates and alerts will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.item, !item.read && styles.itemUnread]}
              onPress={() => handleTap(item)}
              activeOpacity={0.75}
            >
              <Text style={styles.itemEmoji}>{TYPE_EMOJI[item.type] || '🔔'}</Text>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{item.title || 'Notification'}</Text>
                {!!item.body && <Text style={styles.itemText}>{item.body}</Text>}
                <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
              </View>
              {!item.read && <View style={styles.dot} />}
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  markAll: { fontSize: 13, color: colors.brand, fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },

  item: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 16, backgroundColor: colors.bg,
  },
  itemUnread: { backgroundColor: 'rgba(0,201,167,0.06)' },
  itemEmoji: { fontSize: 24, marginRight: 12, marginTop: 2 },
  itemBody: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  itemText: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 4 },
  itemTime: { fontSize: 11, color: colors.textDim },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.brand, marginTop: 6, marginLeft: 8,
  },
  sep: { height: 1, backgroundColor: colors.border },
});
