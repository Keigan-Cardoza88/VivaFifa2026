const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Authorized Admin emails
const ADMIN_EMAILS = [
  'cardoza.kian@gmail.com',
  'cardoza.keigs@gmail.com',
  'cardoza.joseph@gmail.com'
];

async function checkAndPromoteAdmin() {
  console.log('Fetching users to verify admin roles...');
  const usersSnap = await db.collection('users').get();
  
  let promoteCount = 0;
  for (const doc of usersSnap.docs) {
    const user = doc.data();
    if (ADMIN_EMAILS.includes(user.email) && user.role !== 'admin') {
      console.log(`Promoting ${user.email} (${user.name}) to role 'admin'...`);
      await doc.ref.update({ role: 'admin' });
      promoteCount++;
    } else if (ADMIN_EMAILS.includes(user.email)) {
      console.log(`${user.email} is already set as 'admin'.`);
    }
  }
  console.log(`Verification complete. Promoted ${promoteCount} users to admin.`);
}

checkAndPromoteAdmin()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
