// Isolated payout math tests to verify correctness of formulas

// Core Payout Formulas to be tested
function computeTeamBetPayouts(teamWinnersCount, teamLosersCount, teamStake) {
  if (teamWinnersCount > 0 && teamLosersCount > 0) {
    const loserPool = teamLosersCount * teamStake;
    const sharePerWinner = loserPool / teamWinnersCount;
    return {
      winnerProfit: sharePerWinner,
      loserProfit: -teamStake,
      refereeKitty: 0,
      finalsKitty: 0
    };
  } else if (teamWinnersCount > 0 && teamLosersCount === 0) {
    // Everyone picked the winner -> refund stakes (net zero)
    return {
      winnerProfit: 0,
      loserProfit: 0,
      refereeKitty: 0,
      finalsKitty: 0
    };
  } else if (teamWinnersCount === 0 && teamLosersCount > 0) {
    // Everyone lost (no draw prediction or wrong picks) -> 50% referee, 50% finals
    const totalTeamPool = teamLosersCount * teamStake;
    return {
      winnerProfit: 0,
      loserProfit: -teamStake,
      refereeKitty: totalTeamPool * 0.5,
      finalsKitty: totalTeamPool * 0.5
    };
  }
  return { winnerProfit: 0, loserProfit: 0, refereeKitty: 0, finalsKitty: 0 };
}

function computeGoalBetPayouts(goalWinnersCount, placedBetsCount, goalStake) {
  const totalGoalPool = placedBetsCount * goalStake;
  if (goalWinnersCount > 0) {
    const sharePerWinner = totalGoalPool / goalWinnersCount;
    const winnerProfit = sharePerWinner - goalStake;
    return {
      winnerProfit: winnerProfit,
      loserProfit: -goalStake,
      refereeKitty: 0,
      finalsKitty: 0
    };
  } else {
    // Nobody won -> 50% referee, 50% finals
    return {
      winnerProfit: 0,
      loserProfit: -goalStake,
      refereeKitty: totalGoalPool * 0.5,
      finalsKitty: totalGoalPool * 0.5
    };
  }
}

describe('FIFA War Room - Payout Math Calculations', () => {
  const TEAM_STAKE = 50;
  const GOAL_STAKE = 50;

  test('Team Bet: Normal Win (7 Winners, 3 Losers)', () => {
    const result = computeTeamBetPayouts(7, 3, TEAM_STAKE);
    expect(result.winnerProfit).toBeCloseTo(21.43, 2); // 150 / 7
    expect(result.loserProfit).toBe(-50);
    expect(result.refereeKitty).toBe(0);
  });

  test('Team Bet: Sweep / Same-Team Pick (10 Winners, 0 Losers)', () => {
    const result = computeTeamBetPayouts(10, 0, TEAM_STAKE);
    expect(result.winnerProfit).toBe(0); // Stake refunded, profit is 0
    expect(result.loserProfit).toBe(0);
    expect(result.refereeKitty).toBe(0);
  });

  test('Team Bet: Everyone Loses / Draw with 0 Draw Predictors (0 Winners, 10 Losers)', () => {
    const result = computeTeamBetPayouts(0, 10, TEAM_STAKE);
    expect(result.winnerProfit).toBe(0);
    expect(result.loserProfit).toBe(-50);
    expect(result.refereeKitty).toBe(250); // 50% of (10 * 50)
    expect(result.finalsKitty).toBe(250); // 50% of (10 * 50)
  });

  test('Goal Bet: Normal Win (2 Winners out of 10 Placed Bets)', () => {
    const result = computeGoalBetPayouts(2, 10, GOAL_STAKE);
    // Total pool = 10 * 50 = 500
    // Each winner gets 500 / 2 = 250 (Gross) -> Profit = 250 - 50 = 200
    expect(result.winnerProfit).toBe(200);
    expect(result.loserProfit).toBe(-50);
    expect(result.refereeKitty).toBe(0);
  });

  test('Goal Bet: Nobody wins (0 Winners out of 10 Placed Bets)', () => {
    const result = computeGoalBetPayouts(0, 10, GOAL_STAKE);
    // Total pool = 10 * 50 = 500
    // Splits 50-50 to kitties
    expect(result.winnerProfit).toBe(0);
    expect(result.loserProfit).toBe(-50);
    expect(result.refereeKitty).toBe(250);
    expect(result.finalsKitty).toBe(250);
  });
});
