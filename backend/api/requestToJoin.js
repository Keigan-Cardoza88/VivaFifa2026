const { db, auth, admin } = require('../utils/firebase');

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

    const { name, paymentPlan } = req.body;

    // Check if user already exists (registered or pending)
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const data = userDoc.data();
      if (data.role === 'pending') {
        return res.status(200).json({ message: 'Request already pending', user: data });
      }
      return res.status(200).json({ message: 'User already registered', user: data });
    }

    // Create a pending user profile — referee must approve before they get full access
    const pendingParticipant = {
      uid,
      name: name || decodedToken.name || 'Player',
      email,
      role: 'pending',
      paymentStatus: 'unpaid',
      paymentPlan: paymentPlan || 'installments',
      entryFee: 0,
      joinedAt: admin.firestore.Timestamp.now(),
      isLateEntry: false
    };

    await userRef.set(pendingParticipant);

    return res.status(200).json({ message: 'Join request submitted. Awaiting referee approval.', user: pendingParticipant });
  } catch (error) {
    console.error('Join request error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
};
