const admin = require('firebase-admin');

// Detect emulator environment or use production key
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
    try {
      admin.initializeApp({
        projectId: 'vivafifa2026'
      });
    } catch (e) {
      console.error("Error: serviceAccountKey.json not found.", e);
      process.exit(1);
    }
  }
}

const db = admin.firestore();
const auth = admin.auth();

const ADMIN_EMAILS = [
  'cardoza.kian@gmail.com',
  'cardoza.keigs@gmail.com',
  'cardoza.joseph@gmail.com'
];

// Rebuilds entire leaderboard from scratch to ensure perfect self-healing
async function rebuildLeaderboard() {
  const usersSnapshot = await db.collection('users').get();
  const matchesSnapshot = await db.collection('matches').where('status', 'in', ['completed', 'postponed']).get();
  
  const completedMatches = {};
  matchesSnapshot.forEach((doc) => {
    completedMatches[doc.id] = doc.data();
  });

  const settingsDoc = await db.collection('settings').doc('global').get();
  const settings = settingsDoc.exists ? settingsDoc.data() : {
    stakes: {
      group: { team: 100, goal: 50 },
      r32: { team: 75, goal: 75 },
      r16: { team: 100, goal: 100 },
      qf: { team: 125, goal: 125 },
      sf: { team: 150, goal: 150 },
      third_place: { team: 150, goal: 150 },
      final: { team: 200, goal: 200 }
    }
  };

  const batch = db.batch();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();

    // Skip pending users
    if (userData.role === 'pending') {
      continue;
    }

    const betsSnapshot = await db.collection('bets').where('userId', '==', userId).get();
    const userBets = {};
    betsSnapshot.forEach((doc) => {
      userBets[doc.data().matchId] = doc.data();
    });

    let totalWon = 0;
    let totalLost = 0;
    let correctPredictions = 0;
    let totalPredictions = 0;

    Object.keys(completedMatches).forEach((matchId) => {
      const match = completedMatches[matchId];
      
      if (userData.joinedAt && userData.joinedAt.toDate() > match.kickoffTimeIST.toDate()) {
        return;
      }

      if (match.status === 'postponed') {
        return;
      }

      const stage = match.stage;
      const stageStakes = settings.stakes[stage] || { team: 50, goal: 50 };
      const teamStake = stageStakes.team;
      const goalStake = stageStakes.goal;

      totalPredictions += 2;
      totalLost += teamStake + goalStake;

      const bet = userBets[matchId];
      if (bet) {
        totalWon += bet.amountWon || 0;
        if (bet.teamBetResult === 'won' || bet.teamBetResult === 'draw_win') {
          correctPredictions += 1;
        }
        if (bet.goalBetResult === 'won') {
          correctPredictions += 1;
        }
      }
    });

    const netProfit = totalWon - totalLost;
    const accuracyPercent = totalPredictions > 0 ? Number(((correctPredictions / totalPredictions) * 100).toFixed(2)) : 0;

    const leaderboardRef = db.collection('leaderboard').doc(userId);
    batch.set(leaderboardRef, {
      userId,
      userName: userData.name || 'Anonymous',
      netProfit,
      totalWon,
      totalLost,
      correctPredictions,
      totalPredictions,
      accuracyPercent
    });
  }

  await batch.commit();
  console.log("Leaderboard rebuilt successfully!");
}

async function restore() {
  console.log("=== Restoring Admin Profiles to users collection ===");
  
  for (const email of ADMIN_EMAILS) {
    try {
      const userRecord = await auth.getUserByEmail(email);
      const uid = userRecord.uid;
      const name = userRecord.displayName || email.split('@')[0];
      
      const userRef = db.collection('users').doc(uid);
      const userDoc = await userRef.get();
      
      if (!userDoc.exists) {
        console.log(`Re-creating user profile for admin: ${email} (${uid})`);
        await userRef.set({
          uid,
          name,
          email,
          role: 'participant', // Set to participant so they show up as active players
          paymentStatus: 'paid',
          joinedAt: admin.firestore.Timestamp.now(),
          isLateEntry: false,
          entryFee: 0
        });
      } else {
        console.log(`User profile for admin already exists: ${email} (${uid}). Ensuring role is 'participant'...`);
        await userRef.update({
          role: 'participant',
          paymentStatus: 'paid'
        });
      }
    } catch (err) {
      console.error(`Error processing email ${email}:`, err.message);
    }
  }

  console.log("=== Rebuilding Leaderboard ===");
  await rebuildLeaderboard();
  
  console.log("=== Done ===");
  process.exit(0);
}

restore().catch(console.error);
