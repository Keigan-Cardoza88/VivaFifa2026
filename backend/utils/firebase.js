const admin = require('firebase-admin');

// Prevent double initialization
if (!admin.apps.length) {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  if (emulatorHost) {
    console.log(`[Firebase Admin] Initializing in Emulator Mode with projectId: fifa-warroom-app`);
    admin.initializeApp({
      projectId: 'fifa-warroom-app'
    });
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('[Firebase Admin] Initializing with service account environment variable');
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } catch (e) {
      console.error('[Firebase Admin] Failed to parse service account JSON:', e);
      admin.initializeApp(); // Fallback to ADC
    }
  } else {
    console.log('[Firebase Admin] Initializing with Application Default Credentials');
    admin.initializeApp();
  }
}

const db = admin.firestore();
const auth = admin.auth();
const messaging = admin.messaging();

module.exports = { admin, db, auth, messaging };
