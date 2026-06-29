// Run this from the `admin` folder where the standard client SDK is already installed.
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  authDomain: "vivafifa2026.firebaseapp.com",
  projectId: "vivafifa2026",
  storageBucket: "vivafifa2026.appspot.com",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
    const docRef = doc(db, 'matches', item.matchId);
    const snap = await getDoc(docRef);
    
    if (snap.exists()) {
      await updateDoc(docRef, {
        teamA: item.teamA,
        teamB: item.teamB
      });
      console.log(`Updated Match #${item.matchId}: ${item.teamA} vs ${item.teamB}`);
    } else {
      await setDoc(docRef, {
        matchId: item.matchId,
        teamA: item.teamA,
        teamB: item.teamB,
        stage: 'r32',
        status: 'upcoming'
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
