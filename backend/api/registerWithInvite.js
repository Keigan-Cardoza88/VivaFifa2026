const { db, auth, admin } = require('../utils/firebase');

const ADMIN_EMAILS = [
  'cardoza.kian@gmail.com',
  'cardoza.keigs@gmail.com',
  'cardoza.joseph@gmail.com'
];

module.exports = async (req, res) => {
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
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }
    const token = authHeader.split(' ')[1];
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    if (!email) {
      return res.status(400).json({ error: 'Google Auth email is required' });
    }

    const { name, inviteId, paymentPlan } = req.body;

    // Check if user already exists
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      return res.status(200).json({ message: 'User already registered', user: userDoc.data() });
    }

    // Admin self-registration check
    const isSystemAdmin = ADMIN_EMAILS.includes(email);

    if (isSystemAdmin) {
      const adminUser = {
        uid,
        name: name || decodedToken.name || 'System Admin',
        email,
        role: 'admin',
        paymentStatus: 'paid',
        paymentPlan: 'lumpsum',
        entryFee: 0,
        joinedAt: admin.firestore.Timestamp.now(),
        isLateEntry: false
      };

      await userRef.set(adminUser);

      // Create initial leaderboard entry
      await db.collection('leaderboard').doc(uid).set({
        userId: uid,
        userName: adminUser.name,
        netProfit: 0,
        totalWon: 0,
        totalLost: 0,
        correctPredictions: 0,
        totalPredictions: 0,
        accuracyPercent: 0
      });

      return res.status(200).json({ message: 'Admin self-registered successfully', user: adminUser });
    }

    // For regular participants, require a valid invite
    if (!inviteId) {
      return res.status(400).json({ error: 'Registration requires a valid invite ID.' });
    }

    // Validate invite
    const inviteRef = db.collection('invites').doc(inviteId);
    const inviteDoc = await inviteRef.get();

    if (!inviteDoc.exists) {
      return res.status(400).json({ error: 'Invalid invite link.' });
    }

    const inviteData = inviteDoc.data();
    if (inviteData.used) {
      return res.status(400).json({ error: 'Invite link has already been used.' });
    }

    if (inviteData.expiresAt.toDate() < new Date()) {
      return res.status(400).json({ error: 'Invite link has expired (48-hour limit).' });
    }

    // Late Entry Checks
    // Fetch match 1 to check if tournament has started, and match 73 (first R32 match) to check if Group Stage has ended
    const match1Doc = await db.collection('matches').doc('1').get();
    const match73Doc = await db.collection('matches').doc('73').get();

    const now = new Date();
    
    // Check if Group Stage has ended. 
    // If we can't find match 73, fall back to July 2026.
    const groupStageEndLimit = match73Doc.exists ? match73Doc.data().kickoffTimeIST.toDate() : new Date('2026-06-29T20:00:00+05:30');

    if (now > groupStageEndLimit) {
      return res.status(403).json({ error: 'Registration closed. You cannot join after the Group Stage ends.' });
    }

    // Check if tournament has started (kickoff of match 1)
    const tournamentStartLimit = match1Doc.exists ? match1Doc.data().kickoffTimeIST.toDate() : new Date('2026-06-11T20:00:00+05:30');
    
    const isLateEntry = now > tournamentStartLimit;
    
    // Fetch settings for default late entry fee
    const settingsDoc = await db.collection('settings').doc('global').get();
    const settings = settingsDoc.exists ? settingsDoc.data() : { lateEntryFeeDefault: 1500 };
    const entryFee = isLateEntry ? (settings.lateEntryFeeDefault || 1500) : 0;

    const newParticipant = {
      uid,
      name: name || decodedToken.name || 'Participant',
      email,
      role: 'participant',
      paymentStatus: entryFee > 0 ? 'unpaid' : 'unpaid', // Default to unpaid
      paymentPlan: paymentPlan || 'installments',
      entryFee,
      joinedAt: admin.firestore.Timestamp.now(),
      isLateEntry
    };

    // Save transactionally
    await db.runTransaction(async (transaction) => {
      // Mark invite as used
      transaction.update(inviteRef, {
        used: true,
        usedBy: uid
      });

      // Save user
      transaction.set(userRef, newParticipant);

      // Create initial leaderboard
      transaction.set(db.collection('leaderboard').doc(uid), {
        userId: uid,
        userName: newParticipant.name,
        netProfit: 0,
        totalWon: 0,
        totalLost: 0,
        correctPredictions: 0,
        totalPredictions: 0,
        accuracyPercent: 0
      });
    });

    return res.status(200).json({ message: 'Registered successfully', user: newParticipant });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};
