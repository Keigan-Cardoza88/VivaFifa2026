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

const DEFAULT_SETTINGS = {
  stakes: {
    group: { team: 50, goal: 50 },
    r32: { team: 75, goal: 75 },
    r16: { team: 100, goal: 100 },
    qf: { team: 125, goal: 125 },
    sf: { team: 150, goal: 150 },
    third_place: { team: 150, goal: 150 },
    final: { team: 200, goal: 200 } // Default final stakes (admin can edit)
  },
  prizes: {
    firstPlacePercent: 60,
    secondPlacePercent: 25,
    thirdPlacePercent: 15
  },
  lateEntryFeeDefault: 1500,
  tournamentStatus: 'upcoming'
};

function generateMatches() {
  const matches = [];
  let matchId = 1;

  // Helper to add match
  const addMatch = (teamA, teamB, stage, group, dateStr, timeStr = "00:00") => {
    // Kickoff is parsed from dateStr and timeStr
    const kickoffIST = new Date(`${dateStr}T${timeStr}:00+05:30`);
    // Betting lock is 8:00 PM IST on the day BEFORE the kickoff
    const lockDate = new Date(kickoffIST);
    lockDate.setDate(lockDate.getDate() - 1);
    lockDate.setHours(20, 0, 0, 0);

    matches.push({
      matchId: String(matchId++),
      teamA,
      teamB,
      stage,
      group,
      kickoffTimeIST: admin.firestore.Timestamp.fromDate(kickoffIST),
      bettingLockTimeIST: admin.firestore.Timestamp.fromDate(lockDate),
      status: 'upcoming'
    });
  };

  const fixtures = [
    { teamA: 'Mexico', teamB: 'South Africa', date: '2026-06-12', time: '00:30', group: 'A' },
    { teamA: 'South Korea', teamB: 'Czechia', date: '2026-06-12', time: '07:30', group: 'A' },
    { teamA: 'Canada', teamB: 'Bosnia and Herzegovina', date: '2026-06-13', time: '00:30', group: 'B' },
    { teamA: 'USA', teamB: 'Paraguay', date: '2026-06-13', time: '06:30', group: 'D' },
    { teamA: 'Qatar', teamB: 'Switzerland', date: '2026-06-14', time: '00:30', group: 'B' },
    { teamA: 'Brazil', teamB: 'Morocco', date: '2026-06-14', time: '03:30', group: 'C' },
    { teamA: 'Haiti', teamB: 'Scotland', date: '2026-06-14', time: '06:30', group: 'C' },
    { teamA: 'Australia', teamB: 'Turkey', date: '2026-06-14', time: '09:30', group: 'D' },
    { teamA: 'Germany', teamB: 'Curaçao', date: '2026-06-14', time: '22:30', group: 'E' },
    { teamA: 'Netherlands', teamB: 'Japan', date: '2026-06-15', time: '01:30', group: 'F' },
    { teamA: 'Ivory Coast', teamB: 'Ecuador', date: '2026-06-15', time: '04:30', group: 'E' },
    { teamA: 'Sweden', teamB: 'Tunisia', date: '2026-06-15', time: '07:30', group: 'F' },
    { teamA: 'Spain', teamB: 'Cabo Verde', date: '2026-06-15', time: '21:30', group: 'H' },
    { teamA: 'Belgium', teamB: 'Egypt', date: '2026-06-16', time: '00:30', group: 'G' },
    { teamA: 'Saudi Arabia', teamB: 'Uruguay', date: '2026-06-16', time: '03:30', group: 'H' },
    { teamA: 'Iran', teamB: 'New Zealand', date: '2026-06-16', time: '06:30', group: 'G' },
    { teamA: 'France', teamB: 'Senegal', date: '2026-06-17', time: '00:30', group: 'I' },
    { teamA: 'Iraq', teamB: 'Norway', date: '2026-06-17', time: '03:30', group: 'I' },
    { teamA: 'Argentina', teamB: 'Algeria', date: '2026-06-17', time: '06:30', group: 'J' },
    { teamA: 'Austria', teamB: 'Jordan', date: '2026-06-17', time: '09:30', group: 'J' },
    { teamA: 'Portugal', teamB: 'DR Congo', date: '2026-06-17', time: '22:30', group: 'K' },
    { teamA: 'England', teamB: 'Croatia', date: '2026-06-18', time: '01:30', group: 'L' },
    { teamA: 'Ghana', teamB: 'Panama', date: '2026-06-18', time: '04:30', group: 'L' },
    { teamA: 'Uzbekistan', teamB: 'Colombia', date: '2026-06-18', time: '07:30', group: 'K' },
    { teamA: 'Czechia', teamB: 'South Africa', date: '2026-06-18', time: '21:30', group: 'A' },
    { teamA: 'Switzerland', teamB: 'Bosnia and Herzegovina', date: '2026-06-19', time: '00:30', group: 'B' },
    { teamA: 'Canada', teamB: 'Qatar', date: '2026-06-19', time: '03:30', group: 'B' },
    { teamA: 'Mexico', teamB: 'South Korea', date: '2026-06-19', time: '06:30', group: 'A' },
    { teamA: 'USA', teamB: 'Australia', date: '2026-06-20', time: '00:30', group: 'D' },
    { teamA: 'Scotland', teamB: 'Morocco', date: '2026-06-20', time: '03:30', group: 'C' },
    { teamA: 'Brazil', teamB: 'Haiti', date: '2026-06-20', time: '06:00', group: 'C' },
    { teamA: 'Turkey', teamB: 'Paraguay', date: '2026-06-19', time: '08:30', group: 'D' },
    { teamA: 'Netherlands', teamB: 'Sweden', date: '2026-06-20', time: '22:30', group: 'F' },
    { teamA: 'Germany', teamB: 'Ivory Coast', date: '2026-06-21', time: '01:30', group: 'E' },
    { teamA: 'Ecuador', teamB: 'Curacao', date: '2026-06-21', time: '05:30', group: 'E' },
    { teamA: 'Tunisia', teamB: 'Japan', date: '2026-06-21', time: '09:30', group: 'F' },
    { teamA: 'Spain', teamB: 'Saudi Arabia', date: '2026-06-21', time: '21:30', group: 'H' },
    { teamA: 'Belgium', teamB: 'Iran', date: '2026-06-22', time: '00:30', group: 'G' },
    { teamA: 'Uruguay', teamB: 'Cabo Verde', date: '2026-06-22', time: '03:30', group: 'H' },
    { teamA: 'New Zealand', teamB: 'Egypt', date: '2026-06-22', time: '06:30', group: 'G' },
    { teamA: 'Argentina', teamB: 'Austria', date: '2026-06-22', time: '22:30', group: 'J' },
    { teamA: 'France', teamB: 'Iraq', date: '2026-06-23', time: '02:30', group: 'I' },
    { teamA: 'Norway', teamB: 'Senegal', date: '2026-06-23', time: '05:30', group: 'I' },
    { teamA: 'Jordan', teamB: 'Algeria', date: '2026-06-23', time: '08:30', group: 'J' },
    { teamA: 'Portugal', teamB: 'Uzbekistan', date: '2026-06-23', time: '22:30', group: 'K' },
    { teamA: 'England', teamB: 'Ghana', date: '2026-06-24', time: '01:30', group: 'L' },
    { teamA: 'Panama', teamB: 'Croatia', date: '2026-06-24', time: '04:30', group: 'L' },
    { teamA: 'Colombia', teamB: 'DR Congo', date: '2026-06-24', time: '07:30', group: 'K' },
    { teamA: 'Switzerland', teamB: 'Canada', date: '2026-06-25', time: '00:30', group: 'B' },
    { teamA: 'Bosnia and Herzegovina', teamB: 'Qatar', date: '2026-06-25', time: '00:30', group: 'B' },
    { teamA: 'Morocco', teamB: 'Haiti', date: '2026-06-25', time: '03:30', group: 'C' },
    { teamA: 'Scotland', teamB: 'Brazil', date: '2026-06-25', time: '03:30', group: 'C' },
    { teamA: 'South Africa', teamB: 'South Korea', date: '2026-06-25', time: '06:30', group: 'A' },
    { teamA: 'Czechia', teamB: 'Mexico', date: '2026-06-25', time: '06:30', group: 'A' },
    { teamA: 'Curacao', teamB: 'Ivory Coast', date: '2026-06-26', time: '01:30', group: 'E' },
    { teamA: 'Ecuador', teamB: 'Germany', date: '2026-06-26', time: '01:30', group: 'E' },
    { teamA: 'Tunisia', teamB: 'Netherlands', date: '2026-06-26', time: '04:30', group: 'F' },
    { teamA: 'Japan', teamB: 'Sweden', date: '2026-06-26', time: '04:30', group: 'F' },
    { teamA: 'Turkey', teamB: 'USA', date: '2026-06-26', time: '07:30', group: 'D' },
    { teamA: 'Paraguay', teamB: 'Australia', date: '2026-06-26', time: '07:30', group: 'D' },
    { teamA: 'Norway', teamB: 'France', date: '2026-06-27', time: '00:30', group: 'I' },
    { teamA: 'Senegal', teamB: 'Iraq', date: '2026-06-27', time: '00:30', group: 'I' },
    { teamA: 'Cabo Verde', teamB: 'Saudi Arabia', date: '2026-06-27', time: '05:30', group: 'H' },
    { teamA: 'Uruguay', teamB: 'Spain', date: '2026-06-27', time: '05:30', group: 'H' },
    { teamA: 'New Zealand', teamB: 'Belgium', date: '2026-06-27', time: '08:30', group: 'G' },
    { teamA: 'Egypt', teamB: 'Iran', date: '2026-06-27', time: '08:30', group: 'G' },
    { teamA: 'Panama', teamB: 'England', date: '2026-06-28', time: '02:30', group: 'L' },
    { teamA: 'Croatia', teamB: 'Ghana', date: '2026-06-28', time: '02:30', group: 'L' },
    { teamA: 'Colombia', teamB: 'Portugal', date: '2026-06-28', time: '05:00', group: 'K' },
    { teamA: 'DR Congo', teamB: 'Uzbekistan', date: '2026-06-28', time: '05:00', group: 'K' },
    { teamA: 'Algeria', teamB: 'Austria', date: '2026-06-28', time: '07:30', group: 'J' },
    { teamA: 'Jordan', teamB: 'Argentina', date: '2026-06-28', time: '07:30', group: 'J' }
  ];

  fixtures.forEach((f) => {
    addMatch(f.teamA, f.teamB, 'group', f.group, f.date, f.time);
  });

  return matches;
}

async function main() {
  try {
    console.log("Seeding global settings...");
    await db.collection('settings').doc('global').set(DEFAULT_SETTINGS);
    console.log("Global settings seeded successfully!");

    console.log("Deleting all existing matches from Firestore...");
    const matchesSnapshot = await db.collection('matches').get();
    console.log(`Found ${matchesSnapshot.size} matches to delete.`);
    const deleteBatchSize = 100;
    const docs = matchesSnapshot.docs;
    for (let i = 0; i < docs.length; i += deleteBatchSize) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + deleteBatchSize);
      chunk.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`Deleted matches ${i + 1} to ${Math.min(i + deleteBatchSize, docs.length)}`);
    }

    console.log("Generating 72 fixtures...");
    const matches = generateMatches();
    console.log(`Generated ${matches.length} fixtures. Seeding into Firestore...`);

    const batchSize = 20;
    for (let i = 0; i < matches.length; i += batchSize) {
      const batch = db.batch();
      const chunk = matches.slice(i, i + batchSize);

      chunk.forEach(match => {
        const ref = db.collection('matches').doc(match.matchId);
        batch.set(ref, match);
      });

      await batch.commit();
      console.log(`Seeded matches ${i + 1} to ${Math.min(i + batchSize, matches.length)}`);
    }

    console.log("Database seeded successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed: ", err);
    process.exit(1);
  }
}

main();
