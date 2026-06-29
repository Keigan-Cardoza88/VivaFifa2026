let db, auth, admin;

const ADMIN_EMAILS = [
  'cardoza.kian@gmail.com',
  'cardoza.keigs@gmail.com',
  'cardoza.joseph@gmail.com'
];

function getEligibilityTimestamp(user) {
  return user.approvedAt || user.joinedAt || null;
}

function joinedAfterMatch(user, matchData) {
  const eligibleFrom = getEligibilityTimestamp(user);
  return eligibleFrom && eligibleFrom.toDate() > matchData.kickoffTimeIST.toDate();
}

module.exports = async (req, res) => {
  // Handle CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, PATCH, DELETE, POST, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    try {
      const firebase = require('../utils/firebase');
      db = firebase.db;
      auth = firebase.auth;
      admin = firebase.admin;
      await resettleMatchDirectly(db, '3');
      await resettleMatchDirectly(db, '4');
      await rebuildLeaderboard();
      return res.status(200).json({ message: 'Matches 3 and 4 successfully resettled, and leaderboard updated.' });
    } catch (error) {
      return res.status(500).json({ error: 'Resettlement failed', details: error.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const firebase = require('../utils/firebase');
    db = firebase.db;
    auth = firebase.auth;
    admin = firebase.admin;

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
    const stage = matchData.stage || (Number(matchId) < 149 ? 'group' : 'r32');

    // Fetch Global Settings
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

    let stageStakes = settings.stakes[stage] || { team: 50, goal: 50 };
    if (stage === 'group' && Number(matchId) < 45) {
      stageStakes = { team: 50, goal: 50 };
    }
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
      return res.status(400).json({ error: 'Invalid match status. Use completed or postponed.' });
    }

    if (resultTeamAGoals === undefined || resultTeamBGoals === undefined || !winner) {
      return res.status(400).json({ error: 'Missing score results or winner' });
    }

    // Pre-fetch all kitty logs outside the transaction to save transaction operations and avoid Quota Exceeded error
    const allKittiesSnapshot = await db.collection('kitty').get();

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

      const isStakesMatch = String(matchId).endsWith('_stakes');
      const cleanMatchId = String(matchId).replace('_stakes', '');

      // Fetch existing bets (Normal)
      const existingBets = {};
      if (!isStakesMatch) {
        const betsSnapshot = await transaction.get(db.collection('bets').where('matchId', '==', String(cleanMatchId)));
        betsSnapshot.forEach((doc) => {
          existingBets[doc.data().userId] = { id: doc.id, ref: doc.ref, ...doc.data() };
        });
      }

      // Fetch existing bets (Stakes)
      const stakesBets = {};
      if (isStakesMatch) {
        const stakesSnapshot = await transaction.get(db.collection('stakes_bets').where('matchId', '==', String(cleanMatchId)));
        stakesSnapshot.forEach((doc) => {
          stakesBets[doc.data().userId] = { id: doc.id, ref: doc.ref, ...doc.data() };
        });
      }

      // Check if already settled old
      const isAlreadySettledOld = matchData.settledWithNewBonus || false;

      // Delete old kitty logs to prevent duplicates on resettlement
      const kittySnapshot = await transaction.get(db.collection('kitty').where('matchId', 'in', [String(matchId), `${matchId}_stakes`]));

      kittySnapshot.forEach((doc) => {
        transaction.delete(doc.ref);
      });

      // Define local settlement scoring block
      const runSettlementForCollection = (collectionName, existingBetsMap, isStakesCollection) => {
        let finalsKittyInflow = 0;
        let forfeitTeamPool = 0;
        let forfeitGoalPool = 0;

        // Dynamic stakes configuration
        const smSettings = settings.stakes_mode || {};
        const stageStakes = isStakesCollection 
          ? (smSettings[stage] || { team: 100, goal: 50, penalty: 50 })
          : (settings.stakes[stage] || { team: 50, goal: 50, penalty: 50 });

        const teamStake = stageStakes.team || 0;
        const goalStake = stageStakes.goal || 0;
        const penaltyStake = stageStakes.penalty !== undefined ? stageStakes.penalty : 50;

        const placedBets = [];
        const participants = users.filter(u => u.role === 'participant' || ADMIN_EMAILS.includes(u.email));

        participants.forEach((user) => {
          if (joinedAfterMatch(user, matchData)) {
            return;
          }

          const userBet = existingBetsMap[user.uid];

          if (!userBet) {
            // STAKES: no forfeit — players bet on their own will, simply skip.
            if (!isStakesCollection) {
              const defaultBetId = `${user.uid}_${matchId}`;
              const defaultBetRef = db.collection(collectionName).doc(defaultBetId);

              // Default forfeit uses normal teamStake + goalStake
              const defaultForfeitCost = teamStake + goalStake;

              transaction.set(defaultBetRef, {
                betId: defaultBetId,
                userId: user.uid,
                matchId: String(matchId),
                teamPrediction: winner === 'teamA' ? 'teamB' : 'teamA',
                goalsTeamA: -1,
                goalsTeamB: -1,
                placedAt: admin.firestore.Timestamp.now(),
                isDefault: true,
                teamBetResult: 'forfeited',
                goalBetResult: 'forfeited',
                amountWon: 0,
                amountLost: defaultForfeitCost
              });

              forfeitTeamPool += teamStake;
              forfeitGoalPool += goalStake;
            }
          } else {
            userBet.amountWon = 0;
            userBet.amountLost = 0;
            placedBets.push(userBet);
          }
        });

        // 1. Auto-correct teamPrediction based on goals scoreline to heal any mismatch anomalies BEFORE team split
        placedBets.forEach((userBet) => {
          if (!userBet.winViaPenalties && userBet.goalsTeamA !== undefined && userBet.goalsTeamB !== undefined) {
            const numA = Number(userBet.goalsTeamA);
            const numB = Number(userBet.goalsTeamB);
            let corrected = userBet.teamPrediction;
            if (numA > numB) {
              corrected = 'teamA';
            } else if (numB > numA) {
              corrected = 'teamB';
            } else if (stage === 'group') {
              corrected = 'draw';
            }

            if (corrected !== userBet.teamPrediction) {
              userBet.teamPrediction = corrected;
              // Write the corrected prediction to the database
              transaction.update(userBet.ref, { teamPrediction: corrected });
            }
          }
        });

        const teamWinners = [];
        const teamLosers = [];

        placedBets.forEach((bet) => {
          if (bet.teamPrediction === winner) {
            teamWinners.push(bet);
          } else {
            teamLosers.push(bet);
          }
        });

        if (teamWinners.length > 0) {
          const loserPool = (teamLosers.length * teamStake) + forfeitTeamPool;
          const sharePerWinner = loserPool / teamWinners.length;

          teamWinners.forEach((bet) => {
            const updatePayload = {
              // STAKES: no draws in R32+, always 'won'
              teamBetResult: (!isStakesCollection && winner === 'draw') ? 'draw_win' : 'won',
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
        } else {
          // No team winners -> entire pool goes to kitty (for both normal and stakes)
          const totalTeamPool = (placedBets.length * teamStake) + forfeitTeamPool;
          finalsKittyInflow += totalTeamPool;

          teamLosers.forEach((bet) => {
            const updatePayload = {
              teamBetResult: 'lost',
              amountLost: teamStake,
              amountWon: bet.amountWon || 0
            };
            transaction.update(bet.ref, updatePayload);
            Object.assign(bet, updatePayload);
          });
        }

        // --- Unified Goals & Penalties Pool Settlement ---
        const endedInPenalties = (resultTeamAGoals === resultTeamBGoals) && (winner !== 'draw') && (stage !== 'group');

        // Split wagers into standard goal bets vs penalty shootout bets
        const goalBets = placedBets.filter(b => !b.winViaPenalties);
        const penaltyBets = placedBets.filter(b => !!b.winViaPenalties);

        // Calculate unified pool: sum of goal wagers + penalty wagers + forfeit wagers
        const totalWageredGoal = goalBets.length * goalStake;
        const totalWageredPenalty = penaltyBets.length * penaltyStake;
        const unifiedGoalPool = totalWageredGoal + totalWageredPenalty + forfeitGoalPool;

        // Define shootout/goals winners variable for return
        let goalWinners = [];

        if (endedInPenalties) {
          // Shootout winners predicted shootout AND correct winning team
          const shootoutWinners = penaltyBets.filter(b => b.teamPrediction === winner);
          goalWinners = shootoutWinners;

          // Mark all regular goal wagers as lost
          goalBets.forEach((bet) => {
            const existingLost = bet.amountLost || 0;
            const updatePayload = {
              goalBetResult: 'lost',
              amountLost: existingLost + goalStake,
              amountWon: bet.amountWon || 0
            };
            transaction.update(bet.ref, updatePayload);
            Object.assign(bet, updatePayload);
          });

          // Mark wrong shootout predictors as lost
          penaltyBets.forEach((bet) => {
            if (bet.teamPrediction !== winner) {
              const existingLost = bet.amountLost || 0;
              const updatePayload = {
                goalBetResult: 'lost',
                amountLost: existingLost + penaltyStake,
                amountWon: bet.amountWon || 0
              };
              transaction.update(bet.ref, updatePayload);
              Object.assign(bet, updatePayload);
            }
          });

          if (shootoutWinners.length > 0) {
            // Shootout winners split the entire unified goal/penalty pool
            const sharePerWinner = unifiedGoalPool / shootoutWinners.length;
            shootoutWinners.forEach((bet) => {
              const existingWon = bet.amountWon || 0;
              const updatePayload = {
                goalBetResult: 'won',
                amountWon: existingWon + sharePerWinner,
                amountLost: 0
              };
              transaction.update(bet.ref, updatePayload);
              Object.assign(bet, updatePayload);
            });
          } else {
            // No shootout winners -> whole pool goes to kitty
            finalsKittyInflow += unifiedGoalPool;
            penaltyBets.forEach((bet) => {
              const existingLost = bet.amountLost || 0;
              const updatePayload = {
                goalBetResult: 'lost',
                amountLost: existingLost + penaltyStake,
                amountWon: bet.amountWon || 0
              };
              transaction.update(bet.ref, updatePayload);
              Object.assign(bet, updatePayload);
            });
          }
        } else {
          // Match was decided in regular/ET (no shootout)

          // 1. All penalty shootout wagers are lost
          penaltyBets.forEach((bet) => {
            const existingLost = bet.amountLost || 0;
            const updatePayload = {
              goalBetResult: 'lost',
              amountLost: existingLost + penaltyStake,
              amountWon: bet.amountWon || 0
            };
            transaction.update(bet.ref, updatePayload);
            Object.assign(bet, updatePayload);
          });

          // 2. Resolve regular goal predictions
          goalWinners = [];
          const goalLosers = [];

          goalBets.forEach((bet) => {
            if (bet.goalsTeamA === Number(resultTeamAGoals) && bet.goalsTeamB === Number(resultTeamBGoals)) {
              goalWinners.push(bet);
            } else {
              goalLosers.push(bet);
            }
          });

          if (goalWinners.length > 0) {
            const sharePerWinner = unifiedGoalPool / goalWinners.length;

            goalWinners.forEach((bet) => {
              const existingWon = bet.amountWon || 0;
              const updatePayload = {
                goalBetResult: 'won',
                amountWon: existingWon + sharePerWinner,
                amountLost: 0
              };
              transaction.update(bet.ref, updatePayload);
              Object.assign(bet, updatePayload);
            });

            goalLosers.forEach((bet) => {
              const existingLost = bet.amountLost || 0;
              const updatePayload = {
                goalBetResult: 'lost',
                amountLost: existingLost + goalStake,
                amountWon: bet.amountWon || 0
              };
              transaction.update(bet.ref, updatePayload);
              Object.assign(bet, updatePayload);
            });
          } else {
            const partialWinners = [];
            const nonPartialLosers = [];

            goalBets.forEach((bet) => {
              if (bet.goalsTeamA === Number(resultTeamAGoals) || bet.goalsTeamB === Number(resultTeamBGoals)) {
                partialWinners.push(bet);
              } else {
                nonPartialLosers.push(bet);
              }
            });

            if (partialWinners.length > 0) {
              // Both modes split 50% with kitty for partial winners
              const sharePerPartialWinner = (unifiedGoalPool * 0.5) / partialWinners.length;
              finalsKittyInflow += unifiedGoalPool * 0.5;

              partialWinners.forEach((bet) => {
                const existingWon = bet.amountWon || 0;
                const updatePayload = {
                  goalBetResult: 'won_partial',
                  amountWon: existingWon + sharePerPartialWinner,
                  amountLost: 0
                };
                transaction.update(bet.ref, updatePayload);
                Object.assign(bet, updatePayload);
              });

              nonPartialLosers.forEach((bet) => {
                const existingLost = bet.amountLost || 0;
                const updatePayload = {
                  goalBetResult: 'lost',
                  amountLost: existingLost + goalStake,
                  amountWon: bet.amountWon || 0
                };
                transaction.update(bet.ref, updatePayload);
                Object.assign(bet, updatePayload);
              });
            } else {
              // No goal winners or partial winners -> entire pool goes to kitty
              finalsKittyInflow += unifiedGoalPool;

              goalLosers.forEach((bet) => {
                const existingLost = bet.amountLost || 0;
                const updatePayload = {
                  goalBetResult: 'lost',
                  amountLost: existingLost + goalStake,
                  amountWon: bet.amountWon || 0
                };
                transaction.update(bet.ref, updatePayload);
                Object.assign(bet, updatePayload);
              });
            }
          }
        }

        if (!isStakesCollection && stage === 'group') {
          if (Number(matchId) < 45 || isAlreadySettledOld) {
            let totalBonusPayout = 0;
            placedBets.forEach((bet) => {
              const gotOneSideCorrect = (bet.goalsTeamA === Number(resultTeamAGoals) || bet.goalsTeamB === Number(resultTeamBGoals));
              if (gotOneSideCorrect) {
                totalBonusPayout += 25;
                const currentWon = bet.amountWon || 0;
                const updatePayload = {
                  amountWon: currentWon + 25,
                  refereeBonus: 25
                };
                transaction.update(bet.ref, updatePayload);
                Object.assign(bet, updatePayload);
              } else {
                const updatePayload = { refereeBonus: 0 };
                transaction.update(bet.ref, updatePayload);
                Object.assign(bet, updatePayload);
              }
            });
            finalsKittyInflow -= totalBonusPayout;
          } else {
            let totalRequiredBonus = 0;
            const playerBonusDetails = [];

            placedBets.forEach((bet) => {
              let bonus = 0;
              const teamWon = (bet.teamPrediction === winner);
              const goalsACorrect = (bet.goalsTeamA === Number(resultTeamAGoals));
              const goalsBCorrect = (bet.goalsTeamB === Number(resultTeamBGoals));

              if (teamWon) bonus += 300;
              if (goalsACorrect && goalsBCorrect) bonus += 300;
              else if (goalsACorrect || goalsBCorrect) bonus += 150;

              if (bonus > 0) {
                totalRequiredBonus += bonus;
                playerBonusDetails.push({ bet, bonus });
              } else {
                const updatePayload = { refereeBonus: 0 };
                transaction.update(bet.ref, updatePayload);
                Object.assign(bet, updatePayload);
              }
            });

            let currentFinalsKitty = 0;
            allKittiesSnapshot.forEach(doc => {
              const data = doc.data();
              if (Number(data.matchId) === Number(matchId)) return;
              currentFinalsKitty += (data.splitFinals || 0) + (data.splitReferee || 0);
            });

            const availableFinals = Math.max(0, currentFinalsKitty + finalsKittyInflow);
            let actualBonusPayout = totalRequiredBonus;
            let scaleFactor = 1.0;

            if (totalRequiredBonus > availableFinals) {
              actualBonusPayout = availableFinals;
              scaleFactor = availableFinals / totalRequiredBonus;
            }

            if (actualBonusPayout > 0) {
              finalsKittyInflow -= actualBonusPayout;
              playerBonusDetails.forEach(({ bet, bonus }) => {
                const scaledBonus = Math.round(bonus * scaleFactor * 100) / 100;
                const currentWon = bet.amountWon || 0;
                const updatePayload = {
                  amountWon: currentWon + scaledBonus,
                  refereeBonus: scaledBonus
                };
                transaction.update(bet.ref, updatePayload);
                Object.assign(bet, updatePayload);
              });
            } else {
              playerBonusDetails.forEach(({ bet }) => {
                const updatePayload = { refereeBonus: 0 };
                transaction.update(bet.ref, updatePayload);
                Object.assign(bet, updatePayload);
              });
            }
          }
        } else {
          placedBets.forEach((bet) => {
            const updatePayload = { refereeBonus: 0 };
            transaction.update(bet.ref, updatePayload);
            Object.assign(bet, updatePayload);
          });
        }

        return { finalsKittyInflow, teamWinners, goalWinners };
      };

      let normalResult = { finalsKittyInflow: 0, teamWinners: [], goalWinners: [] };
      let stakesResult = { finalsKittyInflow: 0, teamWinners: [], goalWinners: [] };

      if (!isStakesMatch) {
        normalResult = runSettlementForCollection('bets', existingBets, false);
      } else {
        stakesResult = runSettlementForCollection('stakes_bets', stakesBets, true);
      }

      const totalInflow = normalResult.finalsKittyInflow + stakesResult.finalsKittyInflow;

      if (!isStakesMatch && normalResult.finalsKittyInflow !== 0) {
        const kittyLogRef = db.collection('kitty').doc();
        const normalType = normalResult.teamWinners.length === 0 && normalResult.goalWinners.length === 0
          ? 'goalbet_unsolved'
          : (winner === 'draw' && normalResult.teamWinners.length === 0 ? 'draw' : 'forfeit');
        transaction.set(kittyLogRef, {
          kittyId: kittyLogRef.id,
          type: normalType,
          matchId: String(matchId),
          amount: normalResult.finalsKittyInflow,
          splitReferee: 0,
          splitFinals: normalResult.finalsKittyInflow,
          createdAt: admin.firestore.Timestamp.now()
        });
      }

      if (isStakesMatch && stakesResult.finalsKittyInflow !== 0) {
        const kittyLogRef = db.collection('kitty').doc();
        const stakesType = stakesResult.teamWinners.length === 0 && stakesResult.goalWinners.length === 0
          ? 'goalbet_unsolved'
          : (winner === 'draw' && stakesResult.teamWinners.length === 0 ? 'draw' : 'forfeit');
        transaction.set(kittyLogRef, {
          kittyId: kittyLogRef.id,
          type: stakesType,
          matchId: String(matchId),
          amount: stakesResult.finalsKittyInflow,
          splitReferee: 0,
          splitFinals: stakesResult.finalsKittyInflow,
          createdAt: admin.firestore.Timestamp.now()
        });
      }

      // Update match document
      const updateFields = {
        status: 'completed',
        resultTeamAGoals: Number(resultTeamAGoals),
        resultTeamBGoals: Number(resultTeamBGoals),
        winner
      };
      if (Number(matchId) >= 45 && !isAlreadySettledOld) {
        updateFields.settledWithNewBonus = true;
      }
      transaction.update(matchRef, updateFields);

        // Define active participants list for backup
        const backupParticipants = users.filter(u => u.role === 'participant' || ADMIN_EMAILS.includes(u.email));

        const backupRef = db.collection('settlement_backups').doc(String(matchId));
        const backupData = {
          matchId: String(matchId),
          settledAt: admin.firestore.Timestamp.now(),
          resultTeamAGoals: Number(resultTeamAGoals),
          resultTeamBGoals: Number(resultTeamBGoals),
          winner,
          refereeKittyInflow: 0,
          finalsKittyInflow: totalInflow,
          bets: backupParticipants
            .filter(user => {
              if (joinedAfterMatch(user, matchData)) return false;
              if (isStakesMatch) {
                // For Stakes, only include users who actually placed a bet
                return !!stakesBets[user.uid];
              }
              return true;
            })
            .map(user => {
              const defaultBetId = `${user.uid}_${cleanMatchId}`;
              const bet = isStakesMatch
                ? stakesBets[user.uid]
                : (existingBets[user.uid] || {
                    betId: defaultBetId,
                    userId: user.uid,
                    matchId: String(cleanMatchId),
                    teamPrediction: winner === 'teamA' ? 'teamB' : 'teamA',
                    goalsTeamA: -1,
                    goalsTeamB: -1,
                    isDefault: true,
                    teamBetResult: 'forfeited',
                    goalBetResult: 'forfeited',
                    amountWon: 0,
                    amountLost: totalStake
                  });
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
  const ALL_LEADERBOARD_STAGES = [
    { id: 'group', matchStage: 'group', isStakes: false },
    { id: 'r32_normal', matchStage: 'r32', isStakes: false },
    { id: 'r16', matchStage: 'r16', isStakes: false },
    { id: 'qf', matchStage: 'qf', isStakes: false },
    { id: 'sf', matchStage: 'sf', isStakes: false },
    { id: 'final', matchStage: 'final', isStakes: false },

    { id: 'r32', matchStage: 'r32', isStakes: true },
    { id: 'r16_stakes', matchStage: 'r16', isStakes: true },
    { id: 'qf_stakes', matchStage: 'qf', isStakes: true },
    { id: 'sf_stakes', matchStage: 'sf', isStakes: true },
    { id: 'final_stakes', matchStage: 'final', isStakes: true }
  ];

  // Pre-fetch all bets and stakes_bets at once to minimize database read queries
  const allBetsSnapshot = await db.collection('bets').get();
  const allStakesBetsSnapshot = await db.collection('stakes_bets').get();

  const betsByUserId = {};
  allBetsSnapshot.forEach((doc) => {
    const data = doc.data();
    const uid = data.userId;
    if (!betsByUserId[uid]) betsByUserId[uid] = {};
    betsByUserId[uid][data.matchId] = data;
  });

  const stakesBetsByUserId = {};
  allStakesBetsSnapshot.forEach((doc) => {
    const data = doc.data();
    const uid = data.userId;
    if (!stakesBetsByUserId[uid]) stakesBetsByUserId[uid] = {};
    stakesBetsByUserId[uid][data.matchId] = data;
  });

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();

    // Skip pending users from showing on the leaderboard
    if (userData.role === 'pending') {
      continue;
    }

    const userBets = betsByUserId[userId] || {};
    const userStakesBets = stakesBetsByUserId[userId] || {};

    ALL_LEADERBOARD_STAGES.forEach((stageConfig) => {
      const stage = stageConfig.id;
      const matchStage = stageConfig.matchStage;
      const isStakes = stageConfig.isStakes;

      let totalWon = 0;
      let totalLost = 0;
      let correctPredictions = 0;
      let totalPredictions = 0;

      // Iterate through completed matches that kicked off after the user joined
      Object.keys(completedMatches).forEach((matchId) => {
        const match = completedMatches[matchId];
        
        const rawStage = match.stage || (Number(matchId) < 149 ? 'group' : 'r32');
        // Group 'third_place' under 'final' stage for leaderboard aggregation
        const matchStageForLeaderboard = rawStage === 'third_place' ? 'final' : rawStage;
        if (matchStageForLeaderboard !== matchStage) {
          return;
        }

        // Exclude first two matches from R32 Stakes
        if (stage === 'r32' && Number(matchId) <= 150) {
          return;
        }

        // Late entry protection: skip matches that started before they joined
        if (joinedAfterMatch(userData, match)) {
          return;
        }

        if (match.status === 'postponed') {
          return;
        }

        // Use stakes_mode prices for stakes matches, normal stakes prices for normal
        let stageStakes;
        if (isStakes) {
          const smSettings = settings.stakes_mode || {};
          stageStakes = smSettings[rawStage] || settings.stakes[rawStage] || { team: 50, goal: 50 };
        } else {
          stageStakes = settings.stakes[rawStage] || { team: 50, goal: 50 };
          if (rawStage === 'group' && Number(matchId) < 45) {
            stageStakes = { team: 50, goal: 50 };
          }
        }
        const teamStake = stageStakes.team || 0;
        const goalStake = stageStakes.goal || 0;
        const penaltyStake = stageStakes.penalty !== undefined ? stageStakes.penalty : 50;

        const bet = isStakes ? userStakesBets[matchId] : userBets[matchId];

        if (bet) {
          // Auto-correct teamPrediction based on goals scoreline to heal any mismatch anomalies
          if (!bet.winViaPenalties && bet.goalsTeamA !== undefined && bet.goalsTeamB !== undefined) {
            const numA = Number(bet.goalsTeamA);
            const numB = Number(bet.goalsTeamB);
            if (numA > numB) {
              bet.teamPrediction = 'teamA';
            } else if (numB > numA) {
              bet.teamPrediction = 'teamB';
            } else if (rawStage === 'group') {
              bet.teamPrediction = 'draw';
            }
          }
          totalPredictions += 2; // Team + Goal predictions
          let matchTeamLost = teamStake;
          const activeGoalCost = bet.winViaPenalties ? penaltyStake : goalStake;
          let matchGoalLost = activeGoalCost;

          if (bet.isDefault) {
            matchTeamLost = teamStake;
            matchGoalLost = activeGoalCost;
          } else {
            if (bet.teamBetResult === 'refunded') {
              matchTeamLost = 0;
            }
            if (bet.goalBetResult === 'refunded') {
              matchGoalLost = 0;
            } else if (bet.goalBetResult === 'refunded_partial') {
              matchGoalLost = activeGoalCost * 0.5;
            }
          }
          totalWon += bet.amountWon || 0;

          if (bet.teamBetResult === 'won' || bet.teamBetResult === 'draw_win') {
            correctPredictions += 1;
          }
          if (bet.goalBetResult === 'won') {
            correctPredictions += 1;
          }
          totalLost += matchTeamLost + matchGoalLost;
        } else {
          if (isStakes) {
            // STAKES: no bet placed = no participation, no penalty. Skip entirely.
          } else {
            // NORMAL: no bet placed = forfeit (automatic loss of full stake)
            totalPredictions += 2;
            totalLost += teamStake + goalStake;
          }
        }
      });

      const netProfit = totalWon - totalLost;
      const accuracyPercent = totalPredictions > 0 ? Number(((correctPredictions / totalPredictions) * 100).toFixed(2)) : 0;

      const leaderboardRef = db.collection('leaderboard').doc(`${userId}_${stage}`);
      batch.set(leaderboardRef, {
        userId,
        userName: userData.name || 'Anonymous',
        stage,
        netProfit,
        totalWon,
        totalLost,
        correctPredictions,
        totalPredictions,
        accuracyPercent
      });
    });
  }

  await batch.commit();
}

async function resettleMatchDirectly(db, matchId) {
  const matchRef = db.collection('matches').doc(String(matchId));
  const matchDoc = await matchRef.get();
  if (!matchDoc.exists) return;
  const matchData = matchDoc.data();
  if (matchData.status !== 'completed') return;

  const stage = matchData.stage || (Number(matchId) < 149 ? 'group' : 'r32');
  const settingsDoc = await db.collection('settings').doc('global').get();
  const settings = settingsDoc.exists ? settingsDoc.data() : {
    stakes: {
      group: { team: 100, goal: 50 }
    }
  };
  let stageStakes = settings.stakes[stage] || { team: 100, goal: 50 };
  if (stage === 'group' && Number(matchId) < 45) {
    stageStakes = { team: 50, goal: 50 };
  }
  const teamStake = stageStakes.team;
  const goalStake = stageStakes.goal;
  const totalStake = teamStake + goalStake;

  await db.runTransaction(async (transaction) => {
    const usersSnapshot = await transaction.get(db.collection('users'));
    const users = [];
    usersSnapshot.forEach((doc) => {
      const u = doc.data();
      u.uid = doc.id;
      users.push(u);
    });

    const betsSnapshot = await transaction.get(db.collection('bets').where('matchId', '==', String(matchId)));
    const existingBets = {};
    betsSnapshot.forEach((doc) => {
      existingBets[doc.data().userId] = { id: doc.id, ref: doc.ref, ...doc.data() };
    });

    // Delete old kitty logs to prevent duplicates on resettlement
    const kittySnapshot = await transaction.get(db.collection('kitty').where('matchId', '==', String(matchId)));
    kittySnapshot.forEach((doc) => {
      transaction.delete(doc.ref);
    });

    let refereeKittyInflow = 0;
    let finalsKittyInflow = 0;
    let forfeitTeamPool = 0;
    let forfeitGoalPool = 0;
    const placedBets = [];
    const participants = users.filter(u => u.role === 'participant' || ADMIN_EMAILS.includes(u.email));

    participants.forEach((user) => {
      if (joinedAfterMatch(user, matchData)) return;
      const userBet = existingBets[user.uid];
      if (!userBet) {
        const defaultBetId = `${user.uid}_${matchId}`;
        const defaultBetRef = db.collection('bets').doc(defaultBetId);
        transaction.set(defaultBetRef, {
          betId: defaultBetId,
          userId: user.uid,
          matchId: String(matchId),
          teamPrediction: matchData.winner === 'teamA' ? 'teamB' : 'teamA',
          goalsTeamA: -1,
          goalsTeamB: -1,
          placedAt: admin.firestore.Timestamp.now(),
          isDefault: true,
          teamBetResult: 'forfeited',
          goalBetResult: 'forfeited',
          amountWon: 0,
          amountLost: totalStake
        });
        forfeitTeamPool += teamStake;
        forfeitGoalPool += goalStake;
      } else {
        userBet.amountWon = 0;
        userBet.amountLost = 0;
        placedBets.push(userBet);
      }
    });

    // Team outcome
    const teamWinners = [];
    const teamLosers = [];
    placedBets.forEach((bet) => {
      if (bet.teamPrediction === matchData.winner) {
        teamWinners.push(bet);
      } else {
        teamLosers.push(bet);
      }
    });

    if (teamWinners.length > 0) {
      const loserPool = (teamLosers.length * teamStake) + forfeitTeamPool;
      const sharePerWinner = loserPool / teamWinners.length;
      teamWinners.forEach((bet) => {
        const updatePayload = {
          teamBetResult: matchData.winner === 'draw' ? 'draw_win' : 'won',
          amountWon: teamStake + sharePerWinner,
          amountLost: 0
        };
        transaction.update(bet.ref, updatePayload);
        Object.assign(bet, updatePayload);
      });
      teamLosers.forEach((bet) => {
        const updatePayload = {
          teamBetResult: 'lost',
          amountWon: 0,
          amountLost: teamStake
        };
        transaction.update(bet.ref, updatePayload);
        Object.assign(bet, updatePayload);
      });
    } else {
      const totalTeamPool = (teamLosers.length * teamStake) + forfeitTeamPool;
      if (totalTeamPool > 0) {
        refereeKittyInflow += totalTeamPool * 0.5;
        finalsKittyInflow += totalTeamPool * 0.5;
      }
      teamLosers.forEach((bet) => {
        const updatePayload = {
          teamBetResult: 'lost',
          amountWon: 0,
          amountLost: teamStake
        };
        transaction.update(bet.ref, updatePayload);
        Object.assign(bet, updatePayload);
      });
    }

    // Goal outcome
    const goalWinners = [];
    const goalLosers = [];
    placedBets.forEach((bet) => {
      if (bet.goalsTeamA === Number(matchData.resultTeamAGoals) && bet.goalsTeamB === Number(matchData.resultTeamBGoals)) {
        goalWinners.push(bet);
      } else {
        goalLosers.push(bet);
      }
    });

    const totalGoalPool = (placedBets.length * goalStake) + forfeitGoalPool;
    if (goalWinners.length > 0) {
      const sharePerWinner = totalGoalPool / goalWinners.length;
      goalWinners.forEach((bet) => {
        const existingWon = bet.amountWon || 0;
        const updatePayload = {
          goalBetResult: 'won',
          amountWon: existingWon + sharePerWinner
        };
        transaction.update(bet.ref, updatePayload);
        Object.assign(bet, updatePayload);
      });
      goalLosers.forEach((bet) => {
        const existingLost = bet.amountLost || 0;
        const updatePayload = {
          goalBetResult: 'lost',
          amountLost: existingLost + goalStake
        };
        transaction.update(bet.ref, updatePayload);
        Object.assign(bet, updatePayload);
      });
    } else {
      if (totalGoalPool > 0) {
        refereeKittyInflow += totalGoalPool * 0.5;
        finalsKittyInflow += totalGoalPool * 0.5;
      }
      goalLosers.forEach((bet) => {
        const existingLost = bet.amountLost || 0;
        const updatePayload = {
          goalBetResult: 'lost',
          amountLost: existingLost + goalStake
        };
        transaction.update(bet.ref, updatePayload);
        Object.assign(bet, updatePayload);
      });
    }

    // Kitty inflow logs
    if (refereeKittyInflow > 0 || finalsKittyInflow > 0) {
      const kittyLogRef = db.collection('kitty').doc();
      const kittyType = teamWinners.length === 0 && goalWinners.length === 0
        ? 'goalbet_unsolved'
        : (matchData.winner === 'draw' && teamWinners.length === 0 ? 'draw' : 'forfeit');
      transaction.set(kittyLogRef, {
        kittyId: kittyLogRef.id,
        type: kittyType,
        matchId: String(matchId),
        amount: refereeKittyInflow + finalsKittyInflow,
        splitReferee: refereeKittyInflow,
        splitFinals: finalsKittyInflow,
        createdAt: admin.firestore.Timestamp.now()
      });
    }

    // Write full settlement backup snapshot
    const backupRef = db.collection('settlement_backups').doc(String(matchId));
    const backupData = {
      matchId: String(matchId),
      settledAt: admin.firestore.Timestamp.now(),
      resultTeamAGoals: Number(matchData.resultTeamAGoals),
      resultTeamBGoals: Number(matchData.resultTeamBGoals),
      winner: matchData.winner,
      refereeKittyInflow,
      finalsKittyInflow,
      bets: participants.filter(user => !joinedAfterMatch(user, matchData)).map(user => {
        const defaultBetId = `${user.uid}_${matchId}`;
        const bet = existingBets[user.uid] || {
          betId: defaultBetId,
          userId: user.uid,
          matchId: String(matchId),
          teamPrediction: matchData.winner === 'teamA' ? 'teamB' : 'teamA',
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
  });
}
