import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: "AIzaSyCztjOEva599F5vRBHSzRaIq_o3amMozwo",
  authDomain: "vivafifa2026.firebaseapp.com",
  projectId: "vivafifa2026",
  storageBucket: "vivafifa2026.firebasestorage.app",
  messagingSenderId: "56297030289",
  appId: "1:56297030289:web:de0240858f48d66aa9b530"
};

const app = initializeApp(firebaseConfig);

// Set up persistence for mobile to keep session logged in
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

const db = getFirestore(app);

// Local Emulator connection (use correct computer IP for Android emulator/physical devices)
// const isDev = __DEV__;
// if (isDev) {
//   // If running in Android emulator, localhost is 10.0.2.2. If iOS, it is localhost.
//   const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
//   console.log(`[Mobile Firebase] Connecting to emulators at ${host}...`);
//   try {
//     connectFirestoreEmulator(db, host, 8080);
//     // Auth emulator is handled inside sign in methods or connectAuthEmulator
//   } catch (e) {
//     console.warn('[Mobile Firebase] Emulator connection warning:', e.message);
//   }
// }

export { auth, db };
