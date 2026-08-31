import { initializeApp, getApps } from 'firebase/app';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDrBWAflUZBxLJuHqcKO2S1FkP7gs2_oME",
  authDomain: "fitr-22814.firebaseapp.com",
  projectId: "fitr-22814",
  storageBucket: "fitr-22814.firebasestorage.app",
  messagingSenderId: "900395772549",
  appId: "1:900395772549:web:2d48b5877b8d247e7797ec",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
