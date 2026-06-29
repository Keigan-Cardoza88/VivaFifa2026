const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 1. Define the correct final sequence schedule (Matches 151 - 164)
const correctSequence = {
  '151': { teamA: 'Germany', teamB: 'Paraguay' },
  '152': { teamA: 'Netherlands', teamB: 'Morocco' },
  '153': { teamA: 'Ivory Coast', teamB: 'Norway' },
  '154': { teamA: 'France', teamB: 'Sweden' },
  '155': { teamA: 'Mexico', teamB: 'Ecuador' },
  '156': { teamA: 'England', teamB: 'DR Congo' },
  '157': { teamA: 'Belgium', teamB: 'Senegal' },
  '158': { teamA: 'United States', teamB: 'Bosnia and Herzegovina' },
  '159': { teamA: 'Spain', teamB: 'Austria' },
  '160': { teamA: 'Portugal', teamB: 'Croatia' },
  '161': { teamA: 'Switzerland', teamB: 'Algeria' },
  '162': { teamA: 'Australia', teamB: 'Egypt' },
  '163': { teamA: 'Argentina', teamB: 'Cape Verde' },
  '164': { teamA: 'Colombia', teamB: 'Ghana' }
};

// 2. Define the old sequence layout (how teams were ordered before the bracket scrambled them)
const oldSequence = {
  '151': { teamA: 'Ivory Coast', teamB: 'Norway' },
  '152': { teamA: 'Germany', teamB: 'Paraguay' },
  '153': { teamA: 'Netherlands', teamB: 'Morocco' },
  '154': { teamA: 'France', teamB: 'Sweden' },
  '155': { teamA: 'Mexico', teamB: 'Ecuador' },
  '156': { teamA: 'England', teamB: 'DR Congo' },
  '157': { teamA: 'Spain', teamB: 'Austria' },
  '158': { teamA: 'Belgium', teamB: 'Senegal' },
  '159': { teamA: 'United States', teamB: 'Bosnia and Herzegovina' },
  '160': { teamA: 'Portugal', teamB: 'Croatia' },
  '161': { teamA: 'Switzerland', teamB: 'Algeria' },
  '162': { teamA: 'Australia', teamB: 'Egypt' },
  '163': { teamA: 'Argentina', teamB: 'Cape Verde' },
  '164': { teamA: 'Colombia', teamB: 'Ghana' }
};

async function recoverNormalBets() {
  console.log('Retrieving normal bets...');
  const betsSnap = await db.collection('bets').get();
  
  let migratedCount = 0;
  
  for (const doc of betsSnap.docs) {
    const bet = doc.data();
    const matchId = String(bet.matchId);
    
    // We only process future unsettling matches in R32 (excluding 149 and 150)
    if (oldSequence[matchId]) {
      
      // Determine which teams the user actually predicted
      const oldTeams = oldSequence[matchId];
      const predictedTeam = bet.teamPrediction === 'teamA' ? oldTeams.teamA : oldTeams.teamB;
      
      // Find where this predicted team is in the correct sequence
      let targetMatchId = null;
      for (const [newId, newTeams] of Object.entries(correctSequence)) {
        if (newTeams.teamA === oldTeams.teamA && newTeams.teamB === oldTeams.teamB) {
          targetMatchId = newId;
          break;
        }
      }
      
      if (targetMatchId && targetMatchId !== matchId) {
        console.log(`Migrating Bet ${doc.id}: User predicted ${predictedTeam} (Match #${matchId} -> Correct Match #${targetMatchId})`);
        
        // Create new document with correct ID
        const newBetId = `${bet.userId}_${targetMatchId}`;
        const newBetRef = db.collection('bets').doc(newBetId);
        
        await newBetRef.set({
          ...bet,
          betId: newBetId,
          matchId: targetMatchId
        });
        
        // Delete the old incorrect document
        await doc.ref.delete();
        migratedCount++;
      }
    }
  }
  
  console.log(`Recovery Complete. Successfully migrated ${migratedCount} normal bets to their correct match IDs.`);
}

recoverNormalBets()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
