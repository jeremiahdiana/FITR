import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, Linking,
} from 'react-native';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { colors } from '../theme';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_ERROR = 'Could not create account. Please check your details and try again.';

function validatePassword(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(pw)) return 'Password must contain an uppercase letter.';
  if (!/[0-9]/.test(pw)) return 'Password must contain a number.';
  return null;
}

export default function SignupScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    const trimmedName = name.trim().slice(0, 100);
    const trimmedEmail = email.trim().toLowerCase();
    const ageNum = parseInt(age, 10);

    if (!trimmedName) { Alert.alert('Required', 'Please enter your name.'); return; }
    if (!EMAIL_REGEX.test(trimmedEmail)) { Alert.alert('Invalid email', 'Please enter a valid email address.'); return; }
    if (isNaN(ageNum) || ageNum < 13) { Alert.alert('Age required', 'You must be at least 13 years old to create an account.'); return; }
    if (!consentTerms) { Alert.alert('Agreement required', 'You must agree to the Terms of Service and Privacy Policy to create an account.'); return; }
    const pwError = validatePassword(password);
    if (pwError) { Alert.alert('Weak password', pwError); return; }

    setLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      await sendEmailVerification(user);
      await setDoc(doc(db, 'users', user.uid), {
        name: trimmedName,
        email: trimmedEmail,
        isPro: false,
        marketingConsent: consentMarketing,
        createdAt: serverTimestamp(),
      });
      navigation.goBack();
      Alert.alert('Verify your email', 'A verification email has been sent. Please check your inbox before signing in.');
    } catch {
      Alert.alert('Signup failed', GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>

        <Text style={styles.logo}>FITR</Text>
        <Text style={styles.tagline}>Create your account</Text>

        <TextInput style={styles.input} placeholder="Full name" placeholderTextColor={colors.textDim}
          value={name} onChangeText={setName} maxLength={100} autoComplete="name" />
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textDim}
          autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}
          maxLength={254} autoComplete="email" />
        <TextInput style={styles.input} placeholder="Password (8+ chars, 1 uppercase, 1 number)"
          placeholderTextColor={colors.textDim} secureTextEntry value={password}
          onChangeText={setPassword} maxLength={128} autoComplete="new-password" />
        <TextInput style={styles.input} placeholder="Your age (must be 13+)"
          placeholderTextColor={colors.textDim} keyboardType="number-pad" value={age}
          onChangeText={setAge} maxLength={3} />

        {/* Required consent */}
        <TouchableOpacity style={styles.checkRow} onPress={() => setConsentTerms(!consentTerms)} activeOpacity={0.8}>
          <View style={[styles.checkbox, consentTerms && styles.checkboxChecked]}>
            {consentTerms && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>
            I agree to FITR's{' '}
            <Text style={styles.link} onPress={() => Linking.openURL('https://joinfitr.com/terms.html')}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.link} onPress={() => Linking.openURL('https://joinfitr.com/privacy.html')}>Privacy Policy</Text>.
            {' '}I confirm I am 13 or older.
          </Text>
        </TouchableOpacity>

        {/* Optional marketing consent */}
        <TouchableOpacity style={styles.checkRow} onPress={() => setConsentMarketing(!consentMarketing)} activeOpacity={0.8}>
          <View style={[styles.checkbox, consentMarketing && styles.checkboxChecked]}>
            {consentMarketing && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>
            I'd like to receive exclusive deals and updates from FITR via email (optional).
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Creating account...' : 'Sign Up'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.replace('Login')}>
          <Text style={styles.switchLink}>Already have an account? <Text style={styles.switchLinkBold}>Log in</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 80,
  },
  closeBtn: {
    position: 'absolute', top: 52, right: 24,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bgPanel, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.borderLight,
  },
  closeText: { color: colors.textMuted, fontSize: 14 },
  logo: { fontSize: 52, fontWeight: '900', color: colors.brand, letterSpacing: 6, marginBottom: 8 },
  tagline: { color: colors.textMuted, fontSize: 14, marginBottom: 32 },
  input: {
    width: '100%', backgroundColor: colors.bgInput, color: colors.text,
    borderRadius: 12, padding: 16, marginBottom: 12, fontSize: 15,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', width: '100%',
    marginBottom: 12, gap: 10,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1.5,
    borderColor: colors.borderLight, backgroundColor: colors.bgInput,
    alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkmark: { color: colors.bg, fontSize: 12, fontWeight: '900' },
  checkLabel: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  link: { color: colors.brand, fontWeight: '600' },
  button: {
    width: '100%', backgroundColor: colors.brand, borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 8, marginBottom: 24,
  },
  buttonText: { color: colors.bg, fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  switchLink: { color: colors.textMuted, fontSize: 14 },
  switchLinkBold: { color: colors.brand, fontWeight: '600' },
});
