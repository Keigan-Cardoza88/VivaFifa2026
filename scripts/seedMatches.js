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

// Programmatic match generator for 104 matches
function generateMatches() {
  const matches = [];
  let matchId = 1;

  // Helper to add match
  const addMatch = (teamA, teamB, stage, dateStr, timeStr) => {
    // Parse time as IST. Assume UTC+5:30 offset
    const dateTimeIST = new Date(`${dateStr}T${timeStr}:00+05:30`);
    matches.push({
      matchId: String(matchId++),
      teamA,
      teamB,
      stage,
      kickoffTimeIST: admin.firestore.Timestamp.fromDate(dateTimeIST),
      status: 'upcoming'
    });
  };

  // 1. Group Stage Explicit Fixtures (72 matches)
  const groupSpecs = [
    { teamA: 'Mexico', teamB: 'South Africa', date: '2026-06-12' },
    { teamA: 'South Korea', teamB: 'Czechia', date: '2026-06-12' },
    { teamA: 'Canada', teamB: 'Bosnia and Herzegovina', date: '2026-06-13' },
    { teamA: 'USA', teamB: 'Paraguay', date: '2026-06-13' },
    { teamA: 'Qatar', teamB: 'Switzerland', date: '2026-06-14' },
    { teamA: 'Brazil', teamB: 'Morocco', date: '2026-06-14' },
    { teamA: 'Haiti', teamB: 'Scotland', date: '2026-06-14' },
    { teamA: 'Australia', teamB: 'Turkey', date: '2026-06-14' },
    { teamA: 'Germany', teamB: 'Curaçao', date: '2026-06-14' },
    { teamA: 'Netherlands', teamB: 'Japan', date: '2026-06-15' },
    { teamA: 'Ivory Coast', teamB: 'Ecuador', date: '2026-06-15' },
    { teamA: 'Sweden', teamB: 'Tunisia', date: '2026-06-15' },
    { teamA: 'Spain', teamB: 'Cabo Verde', date: '2026-06-15' },
    { teamA: 'Belgium', teamB: 'Egypt', date: '2026-06-16' },
    { teamA: 'Saudi Arabia', teamB: 'Uruguay', date: '2026-06-16' },
    { teamA: 'Iran', teamB: 'New Zealand', date: '2026-06-16' },
    { teamA: 'France', teamB: 'Senegal', date: '2026-06-17' },
    { teamA: 'Iraq', teamB: 'Norway', date: '2026-06-17' },
    { teamA: 'Argentina', teamB: 'Algeria', date: '2026-06-17' },
    { teamA: 'Austria', teamB: 'Jordan', date: '2026-06-17' },
    { teamA: 'Portugal', teamB: 'DR Congo', date: '2026-06-17' },
    { teamA: 'England', teamB: 'Croatia', date: '2026-06-18' },
    { teamA: 'Ghana', teamB: 'Panama', date: '2026-06-18' },
    { teamA: 'Uzbekistan', teamB: 'Colombia', date: '2026-06-18' },
    { teamA: 'Czechia', teamB: 'South Africa', date: '2026-06-18' },
    { teamA: 'Switzerland', teamB: 'Bosnia and Herzegovina', date: '2026-06-19' },
    { teamA: 'Canada', teamB: 'Qatar', date: '2026-06-19' },
    { teamA: 'Mexico', teamB: 'South Korea', date: '2026-06-19' },
    { teamA: 'USA', teamB: 'Australia', date: '2026-06-20' },
    { teamA: 'Scotland', teamB: 'Morocco', date: '2026-06-20' },
    { teamA: 'Brazil', teamB: 'Haiti', date: '2026-06-20' },
    { teamA: 'Turkey', teamB: 'Paraguay', date: '2026-06-20' },
    { teamA: 'Netherlands', teamB: 'Sweden', date: '2026-06-20' },
    { teamA: 'Germany', teamB: 'Ivory Coast', date: '2026-06-21' },
    { teamA: 'Ecuador', teamB: 'Curacao', date: '2026-06-21' },
    { teamA: 'Tunisia', teamB: 'Japan', date: '2026-06-21' },
    { teamA: 'Spain', teamB: 'Saudi Arabia', date: '2026-06-21' },
    { teamA: 'Belgium', teamB: 'Iran', date: '2026-06-22' },
    { teamA: 'Uruguay', teamB: 'Cabo Verde', date: '2026-06-22' },
    { teamA: 'New Zealand', teamB: 'Egypt', date: '2026-06-22' },
    { teamA: 'Argentina', teamB: 'Austria', date: '2026-06-22' },
    { teamA: 'France', teamB: 'Iraq', date: '2026-06-23' },
    { teamA: 'Norway', teamB: 'Senegal', date: '2026-06-23' },
    { teamA: 'Jordan', teamB: 'Algeria', date: '2026-06-23' },
    { teamA: 'Portugal', teamB: 'Uzbekistan', date: '2026-06-23' },
    { teamA: 'England', teamB: 'Ghana', date: '2026-06-24' },
    { teamA: 'Panama', teamB: 'Croatia', date: '2026-06-24' },
    { teamA: 'Colombia', teamB: 'DR Congo', date: '2026-06-24' },
    { teamA: 'Switzerland', teamB: 'Canada', date: '2026-06-25' },
    { teamA: 'Bosnia and Herzegovina', teamB: 'Qatar', date: '2026-06-25' },
    { teamA: 'Morocco', teamB: 'Haiti', date: '2026-06-25' },
    { teamA: 'Scotland', teamB: 'Brazil', date: '2026-06-25' },
    { teamA: 'South Africa', teamB: 'South Korea', date: '2026-06-25' },
    { teamA: 'Czechia', teamB: 'Mexico', date: '2026-06-25' },
    { teamA: 'Curacao', teamB: 'Ivory Coast', date: '2026-06-26' },
    { teamA: 'Ecuador', teamB: 'Germany', date: '2026-06-26' },
    { teamA: 'Tunisia', teamB: 'Netherlands', date: '2026-06-26' },
    { teamA: 'Japan', teamB: 'Sweden', date: '2026-06-26' },
    { teamA: 'Turkey', teamB: 'USA', date: '2026-06-26' },
    { teamA: 'Paraguay', teamB: 'Australia', date: '2026-06-26' },
    { teamA: 'Norway', teamB: 'France', date: '2026-06-27' },
    { teamA: 'Senegal', teamB: 'Iraq', date: '2026-06-27' },
    { teamA: 'Cabo Verde', teamB: 'Saudi Arabia', date: '2026-06-27' },
    { teamA: 'Uruguay', teamB: 'Spain', date: '2026-06-27' },
    { teamA: 'New Zealand', teamB: 'Belgium', date: '2026-06-27' },
    { teamA: 'Egypt', teamB: 'Iran', date: '2026-06-27' },
    { teamA: 'Panama', teamB: 'England', date: '2026-06-28' },
    { teamA: 'Croatia', teamB: 'Ghana', date: '2026-06-28' },
    { teamA: 'Colombia', teamB: 'Portugal', date: '2026-06-28' },
    { teamA: 'DR Congo', teamB: 'Uzbekistan', date: '2026-06-28' },
    { teamA: 'Algeria', teamB: 'Austria', date: '2026-06-28' },
    { teamA: 'Jordan', teamB: 'Argentina', date: '2026-06-28' }
  ];

  const getSlotsForDay = (numMatches) => {
    if (numMatches === 1) return ['20:00'];
    if (numMatches === 2) return ['20:00', '22:30'];
    if (numMatches === 3) return ['17:30', '20:00', '22:30'];
    if (numMatches === 4) return ['15:00', '17:30', '20:00', '22:30'];
    if (numMatches === 5) return ['12:30', '15:00', '17:30', '20:00', '22:30'];
    return ['10:00', '12:30', '15:00', '17:30', '20:00', '22:30'];
  };

  const dateCounter = {};
  groupSpecs.forEach((spec) => {
    const d = spec.date;
    dateCounter[d] = (dateCounter[d] || 0) + 1;
  });

  const dateIndex = {};
  groupSpecs.forEach((spec) => {
    const d = spec.date;
    const idx = dateIndex[d] || 0;
    dateIndex[d] = idx + 1;
    const slots = getSlotsForDay(dateCounter[d]);
    const timeStr = slots[idx] || '20:00';
    addMatch(spec.teamA, spec.teamB, 'group', spec.date, timeStr);
  });

  // Set date for knockout rounds
  let currentDate = new Date('2026-06-29');

  // 2. Round of 32 (16 matches)
  for (let i = 1; i <= 16; i++) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const timeStr = i % 2 === 0 ? '23:00' : '20:00';
    addMatch(`Winner G${i}`, `Runner-up G${i+1}`, 'r32', dateStr, timeStr);
    if (i % 2 === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  currentDate = new Date('2026-07-07');
  // 3. Round of 16 (8 matches)
  for (let i = 1; i <= 8; i++) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const timeStr = i % 2 === 0 ? '23:00' : '20:00';
    addMatch(`Winner R32-${i}`, `Winner R32-${i+8}`, 'r16', dateStr, timeStr);
    if (i % 2 === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  currentDate = new Date('2026-07-12');
  // 4. Quarter-finals (4 matches)
  for (let i = 1; i <= 4; i++) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const timeStr = i % 2 === 0 ? '23:00' : '20:00';
    addMatch(`Winner R16-${i}`, `Winner R16-${i+4}`, 'qf', dateStr, timeStr);
    if (i % 2 === 0) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  currentDate = new Date('2026-07-15');
  // 5. Semi-finals (2 matches)
  addMatch('Winner QF-1', 'Winner QF-2', 'sf', currentDate.toISOString().split('T')[0], '20:00');
  currentDate.setDate(currentDate.getDate() + 1);
  addMatch('Winner QF-3', 'Winner QF-4', 'sf', currentDate.toISOString().split('T')[0], '20:00');

  currentDate = new Date('2026-07-18');
  // 6. Third-place Play-off (1 match)
  addMatch('Loser SF-1', 'Loser SF-2', 'third_place', currentDate.toISOString().split('T')[0], '20:00');

  currentDate = new Date('2026-07-19');
  // 7. Final (1 match)
  addMatch('Winner SF-1', 'Winner SF-2', 'final', currentDate.toISOString().split('T')[0], '20:00');

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

    console.log("Generating 104 fixtures...");
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
