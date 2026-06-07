const admin = require('firebase-admin');

// Parse service account or initialize default
if (!admin.apps.length) {
  const serviceAccount = require('../backend/serviceAccount.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  console.log('--- Registered Users ---');
  const snapshot = await db.collection('users').get();
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`UID: ${doc.id} | Name: ${data.name} | Email: ${data.email} | Role: ${data.role}`);
  });
}

run().catch(console.error);
