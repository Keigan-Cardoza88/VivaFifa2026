const admin = require('firebase-admin');

// Detect emulator environment
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (emulatorHost) {
  console.log(`Running against Firestore Emulator: ${emulatorHost}`);
  admin.initializeApp({
    projectId: 'fifa-warroom-app'
  });
} else {
  console.log("Running in Production. Loading service account...");
  try {
    const serviceAccount = require('../serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (err) {
    console.log("../serviceAccountKey.json not found. Attempting Application Default Credentials...");
    try {
      admin.initializeApp({
        projectId: 'vivafifa2026'
      });
    } catch (e) {
      console.error("Error: Please put 'serviceAccountKey.json' in 'backend/' or run 'firebase login' to authenticate.", e);
      process.exit(1);
    }
  }
}

const db = admin.firestore();

async function deleteCollection(collectionPath, batchSize = 100) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(db, query, resolve) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();

  // Recurse on the next process tick
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

async function main() {
  try {
    console.log("=== 1. Deleting all Bets ===");
    await deleteCollection('bets');
    console.log("Bets cleared successfully!");

    console.log("=== 2. Deleting all Leaderboard entries ===");
    await deleteCollection('leaderboard');
    console.log("Leaderboard cleared successfully!");

    console.log("=== 3. Deleting all Kitty logs ===");
    await deleteCollection('kitty');
    console.log("Kitty logs cleared successfully!");

    console.log("=== 4. Deleting all Settlement Backups ===");
    await deleteCollection('settlement_backups');
    console.log("Settlement backups cleared successfully!");

    console.log("=== 5. Resetting all Matches to 'upcoming' ===");
    const matchesSnapshot = await db.collection('matches').get();
    const batch = db.batch();
    let count = 0;
    matchesSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: 'upcoming',
        resultTeamAGoals: admin.firestore.FieldValue.delete(),
        resultTeamBGoals: admin.firestore.FieldValue.delete(),
        winner: admin.firestore.FieldValue.delete()
      });
      count++;
    });
    if (count > 0) {
      await batch.commit();
    }
    console.log(`Reset ${count} matches back to upcoming status.`);

    console.log("=== Bets Reset Complete! ===");
    process.exit(0);
  } catch (error) {
    console.error("Reset failed:", error);
    process.exit(1);
  }
}

main();
