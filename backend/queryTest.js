const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function testQuery() {
  console.log('Querying bets where matchId == "151"...');
  const snap = await db.collection('bets').where('matchId', '==', '151').get();
  console.log(`Found ${snap.size} bets matching string "151".`);
  snap.forEach(d => console.log(d.id, d.data().teamPrediction));

  console.log('Querying bets where matchId == 151 (number)...');
  const snapNum = await db.collection('bets').where('matchId', '==', 151).get();
  console.log(`Found ${snapNum.size} bets matching number 151.`);
}

testQuery()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
