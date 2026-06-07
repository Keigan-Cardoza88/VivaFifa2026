const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const ADMIN_EMAILS = [
  'cardoza.kian@gmail.com',
  'cardoza.keigs@gmail.com',
  'cardoza.joseph@gmail.com'
];

async function run() {
  console.log('=== Cleaning up Admin profiles from player roster ===');
  const snapshot = await db.collection('users').get();
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (ADMIN_EMAILS.includes(data.email)) {
      console.log(`Deleting player record for admin: ${data.email} (${doc.id})`);
      await db.collection('users').doc(doc.id).delete();
      await db.collection('leaderboard').doc(doc.id).delete();
    }
  }
  console.log('Successfully cleaned up old admin player documents.');
}

run().catch(console.error);
