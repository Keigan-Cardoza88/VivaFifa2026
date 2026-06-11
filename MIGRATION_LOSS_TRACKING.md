# Data Migration Plan: Loss Tracking Fix

## Summary
The betting settlement logic has been updated to correctly track **only actual losses** instead of full stakes. This fixes the UX confusion where players winning 1/2 of their bets appeared to have losses despite 50% accuracy.

---

## What Changed

### **Logic (Unchanged - but reporting fixed)**
Payouts and settlement calculations remain exactly the same. Only **how we count/report losses** changed.

### **Calculation Change**

**BEFORE (Confusing):**
```
netProfit = totalAmountWon - (all stakes ever placed)
Result: Winning 1/2 = +₹64 won, -₹100 lost = -₹36 ❌
```

**AFTER (Clear):**
```
netProfit = totalAmountWon - (only stakes actually lost)
Result: Winning 1/2 = +₹64 won, -₹50 lost = +₹14 ✓
```

---

## All Cases Handled

| Scenario | Team Result | Goal Result | amountWon | amountLost | netProfit |
|----------|-------------|-------------|-----------|-----------|-----------|
| Win both | Won | Won | ₹100 + share | 0 | **Positive** ✓ |
| Win team, lose goal | Won | Lost | ₹64 | ₹50 | **+₹14** ✓ |
| Lose team, win goal | Lost | Won | ₹64 | ₹50 | **+₹14** ✓ |
| Lose both | Lost | Lost | 0 | ₹100 | **-₹100** ✓ |
| Forfeited | Forfeited | Forfeited | 0 | ₹100 | **-₹100** ✓ |
| Goal refunded* | Won | Refunded | ₹64 + ₹50 | ₹50 | **+₹64** ✓ |
| Goal refunded* | Lost | Refunded | ₹50 | ₹50 | **0** ✓ |
| Postponed | — | — | 0 | 0 | **0** ✓ |

*Goal refunded means no one predicted the correct score, so all goal stakes returned

---

## Data Migration Steps

### **Step 1: Backup Current Data**
Before running migration, optionally export:
```bash
# Export current leaderboard for verification
firebase firestore export gs://your-bucket/leaderboard-backup
```

### **Step 2: Run Migration Script**
```bash
cd backend
node scripts/migrateLossTracking.js
```

**What it does:**
1. Reads all completed matches
2. For each bet in those matches:
   - Calculates correct `amountLost` based on actual match results and predictions
   - Updates bet document with corrected `amountLost`
3. Rebuilds entire leaderboard from scratch

**Duration:** ~1-2 minutes for typical dataset

### **Step 3: Verify Results**
Check a few user profiles:
- Open Leaderboard tab
- Pick users who had "confusing" losses
- Verify their `netProfit` now makes sense (≥0 if they had winning predictions)

---

## Field Updates

### **Bets Collection** (`bets/{betId}`)
**New/Updated Fields:**
- `amountLost` - Will be correctly set to only stakes actually lost

**Calculation Logic:**
```javascript
if (isDefault || forfeited) {
  amountLost = teamStake + goalStake;  // ₹100 for group stage
} else if (goalBetResult === 'refunded') {
  amountLost = teamStake ? (teamBetResult === 'lost' ? teamStake : 0) : 0;
} else {
  amountLost = 0;
  if (teamBetResult === 'lost') amountLost += teamStake;
  if (goalBetResult === 'lost') amountLost += goalStake;
}
```

### **Users Collection (`users/{userId}`) - Leaderboard Fields**
**Modified Calculation:**
```javascript
totalLost = SUM(bet.amountLost) from all completed bets
netProfit = totalWon - totalLost
```

**NO CHANGES TO:**
- `totalWon` (still sums amountWon)
- `correctPredictions` (still counts correct team/goal calls)
- `totalPredictions` (still 2 per match)
- `accuracyPercent` (still correctPredictions / totalPredictions * 100)

---

## Example: Mexico 2-0 Match

**Prediction:** Mexico 2-1 (Team: Mexico ✓ | Goals: 2-1 ✗)

**Before Migration:**
```
totalWon:  ₹64 (team half of winners pool)
totalLost: ₹100 (unconditional full stake)
netProfit: -₹36 ❌ CONFUSING
```

**After Migration:**
```
totalWon:  ₹64 (team half of winners pool)
totalLost: ₹50 (only the goal stake lost)
netProfit: +₹14 ✓ CLEAR
```

---

## Rollback Plan (If Needed)

If issues occur, you can restore from backup:
```bash
# 1. Get backup match ID
firebase firestore read settlement_backups/{matchId}

# 2. Re-run settlement for that match
curl -X POST https://your-api/settleMatch \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "matchId": "matchId",
    "status": "completed",
    "resultTeamAGoals": 2,
    "resultTeamBGoals": 0,
    "winner": "teamA"
  }'

# 3. Leaderboard will auto-rebuild
```

---

## Implementation Files Modified

1. **`backend/scripts/migrateLossTracking.js`** - NEW
   - Calculates correct amountLost for all historical bets
   - Rebuilds leaderboard
   
2. **`backend/api/settleMatch.js`** - UPDATED
   - Team outcome branch: Sets `amountLost += teamStake` for losers
   - Goal outcome branch: Sets `amountLost += goalStake` for losers  
   - Goal refund: Sets `amountLost = 0` (refunded stake)
   - Leaderboard rebuild: Uses actual `amountLost` from bets instead of always adding full stakes

---

## No Logic Changes
- Settlement payouts: **IDENTICAL**
- Bet scoring (teamBetResult, goalBetResult): **IDENTICAL**
- Kitty distribution: **IDENTICAL**
- All other game mechanics: **IDENTICAL**

Only the **reporting/accounting** changed to be more intuitive.
