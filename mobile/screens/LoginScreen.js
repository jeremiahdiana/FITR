import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { colors } from '../theme';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Generic error — prevents user enumeration (never reveal if email exists)
const GENERIC_ERROR = 'Incorrect email or password.';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const attempts = useRef(0);
  const lockedUntil = useRef(0);

  async function sendResetEmail(addr) {
    await fetch('https://www.joinfitr.com/api/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addr }),
    }).catch(() => {});
    Alert.alert('Email sent', `If an account exists for ${addr}, a password reset link has been sent. Check your inbox (and spam folder).`);
  }

  function handleForgotPassword() {
    const trimmedEmail = email.trim().toLowerCase();
    if (EMAIL_REGEX.test(trimmedEmail)) {
      sendResetEmail(trimmedEmail);
    } else {
      Alert.prompt(
        'Reset Password',
        "Enter the email address on your account and we'll send you a reset link.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send Link',
            onPress: (value) => {
              const addr = (value || '').trim().toLowerCase();
              if (!EMAIL_REGEX.test(addr)) {
                Alert.alert('Invalid email', 'Please enter a valid email address.');
                return;
              }
              sendResetEmail(addr);
            },
          },
        ],
        'plain-text',
        '',
        'email-address'
      );
    }
  }

  async function handleLogin() {
    // Client-side lockout after too many attempts
    if (Date.now() < lockedUntil.current) {
      const mins = Math.ceil((lockedUntil.current - Date.now()) / 60000);
      Alert.alert('Too many attempts', `Please wait ${mins} minute${mins > 1 ? 's' : ''} before trying again.`);
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(trimmedEmail) || !password) {
      Alert.alert('Invalid input', GENERIC_ERROR);
      return;
    }

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      attempts.current = 0;

      // Check for pending account deletion
      try {
        const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.pendingDeletion && userData.scheduledDeletionAt) {
            const deletionDate = new Date(userData.scheduledDeletionAt.seconds * 1000);
            const now = new Date();

            if (deletionDate <= now) {
              // 30 days have passed — purge the account now
              setLoading(false);
              try {
                const idToken = await cred.user.getIdToken();
                await fetch('https://www.joinfitr.com/api/purge-user', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
                });
              } catch { /* best effort */ }
              await signOut(auth);
              Alert.alert('Account Deleted', 'Your account has been permanently deleted as scheduled.');
              return;
            }

            // Still within 30 days — give them a chance to cancel
            const dateStr = deletionDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            const daysLeft = Math.ceil((deletionDate - now) / (1000 * 60 * 60 * 24));
            await new Promise(resolve => {
              Alert.alert(
                'Account Deletion Scheduled',
                `Your account is scheduled for permanent deletion on ${dateStr} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining).\n\nWould you like to cancel the deletion and keep your account?`,
                [
                  {
                    text: 'Cancel Deletion',
                    onPress: async () => {
                      await updateDoc(doc(db, 'users', cred.user.uid), {
                        pendingDeletion: false,
                        scheduledDeletionAt: null,
                      }).catch(() => {});
                      resolve();
                    },
                  },
                  {
                    text: 'Keep Scheduled',
                    style: 'destructive',
                    onPress: resolve,
                  },
                ]
              );
            });
          }
        }
      } catch { /* non-fatal — proceed with login */ }

      navigation.goBack();
    } catch (e) {
      attempts.current += 1;
      if (attempts.current >= MAX_ATTEMPTS) {
        lockedUntil.current = Date.now() + LOCKOUT_MS;
        attempts.current = 0;
        Alert.alert('Too many attempts', 'For your security, sign-in has been temporarily disabled. Please try again in 15 minutes.');
      } else {
        // Single generic message — never distinguishes "wrong email" vs "wrong password"
        Alert.alert('Sign in failed', GENERIC_ERROR);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      <Text style={styles.logo}>FITR</Text>
      <Text style={styles.tagline}>Sign in to continue</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        maxLength={254}
        autoComplete="email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={colors.textDim}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        maxLength={128}
        autoComplete="current-password"
      />

      <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword}>
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Log In'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.replace('Signup')}>
        <Text style={styles.link}>Don't have an account? <Text style={styles.linkBold}>Sign up</Text></Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 24,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  closeText: { color: colors.textMuted, fontSize: 14 },
  logo: {
    fontSize: 52,
    fontWeight: '900',
    color: colors.brand,
    letterSpacing: 6,
    marginBottom: 8,
  },
  tagline: { color: colors.textMuted, fontSize: 14, marginBottom: 48 },
  input: {
    width: '100%',
    backgroundColor: colors.bgInput,
    color: colors.text,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  button: {
    width: '100%',
    backgroundColor: colors.brand,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonText: { color: colors.bg, fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 16, marginTop: -4 },
  forgotText: { color: colors.brand, fontSize: 13, fontWeight: '600' },
  link: { color: colors.textMuted, fontSize: 14 },
  linkBold: { color: colors.brand, fontWeight: '600' },
});
