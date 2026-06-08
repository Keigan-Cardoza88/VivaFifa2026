const { db, auth, admin } = require('../utils/firebase');

const ADMIN_EMAILS = [
  'cardoza.kian@gmail.com',
  'cardoza.keigs@gmail.com',
  'cardoza.joseph@gmail.com'
];

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 1. Authorize Admin
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    if (!ADMIN_EMAILS.includes(decodedToken.email)) {
      return res.status(403).json({ error: 'Forbidden: Admin access only' });
    }

    const { matchId, status, resultTeamAGoals, resultTeamBGoals, winner } = req.body;

    if (!matchId) {
      return res.status(400).json({ error: 'Missing matchId' });
    }

    // 2. Fetch Match Details
    const matchRef = db.collection('matches').doc(String(matchId));
    const matchDoc = await matchRef.get();
    if (!matchDoc.exists) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const matchData = matchDoc.data();
    const stage = matchData.stage;

    // Fetch Global Settings
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

    const stageStakes = settings.stakes[stage] || { team: 50, goal: 50 };
    const teamStake = stageStakes.team;
    const goalStake = stageStakes.goal;
    const totalStake = teamStake + goalStake;

    // 3. Handle Postponed/Voided Status
    if (status === 'postponed') {
      await db.runTransaction(async (transaction) => {
        // Void all bets for this match
        const betsSnapshot = await transaction.get(db.collection('bets').where('matchId', '==', String(matchId)));
        betsSnapshot.forEach((doc) => {
          transaction.update(doc.ref, {
            teamBetResult: 'lost',
            goalBetResult: 'lost',
            amountWon: 0,
            amountLost: 0 // Refunded, so net loss/win is 0
          });
        });
        transaction.update(matchRef, { status: 'postponed', winner: null, resultTeamAGoals: null, resultTeamBGoals: null });
      });

      await rebuildLeaderboard();
      return res.status(200).json({ message: 'Match marked as postponed. Bets voided.' });
    }

    if (status !== 'completed') {
      return res.status(400).json({ error: 'Invalid match status. Usecompleted or postponed.' });
    }

    if (resultTeamAGoals === undefined || resultTeamBGoals === undefined || !winner) {
      return res.status(400).json({ error: 'Missing score results or winner' });
    }

    // 4. Run Settlement Transaction
    let settlementBackup = null;
    await db.runTransaction(async (transaction) => {
      // Fetch users
      const usersSnapshot = await transaction.get(db.collection('users'));
      const users = [];
      usersSnapshot.forEach((doc) => {
        const u = doc.data();
        u.uid = doc.id;
        users.push(u);
      });

      // Fetch existing bets
      const betsSnapshot = await transaction.get(db.collection('bets').where('matchId', '==', String(matchId)));
      const existingBets = {};
      betsSnapshot.forEach((doc) => {
        existingBets[doc.data().userId] = { id: doc.id, ref: doc.ref, ...doc.data() };
      });

      let refereeKittyInflow = 0;
      let finalsKittyInflow = 0;

      const processedBets = [];
      const participants = users.filter(u => u.role === 'participant' || ADMIN_EMAILS.includes(u.email));

      // A. Create Default Bets (Missed Bets) & evaluate existing bets
      participants.forEach((user) => {
        // Late entry check: If user joined AFTER kickoff time, they don't participate and don't forfeit
        if (user.joinedAt && user.joinedAt.toDate() > matchData.kickoffTimeIST.toDate()) {
          return;
        }

        let userBet = existingBets[user.uid];

        if (!userBet) {
          // MISSING BET PENALTY
          // Forfeit stake: 50% Referee, 50% Finals
          const defaultBetId = `${user.uid}_${matchId}`;
          const defaultBetRef = db.collection('bets').doc(defaultBetId);
          
          userBet = {
            betId: defaultBetId,
            userId: user.uid,
            matchId: String(matchId),
            teamPrediction: winner === 'teamA' ? 'teamB' : 'teamA', // Auto lose
            goalsTeamA: -1,
            goalsTeamB: -1,
            placedAt: admin.firestore.Timestamp.now(),
            isDefault: true,
            teamBetResult: 'forfeited',
            goalBetResult: 'forfeited',
            amountWon: 0,
            amountLost: totalStake
          };

          transaction.set(defaultBetRef, userBet);
          
          refereeKittyInflow += totalStake * 0.5;
          finalsKittyInflow += totalStake * 0.5;
        } else {
          processedBets.push(userBet);
        }
      });

      // B. Evaluate Placed Bets
      // Filter out defaults
      const placedBets = processedBets;

      // TEAM BETS EVALUATION
      const teamWinners = [];
      const teamLosers = [];

      placedBets.forEach((bet) => {
        if (bet.teamPrediction === winner) {
          teamWinners.push(bet);
        } else {
          teamLosers.push(bet);
        }
      });
      if (teamWinners.length > 0 && teamLosers.length > 0) {
        // Losers lose their stake, winners share the losers' pool
        const loserPool = teamLosers.length * teamStake;
        const sharePerWinner = loserPool / teamWinners.length;

        teamWinners.forEach((bet) => {
          const updatePayload = {
            teamBetResult: winner === 'draw' ? 'draw_win' : 'won',
            amountWon: teamStake + sharePerWinner
          };
          transaction.update(bet.ref, updatePayload);
          Object.assign(bet, updatePayload);
        });

        teamLosers.forEach((bet) => {
          const updatePayload = {
            teamBetResult: 'lost',
            amountLost: teamStake
          };
          transaction.update(bet.ref, updatePayload);
          Object.assign(bet, updatePayload);
        });
      } else if (teamWinners.length > 0 && teamLosers.length === 0) {
        // Everyone picked the winner -> refund stakes
        teamWinners.forEach((bet) => {
          const updatePayload = {
            teamBetResult: winner === 'draw' ? 'draw_win' : 'won',
            amountWon: teamStake,
            amountLost: 0
          };
          transaction.update(bet.ref, updatePayload);
          Object.assign(bet, updatePayload);
        });
      } else if (teamWinners.length === 0 && teamLosers.length > 0) {
        // Everyone lost (e.g. no one predicted draw, or everyone picked wrong team)
        // Entire team bet pool goes 50% Referee, 50% Finals
        const totalTeamPool = teamLosers.length * teamStake;
        refereeKittyInflow += totalTeamPool * 0.5;
        finalsKittyInflow += totalTeamPool * 0.5;

        teamLosers.forEach((bet) => {
          const updatePayload = {
            teamBetResult: 'lost',
            amountLost: teamStake
          };
          transaction.update(bet.ref, updatePayload);
          Object.assign(bet, updatePayload);
        });
      }
      // GOAL BETS EVALUATION
      const goalWinners = [];
      const goalLosers = [];

      placedBets.forEach((bet) => {
        if (bet.goalsTeamA === Number(resultTeamAGoals) && bet.goalsTeamB === Number(resultTeamBGoals)) {
          goalWinners.push(bet);
        } else {
          goalLosers.push(bet);
        }
      });

      const totalGoalPool = placedBets.length * goalStake;
      if (goalWinners.length > 0) {
        // Split goal pool among winners
        const sharePerWinner = totalGoalPool / goalWinners.length;

        goalWinners.forEach((bet) => {
          // If they also won team bet, add to amountWon, else set it
          const existingWon = winner === bet.teamPrediction ? (teamStake + (teamLosers.length * teamStake / (teamWinners.length || 1))) : 0;
          
          const updatePayload = {
            goalBetResult: 'won',
            amountWon: existingWon + sharePerWinner
          };
          transaction.update(bet.ref, updatePayload);
          Object.assign(bet, updatePayload);
        });

        goalLosers.forEach((bet) => {
          // Add goalStake to amountLost
          const existingLost = winner !== bet.teamPrediction ? teamStake : 0;
          const updatePayload = {
            goalBetResult: 'lost',
            amountLost: existingLost + goalStake
          };
          transaction.update(bet.ref, updatePayload);
          Object.assign(bet, updatePayload);
        });
      } else {
        // No goal winners -> Goal pool goes 50% Referee, 50% Finals
        refereeKittyInflow += totalGoalPool * 0.5;
        finalsKittyInflow += totalGoalPool * 0.5;

        goalLosers.forEach((bet) => {
          const existingLost = winner !== bet.teamPrediction ? teamStake : 0;
          const updatePayload = {
            goalBetResult: 'lost',
            amountLost: existingLost + goalStake
          };
          transaction.update(bet.ref, updatePayload);
          Object.assign(bet, updatePayload);
        });
      }
      // Write Kitty Logs if there was inflow
      if (refereeKittyInflow > 0 || finalsKittyInflow > 0) {
        const kittyLogRef = db.collection('kitty').doc();
        transaction.set(kittyLogRef, {
          kittyId: kittyLogRef.id,
          type: goalWinners.length === 0 && teamWinners.length === 0 ? 'goalbet_unsolved' : (winner === 'draw' && teamWinners.length === 0 ? 'draw' : 'forfeit'),
          matchId: String(matchId),
          amount: refereeKittyInflow + finalsKittyInflow,
          splitReferee: refereeKittyInflow,
          splitFinals: finalsKittyInflow,
          createdAt: admin.firestore.Timestamp.now()
        });
      }

      // Update match document
      transaction.update(matchRef, {
        status: 'completed',
        resultTeamAGoals: Number(resultTeamAGoals),
        resultTeamBGoals: Number(resultTeamBGoals),
        winner
      });

      // Write full settlement backup snapshot
      const backupRef = db.collection('settlement_backups').doc(String(matchId));
      const backupData = {
        matchId: String(matchId),
        settledAt: admin.firestore.Timestamp.now(),
        resultTeamAGoals: Number(resultTeamAGoals),
        resultTeamBGoals: Number(resultTeamBGoals),
        winner,
        refereeKittyInflow,
        finalsKittyInflow,
        bets: participants.map(user => {
          const defaultBetId = `${user.uid}_${matchId}`;
          const bet = existingBets[user.uid] || {
            betId: defaultBetId,
            userId: user.uid,
            matchId: String(matchId),
            teamPrediction: winner === 'teamA' ? 'teamB' : 'teamA',
            goalsTeamA: -1,
            goalsTeamB: -1,
            isDefault: true,
            teamBetResult: 'forfeited',
            goalBetResult: 'forfeited',
            amountWon: 0,
            amountLost: totalStake
          };
          return {
            userName: user.name || 'Anonymous',
            userEmail: user.email,
            teamPrediction: bet.teamPrediction,
            goalsTeamA: bet.goalsTeamA,
            goalsTeamB: bet.goalsTeamB,
            teamBetResult: bet.teamBetResult || 'lost',
            goalBetResult: bet.goalBetResult || 'lost',
            amountWon: bet.amountWon || 0,
            amountLost: bet.amountLost || 0,
            isDefault: bet.isDefault || false
          };
        })
      };
      transaction.set(backupRef, backupData);
      settlementBackup = {
        ...backupData,
        settledAt: new Date().toISOString()
      };
    });

    // 5. Rebuild Leaderboard
    await rebuildLeaderboard();

    return res.status(200).json({ 
      message: 'Match settled successfully. Leaderboard updated.',
      backup: settlementBackup
    });
  } catch (error) {
    console.error('Match settlement error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};

// Rebuilds entire leaderboard from scratch to ensure perfect self-healing
async function rebuildLeaderboard() {
  const usersSnapshot = await db.collection('users').get();
  const matchesSnapshot = await db.collection('matches').where('status', 'in', ['completed', 'postponed']).get();
  
  const completedMatches = {};
  matchesSnapshot.forEach((doc) => {
    completedMatches[doc.id] = doc.data();
  });

  // Fetch global settings to get stakes dynamically
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

  const batch = db.batch();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();

    // Fetch all bets placed by this user
    const betsSnapshot = await db.collection('bets').where('userId', '==', userId).get();
    const userBets = {};
    betsSnapshot.forEach((doc) => {
      userBets[doc.data().matchId] = doc.data();
    });

    let totalWon = 0;
    let totalLost = 0; // Will represent total contribution stakes
    let correctPredictions = 0;
    let totalPredictions = 0;

    // Iterate through completed matches that kicked off after the user joined
    Object.keys(completedMatches).forEach((matchId) => {
      const match = completedMatches[matchId];
      
      // Late entry protection: skip matches that started before they joined
      if (userData.joinedAt && userData.joinedAt.toDate() > match.kickoffTimeIST.toDate()) {
        return;
      }

      if (match.status === 'postponed') {
        // Postponed matches are voided, count as 0 predictions
        return;
      }

      const stage = match.stage;
      const stageStakes = settings.stakes[stage] || { team: 50, goal: 50 };
      const teamStake = stageStakes.team;
      const goalStake = stageStakes.goal;

      totalPredictions += 2; // Team + Goal predictions
      totalLost += teamStake + goalStake; // Always add the user's total stake contribution for this match

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
}
