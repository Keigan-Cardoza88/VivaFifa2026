import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc,
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp 
} from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

const ADMIN_EMAILS = [
  'cardoza.kian@gmail.com',
  'cardoza.keigs@gmail.com',
  'cardoza.joseph@gmail.com'
];

const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://vivafifa2026.vercel.app';

const getTeamFlag = (teamName) => {
  if (!teamName) return '';
  const codes = {
    'Mexico': 'mx',
    'South Africa': 'za',
    'South Korea': 'kr',
    'Czechia': 'cz',
    'Canada': 'ca',
    'Bosnia and Herzegovina': 'ba',
    'Qatar': 'qa',
    'Switzerland': 'ch',
    'Brazil': 'br',
    'Haiti': 'ht',
    'Morocco': 'ma',
    'Scotland': 'gb-sct',
    'USA': 'us',
    'Australia': 'au',
    'Paraguay': 'py',
    'Turkiye': 'tr',
    'Turkey': 'tr',
    'Germany': 'de',
    'Ecuador': 'ec',
    'Curacao': 'cw',
    'Curaçao': 'cw',
    'Ivory Coast': 'ci',
    'Netherlands': 'nl',
    'Japan': 'jp',
    'Sweden': 'se',
    'Tunisia': 'tn',
    'Belgium': 'be',
    'Egypt': 'eg',
    'Iran': 'ir',
    'New Zealand': 'nz',
    'Spain': 'es',
    'Saudi Arabia': 'sa',
    'Cape Verde': 'cv',
    'Cabo Verde': 'cv',
    'Uruguay': 'uy',
    'France': 'fr',
    'Iraq': 'iq',
    'Norway': 'no',
    'Senegal': 'sn',
    'Argentina': 'ar',
    'Algeria': 'dz',
    'Austria': 'at',
    'Jordan': 'jo',
    'Portugal': 'pt',
    'Colombia': 'co',
    'DR Congo': 'cd',
    'Uzbekistan': 'uz',
    'England': 'gb-eng',
    'Croatia': 'hr',
    'Ghana': 'gh',
    'Panama': 'pa'
  };
  const code = codes[teamName];
  if (!code) return '';
  return (
    <img 
      src={`https://flagcdn.com/w40/${code}.png`} 
      alt="" 
      style={{ 
        width: '20px', 
        height: '14px', 
        marginRight: '6px', 
        display: 'inline-block', 
        verticalAlign: 'middle', 
        objectFit: 'cover', 
        borderRadius: '2px',
        border: '1px solid rgba(0, 0, 0, 0.15)'
      }} 
    />
  );
};

function App() {
  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch(`/admin/version.json?t=${Date.now()}`);
        if (res.ok) {
          const data = await res.json();
          const lastVersion = localStorage.getItem('admin_version_timestamp');
          if (lastVersion && lastVersion !== String(data.timestamp)) {
            localStorage.setItem('admin_version_timestamp', String(data.timestamp));
            window.location.reload();
          } else if (!lastVersion) {
            localStorage.setItem('admin_version_timestamp', String(data.timestamp));
          }
        }
      } catch (e) {
        console.error('Failed to check admin version:', e);
      }
    };
    checkVersion();
  }, []);

  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedStageTab, setSelectedStageTab] = useState('r32');
  const [leaderboard, setLeaderboard] = useState([]);
  const [matchesStakesFilter, setMatchesStakesFilter] = useState('all');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('admin_theme') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('admin_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('admin_theme', 'light');
    }
  }, [isDarkMode]);

  // Real-time collections
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [kittyLogs, setKittyLogs] = useState([]);
  const [globalSettings, setGlobalSettings] = useState(null);

  // Forms states
  const [scoreInput, setScoreInput] = useState({ matchId: '', teamAGoals: 0, teamBGoals: 0, winner: '' });
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
  const [actionLoading, setActionLoading] = useState(false);
  const [customMatch, setCustomMatch] = useState({ matchId: '', teamA: '', teamB: '', stage: 'group', kickoffTime: '' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [editMatchForm, setEditMatchForm] = useState({ teamA: '', teamB: '', stage: 'group', kickoffTime: '' });

  // Bracket Editing States
  const [editingBracketMatch, setEditingBracketMatch] = useState(null);
  const [bracketTeamForm, setBracketTeamForm] = useState({ teamA: '', teamB: '', matchId: '' });

  // Viewing and Overriding Bets
  const [viewingMatchBets, setViewingMatchBets] = useState(null);
  const [matchBetsData, setMatchBetsData] = useState([]);
  const [betsLoading, setBetsLoading] = useState(false);
  const [overrideBetForm, setOverrideBetForm] = useState({ userId: '', teamPrediction: '', goalsTeamA: '', goalsTeamB: '', mode: 'normal' });
  const [matchesSortOrder, setMatchesSortOrder] = useState('time-asc');

  // 1. Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      setAuthError(null);
      try {
        if (currentUser) {
          const email = currentUser.email;
          const isSysAdmin = ADMIN_EMAILS.includes(email);

          if (isSysAdmin) {
            setUser(currentUser);
            setIsAdmin(true);
          } else {
            await signOut(auth);
            setAuthError('Unauthorized: Access denied. This portal is for referees only.');
          }
        } else {
          setUser(null);
          setIsAdmin(false);
        }
      } catch (err) {
        console.error("Auth sync error:", err);
        setAuthError(`Connection Error: ${err.message}`);
        setUser(null);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Load Firestore Data when authenticated
  useEffect(() => {
    if (!user) return;

    // Listen to matches
    const qMatches = query(collection(db, 'matches'), orderBy('kickoffTimeIST', 'asc'));
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setMatches(list);
    });

    // Listen to users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setUsers(list);
    });

    // Listen to settings
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalSettings(docSnap.data());
      }
    });

    // Listen to kitty logs
    const qKitty = query(collection(db, 'kitty'), orderBy('createdAt', 'desc'));
    const unsubKitty = onSnapshot(qKitty, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setKittyLogs(list);
    });

    // Listen to leaderboard
    const unsubLeaderboard = onSnapshot(collection(db, 'leaderboard'), (snapshot) => {
      const list = [];
      snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setLeaderboard(list);
    });

    return () => {
      unsubMatches();
      unsubUsers();
      unsubSettings();
      unsubKitty();
      unsubLeaderboard();
    };
  }, [user]);

  // Auth Operations
  const handleLogin = async () => {
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
      setAuthError('Failed to sign in. Please try again.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  // 3. Actions
  // A. Approve a pending user's join request
  const handleApproveUser = async (pendingUser) => {
    setActionLoading(true);
    try {
      // Determine late entry fee
      const match1Doc = await getDoc(doc(db, 'matches', '1'));
      const now = new Date();
      const tournamentStart = match1Doc.exists() ? match1Doc.data().kickoffTimeIST.toDate() : new Date('2026-06-11T20:00:00+05:30');
      const isLateEntry = now > tournamentStart;
      const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
      const settings = settingsDoc.exists() ? settingsDoc.data() : { lateEntryFeeDefault: 1500 };
      const entryFee = isLateEntry ? (settings.lateEntryFeeDefault || 1500) : 0;

      const userRef = doc(db, 'users', pendingUser.uid);
      await updateDoc(userRef, {
        role: 'participant',
        entryFee,
        isLateEntry,
        paymentStatus: 'unpaid',
        approvedAt: Timestamp.now()
      });

      // Create leaderboard entry
      await setDoc(doc(db, 'leaderboard', pendingUser.uid), {
        userId: pendingUser.uid,
        userName: pendingUser.name,
        netProfit: 0,
        totalWon: 0,
        totalLost: 0,
        correctPredictions: 0,
        totalPredictions: 0,
        accuracyPercent: 0
      });

      setStatusMessage({ type: 'success', text: `${pendingUser.name} approved and added as a participant.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to approve user: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // B. Reject a pending user's join request (deletes their profile)
  const handleRejectUser = async (pendingUser) => {
    if (!window.confirm(`Reject ${pendingUser.name}'s join request? Their profile will be deleted.`)) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'users', pendingUser.uid));
      setStatusMessage({ type: 'success', text: `${pendingUser.name}'s request rejected and profile removed.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to reject user: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // C. Payout Settlement (Settle Match)
  const handleSettleMatch = async (e) => {
    e.preventDefault();

    const goalsA = Number(scoreInput.teamAGoals);
    const goalsB = Number(scoreInput.teamBGoals);
    const winner = scoreInput.winner;

    // Enforce match winner logic consistency
    if (selectedMatch.stage === 'group') {
      if (goalsA > goalsB && winner !== 'teamA') {
        alert(`Validation Error: In group stage, if ${selectedMatch.teamA} scored more goals, they must be selected as the winner.`);
        return;
      }
      if (goalsB > goalsA && winner !== 'teamB') {
        alert(`Validation Error: In group stage, if ${selectedMatch.teamB} scored more goals, they must be selected as the winner.`);
        return;
      }
      if (goalsA === goalsB && winner !== 'draw') {
        alert("Validation Error: In group stage, equal scores must result in a Draw.");
        return;
      }
    } else {
      // Knockout stages (r32, r16, qf, sf, third_place, final)
      if (goalsA > goalsB && winner !== 'teamA') {
        alert(`Validation Error: In knockout stage, if ${selectedMatch.teamA} scored more goals, they must be selected as the winner.`);
        return;
      }
      if (goalsB > goalsA && winner !== 'teamB') {
        alert(`Validation Error: In knockout stage, if ${selectedMatch.teamB} scored more goals, they must be selected as the winner.`);
        return;
      }
      if (goalsA === goalsB && winner === 'draw') {
        alert("Validation Error: Knockout matches cannot end in a Draw. Select the penalty shootout winner (Team A or Team B).");
        return;
      }
    }

    setActionLoading(true);
    setStatusMessage({ type: 'info', text: 'Processing settlement calculations server-side...' });
    
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/settleMatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          matchId: selectedMatch.matchId,
          status: 'completed',
          resultTeamAGoals: Number(scoreInput.teamAGoals),
          resultTeamBGoals: Number(scoreInput.teamBGoals),
          winner: scoreInput.winner
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to settle match');
      }

      setStatusMessage({ type: 'success', text: `Match ${selectedMatch.matchId} settled successfully! Leaderboard updated.` });
      setSelectedMatch(null);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // B. Download Backup
  const handleDownloadBackup = async (matchId) => {
    setActionLoading(true);
    setStatusMessage({ type: 'info', text: `Fetching settlement backup for Match #${matchId}...` });
    try {
      const backupRef = doc(db, 'settlement_backups', String(matchId));
      const backupDoc = await getDoc(backupRef);
      if (!backupDoc.exists()) {
        throw new Error('Settlement backup not found for this match.');
      }
      
      const backupData = backupDoc.data();
      const formattedBackup = {
        ...backupData,
        settledAt: backupData.settledAt?.toDate ? backupData.settledAt.toDate().toISOString() : backupData.settledAt
      };
      
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(formattedBackup, null, 2)
      )}`;
      
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', jsonString);
      downloadAnchor.setAttribute('download', `settlement_backup_match_${matchId}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      
      setStatusMessage({ type: 'success', text: `Backup for Match #${matchId} downloaded successfully.` });
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `Failed to download backup: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // C. Postpone Match
  const handlePostponeMatch = async (matchId) => {
    if (!window.confirm(`Are you sure you want to postpone Match ${matchId}? This will void all bets for this match and refund player stakes.`)) return;
    setActionLoading(true);

    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/settleMatch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          matchId: String(matchId),
          status: 'postponed'
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to postpone match');
      }

      setStatusMessage({ type: 'success', text: `Match ${matchId} postponed. Bets voided.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // D. Update User Payment status
  const handleUpdatePayment = async (userId, field, value) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { [field]: value });
      setStatusMessage({ type: 'success', text: 'Payment details updated successfully.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Error updating user: ${err.message}` });
    }
  };

  // E. Override Late Entry Fee
  const handleOverrideFee = async (userId, fee) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { entryFee: Number(fee) });
      setStatusMessage({ type: 'success', text: 'Late entry fee overridden.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Error updating fee: ${err.message}` });
    }
  };

  // G. Edit Stakes per Stage (Normal mode bet prices)
  const handleUpdateStakes = async (stage, field, value) => {
    try {
      const newStakes = { ...globalSettings.stakes };
      newStakes[stage][field] = Number(value);
      await updateDoc(doc(db, 'settings', 'global'), { stakes: newStakes });
      setStatusMessage({ type: 'success', text: `Normal stakes updated for stage: ${stage}` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Error updating stakes: ${err.message}` });
    }
  };

  // G2. Edit Stakes Mode bet prices (real-money mode — separate from normal)
  const handleUpdateStakesMode = async (stage, field, value) => {
    try {
      const current = globalSettings.stakes_mode || {};
      const updated = {
        ...current,
        [stage]: { ...(current[stage] || { team: 100, goal: 50 }), [field]: Number(value) }
      };
      await updateDoc(doc(db, 'settings', 'global'), { stakes_mode: updated });
      setStatusMessage({ type: 'success', text: `Stakes Mode prices updated for stage: ${stage}` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Error updating stakes mode prices: ${err.message}` });
    }
  };

  // H. Edit Prize Percentages
  const handleUpdatePrizes = async (field, value) => {
    try {
      const newPrizes = { ...globalSettings.prizes, [field]: Number(value) };
      await updateDoc(doc(db, 'settings', 'global'), { prizes: newPrizes });
      setStatusMessage({ type: 'success', text: 'Prize percentages updated.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Error: ${err.message}` });
    }
  };

  // I. Allocate Kitty to Finals
  const handleAllocateKitty = async (amount) => {
    const numAmt = Number(amount);
    if (isNaN(numAmt) || numAmt <= 0) return alert('Enter valid amount');
    try {
      const logRef = doc(collection(db, 'kitty'));
      await setDoc(logRef, {
        kittyId: logRef.id,
        type: 'manual_allocation',
        amount: -numAmt,
        splitReferee: -numAmt,
        splitFinals: numAmt,
        stage: selectedStageTab,
        createdAt: new Date()
      });
      setStatusMessage({ type: 'success', text: `Allocated Rs ${numAmt} from Referee Kitty to Finals Pool.` });
    } catch (err) {
       setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Adjust Kitty Balances Directly
  const handleAdjustKitty = async (targetField, currentTotal) => {
    const promptText = targetField === 'referee'
      ? `Enter new balance for Referee Kitty Reserve (current: Rs ${currentTotal}):`
      : `Enter new balance for Finals Kitty Pool (current: Rs ${currentTotal}):`;
    const newAmtStr = prompt(promptText, currentTotal);
    if (newAmtStr === null) return; // user cancelled
    const numNew = Number(newAmtStr);
    if (isNaN(numNew)) return alert('Enter a valid number');
    const difference = numNew - currentTotal;
    if (difference === 0) return;
    try {
      const logRef = doc(collection(db, 'kitty'));
      await setDoc(logRef, {
        kittyId: logRef.id,
        type: 'manual_adjustment',
        createdAt: new Date(),
        stage: selectedStageTab,
        splitReferee: targetField === 'referee' ? difference : 0,
        splitFinals: targetField === 'finals' ? difference : 0
      });
      setStatusMessage({ type: 'success', text: `Adjusted ${targetField === 'referee' ? 'Referee Kitty' : 'Finals Pot'} by ${difference >= 0 ? '+' : ''}Rs ${difference}` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // J. Trigger Cron Scheduler Manually
  const handleTriggerCron = async () => {
    setActionLoading(true);
    setStatusMessage({ type: 'info', text: 'Triggering lock scheduler...' });
    try {
      const response = await fetch(`${API_BASE}/api/cron?secret=development`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to trigger scheduler');
      setStatusMessage({ type: 'success', text: `Scheduler run complete: ${data.message || 'Updated matching bet locks/notifications'}` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to trigger scheduler: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // K. Create Custom Match Fixture
  const handleCreateCustomMatch = async (e) => {
    e.preventDefault();
    if (!customMatch.matchId || !customMatch.teamA || !customMatch.teamB || !customMatch.kickoffTime) {
      return alert('Please fill in all fields.');
    }
    setActionLoading(true);
    try {
      const kickoffDate = new Date(customMatch.kickoffTime);
      const newFixture = {
        matchId: String(customMatch.matchId),
        teamA: customMatch.teamA,
        teamB: customMatch.teamB,
        stage: customMatch.stage,
        kickoffTimeIST: Timestamp.fromDate(kickoffDate),
        status: 'upcoming'
      };
      await setDoc(doc(db, 'matches', String(customMatch.matchId)), newFixture);
      setCustomMatch({ matchId: '', teamA: '', teamB: '', stage: 'group', kickoffTime: '' });
      setStatusMessage({ type: 'success', text: `Custom Match #${newFixture.matchId} created successfully!` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to create match: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // Bracket Team Quick Updates
  const handleSaveBracketTeams = async (e) => {
    e.preventDefault();
    if (!editingBracketMatch) return;
    setActionLoading(true);
    try {
      const matchId = String(editingBracketMatch.matchId || editingBracketMatch.id);
      const matchDocRef = doc(db, 'matches', matchId);
      const matchDoc = await getDoc(matchDocRef);
      
      const updatedData = {
        teamA: bracketTeamForm.teamA || '',
        teamB: bracketTeamForm.teamB || ''
      };

      if (matchDoc.exists()) {
        await updateDoc(matchDocRef, updatedData);
      } else {
        await setDoc(matchDocRef, {
          ...updatedData,
          matchId,
          stage: editingBracketMatch.stage,
          status: 'upcoming',
          kickoffTimeIST: Timestamp.now()
        });
      }
      
      setEditingBracketMatch(null);
      setStatusMessage({ type: 'success', text: `Bracket Match #${matchId} teams updated successfully.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to update bracket teams: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };



  // L. Delete User from Database
  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user? All their leaderboard data and bets will be removed.")) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      await deleteDoc(doc(db, 'leaderboard', userId));
      setStatusMessage({ type: 'success', text: 'User deleted successfully.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Error deleting user: ${err.message}` });
    }
  };

  // Helper: Format Firestore Timestamp to datetime-local format
  const formatTimestampForInput = (ts) => {
    if (!ts) return '';
    const date = new Date(ts.seconds * 1000);
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
  };

  // N. Delete Match Fixture
  const handleDeleteMatch = async (matchId) => {
    if (!window.confirm(`Are you sure you want to delete Match #${matchId}? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'matches', String(matchId)));
      setStatusMessage({ type: 'success', text: `Match #${matchId} deleted successfully.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to delete match: ${err.message}` });
    }
  };

  // Q2. Open individual match betting window
  const handleOpenMatch = async (matchId) => {
    const match = matches.find(m => String(m.matchId) === String(matchId) || String(m.id) === String(matchId));
    if (match?.status === 'completed') {
      setStatusMessage({ type: 'error', text: `Match ${matchId} is already completed and cannot be reopened.` });
      return;
    }
    if (!window.confirm(`Open betting for Match ${matchId}?`)) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'matches', String(matchId)), { status: 'upcoming' });
      setStatusMessage({ type: 'success', text: `Match ${matchId} betting opened.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to open match: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // Q3. Close individual match betting window
  const handleCloseMatch = async (matchId) => {
    const match = matches.find(m => String(m.matchId) === String(matchId) || String(m.id) === String(matchId));
    if (match?.status === 'completed') {
      setStatusMessage({ type: 'error', text: `Match ${matchId} is already completed and cannot be closed.` });
      return;
    }
    if (!window.confirm(`Close betting for Match ${matchId}? This will forfeit unplaced bets when scheduler runs.`)) return;
    setActionLoading(true);
    try {
      await updateDoc(doc(db, 'matches', String(matchId)), { status: 'betting_closed' });
      setStatusMessage({ type: 'success', text: `Match ${matchId} betting closed.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to close match: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // O. Save Edited Match Fixture
  const handleSaveEditMatch = async (e) => {
    e.preventDefault();
    if (!editMatchForm.teamA || !editMatchForm.teamB || !editMatchForm.kickoffTime) {
      return alert('All fields are required.');
    }
    setActionLoading(true);
    try {
      const matchRef = doc(db, 'matches', String(editingMatch.matchId));
      const kickoffDate = new Date(editMatchForm.kickoffTime);
      await updateDoc(matchRef, {
        teamA: editMatchForm.teamA,
        teamB: editMatchForm.teamB,
        stage: editMatchForm.stage,
        kickoffTimeIST: Timestamp.fromDate(kickoffDate)
      });
      setEditingMatch(null);
      setStatusMessage({ type: 'success', text: `Match #${editingMatch.matchId} updated successfully.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to update match: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // P. View Match Bets
  const handleViewBets = async (matchId) => {
    if (viewingMatchBets === matchId) {
      setViewingMatchBets(null);
      return;
    }
    setViewingMatchBets(matchId);
    setBetsLoading(true);
    try {
      const list = [];
      const showNormal = matchesStakesFilter === 'all' || matchesStakesFilter === 'normal';
      const showStakes = matchesStakesFilter === 'all' || matchesStakesFilter === 'stakes';

      if (showNormal) {
        const betsQuery = query(collection(db, 'bets'), where('matchId', '==', String(matchId)));
        const snapshot = await getDocs(betsQuery);
        snapshot.forEach(doc => list.push({ id: doc.id, collectionName: 'bets', isStakes: false, ...doc.data() }));
      }

      if (showStakes && Number(matchId) >= 151) {
        const stakesQuery = query(collection(db, 'stakes_bets'), where('matchId', '==', String(matchId)));
        const stakesSnapshot = await getDocs(stakesQuery);
        stakesSnapshot.forEach(doc => list.push({ id: doc.id, collectionName: 'stakes_bets', isStakes: true, ...doc.data() }));
      }

      setMatchBetsData(list);
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: `Failed to load bets: ${err.message}` });
    } finally {
      setBetsLoading(false);
    }
  };

  // Q. Override Bet for User
  const handleOverrideBetSubmit = async (e, matchId) => {
    e.preventDefault();
    if (!overrideBetForm.userId || !overrideBetForm.teamPrediction || overrideBetForm.goalsTeamA === '' || overrideBetForm.goalsTeamB === '') {
      return alert('Please fill in all override bet fields.');
    }
    setActionLoading(true);
    try {
      const mode = Number(matchId) >= 151 ? (overrideBetForm.mode || 'normal') : 'normal';
      const collectionName = mode === 'stakes' ? 'stakes_bets' : 'bets';

      const betId = `${overrideBetForm.userId}_${matchId}`;
      const betRef = doc(db, collectionName, betId);
      
      const newBet = {
        betId,
        userId: overrideBetForm.userId,
        matchId: String(matchId),
        teamPrediction: overrideBetForm.teamPrediction,
        goalsTeamA: Number(overrideBetForm.goalsTeamA),
        goalsTeamB: Number(overrideBetForm.goalsTeamB),
        placedAt: Timestamp.now(),
        isDefault: false,
        isOverride: true
      };

      await setDoc(betRef, newBet);
      setStatusMessage({ type: 'success', text: `Bet (${mode.toUpperCase()}) overridden for user ${overrideBetForm.userId}.` });
      setOverrideBetForm({ userId: '', teamPrediction: '', goalsTeamA: '', goalsTeamB: '', mode: 'normal' });
      await handleViewBets(matchId); // reload bets
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to override bet: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // Q2. Delete Placed Bet
  const handleDeleteBet = async (betId, collectionName, matchId) => {
    if (!window.confirm("Are you sure you want to delete this player's bet?")) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, collectionName || 'bets', betId));
      setStatusMessage({ type: 'success', text: 'Bet deleted successfully.' });
      await handleViewBets(matchId); // reload bets
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to delete bet: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // Close betting for all non-completed matches
  const handleCloseAllBets = async () => {
    if (!window.confirm("Are you sure you want to CLOSE betting for all upcoming/live matches immediately?")) return;
    setActionLoading(true);
    setStatusMessage({ type: 'info', text: 'Closing wagers for all upcoming matches...' });
    try {
      const promises = matches
        .filter(m => m.status === 'upcoming' || m.status === 'live')
        .map(m => updateDoc(doc(db, 'matches', m.id), { status: 'betting_closed' }));
      await Promise.all(promises);
      setStatusMessage({ type: 'success', text: 'Successfully closed wagers for all matches.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to close wagers: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // Open betting for all non-completed matches
  const handleStartAllBets = async () => {
    if (!window.confirm("Are you sure you want to OPEN betting for all non-completed/non-postponed matches immediately?")) return;
    setActionLoading(true);
    setStatusMessage({ type: 'info', text: 'Opening wagers for all matches...' });
    try {
      const promises = matches
        .filter(m => m.status === 'betting_closed' || m.status === 'live')
        .map(m => updateDoc(doc(db, 'matches', m.id), { status: 'upcoming' }));
      await Promise.all(promises);
      setStatusMessage({ type: 'success', text: 'Successfully opened wagers for all matches.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to open wagers: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  const isUserEligibleForMatch = (u, match, forcedMode = null) => {
    if (!u) return false;
    
    // Determine active filter state or default split
    const mode = forcedMode || (matchesStakesFilter === 'stakes' ? 'stakes' : (matchesStakesFilter === 'normal' ? 'normal' : null));
    const isStakes = mode === 'stakes' || 
                     (mode === null && match?.stage === 'r32' && Number(match?.matchId) > 150);
                     
    if (isStakes) {
      if (!match?.kickoffTimeIST) return true;
      const joinedAt = u.approvedAt || u.joinedAt;
      if (!joinedAt) return true;
      const joinedTime = joinedAt.seconds * 1000;
      const kickoffTime = match.kickoffTimeIST.seconds * 1000;
      return joinedTime <= kickoffTime;
    } else {
      if (u.isLateEntry || u.entryFee === 1500) return false;
      if (!match?.kickoffTimeIST) return true;
      const joinedAt = u.approvedAt || u.joinedAt;
      if (!joinedAt) return true;
      const joinedTime = joinedAt.seconds * 1000;
      const kickoffTime = match.kickoffTimeIST.seconds * 1000;
      return joinedTime <= kickoffTime;
    }
  };

  const getSortedMatches = () => {
    let list = [...matches];
    if (matchesStakesFilter === 'stakes') {
      list = list.filter(m => String(m.matchId).endsWith('_stakes'));
    } else if (matchesStakesFilter === 'normal') {
      list = list.filter(m => !String(m.matchId).endsWith('_stakes'));
    }

    if (matchesSortOrder === 'time-asc') {
      list.sort((a, b) => (a.kickoffTimeIST?.seconds || 0) - (b.kickoffTimeIST?.seconds || 0));
    } else if (matchesSortOrder === 'time-desc') {
      list.sort((a, b) => (b.kickoffTimeIST?.seconds || 0) - (a.kickoffTimeIST?.seconds || 0));
    } else if (matchesSortOrder === 'id-asc') {
      list.sort((a, b) => {
        const idA = parseInt(a.matchId) || 0;
        const idB = parseInt(b.matchId) || 0;
        return idA - idB;
      });
    } else if (matchesSortOrder === 'id-desc') {
      list.sort((a, b) => {
        const idA = parseInt(a.matchId) || 0;
        const idB = parseInt(b.matchId) || 0;
        return idB - idA;
      });
    } else if (matchesSortOrder === 'stage') {
      const stageOrder = { group: 1, r32: 2, r16: 3, qf: 4, sf: 5, third_place: 6, final: 7 };
      list.sort((a, b) => (stageOrder[a.stage] || 0) - (stageOrder[b.stage] || 0));
    }
    return list;
  };
  const sortedMatches = getSortedMatches();

  // Loading Screen
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <h2>Loading VivaFifa2026 Codex...</h2>
      </div>
    );
  }

  // Login Screen
  if (!user) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">VivaFifa2026</h1>
          <p className="login-subtitle">Closed betting arena — World Cup 2026</p>
          <p className="login-description">
            Access to this referee panel is strictly restricted. Log in with your authorized Google Account.
          </p>
          {authError && <div className="error-message">{authError}</div>}
          <button className="btn-google" onClick={handleLogin}>
            <svg className="google-logo" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.47 14.99 0 12 0 7.35 0 3.39 2.67 1.46 6.57l3.92 3.04C6.35 6.88 8.97 5.04 12 5.04z"/>
              <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58v2.98h3.89c2.28-2.1 3.54-5.18 3.54-8.71z"/>
              <path fill="#FBBC05" d="M5.38 14.53c-.23-.69-.37-1.44-.37-2.21s.14-1.52.37-2.21L1.46 7.07C.53 8.94 0 11.02 0 13.2s.53 4.26 1.46 6.13l3.92-3.8z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.89-2.98c-1.08.72-2.45 1.16-4.04 1.16-3.03 0-5.65-1.84-6.62-4.57L1.46 17.65C3.39 21.33 7.35 24 12 24z"/>
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // Dashboard Stats calculations
  const totalParticipants = users.filter(u => u.role === 'participant').length;
  const completedMatches = matches.filter(m => m.status === 'completed');

  const getStageMatchStats = () => {
    let stageMatches = [];
    if (selectedStageTab === 'group') {
      stageMatches = matches.filter(m => m.stage === 'group');
    } else if (selectedStageTab === 'r32_normal') {
      stageMatches = matches.filter(m => m.stage === 'r32' && Number(m.matchId) <= 150);
    } else if (selectedStageTab === 'r32') {
      stageMatches = matches.filter(m => m.stage === 'r32' && Number(m.matchId) > 150);
    } else if (selectedStageTab === 'r16' || selectedStageTab === 'r16_stakes') {
      stageMatches = matches.filter(m => m.stage === 'r16');
    } else if (selectedStageTab === 'qf' || selectedStageTab === 'qf_stakes') {
      stageMatches = matches.filter(m => m.stage === 'qf');
    } else if (selectedStageTab === 'sf' || selectedStageTab === 'sf_stakes') {
      stageMatches = matches.filter(m => m.stage === 'sf');
    } else if (selectedStageTab === 'final' || selectedStageTab === 'final_stakes') {
      stageMatches = matches.filter(m => m.stage === 'final' || m.stage === 'third_place');
    }
    const completed = stageMatches.filter(m => m.status === 'completed').length;
    const total = stageMatches.length;
    return { completed, total };
  };
  const stageStats = getStageMatchStats();
  
  // Compute total kitty reserves
  let finalsKittyBonus = 0;
  kittyLogs.forEach(log => {
    let logStage = 'group'; // default
    if (log.matchId) {
      const cleanMatchId = String(log.matchId).replace('_stakes', '');
      const isStakesLog = String(log.matchId).endsWith('_stakes');
      const matchObj = matches.find(m => Number(m.matchId) === Number(cleanMatchId));
      if (matchObj) {
        if (matchObj.stage === 'r32') {
          logStage = isStakesLog ? 'r32' : 'r32_normal';
        } else {
          const baseStage = matchObj.stage === 'third_place' ? 'final' : matchObj.stage;
          logStage = isStakesLog ? `${baseStage}_stakes` : baseStage;
        }
      }
    } else if (log.stage) {
      logStage = log.stage;
    }
    
    if (logStage === selectedStageTab) {
      finalsKittyBonus += (log.splitFinals || 0) + (log.splitReferee || 0);
    }
  });

  // Total entry fees pot
  let entryPot = 0;
  users.forEach(u => {
    if (u.role === 'participant') {
      entryPot += u.entryFee !== undefined ? u.entryFee : 10400;
    }
  });

  return (
    <div className="app-container">
      {/* Mobile Top Header */}
      <header className="mobile-header">
        <button className="menu-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <span className="mobile-header-title">VivaFifa2026</span>
        <div style={{ width: '40px' }}></div>
      </header>

      {/* Backdrop for closing drawer */}
      {isSidebarOpen && <div className="sidebar-backdrop" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* Sidebar Navigation */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-title">VivaFifa2026</span>
          <span className="sidebar-subtitle">Referee Control</span>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            style={{
              marginTop: '12px',
              padding: '6px 12px',
              backgroundColor: 'var(--btn-bg)',
              color: 'var(--text-main)',
              border: '1px solid var(--card-border)',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'background-color 0.2s'
            }}
          >
            {isDarkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>

        <ul className="sidebar-menu">
          <li className="menu-item">
            <a className={`menu-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}>
              Dashboard
            </a>
          </li>
          <li className="menu-item">
            <a className={`menu-link ${activeTab === 'matches' ? 'active' : ''}`} onClick={() => { setActiveTab('matches'); setIsSidebarOpen(false); }}>
              Matches ({matches.length})
            </a>
          </li>
          <li className="menu-item">
            <a className={`menu-link ${activeTab === 'participants' ? 'active' : ''}`} onClick={() => { setActiveTab('participants'); setIsSidebarOpen(false); }}>
              Participants ({users.filter(u => u.role === 'participant').length})
              {users.filter(u => u.role === 'pending').length > 0 && (
                <span style={{
                  marginLeft: '8px', backgroundColor: 'var(--brazil-gold)', color: '#0b0f19',
                  borderRadius: '10px', padding: '1px 7px', fontSize: '0.7rem', fontWeight: '800'
                }}>
                  {users.filter(u => u.role === 'pending').length}
                </span>
              )}
            </a>
          </li>
          <li className="menu-item">
            <a className={`menu-link ${activeTab === 'bracket' ? 'active' : ''}`} onClick={() => { setActiveTab('bracket'); setIsSidebarOpen(false); }}>
              Bracket Layout
            </a>
          </li>
          <li className="menu-item">
            <a className={`menu-link ${activeTab === 'stakes' ? 'active' : ''}`} onClick={() => { setActiveTab('stakes'); setIsSidebarOpen(false); }}>
              Stakes & Prizes
            </a>
          </li>
          <li className="menu-item">
            <a className={`menu-link ${activeTab === 'kitty' ? 'active' : ''}`} onClick={() => { setActiveTab('kitty'); setIsSidebarOpen(false); }}>
              Kitty & Logs
            </a>
          </li>
          <li className="menu-item">
            <a className={`menu-link ${activeTab === 'tools' ? 'active' : ''}`} onClick={() => { setActiveTab('tools'); setIsSidebarOpen(false); }}>
              System Tools
            </a>
          </li>
        </ul>

        <div className="sidebar-footer">
          <div className="user-badge">
            <div>Signed in as:</div>
            <div className="user-email">{user.email}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>
              Role: System Referee
            </div>
            <button className="btn-logout" onClick={handleLogout}>Log Out</button>
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Dashboard Overview</h2>
              <p className="page-subtitle">Tournament-wide aggregates and referee records.</p>
            </div>

            {/* Stage Switcher control */}
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '16px' }}>
              {[
                { id: 'group', label: 'Group Stage' },
                { id: 'r32_normal', label: 'Round of 32 (Normal)' },
                { id: 'r32', label: 'STAKES (Round of 32)' },
                { id: 'r16', label: 'Round of 16 (Normal)' },
                { id: 'r16_stakes', label: 'STAKES (Round of 16)' },
                { id: 'qf', label: 'Quarter-Finals (Normal)' },
                { id: 'qf_stakes', label: 'STAKES (Quarter-Finals)' },
                { id: 'sf', label: 'Semi-Finals (Normal)' },
                { id: 'sf_stakes', label: 'STAKES (Semi-Finals)' },
                { id: 'final', label: 'Finals (Normal)' },
                { id: 'final_stakes', label: 'STAKES (Finals)' }
              ].map((stg) => {
                const isStakes = stg.id === 'r32' || stg.id.endsWith('_stakes');
                return (
                  <button
                    key={stg.id}
                    className={`btn ${selectedStageTab === stg.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      whiteSpace: 'nowrap',
                      padding: '8px 16px',
                      fontSize: '0.8rem',
                      ...(isStakes ? {
                        borderColor: '#ff3d71',
                        borderWidth: '1.5px',
                        color: selectedStageTab === stg.id ? '#ffffff' : '#ff3d71',
                        backgroundColor: selectedStageTab === stg.id ? '#ff3d71' : 'transparent',
                      } : {})
                    }}
                    onClick={() => setSelectedStageTab(stg.id)}
                  >
                    {stg.label}
                  </button>
                );
              })}
            </div>

            <div className="stats-grid">
              <div className="stat-card argentina" style={{ position: 'relative' }}>
                <span className="stat-label">Finals Kitty Pool</span>
                <span className="stat-value">Rs {finalsKittyBonus.toLocaleString()}</span>
                <button 
                  className="btn btn-secondary" 
                  style={{ position: 'absolute', bottom: '8px', right: '8px', padding: '2px 8px', fontSize: '0.7rem' }}
                  onClick={() => handleAdjustKitty('finals', finalsKittyBonus)}
                >
                  ✏️ Edit
                </button>
              </div>
              <div className="stat-card">
                <span className="stat-label">Settled Fixtures</span>
                <span className="stat-value">{stageStats.completed} / {stageStats.total}</span>
              </div>
            </div>

            <div className="content-card">
              <h3 className="card-title">Live Money Standings Preview</h3>
              <div className="table-responsive">
                <table className="scoreboard-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Payment Status</th>
                      <th>Winnings (Won)</th>
                      <th>Losses (Lost)</th>
                      <th>Net Profit (Rs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.role === 'participant').map((u) => {
                      const stageKey = selectedStageTab === 'r32_normal' ? 'r32' : selectedStageTab;
                      const entry = leaderboard.find(l => l.userId === u.uid && l.stage === stageKey);
                      const won = entry ? entry.totalWon || 0 : 0;
                      const lost = entry ? entry.totalLost || 0 : 0;
                      const profit = entry ? entry.netProfit || 0 : 0;

                      return (
                        <tr key={u.uid}>
                          <td><strong>{u.name}</strong></td>
                          <td>{u.email}</td>
                          <td>
                            <span className={`badge ${u.paymentStatus === 'paid' ? 'win' : (u.paymentStatus === 'partially_paid' ? 'warning' : 'loss')}`}>
                              {u.paymentStatus}
                            </span>
                          </td>
                          <td style={{ color: 'var(--win-green)', fontWeight: '600' }}>Rs {won.toLocaleString()}</td>
                          <td style={{ color: 'var(--loss-red)', fontWeight: '600' }}>Rs {lost.toLocaleString()}</td>
                          <td style={{ 
                            fontWeight: 'bold', 
                            color: profit >= 0 ? 'var(--win-green)' : 'var(--loss-red)' 
                          }}>
                            Rs {profit.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MATCHES MANAGEMENT */}
        {activeTab === 'matches' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Fixtures Control</h2>
              <p className="page-subtitle">Configure kickoff states and enter final game scorelines.</p>
            </div>

            <div className="content-card" style={{ marginBottom: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn" style={{ backgroundColor: 'var(--loss-red)', border: 'none', color: 'white', padding: '8px 16px', fontWeight: '800', borderRadius: '4px', cursor: 'pointer' }}
                          disabled={actionLoading} onClick={handleCloseAllBets}>
                    Close All Bets
                  </button>
                  <button className="btn" style={{ backgroundColor: 'var(--win-green)', border: 'none', color: 'white', padding: '8px 16px', fontWeight: '800', borderRadius: '4px', cursor: 'pointer' }}
                          disabled={actionLoading} onClick={handleStartAllBets}>
                    Start All Bets
                  </button>
                </div>
                
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap', color: 'var(--text-sub)' }}>Stakes Filter:</span>
                    <select className="form-control" style={{ width: '220px', padding: '6px', borderColor: matchesStakesFilter === 'stakes' ? '#ff3d71' : 'var(--border)' }} value={matchesStakesFilter}
                            onChange={e => setMatchesStakesFilter(e.target.value)}>
                      <option value="all">All Matches</option>
                      <option value="normal">Normal Matches</option>
                      <option value="stakes" style={{ color: '#ff3d71', fontWeight: 'bold' }}>Stakes Section Matches</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="form-label" style={{ marginBottom: 0, whiteSpace: 'nowrap', color: 'var(--text-sub)' }}>Rearrange Matches:</span>
                    <select className="form-control" style={{ width: '220px', padding: '6px' }} value={matchesSortOrder}
                            onChange={e => setMatchesSortOrder(e.target.value)}>
                      <option value="time-asc">Kickoff Time (Earliest First)</option>
                      <option value="time-desc">Kickoff Time (Latest First)</option>
                      <option value="id-asc">Match Number (Ascending)</option>
                      <option value="id-desc">Match Number (Descending)</option>
                      <option value="stage">Tournament Stage</option>
                    </select>
                  </div>
                </div>
              </div>



            <div className="matches-grid">
              {sortedMatches.map((match) => (
                <div className="match-item-card" key={match.id}>
                  <div className="match-item-header">
                    <span className="match-stage-label">
                      {(() => {
                        const isStakesMode = String(match.matchId).endsWith('_stakes');
                        const displayId = String(match.matchId).replace('_stakes', '');
                        
                        if (isStakesMode) {
                          return <span style={{ color: '#ff3d71', fontWeight: 'bold' }}>{match.stage.toUpperCase()} (STAKES)</span>;
                        } else {
                          return <span style={{ color: 'var(--text-sub)' }}>{match.stage.toUpperCase()} (NORMAL)</span>;
                        }
                      })()} (Match #{String(match.matchId).replace('_stakes', '')})
                    </span>
                    <span className={`badge ${match.status === 'upcoming' ? 'win' : (match.status === 'completed' ? 'info' : 'loss')}`}>
                      {match.status}
                    </span>
                  </div>

                  <div className="match-team-row">
                    <span>{getTeamFlag(match.teamA)} {match.teamA}</span>
                    <span className="match-score-bubble">{match.resultTeamAGoals !== undefined ? match.resultTeamAGoals : '-'}</span>
                  </div>
                  <div className="match-team-row">
                    <span>{match.teamB} {getTeamFlag(match.teamB)}</span>
                    <span className="match-score-bubble">{match.resultTeamBGoals !== undefined ? match.resultTeamBGoals : '-'}</span>
                  </div>

                  <div className="match-kickoff">
                    Kickoff: {new Date(match.kickoffTimeIST.seconds * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
                  </div>

                  <div className="match-item-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                        {match.status !== 'completed' && match.status !== 'postponed' ? (
                          <>
                            <button className="btn btn-primary" style={{ width: '100%', padding: '6px 8px', fontSize: '0.75rem' }}
                                    onClick={() => {
                                      setSelectedMatch(match);
                                      setScoreInput({ matchId: match.matchId, teamAGoals: 0, teamBGoals: 0, winner: '' });
                                    }}>
                              Settle
                            </button>
                          </>
                        ) : (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '8px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', flex: 1 }}>
                              Result: <strong>{match.winner === 'draw' ? 'Draw' : (match.winner === 'teamA' ? <>{getTeamFlag(match.teamA)} {match.teamA}</> : <>{match.teamB} {getTeamFlag(match.teamB)}</>)}</strong>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {match.status === 'completed' && (
                                <button className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--win-green)', border: 'none' }}
                                        onClick={() => {
                                          setSelectedMatch(match);
                                          setScoreInput({
                                            matchId: match.matchId,
                                            teamAGoals: match.resultTeamAGoals !== undefined ? match.resultTeamAGoals : 0,
                                            teamBGoals: match.resultTeamBGoals !== undefined ? match.resultTeamBGoals : 0,
                                            winner: match.winner || ''
                                          });
                                        }}>
                                  Resettle
                                </button>
                              )}
                              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                      onClick={() => handleDownloadBackup(match.matchId)}>
                                Backup
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                        <button className="btn btn-secondary" style={{ flex: 1, padding: '4px 8px', fontSize: '0.7rem' }}
                                onClick={() => handleViewBets(match.matchId)}>
                          {viewingMatchBets === match.matchId ? 'Hide Bets' : 'View Bets'}
                        </button>

                        {/* Per-match open/close betting control */}
                        {match.status !== 'completed' && (
                          match.status === 'betting_closed' ? (
                            <button className="btn" style={{ flex: 1, padding: '4px 8px', fontSize: '0.7rem', backgroundColor: 'var(--win-green)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={() => handleOpenMatch(match.matchId)}>
                              Open Bets
                            </button>
                          ) : (
                            <button className="btn" style={{ flex: 1, padding: '4px 8px', fontSize: '0.7rem', backgroundColor: 'var(--loss-red)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={() => handleCloseMatch(match.matchId)}>
                              Close Bets
                            </button>
                          )
                        )}

                        <button className="btn btn-secondary" style={{ flex: 1, padding: '4px 8px', fontSize: '0.7rem' }}
                                onClick={() => {
                                  setEditingMatch(match);
                                  setEditMatchForm({
                                    teamA: match.teamA,
                                    teamB: match.teamB,
                                    stage: match.stage,
                                    kickoffTime: formatTimestampForInput(match.kickoffTimeIST)
                                  });
                                }}>
                          Edit
                        </button>
                        <button className="btn" style={{ flex: 1, padding: '4px 8px', fontSize: '0.7rem', backgroundColor: 'var(--loss-red)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                                onClick={() => handleDeleteMatch(match.matchId)}>
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Contextual Settle Form */}
                    {selectedMatch && selectedMatch.matchId === match.matchId && (
                      <div className="content-card" style={{ marginTop: '16px', border: '1px solid var(--brazil-gold)', padding: '12px', borderRadius: '6px' }}>
                        <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', color: 'var(--brazil-gold)' }}>Settle Match #{match.matchId}</h4>
                        <form onSubmit={handleSettleMatch}>
                          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ flex: 1 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>{match.teamA} Goals</label>
                              <input className="form-control" type="number" min="0" required style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                     value={scoreInput.teamAGoals} onChange={e => {
                                       const val = e.target.value;
                                       const otherVal = scoreInput.teamBGoals;
                                       let newWinner = scoreInput.winner;
                                       if (val !== '' && otherVal !== '') {
                                         const goalsA = Number(val);
                                         const goalsB = Number(otherVal);
                                         if (match.stage === 'group') {
                                           if (goalsA > goalsB) newWinner = 'teamA';
                                           else if (goalsB > goalsA) newWinner = 'teamB';
                                           else newWinner = 'draw';
                                         } else {
                                           if (goalsA > goalsB) newWinner = 'teamA';
                                           else if (goalsB > goalsA) newWinner = 'teamB';
                                         }
                                       }
                                       setScoreInput({ ...scoreInput, teamAGoals: val, winner: newWinner });
                                     }}/>
                            </div>
                            <div style={{ flex: 1 }}>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>{match.teamB} Goals</label>
                              <input className="form-control" type="number" min="0" required style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                     value={scoreInput.teamBGoals} onChange={e => {
                                       const val = e.target.value;
                                       const otherVal = scoreInput.teamAGoals;
                                       let newWinner = scoreInput.winner;
                                       if (val !== '' && otherVal !== '') {
                                         const goalsA = Number(otherVal);
                                         const goalsB = Number(val);
                                         if (match.stage === 'group') {
                                           if (goalsA > goalsB) newWinner = 'teamA';
                                           else if (goalsB > goalsA) newWinner = 'teamB';
                                           else newWinner = 'draw';
                                         } else {
                                           if (goalsA > goalsB) newWinner = 'teamA';
                                           else if (goalsB > goalsA) newWinner = 'teamB';
                                         }
                                       }
                                       setScoreInput({ ...scoreInput, teamBGoals: val, winner: newWinner });
                                     }}/>
                            </div>
                          </div>
                          <div className="form-group" style={{ marginBottom: '12px' }}>
                            <label className="form-label" style={{ fontSize: '0.75rem' }}>Winner</label>
                            <select className="form-control" required style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                    value={scoreInput.winner} onChange={e => setScoreInput({ ...scoreInput, winner: e.target.value })}>
                              <option value="">-- Choose Winner --</option>
                              <option value="teamA">{match.teamA}</option>
                              <option value="teamB">{match.teamB}</option>
                              {match.stage === 'group' && <option value="draw">Draw</option>}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-success" type="submit" disabled={actionLoading} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                              {actionLoading ? 'Settling...' : 'Submit Settle'}
                            </button>
                            <button className="btn btn-secondary" type="button" onClick={() => setSelectedMatch(null)} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>Cancel</button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Contextual Edit Form */}
                    {editingMatch && editingMatch.matchId === match.matchId && (
                      <div className="content-card" style={{ marginTop: '16px', border: '1px solid var(--active-blue)', padding: '12px', borderRadius: '6px' }}>
                        <h4 style={{ fontSize: '0.85rem', marginBottom: '12px', color: 'var(--active-blue)' }}>Edit Match #{match.matchId}</h4>
                        <form onSubmit={handleSaveEditMatch}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>Team A</label>
                              <input className="form-control" type="text" required style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                     value={editMatchForm.teamA} onChange={e => setEditMatchForm({ ...editMatchForm, teamA: e.target.value })}/>
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>Team B</label>
                              <input className="form-control" type="text" required style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                     value={editMatchForm.teamB} onChange={e => setEditMatchForm({ ...editMatchForm, teamB: e.target.value })}/>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>Stage</label>
                              <select className="form-control" required style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                      value={editMatchForm.stage} onChange={e => setEditMatchForm({ ...editMatchForm, stage: e.target.value })}>
                                <option value="group">Group Stage</option>
                                <option value="r32" style={{ color: '#ff3d71', fontWeight: 'bold' }}>STAKES (Round of 32)</option>
                                <option value="r16">Round of 16</option>
                                <option value="qf">Quarter-final</option>
                                <option value="sf">Semi-final</option>
                                <option value="third_place">Third Place Play-off</option>
                                <option value="final">Final</option>
                              </select>
                            </div>
                            <div>
                              <label className="form-label" style={{ fontSize: '0.75rem' }}>Kickoff Time</label>
                              <input className="form-control" type="datetime-local" required style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                     value={editMatchForm.kickoffTime} onChange={e => setEditMatchForm({ ...editMatchForm, kickoffTime: e.target.value })}/>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-primary" type="submit" disabled={actionLoading} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                              {actionLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button className="btn btn-secondary" type="button" onClick={() => setEditingMatch(null)} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>Cancel</button>
                          </div>
                        </form>
                      </div>
                    )}

                  {/* Expandable View Bets Section */}
                  {viewingMatchBets === match.matchId && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                      <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: '#f8fafc' }}>Placed Bets for Match #{match.matchId}</h4>
                      {betsLoading ? (
                        <p style={{ color: 'var(--text-sub)', fontSize: '0.8rem' }}>Loading bets...</p>
                      ) : (
                        <>
                          {matchBetsData.length === 0 ? (
                            <p style={{ color: 'var(--text-sub)', fontSize: '0.8rem' }}>No bets placed yet.</p>
                          ) : (
                            <div className="table-responsive" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                              <table className="scoreboard-table" style={{ fontSize: '0.8rem' }}>
                                <thead>
                                  <tr>
                                    <th>User</th>
                                    <th>Type</th>
                                    <th>Team Pick</th>
                                    <th>Scoreline</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {matchBetsData.map(b => {
                                    const u = users.find(user => user.id === b.userId);
                                    return (
                                      <tr key={b.id}>
                                        <td>{u ? u.name : b.userId}</td>
                                        <td>
                                          <span className="badge" style={{ backgroundColor: b.isStakes ? '#ff3d71' : '#00e676', color: '#fff', fontSize: '0.65rem', padding: '2px 6px' }}>
                                            {b.isStakes ? 'STAKES' : 'NORMAL'}
                                          </span>
                                        </td>
                                        <td>{b.teamPrediction}</td>
                                        <td>{b.goalsTeamA} - {b.goalsTeamB}</td>
                                        <td>{b.isOverride ? 'Override' : (b.isDefault ? 'Default' : 'User')}</td>
                                        <td>
                                          <button 
                                            className="btn" 
                                            style={{ padding: '2px 6px', fontSize: '0.65rem', backgroundColor: 'var(--loss-red)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                            onClick={() => handleDeleteBet(b.id, b.collectionName, match.matchId)}
                                          >
                                            🗑️ Delete
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Override Form */}
                          <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'rgba(19, 27, 46, 0.4)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                              <h5 style={{ fontSize: '0.8rem', marginBottom: '8px', color: 'var(--brazil-gold)' }}>Override/Place Bet for User</h5>
                              <form onSubmit={(e) => handleOverrideBetSubmit(e, match.matchId)}>
                                {Number(match.matchId) >= 151 && (
                                  <div style={{ marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.7rem', color: 'var(--text-sub)', display: 'block', marginBottom: '4px' }}>Bet Mode:</label>
                                    <select className="form-control" style={{ fontSize: '0.75rem', padding: '6px', width: '100%' }} required
                                            value={overrideBetForm.mode} onChange={e => setOverrideBetForm({ ...overrideBetForm, mode: e.target.value })}>
                                      <option value="normal">Normal (Standard)</option>
                                      <option value="stakes">Stakes (Real Money)</option>
                                    </select>
                                  </div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                                  <select className="form-control" style={{ fontSize: '0.75rem', padding: '6px' }} required
                                          value={overrideBetForm.userId} onChange={e => setOverrideBetForm({ ...overrideBetForm, userId: e.target.value })}>
                                    <option value="">Select User...</option>
                                    {users.filter(u => u.role === 'participant' && isUserEligibleForMatch(u, match, Number(match.matchId) >= 151 ? (overrideBetForm.mode || 'normal') : 'normal')).map(u => (
                                      <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                                    ))}
                                  </select>
                                  <select className="form-control" style={{ fontSize: '0.75rem', padding: '6px' }} required
                                          value={overrideBetForm.teamPrediction} onChange={e => setOverrideBetForm({ ...overrideBetForm, teamPrediction: e.target.value })}>
                                    <option value="">Winner Pick...</option>
                                    <option value="teamA">{match.teamA}</option>
                                    <option value="teamB">{match.teamB}</option>
                                    {match.stage === 'group' && <option value="draw">Draw</option>}
                                  </select>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                  <input className="form-control" type="number" min="0" placeholder={`${match.teamA} goals`} required
                                         style={{ flex: 1, fontSize: '0.75rem', padding: '6px' }}
                                         value={overrideBetForm.goalsTeamA} onChange={e => setOverrideBetForm({ ...overrideBetForm, goalsTeamA: e.target.value })}/>
                                  <span style={{ color: 'var(--text-sub)' }}>:</span>
                                  <input className="form-control" type="number" min="0" placeholder={`${match.teamB} goals`} required
                                         style={{ flex: 1, fontSize: '0.75rem', padding: '6px' }}
                                         value={overrideBetForm.goalsTeamB} onChange={e => setOverrideBetForm({ ...overrideBetForm, goalsTeamB: e.target.value })}/>
                                  <button className="btn btn-primary" type="submit" style={{ fontSize: '0.75rem', padding: '6px 12px' }} disabled={actionLoading}>
                                    Save Override
                                  </button>
                                </div>
                              </form>
                            </div>
                        </>
                      )}
                    </div>
                  )}
                  {/* Contextual Status Toast */}
                  {statusMessage.text && (statusMessage.text.includes(String(match.matchId)) || statusMessage.text.includes(String(match.matchId).replace('_stakes', ''))) && (
                    <div className={`badge ${statusMessage.type === 'success' ? 'win' : (statusMessage.type === 'info' ? 'info' : 'loss')}`} 
                         style={{ width: '100%', padding: '10px', borderRadius: '6px', marginTop: '12px', textAlign: 'center', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{statusMessage.text}</span>
                      <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }} 
                              onClick={() => setStatusMessage({ type: '', text: '' })}>X</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: PARTICIPANT MANAGEMENT */}
        {activeTab === 'participants' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Participant Management</h2>
              <p className="page-subtitle">Review join requests, verify player roles, and track payments.</p>
            </div>

            {/* PENDING JOIN REQUESTS */}
            {users.filter(u => u.role === 'pending').length > 0 && (
              <div className="content-card" style={{ borderColor: 'var(--brazil-gold)', borderWidth: '2px' }}>
                <h3 className="card-title" style={{ color: 'var(--brazil-gold)' }}>Pending Join Requests ({users.filter(u => u.role === 'pending').length})</h3>
                <div className="table-responsive">
                  <table className="scoreboard-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Payment Plan</th>
                        <th>Requested At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.filter(u => u.role === 'pending').map((u) => (
                        <tr key={u.id}>
                          <td><strong>{u.name}</strong></td>
                          <td>{u.email}</td>
                          <td><span className="badge secondary">{u.paymentPlan || 'installments'}</span></td>
                          <td>{u.joinedAt ? new Date(u.joinedAt.seconds * 1000).toLocaleString() : 'N/A'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                className="btn btn-success"
                                style={{ padding: '5px 14px', fontSize: '0.8rem' }}
                                disabled={actionLoading}
                                onClick={() => handleApproveUser(u)}
                              >
                                Accept
                              </button>
                              <button
                                className="btn"
                                style={{ padding: '5px 14px', fontSize: '0.8rem', backgroundColor: 'var(--loss-red)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                                disabled={actionLoading}
                                onClick={() => handleRejectUser(u)}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ACTIVE MEMBERS REGISTRY */}
            <div className="content-card">
              <h3 className="card-title">Active Members Registry</h3>
              <div className="table-responsive">
                <table className="scoreboard-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Payment Plan</th>
                      <th>Payment Status</th>
                      <th>Entry Fee Overrides</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.role !== 'pending').map((u) => (
                      <tr key={u.id}>
                        <td><strong>{u.name}</strong></td>
                        <td>{u.email}</td>
                        <td>
                          <span className={`badge ${u.role === 'admin' ? 'win' : 'secondary'}`}>
                            {u.role}
                          </span>
                        </td>
                        <td>{u.paymentPlan || 'installments'}</td>
                        <td>
                          <select className="form-control" style={{ padding: '4px', fontSize: '0.85rem' }} value={u.paymentStatus}
                                  onChange={e => handleUpdatePayment(u.id, 'paymentStatus', e.target.value)}>
                            <option value="unpaid">unpaid</option>
                            <option value="partially_paid">partially paid</option>
                            <option value="paid">paid</option>
                          </select>
                        </td>
                        <td>
                          <input className="form-control" type="number" style={{ width: '100px', padding: '4px', fontSize: '0.85rem' }} 
                                 defaultValue={u.entryFee !== undefined ? u.entryFee : 10400}
                                 onBlur={e => handleOverrideFee(u.id, e.target.value)}/>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn" style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--loss-red)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                                    onClick={() => handleDeleteUser(u.id)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: STAKES & PRIZES */}
        {activeTab === 'stakes' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Stakes & Prize Pools</h2>
              <p className="page-subtitle">Configure stake distribution weights and leaderboard prize payouts.</p>
            </div>

            {globalSettings && (
              <>
                <div className="content-card">
                  <h3 className="card-title">Stage Stake Settings (Rs)</h3>
                  <div className="table-responsive">
                    <table className="scoreboard-table">
                      <thead>
                        <tr>
                          <th>Stage</th>
                          <th>Team Prediction Stake (Rs)</th>
                          <th>Goal Prediction Stake (Rs)</th>
                          <th>Penalty Prediction Stake (Rs)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(globalSettings.stakes).sort((a, b) => {
                          const order = ['final', 'sf', 'third_place', 'qf', 'r16', 'r32', 'group'];
                          return order.indexOf(a) - order.indexOf(b);
                        }).map((stage) => (
                          <tr key={stage}>
                            <td><strong style={{ textTransform: 'uppercase' }}>{stage}</strong></td>
                            <td>
                              <input className="form-control" type="number" style={{ width: '120px', padding: '6px' }}
                                     value={globalSettings.stakes[stage].team}
                                     onChange={e => handleUpdateStakes(stage, 'team', e.target.value)}/>
                            </td>
                            <td>
                              <input className="form-control" type="number" style={{ width: '120px', padding: '6px' }}
                                     value={globalSettings.stakes[stage].goal}
                                     onChange={e => handleUpdateStakes(stage, 'goal', e.target.value)}/>
                            </td>
                            <td>
                              <input className="form-control" type="number" style={{ width: '120px', padding: '6px' }}
                                     value={globalSettings.stakes[stage].penalty !== undefined ? globalSettings.stakes[stage].penalty : 50}
                                     disabled={stage === 'group'}
                                     onChange={e => handleUpdateStakes(stage, 'penalty', e.target.value)}/>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* STAKES MODE BET PRICES — real money, separate from normal */}
                <div className="content-card" style={{ borderColor: '#ff3d71', borderWidth: '2px' }}>
                  <h3 className="card-title" style={{ color: '#ff3d71' }}>⚡ Stakes Mode Bet Prices (Real Money) (Rs)</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)', marginBottom: '16px' }}>
                    These prices apply only to real-money Stakes Mode (matches #151+). Fully independent from normal mode prices above.
                  </p>
                  <div className="table-responsive">
                    <table className="scoreboard-table">
                      <thead>
                        <tr>
                          <th>Stage</th>
                          <th>Team Prediction Stake (Rs)</th>
                          <th>Goal Prediction Stake (Rs)</th>
                          <th>Penalty Prediction Stake (Rs)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {['r32', 'r16', 'qf', 'sf', 'final'].map((stage) => {
                          const sm = globalSettings.stakes_mode || {};
                          const defaults = { r32: { team: 75, goal: 75, penalty: 50 }, r16: { team: 100, goal: 100, penalty: 50 }, qf: { team: 125, goal: 125, penalty: 50 }, sf: { team: 150, goal: 150, penalty: 50 }, final: { team: 200, goal: 200, penalty: 50 } };
                          const cur = sm[stage] || defaults[stage] || { team: 100, goal: 50, penalty: 50 };
                          return (
                            <tr key={stage}>
                              <td><strong style={{ textTransform: 'uppercase', color: '#ff3d71' }}>{stage}</strong></td>
                              <td>
                                <input className="form-control" type="number" style={{ width: '120px', padding: '6px', borderColor: '#ff3d71' }}
                                       value={cur.team}
                                       onChange={e => handleUpdateStakesMode(stage, 'team', e.target.value)}/>
                              </td>
                              <td>
                                <input className="form-control" type="number" style={{ width: '120px', padding: '6px', borderColor: '#ff3d71' }}
                                       value={cur.goal}
                                       onChange={e => handleUpdateStakesMode(stage, 'goal', e.target.value)}/>
                              </td>
                              <td>
                                <input className="form-control" type="number" style={{ width: '120px', padding: '6px', borderColor: '#ff3d71' }}
                                       value={cur.penalty !== undefined ? cur.penalty : 50}
                                       onChange={e => handleUpdateStakesMode(stage, 'penalty', e.target.value)}/>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="content-card">
                  <h3 className="card-title">Prize Money Distribution Weights (%)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
                    <div>
                      <label className="form-label">1st Place Weight (%)</label>
                      <input className="form-control" type="number"
                             value={globalSettings.prizes.firstPlacePercent}
                             onChange={e => handleUpdatePrizes('firstPlacePercent', e.target.value)}/>
                    </div>
                    <div>
                      <label className="form-label">2nd Place Weight (%)</label>
                      <input className="form-control" type="number"
                             value={globalSettings.prizes.secondPlacePercent}
                             onChange={e => handleUpdatePrizes('secondPlacePercent', e.target.value)}/>
                    </div>
                    <div>
                      <label className="form-label">3rd Place Weight (%)</label>
                      <input className="form-control" type="number"
                             value={globalSettings.prizes.thirdPlacePercent}
                             onChange={e => handleUpdatePrizes('thirdPlacePercent', e.target.value)}/>
                    </div>
                  </div>
                  <p style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                    Note: Combined distribution percentages must sum to 100%. Total pot size will split according to these rules.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 5: KITTY & LOGS */}
        {activeTab === 'kitty' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Kitty Reserves & Transaction Logs</h2>
              <p className="page-subtitle">Trace every financial transaction, forfeit logs, and reserve transfers.</p>
            </div>


            <div className="content-card">
              <h3 className="card-title">Transaction Ledger</h3>
              <div className="table-responsive">
                <table className="scoreboard-table">
                  <thead>
                    <tr>
                      <th>Transaction ID</th>
                      <th>Source Type</th>
                      <th>Fixture ID</th>
                      <th>Total Amount (Rs)</th>
                      <th>Referee Kitty (Rs)</th>
                      <th>Finals Pool (Rs)</th>
                      <th>Logged Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kittyLogs.map((log) => (
                      <tr key={log.id}>
                        <td><code>{log.id}</code></td>
                        <td>
                          <span className={`badge ${log.type === 'forfeit' ? 'loss' : (log.type === 'draw' ? 'info' : 'win')}`}>
                            {log.type}
                          </span>
                        </td>
                        <td>
                          {log.matchId ? (
                            Number(log.matchId) >= 149 && Number(log.matchId) <= 164 ? (
                              Number(log.matchId) <= 150 ? (
                                `Match #${log.matchId} (NORMAL)`
                              ) : (
                                <span style={{ color: '#ff3d71', fontWeight: 'bold' }}>Match #{log.matchId} (STAKES)</span>
                              )
                            ) : (
                              `Match #${log.matchId}`
                            )
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td style={{ fontWeight: 'bold' }}>Rs {Math.abs(log.amount)}</td>
                        <td style={{ color: log.splitReferee < 0 ? 'var(--loss-red)' : 'var(--win-green)' }}>
                          {log.splitReferee < 0 ? '-' : '+'}Rs {Math.abs(log.splitReferee)}
                        </td>
                        <td style={{ color: log.splitFinals < 0 ? 'var(--loss-red)' : 'var(--win-green)' }}>
                          {log.splitFinals < 0 ? '-' : '+'}Rs {Math.abs(log.splitFinals)}
                        </td>
                        <td>{log.createdAt ? new Date(log.createdAt.seconds * 1000).toLocaleString() : 'N/A'}</td>
                      </tr>
                    ))}
                    {kittyLogs.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-sub)' }}>No transactions recorded in the ledger yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SYSTEM & DATABASE TOOLS */}
        {activeTab === 'tools' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">System & Database Tools</h2>
              <p className="page-subtitle">Perform manual scheduler triggers, fixture adjustments, and database resets.</p>
            </div>

            <>
              {/* Section 1: Cron Scheduler */}
              <div className="content-card">
                <h3 className="card-title">Lock & Reminder Scheduler (Cron)</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-sub)', marginBottom: '16px' }}>
                  Trigger the serverless task scheduler immediately. This will run the match lock check, auto-forfeiting empty wagers for fixtures kickoff within 8 hours, and distributing reminders.
                </p>
                <button className="btn btn-primary" onClick={handleTriggerCron} disabled={actionLoading}>
                  {actionLoading ? 'Triggering...' : 'Trigger Lock Scheduler (Run Cron)'}
                </button>
              </div>

              {/* Section 2: Create Custom Match */}
              <div className="content-card">
                <h3 className="card-title">Register Custom Match / Fixture</h3>
                <form onSubmit={handleCreateCustomMatch}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label className="form-label">Match ID (Number, e.g. 105)</label>
                      <input className="form-control" type="number" required placeholder="105"
                             value={customMatch.matchId} onChange={e => setCustomMatch({ ...customMatch, matchId: e.target.value })}/>
                    </div>
                    <div>
                      <label className="form-label">Stage</label>
                      <select className="form-control" required value={customMatch.stage}
                              onChange={e => setCustomMatch({ ...customMatch, stage: e.target.value })}>
                        <option value="group">Group Stage</option>
                        <option value="r32" style={{ color: '#ff3d71', fontWeight: 'bold' }}>STAKES (Round of 32)</option>
                        <option value="r16">Round of 16</option>
                        <option value="qf">Quarter-final</option>
                        <option value="sf">Semi-final</option>
                        <option value="third_place">Third Place Play-off</option>
                        <option value="final">Final</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label className="form-label">Team A Name</label>
                      <input className="form-control" type="text" required placeholder="e.g. France"
                             value={customMatch.teamA} onChange={e => setCustomMatch({ ...customMatch, teamA: e.target.value })}/>
                    </div>
                    <div>
                      <label className="form-label">Team B Name</label>
                      <input className="form-control" type="text" required placeholder="e.g. Brazil"
                             value={customMatch.teamB} onChange={e => setCustomMatch({ ...customMatch, teamB: e.target.value })}/>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '20px' }}>
                    <label className="form-label">Kickoff Time (Local Time)</label>
                    <input className="form-control" type="datetime-local" required
                           value={customMatch.kickoffTime} onChange={e => setCustomMatch({ ...customMatch, kickoffTime: e.target.value })}/>
                  </div>
                  <button className="btn btn-success" type="submit" disabled={actionLoading}>
                    Add Custom Fixture
                  </button>
                </form>
              </div>
            </>
          </div>
        )}

        {/* TAB 7: BRACKET EDITOR */}
        {activeTab === 'bracket' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Tournament Bracket Editor</h2>
              <p className="page-subtitle">Directly update teams in bracket stages (Round of 32 to Finals).</p>
            </div>

            {editingBracketMatch && (
              <div className="content-card" style={{ border: '2px solid var(--brazil-gold)', backgroundColor: 'var(--input-bg)' }}>
                <h3 className="card-title">Edit Bracket Teams (Match #{editingBracketMatch.matchId || editingBracketMatch.id})</h3>
                <form onSubmit={handleSaveBracketTeams}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label className="form-label">Team A Name (Empty for TBD)</label>
                      <input 
                        className="form-control" 
                        type="text" 
                        placeholder="TBD"
                        value={bracketTeamForm.teamA} 
                        onChange={e => setBracketTeamForm({ ...bracketTeamForm, teamA: e.target.value })} 
                      />
                    </div>
                    <div>
                      <label className="form-label">Team B Name (Empty for TBD)</label>
                      <input 
                        className="form-control" 
                        type="text" 
                        placeholder="TBD"
                        value={bracketTeamForm.teamB} 
                        onChange={e => setBracketTeamForm({ ...bracketTeamForm, teamB: e.target.value })} 
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button className="btn btn-success" type="submit" disabled={actionLoading}>
                      Save Changes
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => setEditingBracketMatch(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div 
              style={{ 
                overflowX: 'auto', 
                padding: '24px', 
                backgroundColor: 'rgba(0,0,0,0.15)', 
                borderRadius: '12px', 
                border: '1px solid var(--card-border)' 
              }}
            >
              <div style={{ display: 'flex', gap: '24px', minWidth: '1800px' }}>
                {[
                  { key: 'r32_left', stage: 'r32', side: 'left', count: 8, title: 'Round of 32' },
                  { key: 'r16_left', stage: 'r16', side: 'left', count: 4, title: 'Round of 16' },
                  { key: 'qf_left', stage: 'qf', side: 'left', count: 2, title: 'Quarter-Finals' },
                  { key: 'sf_left', stage: 'sf', side: 'left', count: 1, title: 'Semi-Finals' },
                  { key: 'final', stage: 'final', side: 'center', count: 1, title: 'Finals' },
                  { key: 'sf_right', stage: 'sf', side: 'right', count: 1, title: 'Semi-Finals' },
                  { key: 'qf_right', stage: 'qf', side: 'right', count: 2, title: 'Quarter-Finals' },
                  { key: 'r16_right', stage: 'r16', side: 'right', count: 4, title: 'Round of 16' },
                  { key: 'r32_right', stage: 'r32', side: 'right', count: 8, title: 'Round of 32' }
                ].map((col) => {
                  const renderMatchCard = (m, matchIndex = 0) => {
                    const isPlaceholder = String(m.id || m.matchId).startsWith('placeholder') || !m.matchId;
                    // Map placeholders to their actual matchId based on standard index offsets
                    let finalMatchId = m.matchId;
                    if (isPlaceholder) {
                      if (m.stage === 'final') {
                        finalMatchId = '164';
                      } else if (m.stage === 'third_place') {
                        finalMatchId = '163';
                      } else {
                        // Dynamically calculate matching matchId based on stage and column offset index
                        const matchIdOffsets = {
                          r32: 149,
                          r16: 151, // stakes stage r16: 151-158
                          qf: 159,  // stakes stage qf: 159-162
                          sf: 161,  // stakes stage sf: 161-162
                        };
                        const offset = matchIdOffsets[m.stage] || 149;
                        finalMatchId = String(offset + matchIndex);
                      }
                    }

                    const resolvedMatch = matches.find(realMatch => String(realMatch.matchId) === String(finalMatchId)) || {
                      matchId: finalMatchId,
                      teamA: m.teamA,
                      teamB: m.teamB,
                      status: 'upcoming',
                      stage: m.stage
                    };

                    return (
                      <div 
                        key={m.id}
                        onClick={() => {
                          setEditingBracketMatch(resolvedMatch);
                          setBracketTeamForm({ 
                            teamA: resolvedMatch.teamA || '', 
                            teamB: resolvedMatch.teamB || '',
                            matchId: resolvedMatch.matchId || ''
                          });
                        }}
                        style={{
                          backgroundColor: 'var(--card-bg)',
                          border: '2px solid var(--card-border)',
                          borderRadius: '8px',
                          padding: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          position: 'relative',
                          boxShadow: '2px 2px 0px var(--card-border)',
                          width: '180px',
                          opacity: 1
                        }}
                        title="Click to Edit Teams"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>
                          <span style={{ color: 'var(--text-sub)' }}>{`#${finalMatchId}`}</span>
                          <span style={{ color: 'var(--brazil-gold)', fontSize: '0.7rem' }}>✏️ Edit</span>
                        </div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {isPlaceholder ? null : getTeamFlag(m.teamA)} {m.teamA || 'TBD'}
                          </span>
                          {m.status === 'completed' && <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{m.resultTeamAGoals}</span>}
                        </div>
                        <div style={{ borderTop: '1px dashed var(--card-border)', margin: '2px 0' }} />
                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            {isPlaceholder ? null : getTeamFlag(m.teamB)} {m.teamB || 'TBD'}
                          </span>
                          {m.status === 'completed' && <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>{m.resultTeamBGoals}</span>}
                        </div>
                        {m.stage === 'third_place' && (
                          <div style={{ fontSize: '0.65rem', backgroundColor: 'var(--active-blue)', color: '#fff', padding: '2px 4px', borderRadius: '4px', textAlign: 'center', marginTop: '4px' }}>
                            3rd Place Playoff
                          </div>
                        )}
                      </div>
                    );
                  };

                  if (col.stage === 'final') {
                    const finalMatch = matches.find(m => m.stage === 'final') || {
                      id: 'placeholder_final',
                      teamA: 'TBD',
                      teamB: 'TBD',
                      status: 'upcoming',
                      stage: 'final'
                    };
                    const thirdPlaceMatch = matches.find(m => m.stage === 'third_place') || {
                      id: 'placeholder_third_place',
                      teamA: 'TBD',
                      teamB: 'TBD',
                      status: 'upcoming',
                      stage: 'third_place'
                    };

                    return (
                      <div key={col.key} style={{ display: 'flex', flexDirection: 'column', width: '200px', alignItems: 'center', justifyContent: 'space-between', height: '600px' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--brazil-gold)', marginBottom: '16px' }}>{col.title}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', justifyContent: 'center', flexGrow: 1 }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', textAlign: 'center', marginBottom: '4px' }}>Finals</div>
                            {renderMatchCard(finalMatch)}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', textAlign: 'center', marginBottom: '4px' }}>3rd Place</div>
                            {renderMatchCard(thirdPlaceMatch)}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  const stageMatches = matches.filter(m => m.stage === col.stage);
                  stageMatches.sort((a, b) => Number(a.matchId) - Number(b.matchId));

                  let colMatches = [];
                  if (col.side === 'left') {
                    colMatches = stageMatches.slice(0, col.count);
                  } else {
                    colMatches = stageMatches.slice(stageMatches.length - col.count);
                  }

                  const placeholdersNeeded = col.count - colMatches.length;
                  const displayMatches = [...colMatches];
                  for (let idx = 0; idx < placeholdersNeeded; idx++) {
                    displayMatches.push({
                      id: `placeholder_${col.key}_${idx}`,
                      teamA: 'TBD',
                      teamB: 'TBD',
                      status: 'upcoming',
                      stage: col.stage
                    });
                  }

                  return (
                    <div key={col.key} style={{ display: 'flex', flexDirection: 'column', width: '200px', alignItems: 'center' }}>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--brazil-gold)', marginBottom: '16px', textAlign: 'center' }}>{col.title}</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', flexGrow: 1, height: '540px' }}>
                        {displayMatches.map((m, idx) => renderMatchCard(m, idx))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

