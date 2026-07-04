let db, auth, admin;

const TOP_PICK_PRIZE = 10000;
const DARK_HORSE_PRIZE = 5000;

const ADMIN_EMAILS = [
  'cardoza.kian@gmail.com',
  'cardoza.keigs@gmail.com',
  'cardoza.joseph@gmail.com'
];

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, POST, PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const firebase = require('../utils/firebase');
    db = firebase.db;
    auth = firebase.auth;
    admin = firebase.admin;

    // Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = await auth.verifyIdToken(token);
    if (!ADMIN_EMAILS.includes(decoded.email)) {
      return res.status(403).json({ error: 'Forbidden: Admin only' });
    }

    const { action, actualFinalists } = req.body;
    // action: 'settle'
    // actualFinalists: ['Germany', 'France'] (array of 2 team names)

    if (action !== 'settle') {
      return res.status(400).json({ error: 'Invalid action. Use action: "settle"' });
    }

    if (!Array.isArray(actualFinalists) || actualFinalists.length !== 2) {
      return res.status(400).json({ error: 'actualFinalists must be an array of exactly 2 team names' });
    }

    // Fetch all finalist picks
    const picksSnap = await db.collection('finalist_picks').get();
    if (picksSnap.empty) {
      return res.status(200).json({ message: 'No finalist picks found.', settled: 0 });
    }

    const batch = db.batch();
    const results = [];

    for (const pickDoc of picksSnap.docs) {
      const pick = pickDoc.data();
      const userId = pick.userId || pickDoc.id;

      const primaryWon = actualFinalists.includes(pick.primaryPick);
      const secondaryWon = actualFinalists.includes(pick.secondaryPick);

      const primaryPrize = primaryWon ? TOP_PICK_PRIZE : 0;
      const secondaryPrize = secondaryWon ? DARK_HORSE_PRIZE : 0;
      const totalPrize = primaryPrize + secondaryPrize;

      // Update leaderboard
      const leaderboardRef = db.collection('leaderboard').doc(userId);
      const finalLeaderboardRef = db.collection('leaderboard').doc(`${userId}_final_leaderboard`);
      const leaderboardSnap = await leaderboardRef.get();

      if (leaderboardSnap.exists) {
        const existing = leaderboardSnap.data();
        const currentProfit = existing.netProfit || 0;

        // Check if already settled to avoid double-crediting
        if (!existing.finalistsSettled) {
          batch.update(leaderboardRef, {
            netProfit: currentProfit + totalPrize,
            finalistPrimaryPick: pick.primaryPick,
            finalistPrimaryWon: primaryWon,
            finalistSecondaryPick: pick.secondaryPick,
            finalistSecondaryWon: secondaryWon,
            finalistPrize: totalPrize,
            finalistsSettled: true
          });
          batch.set(finalLeaderboardRef, {
            userId,
            stage: 'final_leaderboard',
            netProfit: totalPrize,
            totalWon: totalPrize,
            totalLost: 0,
            correctPredictions: 0,
            totalPredictions: 0,
            accuracyPercent: 0,
            finalistPrize: totalPrize,
            finalistsSettled: true
          }, { merge: true });

          results.push({
            userId,
            primaryPick: pick.primaryPick,
            primaryWon,
            secondaryPick: pick.secondaryPick,
            secondaryWon,
            totalPrize
          });
        }
      }
    }

    // Mark finalists as settled in global settings
    const settingsRef = db.collection('settings').doc('global');
    batch.update(settingsRef, {
      finalistsSettled: true,
      finalistsOpen: false,
      actualFinalists
    });

    await batch.commit();

    return res.status(200).json({
      message: `Finalists settled. ${results.length} players processed.`,
      actualFinalists,
      results
    });
  } catch (err) {
    console.error('settleFinalists error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
};
