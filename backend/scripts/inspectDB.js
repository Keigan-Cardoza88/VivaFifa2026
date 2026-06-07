const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  const snapshot = await db.collection('users').get();
  console.log(`Found ${snapshot.size} users.`);
  snapshot.forEach(doc => {
    console.log(`ID: ${doc.id} => Data:`, doc.data());
  });
}

run().catch(console.error);
