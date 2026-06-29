const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function cleanLegacyStakes() {
  console.log('Fetching all matches to identify legacy capitalized _STAKES documents...');
  const snapshot = await db.collection('matches').get();
  
  let deleteCount = 0;
  for (const doc of snapshot.docs) {
    if (doc.id.endsWith('_STAKES')) {
      await doc.ref.delete();
      console.log(`Deleted legacy document: ${doc.id}`);
      deleteCount++;
    }
  }
  console.log(`Cleanup complete. Deleted ${deleteCount} legacy capitalized documents.`);
}

cleanLegacyStakes()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
