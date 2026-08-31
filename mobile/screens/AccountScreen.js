import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, deleteDoc, collection, getDocs, Timestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { colors } from '../theme';

export default function AccountScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(auth.currentUser);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setProfile(null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (snap.exists()) setProfile(snap.data());
    });
  }, [user]);

  function handleSignOut() {
    Alert.alert('Sign out?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  }

  function handleDeleteAccount() {
    const newDeletionDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    if (profile?.pendingDeletion) {
      // Show the actual scheduled date from Firestore, not a fresh +30d calculation
      const actualDate = profile.scheduledDeletionAt
        ? new Date(profile.scheduledDeletionAt.seconds * 1000)
        : newDeletionDate;
      const dateStr = actualDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      // Already scheduled — offer to cancel
      Alert.alert(
        'Account Deletion Scheduled',
        `Your account is scheduled for permanent deletion on ${dateStr}. Would you like to cancel this?`,
        [
          { text: 'Keep Scheduled', style: 'cancel' },
          {
            text: 'Cancel Deletion',
            onPress: async () => {
              try {
                await updateDoc(doc(db, 'users', user.uid), {
                  pendingDeletion: false,
                  scheduledDeletionAt: null,
                });
                setProfile(prev => ({ ...prev, pendingDeletion: false, scheduledDeletionAt: null }));
                Alert.alert('Deletion Cancelled', 'Your account is safe. Nothing will be deleted.');
              } catch {
                Alert.alert('Error', 'Could not cancel deletion. Please try again.');
              }
            },
          },
        ]
      );
      return;
    }

    const newDateStr = newDeletionDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    Alert.alert(
      'Delete Account',
      `Your account and all data will be permanently deleted on ${newDateStr} (30 days from now).\n\nYou can sign back in at any time before then to cancel the deletion.`,
      [
        { text: 'Keep My Account', style: 'cancel' },
        {
          text: 'Schedule Deletion',
          style: 'destructive',
          onPress: async () => {
            try {
              const deletionTs = Timestamp.fromDate(newDeletionDate);
              await updateDoc(doc(db, 'users', user.uid), {
                pendingDeletion: true,
                scheduledDeletionAt: deletionTs,
              });
              await signOut(auth);
              Alert.alert(
                'Deletion Scheduled',
                `Your account will be deleted on ${newDateStr}. Sign back in before then to cancel.`
              );
            } catch {
              Alert.alert('Error', 'Could not schedule deletion. Please try again.');
            }
          },
        },
      ]
    );
  }

  // Not logged in — show sign in prompt
  if (!user) {
    return (
      <View style={styles.guestContainer}>
        <Text style={styles.guestLogo}>FITR</Text>
        <Text style={styles.guestTitle}>Sign in to your account</Text>
        <Text style={styles.guestSub}>
          Create an account to save your cart, track orders, and unlock FITR Prime deals.
        </Text>
        <TouchableOpacity
          style={styles.signInBtn}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.signInBtnText}>Log In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signUpBtn}
          onPress={() => navigation.navigate('Signup')}
        >
          <Text style={styles.signUpBtnText}>Create Account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Account</Text>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View>
          <Text style={styles.name}>{profile?.name || user.email}</Text>
          <Text style={styles.email}>{user.email}</Text>
          {profile?.isPro && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>FITR PRIME</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.menu}>
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Orders')}>
          <View style={styles.menuLeft}>
            <Ionicons name="bag-outline" size={20} color={colors.textMuted} />
            <Text style={styles.menuText}>My Orders</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('Wishlist')}>
          <View style={styles.menuLeft}>
            <Ionicons name="heart-outline" size={20} color={colors.textMuted} />
            <Text style={styles.menuText}>Wishlist</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => Alert.alert('FITR Prime', 'FITR Prime is coming soon! Stay tuned for exclusive deals and free shipping.', [{ text: 'OK' }])}
        >
          <View style={styles.menuLeft}>
            <Ionicons name="star-outline" size={20} color={colors.textMuted} />
            <Text style={styles.menuText}>Upgrade to Prime</Text>
          </View>
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Soon</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('Settings')}
        >
          <View style={styles.menuLeft}>
            <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
            <Text style={styles.menuText}>Settings</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
        </TouchableOpacity>
      </View>

      {profile?.pendingDeletion && profile?.scheduledDeletionAt && (
        <View style={styles.deletionBanner}>
          <Text style={styles.deletionBannerText}>
            ⚠️ Account deletion scheduled for{' '}
            {new Date(profile.scheduledDeletionAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
            Tap below to cancel.
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
        <Text style={styles.deleteText}>
          {profile?.pendingDeletion ? 'Cancel Account Deletion' : 'Delete My Account'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Guest state
  guestContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  guestLogo: {
    fontSize: 48,
    fontWeight: '900',
    color: colors.brand,
    letterSpacing: 6,
    marginBottom: 24,
  },
  guestTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  guestSub: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 40,
  },
  signInBtn: {
    width: '100%',
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  signInBtnText: { color: colors.bg, fontWeight: '800', fontSize: 16 },
  signUpBtn: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  signUpBtnText: { color: colors.text, fontWeight: '700', fontSize: 16 },

  // Logged in state
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 24, fontWeight: '900', color: colors.text },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.bg, fontSize: 20, fontWeight: '900' },
  name: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 2 },
  email: { color: colors.textMuted, fontSize: 13 },
  proBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 6,
  },
  proBadgeText: { color: colors.bg, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  menu: { paddingTop: 8 },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuText: { color: colors.text, fontSize: 15 },
  comingSoonBadge: {
    backgroundColor: colors.bgPanel,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  comingSoonText: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  deletionBanner: {
    marginHorizontal: 20, marginTop: 16,
    backgroundColor: '#fff0f0', borderRadius: 10,
    borderWidth: 1, borderColor: '#e6394640',
    padding: 12,
  },
  deletionBannerText: { color: '#e63946', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  signOutBtn: {
    margin: 20,
    marginTop: 'auto',
    borderWidth: 1,
    borderColor: '#e6394640',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#e63946', fontWeight: '700', fontSize: 15 },
  deleteBtn: {
    marginHorizontal: 20, marginBottom: 32, marginTop: 8,
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  deleteText: { color: '#555', fontSize: 13, textDecorationLine: 'underline' },
});
