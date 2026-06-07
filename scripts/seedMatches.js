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

  // 1. Group Stage (72 matches) - e.g., June 11 to June 27, 2026. 4 matches/day
  // Group names/teams as place-holders or actual teams
  const groupTeams = [
    ['Mexico', 'South Africa', 'South Korea', 'Czechia'],         // Group A
    ['Canada', 'Bosnia and Herzegovina', 'Qatar', 'Switzerland'],  // Group B
    ['Brazil', 'Haiti', 'Morocco', 'Scotland'],                     // Group C
    ['USA', 'Australia', 'Paraguay', 'Turkiye'],                   // Group D
    ['Germany', 'Ecuador', 'Curacao', 'Ivory Coast'],               // Group E
    ['Netherlands', 'Japan', 'Sweden', 'Tunisia'],                  // Group F
    ['Belgium', 'Egypt', 'Iran', 'New Zealand'],                    // Group G
    ['Spain', 'Saudi Arabia', 'Cape Verde', 'Uruguay'],            // Group H
    ['France', 'Iraq', 'Norway', 'Senegal'],                        // Group I
    ['Argentina', 'Algeria', 'Austria', 'Jordan'],                  // Group J
    ['Portugal', 'Colombia', 'DR Congo', 'Uzbekistan'],             // Group K
    ['England', 'Croatia', 'Ghana', 'Panama']                       // Group L
  ];

  let currentDate = new Date('2026-06-11');
  for (let g = 0; g < 12; g++) {
    const teams = groupTeams[g];
    // Each group has 6 matches
    const matchups = [
      [teams[0], teams[1]],
      [teams[2], teams[3]],
      [teams[0], teams[2]],
      [teams[1], teams[3]],
      [teams[3], teams[0]],
      [teams[1], teams[2]]
    ];

    matchups.forEach((pair, index) => {
      const dateStr = currentDate.toISOString().split('T')[0];
      const hour = 20 + (index % 2) * 2.5; // e.g. 8:00 PM, 10:30 PM
      const timeStr = `${Math.floor(hour)}:${(hour % 1 === 0 ? '00' : '30')}`;
      addMatch(pair[0], pair[1], 'group', dateStr, timeStr);
      // Advance date every 4 matches
      if (matchId % 4 === 0) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });
  }

  // Set date for knockout rounds
  currentDate = new Date('2026-06-29');

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
