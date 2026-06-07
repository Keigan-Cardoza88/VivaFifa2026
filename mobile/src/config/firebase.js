import { initializeApp } from 'firebase/app';
import { 
  initializeAuth, 
  getReactNativePersistence, 
  getAuth 
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

// Set up platform-appropriate Auth
const auth = Platform.OS === 'web' 
  ? getAuth(app) 
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });

const db = getFirestore(app);

export { auth, db };
