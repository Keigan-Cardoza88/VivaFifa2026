const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const correctSequence = [
  { matchId: '149', teamA: 'South Africa', teamB: 'Canada' },
  { matchId: '150', teamA: 'Brazil', teamB: 'Japan' },
  { matchId: '151', teamA: 'Germany', teamB: 'Paraguay' },
  { matchId: '152', teamA: 'Netherlands', teamB: 'Morocco' },
  { matchId: '153', teamA: 'Ivory Coast', teamB: 'Norway' },
  { matchId: '154', teamA: 'France', teamB: 'Sweden' },
  { matchId: '155', teamA: 'Mexico', teamB: 'Ecuador' },
  { matchId: '156', teamA: 'England', teamB: 'DR Congo' },
  { matchId: '157', teamA: 'Belgium', teamB: 'Senegal' },
  { matchId: '158', teamA: 'United States', teamB: 'Bosnia and Herzegovina' },
  { matchId: '159', teamA: 'Spain', teamB: 'Austria' },
  { matchId: '160', teamA: 'Portugal', teamB: 'Croatia' },
  { matchId: '161', teamA: 'Switzerland', teamB: 'Algeria' },
  { matchId: '162', teamA: 'Australia', teamB: 'Egypt' },
  { matchId: '163', teamA: 'Argentina', teamB: 'Cape Verde' },
  { matchId: '164', teamA: 'Colombia', teamB: 'Ghana' }
];

async function realignMatches() {
  console.log('Starting realignment of Round of 32 matches...');
  for (const item of correctSequence) {
    const docRef = db.collection('matches').doc(item.matchId);
    const snap = await docRef.get();
    
    if (snap.exists) {
      await docRef.update({
        teamA: item.teamA,
        teamB: item.teamB
      });
      console.log(`Updated Match #${item.matchId}: ${item.teamA} vs ${item.teamB}`);
    } else {
      await docRef.set({
        matchId: item.matchId,
        teamA: item.teamA,
        teamB: item.teamB,
        stage: 'r32',
        status: 'upcoming',
        kickoffTimeIST: admin.firestore.Timestamp.now()
      });
      console.log(`Created missing Match #${item.matchId}: ${item.teamA} vs ${item.teamB}`);
    }
  }
  console.log('Realignment complete.');
}

realignMatches()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
