const admin = require('firebase-admin');

// Detect emulator environment
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (emulatorHost) {
  console.log(`Running against Firestore Emulator: ${emulatorHost}`);
  admin.initializeApp({
    projectId: 'fifa-warroom-app'
  });
} else {
  console.log("Running in Production. Loading service account...");
  try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (err) {
    console.log("serviceAccountKey.json not found. Attempting Application Default Credentials...");
    try {
      admin.initializeApp({
        projectId: 'vivafifa2026'
      });
    } catch (e) {
      console.error("Error: Please put 'serviceAccountKey.json' in 'scripts/' or run 'firebase login' to authenticate.", e);
      process.exit(1);
    }
  }
}

const db = admin.firestore();

function generateMatches() {
  const matches = [];
  let matchId = 149; // Starts at 149 (Group Stage finished at 148)

  const addMatch = (teamA, teamB, dateStr, timeStr) => {
    // Kickoff is parsed from dateStr and timeStr (in IST)
    const kickoffIST = new Date(`${dateStr}T${timeStr}:00+05:30`);
    
    // Betting lock is 8:00 PM IST on the day BEFORE the kickoff
    const lockDate = new Date(kickoffIST);
    lockDate.setDate(lockDate.getDate() - 1);
    lockDate.setHours(20, 0, 0, 0); // 8:00 PM IST

    matches.push({
      matchId: String(matchId++),
      teamA,
      teamB,
      stage: 'r32',
      group: null, // Knockout stage doesn't have groups
      kickoffTimeIST: admin.firestore.Timestamp.fromDate(kickoffIST),
      bettingLockTimeIST: admin.firestore.Timestamp.fromDate(lockDate),
      status: 'upcoming'
    });
  };

  const fixtures = [
    // Monday, 29 June 2026
    { teamA: 'South Africa', teamB: 'Canada', date: '2026-06-29', time: '00:30' },
    { teamA: 'Brazil', teamB: 'Japan', date: '2026-06-29', time: '22:30' },
    // Tuesday, 30 June 2026
    { teamA: 'Germany', teamB: 'Paraguay', date: '2026-06-30', time: '02:00' },
    { teamA: 'Netherlands', teamB: 'Morocco', date: '2026-06-30', time: '06:30' },
    { teamA: 'Ivory Coast', teamB: 'Norway', date: '2026-06-30', time: '22:30' },
    // Wednesday, 1 July 2026
    { teamA: 'France', teamB: 'Sweden', date: '2026-07-01', time: '02:30' },
    { teamA: 'Mexico', teamB: 'Ecuador', date: '2026-07-01', time: '06:30' },
    { teamA: 'England', teamB: 'DR Congo', date: '2026-07-01', time: '21:30' },
    // Thursday, 2 July 2026
    { teamA: 'Belgium', teamB: 'Senegal', date: '2026-07-02', time: '01:30' },
    { teamA: 'United States', teamB: 'Bosnia and Herzegovina', date: '2026-07-02', time: '05:30' },
    // Friday, 3 July 2026
    { teamA: 'Spain', teamB: 'Austria', date: '2026-07-03', time: '00:30' },
    { teamA: 'Portugal', teamB: 'Croatia', date: '2026-07-03', time: '04:30' },
    { teamA: 'Switzerland', teamB: 'Algeria', date: '2026-07-03', time: '08:30' },
    { teamA: 'Australia', teamB: 'Egypt', date: '2026-07-03', time: '23:30' },
    // Saturday, 4 July 2026
    { teamA: 'Argentina', teamB: 'Cape Verde', date: '2026-07-04', time: '03:30' },
    { teamA: 'Colombia', teamB: 'Ghana', date: '2026-07-04', time: '07:00' }
  ];

  fixtures.forEach((f) => {
    addMatch(f.teamA, f.teamB, f.date, f.time);
  });

  return matches;
}

async function main() {
  try {
    console.log("Generating 16 Round of 32 fixtures...");
    const matches = generateMatches();
    console.log(`Generated ${matches.length} fixtures. Seeding into Firestore...`);

    const batch = db.batch();
    matches.forEach(match => {
      const ref = db.collection('matches').doc(match.matchId);
      batch.set(ref, match);
    });

    await batch.commit();
    console.log("Round of 32 matches seeded successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed: ", err);
    process.exit(1);
  }
}

main();
