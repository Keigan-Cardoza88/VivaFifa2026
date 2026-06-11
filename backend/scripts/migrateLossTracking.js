/**
 * Migration Script: Fix amountLost tracking for all historical bets
 * 
 * This script recalculates amountLost for all bets in completed matches.
 * amountLost should only track stakes actually lost, not full stakes:
 * - Both correct: amountLost = 0
 * - Team correct only: amountLost = goalStake (50 if group stage)
 * - Goal correct only: amountLost = teamStake (50 if group stage)
 * - Neither correct: amountLost = teamStake + goalStake (100 if group stage)
 * - Forfeited/default: amountLost = teamStake + goalStake (full stake lost)
 * - Refunded (goal bets with no winners): amountLost = 0
 * - Postponed: amountLost = 0 (voided)
 */

const admin = require('firebase-admin');

let db;
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (emulatorHost) {
  console.log(`Running migration against Firestore Emulator: ${emulatorHost}`);
  admin.initializeApp({ projectId: 'fifa-warroom-app' });
  db = admin.firestore();
} else {
  try {
    const serviceAccount = require('../serviceAccountKey.json');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
  } catch (err) {
    console.log('serviceAccountKey.json not found or invalid. Falling back to Application Default Credentials with explicit projectId.');
    try {
      admin.initializeApp({ projectId: 'vivafifa2026' });
      db = admin.firestore();
    } catch (error) {
      console.error('Failed to initialize Firebase Admin in migration script:', error);
      process.exit(1);
    }
  }
}

async function migrateLossTracking() {
  try {
    console.log('Starting loss tracking migration...');

    // Get global settings for stakes
    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {
      stakes: {
        group: { team: 50, goal: 50 },
        r32: { team: 75, goal: 75 },
        r16: { team: 100, goal: 100 },
        qf: { team: 125, goal: 125 },
        sf: { team: 150, goal: 150 },
        third_place: { team: 150, goal: 150 },
        final: { team: 200, goal: 200 }
      }
    };

    // Get all completed matches
    const matchesSnapshot = await db.collection('matches')
      .where('status', '==', 'completed')
      .get();

    console.log(`Found ${matchesSnapshot.docs.length} completed matches`);

    let updatedBetCount = 0;
    const batch = db.batch();
    let batchOperations = 0;
    const BATCH_SIZE = 500; // Firestore batch limit

    for (const matchDoc of matchesSnapshot.docs) {
      const matchId = matchDoc.id;
      const matchData = matchDoc.data();
      const stage = matchData.stage;
      const stageStakes = settings.stakes[stage] || { team: 50, goal: 50 };
      const teamStake = stageStakes.team;
      const goalStake = stageStakes.goal;

      // Get all bets for this match
      const betsSnapshot = await db.collection('bets')
        .where('matchId', '==', matchId)
        .get();

      for (const betDoc of betsSnapshot.docs) {
        const bet = betDoc.data();
        let amountLost = 0;

        // Calculate amountLost based on bet results
        if (bet.isDefault || bet.teamBetResult === 'forfeited') {
          // Forfeit or default: lost full stake
          amountLost = teamStake + goalStake;
        } else if (bet.goalBetResult === 'refunded') {
          // Goal bet was refunded (no goal winners scenario) - no loss on goal
          // Only lose teamStake if team was wrong
          if (bet.teamBetResult === 'lost') {
            amountLost = teamStake;
          } else {
            amountLost = 0;
          }
        } else {
          // Normal case: count actual losses
          if (bet.teamBetResult === 'lost') {
            amountLost += teamStake;
          }
          if (bet.goalBetResult === 'lost') {
            amountLost += goalStake;
          }
          // If won or draw_win on team, and won on goal: amountLost stays 0
        }

        // Update bet with corrected amountLost (if it changed)
        const oldAmountLost = bet.amountLost || 0;
        if (amountLost !== oldAmountLost) {
          batch.update(betDoc.ref, { amountLost });
          updatedBetCount++;
          batchOperations++;

          if (batchOperations >= BATCH_SIZE) {
            await batch.commit();
            console.log(`  Batch committed. Total bets updated so far: ${updatedBetCount}`);
            batchOperations = 0;
          }
        }
      }
    }

    // Commit remaining operations
    if (batchOperations > 0) {
      await batch.commit();
    }

    console.log(`✓ Updated ${updatedBetCount} bet documents with corrected amountLost values`);

    // Now rebuild leaderboard with corrected logic
    console.log('Rebuilding leaderboard...');
    await rebuildLeaderboard(settings);
    console.log('✓ Leaderboard rebuilt');

    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
}

async function rebuildLeaderboard(settings) {
  const usersSnapshot = await db.collection('users').get();
  const matchesSnapshot = await db.collection('matches')
    .where('status', 'in', ['completed', 'postponed'])
    .get();

  const completedMatches = {};
  matchesSnapshot.forEach((doc) => {
    completedMatches[doc.id] = doc.data();
  });

  const batch = db.batch();
  let batchOperations = 0;
  const BATCH_SIZE = 500;

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();

    if (userData.role === 'pending') {
      continue;
    }

    // Fetch all bets for this user
    const betsSnapshot = await db.collection('bets')
      .where('userId', '==', userId)
      .get();
    const userBets = {};
    betsSnapshot.forEach((doc) => {
      userBets[doc.data().matchId] = doc.data();
    });

    let totalWon = 0;
    let totalLost = 0;
    let correctPredictions = 0;
    let totalPredictions = 0;

    // Iterate through completed matches
    Object.keys(completedMatches).forEach((matchId) => {
      const match = completedMatches[matchId];

      // Late entry protection
      if (userData.joinedAt && userData.joinedAt.toDate() > match.kickoffTimeIST.toDate()) {
        return;
      }

      if (match.status === 'postponed') {
        return;
      }

      const stage = match.stage;
      const stageStakes = settings.stakes[stage] || { team: 50, goal: 50 };

      totalPredictions += 2; // Team + Goal

      const bet = userBets[matchId];
      if (bet) {
        // Sum actual amountWon and amountLost from the bet
        totalWon += bet.amountWon || 0;
        totalLost += bet.amountLost || 0;

        if (bet.teamBetResult === 'won' || bet.teamBetResult === 'draw_win') {
          correctPredictions += 1;
        }
        if (bet.goalBetResult === 'won') {
          correctPredictions += 1;
        }
      }
    });

    const netProfit = totalWon - totalLost;
    const accuracyPercent = totalPredictions > 0
      ? Number(((correctPredictions / totalPredictions) * 100).toFixed(2))
      : 0;

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

    batchOperations++;
    if (batchOperations >= BATCH_SIZE) {
      await batch.commit();
      console.log(`  Leaderboard batch committed. Users updated: ${batchOperations}`);
      batchOperations = 0;
    }
  }

  if (batchOperations > 0) {
    await batch.commit();
  }
}

// Run the migration
migrateLossTracking().catch(console.error);
