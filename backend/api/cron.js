const { db, admin, messaging } = require('../utils/firebase');

module.exports = async (req, res) => {
  // Allow Vercel Cron verification
  const cronAuth = req.headers.authorization;
  const isVercelCron = cronAuth === `Bearer ${process.env.CRON_SECRET}` || process.env.NODE_ENV === 'development';

  if (!isVercelCron) {
    return res.status(401).json({ error: 'Unauthorized: Cron requests only' });
  }

  try {
    // 1. Get current time in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const day = istDate.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat

    console.log(`Cron triggered at IST: ${hours}:${minutes}, Day: ${day}`);

    // We align our cron executions on 15 minute marks.
    // Allow a small window (e.g. within 10 minutes of the target marks) to account for scheduling drift.
    const is7PM = hours === 19 && minutes >= 0 && minutes < 15;
    const is745PM = hours === 19 && minutes >= 45 && minutes < 60;
    const is8PM = hours === 20 && minutes >= 0 && minutes < 15;

    if (!is7PM && !is745PM && !is8PM) {
      return res.status(200).json({ message: 'No tasks scheduled for this time mark.' });
    }

    // 2. Fetch matches locking today
    // Which matches lock today?
    // Matches kicking off today lock today, unless today is Friday, in which case weekend/Monday matches also lock today.
    // If today is Sat/Sun/Mon, those matches have already been locked on Friday, so no matches should lock today.
    const todayStart = new Date(istDate);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(istDate);
    todayEnd.setUTCHours(23, 59, 59, 999);

    const matchesSnapshot = await db.collection('matches').where('status', '==', 'upcoming').get();
    const lockingMatches = [];

    matchesSnapshot.forEach((doc) => {
      const match = doc.data();
      match.id = doc.id;
      const cutoffTime = getMatchCutoffTime(match.kickoffTimeIST.toDate());
      
      // If cutoffTime falls within today's range
      if (cutoffTime >= todayStart && cutoffTime <= todayEnd) {
        lockingMatches.push(match);
      }
    });

    if (lockingMatches.length === 0) {
      return res.status(200).json({ message: 'No matches locking today.' });
    }

    // 3. Execute Actions based on time
    if (is7PM) {
      await send7PMReminders(lockingMatches);
      return res.status(200).json({ message: '7:00 PM IST general reminders sent.' });
    }

    if (is745PM) {
      await send745PMReminders(lockingMatches);
      return res.status(200).json({ message: '7:45 PM IST final warnings sent.' });
    }

    if (is8PM) {
      await lockMatchesAndCreateDefaults(lockingMatches);
      return res.status(200).json({ message: '8:00 PM IST matches locked and default bets created.' });
    }

    return res.status(200).json({ message: 'Completed' });
  } catch (error) {
    console.error('Cron job error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Helper: Calculate cutoff time based on weekend rules
function getMatchCutoffTime(kickoffDate) {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istKickoff = new Date(kickoffDate.getTime() + istOffset);
  const day = istKickoff.getUTCDay(); // 0 = Sun, 1 = Mon, 2 = Tue, ..., 5 = Fri, 6 = Sat

  // Saturday (6), Sunday (0), Monday (1) matches lock on the preceding Friday at 8:00 PM IST
  if (day === 6) {
    const cutoff = new Date(istKickoff);
    cutoff.setUTCDate(istKickoff.getUTCDate() - 1);
    cutoff.setUTCHours(20, 0, 0, 0);
    return new Date(cutoff.getTime() - istOffset);
  }
  if (day === 0) {
    const cutoff = new Date(istKickoff);
    cutoff.setUTCDate(istKickoff.getUTCDate() - 2);
    cutoff.setUTCHours(20, 0, 0, 0);
    return new Date(cutoff.getTime() - istOffset);
  }
  if (day === 1) {
    const cutoff = new Date(istKickoff);
    cutoff.setUTCDate(istKickoff.getUTCDate() - 3);
    cutoff.setUTCHours(20, 0, 0, 0);
    return new Date(cutoff.getTime() - istOffset);
  }

  // Otherwise, locks on the same day at 8:00 PM IST
  const cutoff = new Date(istKickoff);
  cutoff.setUTCHours(20, 0, 0, 0);
  return new Date(cutoff.getTime() - istOffset);
}

// 7:00 PM general reminder: "Betting closes in 1 hour!"
async function send7PMReminders(matches) {
  const tokens = await getPlayerFCMTokens();
  if (tokens.length === 0) return;

  const matchNames = matches.map(m => `${m.teamA} vs ${m.teamB}`).join(', ');
  const message = {
    notification: {
      title: 'Betting Closes in 1 Hour!',
      body: `Place your bets for today's fixtures: ${matchNames}`
    },
    tokens
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    console.log(`Successfully sent 7PM reminders to ${response.successCount} devices`);
  } catch (err) {
    console.error('Error sending multicast message:', err);
  }
}

// 7:45 PM final warning: "Final warning — 15 mins to place bets"
// Only sent to users who haven't placed bets for ALL locking matches
async function send745PMReminders(matches) {
  const usersSnapshot = await db.collection('users').get();
  const usersToNotify = [];

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();

    // Check if user has placed a bet for all matches locking today
    const betsSnapshot = await db.collection('bets')
      .where('userId', '==', userId)
      .where('matchId', 'in', matches.map(m => m.id))
      .get();

    if (betsSnapshot.size < matches.length && userData.fcmToken) {
      usersToNotify.push(userData.fcmToken);
    }
  }

  if (usersToNotify.length === 0) return;

  const message = {
    notification: {
      title: 'Final Warning — 15 Mins Left!',
      body: 'You have unplaced bets for today\'s matches! Go to the App now.'
    },
    tokens: usersToNotify
  };

  try {
    const response = await messaging.sendEachForMulticast(message);
    console.log(`Successfully sent 745PM reminders to ${response.successCount} devices`);
  } catch (err) {
    console.error('Error sending 745PM reminders:', err);
  }
}

// 8:00 PM lock matches and create default bets (no-shows)
async function lockMatchesAndCreateDefaults(matches) {
  const batch = db.batch();

  // 1. Lock match statuses
  matches.forEach(match => {
    const matchRef = db.collection('matches').doc(match.id);
    batch.update(matchRef, { status: 'betting_closed' });
  });

  // 2. Assign default bets for players who haven't placed their bets
  const usersSnapshot = await db.collection('users').get();
  const participants = [];
  usersSnapshot.forEach(doc => {
    const u = doc.data();
    u.uid = doc.id;
    participants.push(u);
  });

  for (const match of matches) {
    const betsSnapshot = await db.collection('bets').where('matchId', '==', match.id).get();
    const placedUserIds = new Set();
    betsSnapshot.forEach(doc => placedUserIds.add(doc.data().userId));

    // Fetch Global Settings to get stakes
    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.exists ? settingsDoc.data() : {};
    const stage = match.stage;
    const stakes = (settings.stakes && settings.stakes[stage]) || { team: 50, goal: 50 };
    const totalStake = stakes.team + stakes.goal;

    participants.forEach(user => {
      // Ignore non-participants (unless they are admin since admin bets as well)
      const isAdminUser = ['cardoza.kian@gmail.com', 'cardoza.keigs@gmail.com', 'cardoza.joseph@gmail.com'].includes(user.email);
      if (user.role !== 'participant' && !isAdminUser) return;

      // Late entry protection: if user joined AFTER kickoff time, they don't participate and don't forfeit
      if (user.joinedAt && user.joinedAt.toDate() > match.kickoffTimeIST.toDate()) {
        return;
      }

      if (!placedUserIds.has(user.uid)) {
        // Create Default Forfeited Bet
        const defaultBetId = `${user.uid}_${match.id}`;
        const defaultBetRef = db.collection('bets').doc(defaultBetId);

        batch.set(defaultBetRef, {
          betId: defaultBetId,
          userId: user.uid,
          matchId: match.id,
          teamPrediction: 'draw', // Will be corrected to the losing team on result settlement
          goalsTeamA: -1,
          goalsTeamB: -1,
          placedAt: admin.firestore.Timestamp.now(),
          isDefault: true,
          teamBetResult: 'forfeited',
          goalBetResult: 'forfeited',
          amountWon: 0,
          amountLost: totalStake
        });
      }
    });
  }

  await batch.commit();
  console.log(`Successfully locked ${matches.length} matches at 8:00 PM IST`);
}

async function getPlayerFCMTokens() {
  const usersSnapshot = await db.collection('users').get();
  const tokens = [];
  usersSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.fcmToken) {
      tokens.push(data.fcmToken);
    }
  });
  return tokens;
}
