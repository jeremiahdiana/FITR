import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updateProfile, reauthenticateWithCredential, EmailAuthProvider, updatePassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { colors } from '../theme';

const API_BASE = 'https://www.joinfitr.com';

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize, secureTextEntry, maxLength }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, focused && s.inputFocused]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || ''}
        placeholderTextColor={colors.textDim}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'sentences'}
        autoCorrect={false}
        secureTextEntry={secureTextEntry || false}
        maxLength={maxLength || 200}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

function Section({ title, children, onSave, saving, msg, msgType }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {children}
      {msg ? <Text style={[s.msg, msgType === 'error' ? s.msgError : s.msgSuccess]}>{msg}</Text> : null}
      <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={onSave} disabled={saving}>
        {saving
          ? <ActivityIndicator size="small" color={colors.bg} />
          : <Text style={s.saveBtnText}>Save</Text>}
      </TouchableOpacity>
    </View>
  );
}

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);

  // Profile
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg,    setProfileMsg]    = useState('');
  const [profileMsgType, setProfileMsgType] = useState('');

  // Contact
  const [phone, setPhone] = useState('');
  const [contactSaving, setContactSaving] = useState(false);
  const [contactMsg,    setContactMsg]    = useState('');
  const [contactMsgType, setContactMsgType] = useState('');

  // Billing / Default Shipping Address
  const [street,  setStreet]  = useState('');
  const [city,    setCity]    = useState('');
  const [addrState, setAddrState] = useState('');
  const [zip,     setZip]     = useState('');
  const [addrSaving, setAddrSaving] = useState(false);
  const [addrMsg,    setAddrMsg]    = useState('');
  const [addrMsgType, setAddrMsgType] = useState('');

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw,     setNewPw]     = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving,  setPwSaving]  = useState(false);
  const [pwMsg,     setPwMsg]     = useState('');
  const [pwMsgType, setPwMsgType] = useState('');

  // Payment Methods
  const [paymentMethods,   setPaymentMethods]   = useState([]);
  const [pmLoading,        setPmLoading]        = useState(false);
  const [pmError,          setPmError]          = useState('');

  const fetchPaymentMethods = useCallback(async () => {
    if (!user) return;
    setPmLoading(true);
    setPmError('');
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`${API_BASE}/api/payment-methods`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setPaymentMethods(data.paymentMethods || []);
      } else {
        setPmError(data.error || 'Could not load payment methods.');
      }
    } catch {
      setPmError('Could not load payment methods.');
    } finally {
      setPmLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Seed name from Firebase Auth
    const parts = (user.displayName || '').split(' ');
    setFirstName(parts[0] || '');
    setLastName(parts.slice(1).join(' ') || '');

    // Load rest from Firestore
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.firstName) setFirstName(d.firstName);
      if (d.lastName)  setLastName(d.lastName);
      if (d.phone)     setPhone(d.phone);
      if (d.billing) {
        setStreet(d.billing.street || '');
        setCity(d.billing.city     || '');
        setAddrState(d.billing.state || '');
        setZip(d.billing.zip       || '');
      }
    }).catch(() => {}).finally(() => setLoading(false));

    fetchPaymentMethods();
  }, []);

  async function saveProfile() {
    if (!firstName.trim()) { setProfileMsg('First name is required.'); setProfileMsgType('error'); return; }
    setProfileSaving(true); setProfileMsg('');
    try {
      const displayName = (firstName.trim() + ' ' + lastName.trim()).trim();
      await updateProfile(user, { displayName });
      await setDoc(doc(db, 'users', user.uid), { firstName: firstName.trim(), lastName: lastName.trim() }, { merge: true });
      setProfileMsg('Profile updated!'); setProfileMsgType('success');
    } catch(e) {
      setProfileMsg('Could not save. Try again.'); setProfileMsgType('error');
    } finally { setProfileSaving(false); }
  }

  async function saveContact() {
    setContactSaving(true); setContactMsg('');
    try {
      await setDoc(doc(db, 'users', user.uid), { phone: phone.trim() }, { merge: true });
      setContactMsg('Contact saved!'); setContactMsgType('success');
    } catch(e) {
      setContactMsg('Could not save. Try again.'); setContactMsgType('error');
    } finally { setContactSaving(false); }
  }

  async function saveAddress() {
    setAddrSaving(true); setAddrMsg('');
    try {
      await setDoc(doc(db, 'users', user.uid), {
        billing: {
          street:  street.trim(),
          city:    city.trim(),
          state:   addrState.trim().toUpperCase(),
          zip:     zip.trim(),
          country: 'US',
        },
      }, { merge: true });
      setAddrMsg('Address saved! It will pre-fill at checkout.'); setAddrMsgType('success');
    } catch(e) {
      setAddrMsg('Could not save. Try again.'); setAddrMsgType('error');
    } finally { setAddrSaving(false); }
  }

  async function savePassword() {
    if (!currentPw || !newPw || !confirmPw) { setPwMsg('Fill in all fields.'); setPwMsgType('error'); return; }
    if (newPw !== confirmPw) { setPwMsg('New passwords do not match.'); setPwMsgType('error'); return; }
    if (newPw.length < 8)   { setPwMsg('Password must be at least 8 characters.'); setPwMsgType('error'); return; }
    setPwSaving(true); setPwMsg('');
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setPwMsg('Password updated!'); setPwMsgType('success');
    } catch(e) {
      const msg = e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'
        ? 'Current password is incorrect.'
        : 'Could not update password. Try again.';
      setPwMsg(msg); setPwMsgType('error');
    } finally { setPwSaving(false); }
  }

  async function removePaymentMethod(pmId) {
    Alert.alert('Remove Card', 'Remove this payment method?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            const idToken = await user.getIdToken();
            const res = await fetch(`${API_BASE}/api/payment-methods`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({ pmId }),
            });
            if (res.ok) {
              setPaymentMethods(prev => prev.filter(pm => pm.id !== pmId));
            } else {
              Alert.alert('Error', 'Could not remove payment method.');
            }
          } catch {
            Alert.alert('Error', 'Could not remove payment method.');
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Section title="Profile" onSave={saveProfile} saving={profileSaving} msg={profileMsg} msgType={profileMsgType}>
          <Field label="First Name" value={firstName} onChangeText={setFirstName} placeholder="Jane" autoCapitalize="words" />
          <Field label="Last Name"  value={lastName}  onChangeText={setLastName}  placeholder="Smith" autoCapitalize="words" />
          <Text style={s.hint}>Email: {user?.email}</Text>
        </Section>

        <Section title="Contact" onSave={saveContact} saving={contactSaving} msg={contactMsg} msgType={contactMsgType}>
          <Field label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+1 (305) 555-0100" keyboardType="phone-pad" autoCapitalize="none" maxLength={20} />
        </Section>

        <Section title="Default Shipping Address" onSave={saveAddress} saving={addrSaving} msg={addrMsg} msgType={addrMsgType}>
          <Text style={s.hint}>Saved here, pre-filled automatically at checkout.</Text>
          <Field label="Street Address" value={street}     onChangeText={setStreet}     placeholder="123 Main St"  autoCapitalize="words" />
          <Field label="City"           value={city}       onChangeText={setCity}        placeholder="Miami"        autoCapitalize="words" />
          <Field label="State"          value={addrState}  onChangeText={setAddrState}   placeholder="FL"           autoCapitalize="characters" maxLength={2} />
          <Field label="ZIP Code"       value={zip}        onChangeText={setZip}         placeholder="33101"        keyboardType="numeric" autoCapitalize="none" maxLength={10} />
        </Section>

        <Section title="Change Password" onSave={savePassword} saving={pwSaving} msg={pwMsg} msgType={pwMsgType}>
          <Field label="Current Password" value={currentPw} onChangeText={setCurrentPw} placeholder="••••••••" secureTextEntry autoCapitalize="none" />
          <Field label="New Password"     value={newPw}     onChangeText={setNewPw}     placeholder="••••••••" secureTextEntry autoCapitalize="none" />
          <Field label="Confirm New"      value={confirmPw} onChangeText={setConfirmPw} placeholder="••••••••" secureTextEntry autoCapitalize="none" />
        </Section>

        {/* Payment Methods */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Payment Methods</Text>
          <Text style={s.hint}>Cards saved at checkout appear here and sync across web and app.</Text>
          {pmLoading && <ActivityIndicator size="small" color={colors.brand} style={{ marginVertical: 8 }} />}
          {pmError ? <Text style={[s.msg, s.msgError]}>{pmError}</Text> : null}
          {!pmLoading && !pmError && paymentMethods.length === 0 && (
            <Text style={s.hint}>No saved cards yet. Pay once and your card will appear here.</Text>
          )}
          {paymentMethods.map(pm => (
            <View key={pm.id} style={s.pmRow}>
              <View>
                <Text style={s.pmName}>
                  {pm.brand.charAt(0).toUpperCase() + pm.brand.slice(1)} ending in {pm.last4}
                </Text>
                <Text style={s.pmSub}>
                  Expires {String(pm.expMonth).padStart(2, '0')}/{pm.expYear}
                </Text>
              </View>
              <TouchableOpacity onPress={() => removePaymentMethod(pm.id)} style={s.pmRemoveBtn}>
                <Text style={s.pmRemoveText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={fetchPaymentMethods} style={s.refreshBtn}>
            <Text style={s.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered:  { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 38, alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },

  scroll: { padding: 20, paddingBottom: 48 },

  card: {
    backgroundColor: colors.bgPanel,
    borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 20,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },

  fieldWrap:  { marginBottom: 14 },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.text,
  },
  inputFocused: { borderColor: colors.brand },

  hint: { fontSize: 12, color: colors.textDim, marginBottom: 12, lineHeight: 18 },

  msg:        { fontSize: 13, marginTop: 4, marginBottom: 10 },
  msgSuccess: { color: colors.brand },
  msgError:   { color: '#e63946' },

  saveBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10, paddingVertical: 13,
    alignItems: 'center', marginTop: 6,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: colors.bg, fontWeight: '800', fontSize: 15 },

  pmRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pmName: { fontSize: 14, fontWeight: '700', color: colors.text },
  pmSub:  { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  pmRemoveBtn: { padding: 6 },
  pmRemoveText: { color: '#e63946', fontSize: 13, fontWeight: '600' },
  refreshBtn: { alignSelf: 'flex-start', marginTop: 12 },
  refreshText: { color: colors.brand, fontSize: 13, fontWeight: '600' },
});
