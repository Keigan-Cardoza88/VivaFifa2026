# FIFA War Room — World Cup 2026 closed Betting Arena

Welcome to the **FIFA War Room** project repository. This is a private, high-stakes sports prediction and payout management application built for the FIFA World Cup 2026. The platform allows a select circle of participants to wager on matches, predict scorelines, and compete on dual leaderboards (Money & Accuracy) under a mathematical peer-to-peer payout framework.

---

## 📂 Repository Structure

The project is structured as a monorepo to isolate concerns while sharing config:

```text
VivaFifa2026/
├── admin/                 # Vite + React Admin Web Portal (dark flag-themed scoreboard UI)
├── mobile/                # Expo React Native App (for players to place and track bets)
├── backend/               # Node.js Serverless Vercel Backend (APIs for settleMatch, cron, register)
├── firebase/              # Firebase security rules and firestore database indexes
└── scripts/               # Seed scripts to populate matches and default settings
```

---

## 🚀 Setup & Installation Instructions

### 1. Prerequisite Accounts & Setup
1. Create a project in the **Firebase Console** (e.g., `fifa-warroom-app`).
2. Enable **Google Authentication** in the Firebase Auth settings.
3. Enable **Cloud Firestore** in the database panel.
4. Generate a Firebase Service Account key (JSON) from *Project Settings > Service Accounts* (keep this secret).

---

### 2. Seeding the Database
Before running any applications, run the database seeder to establish the 104 matches, stakes structure, and default settings.

1. Navigate to the root directory and install dependencies:
   ```bash
   npm install dotenv firebase-admin
   ```
2. Save your service account credentials as `serviceAccountKey.json` in the root folder (or define `FIREBASE_SERVICE_ACCOUNT` environment variable).
3. Run the seed script:
   ```bash
   node scripts/seed-fixtures.js
   ```
   *This initializes the `matches` collection (104 games with correct groups/stages/kickoff times in IST), and creates `settings/global` with default stakes.*

---

### 3. Serverless Backend Deployment (Vercel)
The backend manages payments, locks matches, sends push reminders, and recalculates leaderboards.

1. Navigate to the `backend/` folder and install dependencies:
   ```bash
   cd backend
   npm install
   ```
2. Deploy to Vercel (or run locally using Vercel CLI: `vercel dev`).
3. Add the following Environment Variables in your Vercel Dashboard:
   - `FIREBASE_SERVICE_ACCOUNT`: The contents of your Firebase Service Account JSON file as a single string.
   - `CRON_SECRET`: A secure random secret string used to protect your Vercel Cron routes from anonymous hits.

---

### 4. Admin Web App (Vite React)
The Admin Portal provides referees and co-auditors with full dashboard views, match settlement triggers, invite generators, and stakes overrides.

1. Navigate to `admin/` and install packages:
   ```bash
   cd admin
   npm install
   ```
2. Open `admin/src/firebase.js` and replace `firebaseConfig` with your actual client-side credentials from the Firebase Console.
3. Start the local server:
   ```bash
   npm run dev
   ```

*Note: Access to the Admin portal is hardcoded to `cardoza.kian@gmail.com`, `cardoza.keigs@gmail.com`, and `cardoza.joseph@gmail.com`. Auditors can also sign in with read-only permissions.*

---

### 5. Expo Mobile App (React Native)
The player-facing app where users authenticate, place bets, check ranks, view past payouts, and check the bracket.

1. Navigate to `mobile/` and install packages:
   ```bash
   cd mobile
   npx expo install
   ```
2. Open `mobile/src/config/firebase.js` and replace the placeholder credentials with your Firebase config.
3. Open `mobile/App.js` and edit `API_BASE` to point to your live Vercel URL.
4. Start Expo:
   ```bash
   npx expo start
   ```

#### 🛠️ Developer Mode Login
Because setting up native Google Sign-in requires SHA keys and development builds that do not run in standard **Expo Go** out of the box, we have integrated a **Developer Quick Login** on the login screen.
- Enter an email (e.g. one of the admin emails) and hit "Referees / Quick Login" to log in instantly.
- In production, Google Sign-in serves as the primary and only entrance.

#### 🔗 Deep-Linking Invite Format
To register a new player, the Admin generates an invite token. The link has the format:
`fifawarroom://register?inviteId=YOUR_TOKEN`
When clicked, the mobile app intercepts the link, extracts the `inviteId`, and validates it server-side.

---

## 🧮 Mathematical Payout Formulas

### 1. Team Bet Payouts (Peer-to-Peer Pool Split)
- **Normal Win**: The stakes of all losing players are combined into a *Losers Pool*. This pool is divided equally among the winning players.
  $$\text{Winnings per Winner} = \text{TeamStake} + \left( \frac{\text{LosersCount} \times \text{TeamStake}}{\text{WinnersCount}} \right)$$
- **Sweep (Same-Team Sweep)**: If all active participants predicted the same team and that team wins, there is no losers pool. Everyone gets their stake refunded (net zero change).
- **Everyone Loses (Or Draw with 0 Draw Predictors)**: If nobody predicted the correct outcome (or a group stage match ends in a draw and nobody bet on Draw), the entire Team Bet pool is split: **50% to the Referee Kitty** and **50% to the Finals Prize Kitty**.

### 2. Goal Prediction Bet Payouts (Exact Scoreline)
- **Normal Win**: The total goal bet stakes from all participants are pooled together. This pool is divided equally among the players who got the exact score correct.
  $$\text{Winnings per Winner} = \frac{\text{PlacedBetsCount} \times \text{GoalStake}}{\text{WinnersCount}}$$
- **Nobody Wins**: If nobody predicted the exact scoreline, the entire goal bet pool is split: **50% to the Referee Kitty** and **50% to the Finals Prize Kitty**.

### 3. Forfeits & Missed Bets
- If a user does not submit their bets before the **8:00 PM IST daily cutoff**, a default bet is generated.
- The default bet is placed on the losing team and goals are marked incorrect.
- The player forfeits their entire stake (Team + Goal stakes) for that match.
- The forfeited stake is split: **50% to the Referee Kitty** and **50% to the Finals Prize Kitty**.
- Forfeits count as wrong predictions and lower the user's accuracy score.

---

## 🛡️ Firebase Security Rules

Database access is governed by strict rules (`firebase/firestore.rules`):
- Users can read match lists.
- Users can read/write their own bets before lock.
- Bets of other players are strictly hidden until the match locks at 8:00 PM IST (checked using `kickoffTimeIST`).
- Leaderboards are read-only for participants.
- Only users with `role: 'admin'` or emails in the Admin list can modify global settings and settle match outcomes.
