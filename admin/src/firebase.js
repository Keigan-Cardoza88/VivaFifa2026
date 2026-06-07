import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// Default config. The user will replace this with their Firebase Console config.
const firebaseConfig = {
  apiKey: "AIzaSyCztjOEva599F5vRBHSzRaIq_o3amMozwo",
  authDomain: "vivafifa2026.firebaseapp.com",
  projectId: "vivafifa2026",
  storageBucket: "vivafifa2026.firebasestorage.app",
  messagingSenderId: "56297030289",
  appId: "1:56297030289:web:de0240858f48d66aa9b530",
  measurementId: "G-N4GTG96NTH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Detect local development and connect to emulators
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.log('[Firebase Client] Connecting to local Emulators...');
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
}

export { auth, db, googleProvider };
