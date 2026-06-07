# FIFA War Room — Full Codex Build Prompt

---

## OVERVIEW

Build a full-stack mobile application called **"FIFA War Room"** — a private family betting app for FIFA World Cup 2026. The app is for a closed group (no public access), distributed via TestFlight (iOS) and direct APK (Android). There is no App Store deployment.

**Tech Stack:**
- **Frontend:** React Native + Expo (single codebase for iOS + Android)
- **Backend:** Firebase (Firestore, Authentication, Cloud Functions, FCM)
- **Admin Panel:** Separate React web app (runs in browser, for referee/admin only)
- **No external payment gateway needed** — money is handled offline, app only tracks it

---

## USER ROLES

### 1. Admin (Referee)
- One account, hardcoded or set during first-time setup
- Full access to admin web panel
- Can: add/edit matches, enter final scores, change stake amounts per stage, manage prize distribution percentages, view all bets, add/remove participants, adjust late entry fees, manually override anything, manage the referee kitty balance
- Admin also participates as a regular player — their bets are visible to a designated co-auditor (one other user flagged as "auditor" by admin, read-only access to admin bet logs)

### 2. Participant
- Registers via invite link only (no open registration)
- Can: place bets, view their own bets, view leaderboard, view match schedule, view their balance and payment status

---

## AUTHENTICATION

- Firebase Phone Auth (OTP via SMS) — primary method
- Google Sign-in as fallback
- Invite-only: admin generates invite links, each link is single-use and expires after 48 hours
- No public sign-up screen

---

## TOURNAMENT STRUCTURE

FIFA World Cup 2026 — **104 matches total:**

| Stage | Matches |
|---|---|
| Group Stage | 72 |
| Round of 32 | 16 |
| Round of 16 | 8 |
| Quarter-finals | 4 |
| Semi-finals | 2 |
| Third-place Play-off | 1 |
| Final | 1 |
| **Total** | **104** |

All 104 matches must be pre-loaded into Firestore with:
- Match ID
- Team A, Team B
- Stage
- Scheduled kickoff time (IST)
- Status: upcoming / betting_open / betting_closed / live / completed
- Result (filled after match)

---

## STAKE AMOUNTS PER STAGE

Stakes increase by ₹25 per stage from Round of 32 onwards. Admin can override any stage's stake at any time from the admin panel.

| Stage | Team Bet | Goal Bet | Total Per Match |
|---|---|---|---|
| Group Stage | ₹50 | ₹50 | ₹100 |
| Round of 32 | ₹75 | ₹75 | ₹150 |
| Round of 16 | ₹100 | ₹100 | ₹200 |
| Quarter-finals | ₹125 | ₹125 | ₹250 |
| Semi-finals | ₹150 | ₹150 | ₹300 |
| Third-place | ₹150 | ₹150 | ₹300 |
| Final | Admin sets | Admin sets | Admin sets |

---

## BETTING RULES — CORE

### Two Mandatory Bets Per Match
Every participant **must** place both bets for every match before the cutoff. Both are mandatory — you cannot place one without the other.

#### Bet 1 — Team Prediction
- Pick one team to win OR predict a Draw (Draw only available in Group Stage)
- Single selection only — no hedging, no changing after submission

#### Bet 2 — Goal Prediction
- Predict the exact final score: Team A goals and Team B goals
- Must be consistent with Bet 1:
  - If you picked Team A to win → Team A goals must be strictly greater than Team B goals
  - If you picked Team B to win → Team B goals must be strictly greater than Team A goals
  - If you picked Draw (group stage only) → both teams must have equal goals
- App enforces this at submission — inconsistent combinations are blocked with a clear error message

### Bet Cutoff
- **8:00 PM IST daily** — all bets for upcoming matches that day must be placed before 8pm IST
- On weekends and public holidays, the cutoff covers all matches up to and including the next working day (Monday)
- No matches in India kick off before 8pm IST — this is confirmed, no edge case needed
- App sends a push notification reminder at **7:00 PM IST** every day that has upcoming matches
- Final reminder at **7:45 PM IST** for anyone who hasn't bet yet
- Notifications are informational — not harassing. Max 2 per day per person

### Once Placed, Bets Cannot Be Changed
- Bets are locked on submission
- No edit, no withdrawal
- App shows a confirmation screen before final submission with all bet details

---

## DEFAULT BET RULE (Missing Bet Penalty)

If a participant does NOT place their bets before the 8pm cutoff for any match:
- Their Team Bet is automatically placed on the **losing team** (assigned after match ends)
- Their Goal Bet is automatically recorded as **wrong**
- Their full stake for that match is forfeited
- **Forfeit split:** 50% goes to Referee Kitty, 50% goes to Finals Prize Kitty
- This is shown clearly on their profile as a "Forfeited" entry
- Counts as a loss on leaderboard — no points awarded, no negative points either (floor is 0)

---

## RESULT CALCULATION RULES

### Group Stage
- Team bet winner = team that wins in 90 minutes OR draw if it ends level
- Goal prediction = exact goals scored in 90 minutes only (no extra time in group stage)

### Post Group Stage (Round of 32 onwards)
- Team bet winner = final result including extra time and penalties (whoever advances)
- Goal prediction = goals scored in 90 minutes + extra time combined
- If match goes to penalties: extra time goals are the final count for goal prediction — penalty shootout goals are NOT counted
- If the goal prediction bet cannot be resolved by ET goals (i.e. nobody predicted the ET scoreline correctly) → all goal prediction bets for that match split: 50% to Referee Kitty, 50% to Finals Prize Kitty

### Draw Outcomes (Group Stage Only)
- If one or more participants predicted Draw and the match ends in a draw → those participants win the Team Bet pool for that match (split equally among all who predicted draw)
- If NO participant predicted Draw and match ends in draw → full Team Bet pool splits: 50% Referee Kitty, 50% Finals Prize Kitty
- Goal prediction in a draw match follows normal rules (exact score in 90 mins)

---

## PAYOUT LOGIC — TEAM BET

- All participants who predicted the correct outcome share the losing side's total stake equally
- Example: 10 people bet, 7 picked Team A (winner), 3 picked Team B (loser)
  - Losers' pool = 3 × stake
  - That pool is split equally among the 7 winners
  - Each winner gets their stake back + their share of the losers' pool
- App calculates and records this automatically after admin enters the result

---

## PAYOUT LOGIC — GOAL BET

- Exact scoreline must match
- If one or more people got it exactly right → they split the total goal bet pool for that match equally
- If nobody got it right → full pool splits: 50% Referee Kitty, 50% Finals Prize Kitty
- Post group stage penalty edge case handled as described above

---

## LEADERBOARD — TWO SEPARATE BOARDS

### 1. Money Leaderboard
- Ranked by **net profit** = total winnings minus total amount lost
- Updates live after every match result is entered
- Shows: Rank, Name, Net Profit (₹), Total Won, Total Lost, Matches Played

### 2. Accuracy Leaderboard
- Ranked by **prediction accuracy %** = correct predictions / total predictions placed
- Counts both Team Bet and Goal Bet as separate predictions
- Forfeited/defaulted bets count as wrong predictions (not excluded)
- No negative scores — floor is 0% accuracy
- Tiebreaker: higher total number of correct predictions wins the tie
- Shows: Rank, Name, Accuracy %, Correct Predictions, Total Predictions

Both leaderboards visible to all participants at all times.

---

## PAYMENT TRACKING

Participants can pay in one of two ways:
- **Lumpsum:** Full ₹10,400 upfront before tournament starts
- **Installments:** ₹5,000 at tournament start + ₹5,400 before Round of 32 begins

Admin manually marks payments as received in admin panel. App shows each participant's payment status:
- Paid / Partially Paid / Unpaid
- Participants with Unpaid or Partially Paid status are shown a reminder banner

**Late Entry (Group Stage only):**
- Joining is free before the very first FIFA match
- After first match starts, joining costs ₹1,500 entry fee (admin can override this amount per person)
- No joining after Group Stage ends — locked out completely

---

## PRIZE DISTRIBUTION

Default split (admin can change all percentages from admin panel at any time):

Total Prize Pool = all entry fees + all accumulated kitty money (forfeit splits, draw splits, unsolved goal bet splits)

| Prize | Default % | Notes |
|---|---|---|
| 1st Place (Money Leaderboard) | 60% | Highest net profit |
| 2nd Place (Money Leaderboard) | 25% | Second highest net profit |
| 3rd Place (Money Leaderboard) | 15% | Third highest net profit |
| Accuracy Bonus (Highest %) | From Referee Kitty | Admin decides amount |
| Accuracy Bonus (Lowest %) | From Referee Kitty | Loser award — fun prize |
| Maximum Loss Award | From Referee Kitty | Highest total loss — consolation |

Referee Kitty is separate from main prize pool. Admin decides how much of it rolls into bonuses vs kept. All kitty movements logged in admin panel.

Ties on money leaderboard for 2nd/3rd: split the combined prize equally.

---

## NOTIFICATIONS (FCM)

Send push notifications for:
- **7:00 PM IST** — "Betting closes in 1 hour! Place your bets for today's matches"
- **7:45 PM IST** — Only to users who haven't bet yet: "Final warning — 15 mins to place bets"
- **Match result entered** — "Result: Brazil 2–1 Japan | Your bets have been settled"
- **Bet settled** — "You won ₹X on [match]" or "Better luck next time on [match]"
- **New match added** — "New match scheduled: [Team A] vs [Team B]"
- **Payment reminder** — If installment 2 is due soon (3 days before Round of 32)
- No duplicate notifications, no spam, notification preferences not user-editable (family app, keep it simple)

---

## APP SCREENS — PARTICIPANT

### 1. Home / Dashboard
- Today's matches with betting status (Bet Placed / Bet Now / Closed)
- Quick stats: current net profit, accuracy %, rank on both leaderboards
- Notification bell

### 2. Bet Placement Screen
- Shows match details: Team A vs Team B, stage, kickoff time
- Bet 1: Team selector (Team A / Draw / Team B) — Draw only shown in group stage
- Bet 2: Goal input — two number fields (Team A goals : Team B goals)
- Real-time validation — blocks inconsistent combinations with clear error
- Confirmation screen before submission
- Locked screen shown if bet already placed (shows their bet, not editable)

### 3. Match History
- All past matches with: result, user's prediction, outcome (Won/Lost/Forfeited), amount won/lost

### 4. Leaderboard
- Toggle between Money Leaderboard and Accuracy Leaderboard
- Highlight current user's row
- Live updates

### 5. My Profile
- Name, payment status, total stats
- Full bet history
- Wild card status (if implemented later — leave hook in codebase)

### 6. Tournament Bracket
- Visual bracket of all stages
- Shows results for completed matches, upcoming for future

---

## APP SCREENS — ADMIN PANEL (Web)

### 1. Dashboard
- Total pot, referee kitty balance, total participants, bets placed today, matches today

### 2. Match Management
- View all 104 matches
- Enter/edit results after match
- Add new matches if needed
- Change match status manually

### 3. Participant Management
- View all users, payment status, mark payments received
- Generate invite links
- Set co-auditor
- Remove participants
- Override late entry fee per person

### 4. Stakes Management
- View current stakes per stage
- Edit stakes for any stage
- Changes apply to all future bets in that stage

### 5. Prize Distribution
- Edit all prize percentages
- Preview total prize pool and projected payouts
- Manually trigger final payout calculation

### 6. Kitty Management
- Full log of all kitty inflows (draws, forfeits, unsolved goal bets)
- Allocate kitty funds to prizes manually

### 7. Audit Log
- All admin actions logged with timestamp
- Admin's own bets visible to co-auditor here

---

## DATA MODELS (Firestore)

### Collections:

**users**
- uid, name, phone, role (admin/auditor/participant), paymentStatus, paymentPlan, entryFee, joinedAt, isLateEntry

**matches**
- matchId, teamA, teamB, stage, kickoffTimeIST, status, resultTeamAGoals, resultTeamBGoals, winner (teamA/teamB/draw)

**bets**
- betId, userId, matchId, teamPrediction, goalsTeamA, goalsTeamB, placedAt, isDefault (true if system placed), teamBetResult (won/lost/draw_win/forfeited), goalBetResult (won/lost/forfeited), amountWon, amountLost

**leaderboard**
- userId, netProfit, totalWon, totalLost, correctPredictions, totalPredictions, accuracyPercent — recalculated after every match

**kitty**
- type (forfeit/draw/goalbet_unsolved), matchId, amount, splitReferee, splitFinals, createdAt

**invites**
- inviteId, createdBy, usedBy, expiresAt, used (bool)

**settings**
- stakes per stage, prize distribution percentages, late entry fee, tournament status

---

## EDGE CASES TO HANDLE

1. Admin enters wrong result → must be able to correct it, app recalculates all affected bets automatically
2. Match cancelled or postponed → admin marks as postponed, bets are voided and stakes refunded to participants
3. Participant places bet then loses internet → bet only counts if server confirmed receipt (optimistic locking)
4. Two people tie exactly on money leaderboard → combined prize split equally
5. All participants pick the same team and that team wins → no losers pool, no payout movement (everyone just gets their stake back — net zero that match)
6. Late entry participant joins mid group stage → they are only responsible for remaining matches, past forfeits are not applied retroactively
7. Admin changes stakes mid-stage → only applies to matches not yet bet on, already placed bets unaffected
8. Notification fails to send → app shows in-app banner as fallback at 7pm on home screen
9. Final match — admin sets custom stake → app prompts admin to confirm before locking in
10. Co-auditor tries to edit anything → read-only enforced at Firestore rules level

---

## UI / DESIGN DIRECTION

- Dark theme, high contrast — feels like a war room / trading floor
- Primary color: deep navy or near-black background
- Accent: electric green or hot amber for wins, red for losses
- Bold typography — numbers and scores should be large and punchy
- Leaderboard should feel like a live sports scoreboard
- Bet placement screen should feel decisive and clean — no clutter
- Animations on result reveal (win/loss)
- Mobile-first, no desktop participant view needed
- Admin panel can be a clean functional web dashboard — doesn't need to be pretty but must be clear

---

## WHAT NOT TO BUILD

- No social feed, no chat, no comments
- No public leaderboard (invite only)
- No in-app payments or wallets
- No odds engine or probability display
- No match statistics or live score integration (admin enters results manually)
- No wild cards yet — leave hooks in codebase for future addition
- No iOS App Store or Google Play Store deployment

---

## DISTRIBUTION

- iOS: Export as TestFlight build via Expo EAS
- Android: Export as APK via Expo EAS, share directly
- Include `eas.json` config for both targets
- Admin web panel: Firebase Hosting

---

## FINAL NOTES FOR CODEX

- Use Expo SDK latest stable
- Use Firebase v9+ modular SDK
- All Firebase security rules must be written — participants cannot read other participants' bets before cutoff, cannot write to match results, cannot edit placed bets
- Cloud Functions handle: result processing, leaderboard recalculation, kitty allocation, default bet assignment, notification dispatch
- All money calculations happen server-side in Cloud Functions only — never trust client
- Code must be clean, commented, and modular — this app will be maintained and extended
- Include a README with setup instructions, Firebase project config steps, and EAS build commands
