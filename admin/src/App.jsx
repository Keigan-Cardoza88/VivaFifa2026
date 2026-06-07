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

function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuditor, setIsAuditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Real-time collections
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [kittyLogs, setKittyLogs] = useState([]);
  const [globalSettings, setGlobalSettings] = useState(null);

  // Forms states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [scoreInput, setScoreInput] = useState({ matchId: '', teamAGoals: 0, teamBGoals: 0, winner: '' });
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
  const [actionLoading, setActionLoading] = useState(false);
  const [customMatch, setCustomMatch] = useState({ matchId: '', teamA: '', teamB: '', stage: 'group', kickoffTime: '' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
  const [editMatchForm, setEditMatchForm] = useState({ teamA: '', teamB: '', stage: 'group', kickoffTime: '' });

  // 1. Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      setAuthError(null);
      try {
        if (currentUser) {
          const email = currentUser.email;
          const isSysAdmin = ADMIN_EMAILS.includes(email);

          // Fetch user document to check if auditor role exists
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          const role = userDoc.exists() ? userDoc.data().role : null;
          const isSysAuditor = role === 'auditor';

          if (isSysAdmin || isSysAuditor) {
            setUser(currentUser);
            setIsAdmin(isSysAdmin);
            setIsAuditor(isSysAuditor);
          } else {
            // Check if they are trying to register as admin on first setup
            if (ADMIN_EMAILS.includes(email)) {
               setUser(currentUser);
               setIsAdmin(true);
            } else {
               await signOut(auth);
               setAuthError('Unauthorized: Access denied. This portal is for Referees and Auditors only.');
            }
          }
        } else {
          setUser(null);
          setIsAdmin(false);
          setIsAuditor(false);
        }
      } catch (err) {
        console.error("Auth sync error:", err);
        setAuthError(`Connection Error: ${err.message}`);
        setUser(null);
        setIsAdmin(false);
        setIsAuditor(false);
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

    return () => {
      unsubMatches();
      unsubUsers();
      unsubSettings();
      unsubKitty();
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
  // A. Generate Single-use Invite Code
  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    if (isAuditor) return;
    setActionLoading(true);
    try {
      const inviteId = Math.random().toString(36).substring(2, 10).toUpperCase();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48); // 48 hours expiry

      const inviteRef = doc(db, 'invites', inviteId);
      await setDoc(inviteRef, {
        inviteId,
        createdBy: user.uid,
        expiresAt,
        used: false
      });

      // Construct a generic invite link structure that the mobile app will process via query params
      const generatedLink = `fifawarroom://register?inviteId=${inviteId}`;
      setInviteLink(generatedLink);
      setStatusMessage({ type: 'success', text: `Invite generated successfully: ${inviteId}` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to generate invite: ${err.message}` });
    } finally {
      setActionLoading(false);
    }
  };

  // B. Payout Settlement (Settle Match)
  const handleSettleMatch = async (e) => {
    e.preventDefault();
    if (isAuditor) return;
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

      setStatusMessage({ type: 'success', text: `Match ${selectedMatch.matchId} settled successfully!` });
      setSelectedMatch(null);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // C. Postpone Match
  const handlePostponeMatch = async (matchId) => {
    if (isAuditor) return;
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
    if (isAuditor) return;
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
    if (isAuditor) return;
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { entryFee: Number(fee) });
      setStatusMessage({ type: 'success', text: 'Late entry fee overridden.' });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Error updating fee: ${err.message}` });
    }
  };

  // F. Assign Co-Auditor role
  const handleToggleAuditor = async (targetUser) => {
    if (isAuditor) return;
    try {
      const newRole = targetUser.role === 'auditor' ? 'participant' : 'auditor';
      const userRef = doc(db, 'users', targetUser.uid);
      await updateDoc(userRef, { role: newRole });
      setStatusMessage({ type: 'success', text: `User role updated to ${newRole}.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Error changing role: ${err.message}` });
    }
  };

  // G. Edit Stakes per Stage
  const handleUpdateStakes = async (stage, field, value) => {
    if (isAuditor) return;
    try {
      const newStakes = { ...globalSettings.stakes };
      newStakes[stage][field] = Number(value);
      await updateDoc(doc(db, 'settings', 'global'), { stakes: newStakes });
      setStatusMessage({ type: 'success', text: `Stakes updated for stage: ${stage}` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Error updating stakes: ${err.message}` });
    }
  };

  // H. Edit Prize Percentages
  const handleUpdatePrizes = async (field, value) => {
    if (isAuditor) return;
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
    if (isAuditor) return;
    const numAmt = Number(amount);
    if (isNaN(numAmt) || numAmt <= 0) return alert('Enter valid amount');
    try {
      const settingsRef = doc(db, 'settings', 'global');
      // Decrement referee kitty, add to prizes or logs
      const logRef = doc(collection(db, 'kitty'));
      await setDoc(logRef, {
        kittyId: logRef.id,
        type: 'manual_allocation',
        amount: -numAmt,
        splitReferee: -numAmt,
        splitFinals: numAmt,
        createdAt: new Date()
      });
      setStatusMessage({ type: 'success', text: `Allocated ₹${numAmt} from Referee Kitty to Finals Pool.` });
    } catch (err) {
       setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // J. Trigger Cron Scheduler Manually
  const handleTriggerCron = async () => {
    if (isAuditor) return;
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
    if (isAuditor) return;
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

  // L. Delete User from Database
  const handleDeleteUser = async (userId) => {
    if (isAuditor) return;
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
    if (isAuditor) return;
    if (!window.confirm(`Are you sure you want to delete Match #${matchId}? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'matches', String(matchId)));
      setStatusMessage({ type: 'success', text: `Match #${matchId} deleted successfully.` });
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to delete match: ${err.message}` });
    }
  };

  // O. Save Edited Match Fixture
  const handleSaveEditMatch = async (e) => {
    e.preventDefault();
    if (isAuditor) return;
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
  
  // Compute total kitty reserves
  let refereeKitty = 0;
  let finalsKittyBonus = 0;
  kittyLogs.forEach(log => {
    refereeKitty += log.splitReferee || 0;
    finalsKittyBonus += log.splitFinals || 0;
  });

  // Total entry fees pot
  let entryPot = 0;
  users.forEach(u => {
    if (u.role === 'participant') {
      entryPot += u.entryFee || 10400; // base or override
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
              Participants ({totalParticipants})
            </a>
          </li>
          <li className="menu-item">
            <a className={`menu-link ${activeTab === 'stakes' ? 'active' : ''}`} onClick={() => { setActiveTab('stakes'); setIsSidebarOpen(false); }}>
              Stakes & Prizes
            </a>
          </li>
          <li className="menu-item">
            <a className={`menu-link ${activeTab === 'kitty' ? 'active' : ''}`} onClick={() => { setActiveTab('kitty'); setIsSidebarOpen(false); }}>
              Kitty & Audits
            </a>
          </li>
          {!isAuditor && (
            <li className="menu-item">
              <a className={`menu-link ${activeTab === 'tools' ? 'active' : ''}`} onClick={() => { setActiveTab('tools'); setIsSidebarOpen(false); }}>
                System Tools
              </a>
            </li>
          )}
        </ul>

        <div className="sidebar-footer">
          <div className="user-badge">
            <div>Signed in as:</div>
            <div className="user-email">{user.email}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>
              Role: {isAdmin ? 'System Referee' : 'Auditor'}
            </div>
            <button className="btn-logout" onClick={handleLogout}>Log Out</button>
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        {statusMessage.text && (
          <div className={`badge ${statusMessage.type === 'success' ? 'win' : (statusMessage.type === 'info' ? 'info' : 'loss')}`} 
               style={{ width: '100%', padding: '16px', borderRadius: '8px', marginBottom: '24px', textAlign: 'center', fontSize: '0.9rem' }}>
            {statusMessage.text}
            <button style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }} 
                    onClick={() => setStatusMessage({ type: '', text: '' })}>X</button>
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Dashboard Overview</h2>
              <p className="page-subtitle">Tournament-wide aggregates and referee records.</p>
            </div>

            <div className="stats-grid">
              <div className="stat-card brazil">
                <span className="stat-label">Total Stakes Pot</span>
                <span className="stat-value">₹{entryPot.toLocaleString()}</span>
              </div>
              <div className="stat-card argentina">
                <span className="stat-label">Finals Kitty Pool</span>
                <span className="stat-value">₹{finalsKittyBonus.toLocaleString()}</span>
              </div>
              <div className="stat-card spain">
                <span className="stat-label">Referee Kitty Reserve</span>
                <span className="stat-value">₹{refereeKitty.toLocaleString()}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Settled Fixtures</span>
                <span className="stat-value">{completedMatches.length} / 104</span>
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
                      <th>Net Profit (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.role === 'participant').map((u) => {
                      // We can query leaderboard collection, but let's mock/calculate or fetch from existing users list
                      return (
                        <tr key={u.uid}>
                          <td><strong>{u.name}</strong></td>
                          <td>{u.email}</td>
                          <td>
                            <span className={`badge ${u.paymentStatus === 'paid' ? 'win' : (u.paymentStatus === 'partially_paid' ? 'warning' : 'loss')}`}>
                              {u.paymentStatus}
                            </span>
                          </td>
                          <td style={{ color: 'var(--win-green)' }}>₹0</td>
                          <td style={{ color: 'var(--loss-red)' }}>₹{u.entryFee || 0}</td>
                          <td style={{ fontWeight: 'bold' }}>₹0</td>
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

            {selectedMatch ? (
              <div className="content-card" style={{ border: '2px solid var(--brazil-gold)' }}>
                <h3 className="card-title">Settle Match #{selectedMatch.matchId}</h3>
                <form onSubmit={handleSettleMatch}>
                  <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                    <div style={{ flex: 1 }}>
                      <label className="form-label">{selectedMatch.teamA} Goals</label>
                      <input className="form-control" type="number" min="0" required 
                             value={scoreInput.teamAGoals} onChange={e => setScoreInput({ ...scoreInput, teamAGoals: e.target.value })}/>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="form-label">{selectedMatch.teamB} Goals</label>
                      <input className="form-control" type="number" min="0" required 
                             value={scoreInput.teamBGoals} onChange={e => setScoreInput({ ...scoreInput, teamBGoals: e.target.value })}/>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Calculated Match Winner</label>
                    <select className="form-control" required value={scoreInput.winner}
                            onChange={e => setScoreInput({ ...scoreInput, winner: e.target.value })}>
                      <option value="">-- Choose Winner --</option>
                      <option value="teamA">{selectedMatch.teamA}</option>
                      <option value="teamB">{selectedMatch.teamB}</option>
                      {selectedMatch.stage === 'group' && <option value="draw">Draw</option>}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-success" type="submit" disabled={actionLoading}>
                      {actionLoading ? 'Settling...' : 'Submit Scores & Trigger Settlement'}
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => setSelectedMatch(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : null}

            {editingMatch ? (
              <div className="content-card" style={{ border: '2px solid var(--active-blue)' }}>
                <h3 className="card-title">Edit Match #{editingMatch.matchId}</h3>
                <form onSubmit={handleSaveEditMatch}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                      <label className="form-label">Team A</label>
                      <input className="form-control" type="text" required 
                             value={editMatchForm.teamA} onChange={e => setEditMatchForm({ ...editMatchForm, teamA: e.target.value })}/>
                    </div>
                    <div>
                      <label className="form-label">Team B</label>
                      <input className="form-control" type="text" required 
                             value={editMatchForm.teamB} onChange={e => setEditMatchForm({ ...editMatchForm, teamB: e.target.value })}/>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    <div>
                      <label className="form-label">Stage</label>
                      <select className="form-control" required value={editMatchForm.stage}
                              onChange={e => setEditMatchForm({ ...editMatchForm, stage: e.target.value })}>
                        <option value="group">Group Stage</option>
                        <option value="r32">Round of 32</option>
                        <option value="r16">Round of 16</option>
                        <option value="qf">Quarter-final</option>
                        <option value="sf">Semi-final</option>
                        <option value="third_place">Third Place Play-off</option>
                        <option value="final">Final</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Kickoff Time (Local Time)</label>
                      <input className="form-control" type="datetime-local" required
                             value={editMatchForm.kickoffTime} onChange={e => setEditMatchForm({ ...editMatchForm, kickoffTime: e.target.value })}/>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-primary" type="submit" disabled={actionLoading}>
                      {actionLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={() => setEditingMatch(null)}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : null}

            <div className="matches-grid">
              {matches.map((match) => (
                <div className="match-item-card" key={match.id}>
                  <div className="match-item-header">
                    <span className="match-stage-label">{match.stage} (Match #{match.matchId})</span>
                    <span className={`badge ${match.status === 'upcoming' ? 'info' : (match.status === 'completed' ? 'win' : 'loss')}`}>
                      {match.status}
                    </span>
                  </div>

                  <div className="match-team-row">
                    <span>{match.teamA}</span>
                    <span className="match-score-bubble">{match.resultTeamAGoals !== undefined ? match.resultTeamAGoals : '-'}</span>
                  </div>
                  <div className="match-team-row">
                    <span>{match.teamB}</span>
                    <span className="match-score-bubble">{match.resultTeamBGoals !== undefined ? match.resultTeamBGoals : '-'}</span>
                  </div>

                  <div className="match-kickoff">
                    Kickoff: {new Date(match.kickoffTimeIST.seconds * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)
                  </div>

                  {!isAuditor && (
                    <div className="match-item-footer" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                        {match.status !== 'completed' && match.status !== 'postponed' ? (
                          <>
                            <button className="btn btn-primary" style={{ flex: 1, padding: '6px 8px', fontSize: '0.75rem' }}
                                    onClick={() => {
                                      setSelectedMatch(match);
                                      setScoreInput({ matchId: match.matchId, teamAGoals: 0, teamBGoals: 0, winner: '' });
                                    }}>
                              Settle
                            </button>
                            <button className="btn btn-secondary" style={{ flex: 1, padding: '6px 8px', fontSize: '0.75rem' }}
                                    onClick={() => handlePostponeMatch(match.matchId)}>
                              Postpone
                            </button>
                          </>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)' }}>
                            Result: <strong>{match.winner === 'draw' ? 'Draw' : (match.winner === 'teamA' ? match.teamA : match.teamB)}</strong>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
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
              <p className="page-subtitle">Generate single-use invite links, verify player roles, and track payments.</p>
            </div>

            {!isAuditor && (
              <div className="content-card">
                <h3 className="card-title">Generate Single-Use Invite Token</h3>
                <form onSubmit={handleGenerateInvite} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Single-use tokens expire in 48 hours</label>
                    <input className="form-control" type="text" readOnly placeholder="Token link will appear here..." value={inviteLink}/>
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={actionLoading}>
                    Generate Code
                  </button>
                </form>
                {inviteLink && (
                  <p style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--brazil-gold)' }}>
                    Share this URL structure with the player to open their mobile app registration: <strong>{inviteLink}</strong>
                  </p>
                )}
              </div>
            )}

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
                      {!isAuditor && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td><strong>{u.name}</strong></td>
                        <td>{u.email}</td>
                        <td>
                          <span className={`badge ${u.role === 'admin' ? 'win' : (u.role === 'auditor' ? 'info' : 'secondary')}`}>
                            {u.role}
                          </span>
                        </td>
                        <td>{u.paymentPlan || 'installments'}</td>
                        <td>
                          {isAuditor ? (
                            u.paymentStatus
                          ) : (
                            <select className="form-control" style={{ padding: '4px', fontSize: '0.85rem' }} value={u.paymentStatus}
                                    onChange={e => handleUpdatePayment(u.id, 'paymentStatus', e.target.value)}>
                              <option value="unpaid">unpaid</option>
                              <option value="partially_paid">partially paid</option>
                              <option value="paid">paid</option>
                            </select>
                          )}
                        </td>
                        <td>
                          {isAuditor ? (
                            `₹${u.entryFee || 10400}`
                          ) : (
                            <input className="form-control" type="number" style={{ width: '100px', padding: '4px', fontSize: '0.85rem' }} 
                                   defaultValue={u.entryFee !== undefined ? u.entryFee : 10400}
                                   onBlur={e => handleOverrideFee(u.id, e.target.value)}/>
                          )}
                        </td>
                        {!isAuditor && (
                          <td>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                      onClick={() => handleToggleAuditor(u)}>
                                {u.role === 'auditor' ? 'Demote to Player' : 'Set Auditor'}
                              </button>
                              <button className="btn" style={{ padding: '4px 8px', fontSize: '0.75rem', backgroundColor: 'var(--loss-red)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                                      onClick={() => handleDeleteUser(u.id)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        )}
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
                  <h3 className="card-title">Stage Stake Settings (₹)</h3>
                  <div className="table-responsive">
                    <table className="scoreboard-table">
                      <thead>
                        <tr>
                          <th>Stage</th>
                          <th>Team Prediction Stake (₹)</th>
                          <th>Goal Prediction Stake (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(globalSettings.stakes).map((stage) => (
                          <tr key={stage}>
                            <td><strong style={{ textTransform: 'uppercase' }}>{stage}</strong></td>
                            <td>
                              <input className="form-control" type="number" style={{ width: '120px', padding: '6px' }}
                                     disabled={isAuditor}
                                     value={globalSettings.stakes[stage].team}
                                     onChange={e => handleUpdateStakes(stage, 'team', e.target.value)}/>
                            </td>
                            <td>
                              <input className="form-control" type="number" style={{ width: '120px', padding: '6px' }}
                                     disabled={isAuditor}
                                     value={globalSettings.stakes[stage].goal}
                                     onChange={e => handleUpdateStakes(stage, 'goal', e.target.value)}/>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="content-card">
                  <h3 className="card-title">Prize Money Distribution Weights (%)</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
                    <div>
                      <label className="form-label">1st Place Weight (%)</label>
                      <input className="form-control" type="number" disabled={isAuditor}
                             value={globalSettings.prizes.firstPlacePercent}
                             onChange={e => handleUpdatePrizes('firstPlacePercent', e.target.value)}/>
                    </div>
                    <div>
                      <label className="form-label">2nd Place Weight (%)</label>
                      <input className="form-control" type="number" disabled={isAuditor}
                             value={globalSettings.prizes.secondPlacePercent}
                             onChange={e => handleUpdatePrizes('secondPlacePercent', e.target.value)}/>
                    </div>
                    <div>
                      <label className="form-label">3rd Place Weight (%)</label>
                      <input className="form-control" type="number" disabled={isAuditor}
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

        {/* TAB 5: KITTY & AUDITS */}
        {activeTab === 'kitty' && (
          <div>
            <div className="page-header">
              <h2 className="page-title">Kitty Reserves & Audit Trails</h2>
              <p className="page-subtitle">Trace every financial transaction, forfeit logs, and auditor observations.</p>
            </div>

            {!isAuditor && (
              <div className="content-card">
                <h3 className="card-title">Allocate Kitty Funds to Prizes</h3>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label">Amount to transfer from Referee Kitty to Finals Pot (₹)</label>
                    <input className="form-control" id="kittyAllocAmt" type="number" placeholder="Enter amount (e.g. 1000)"/>
                  </div>
                  <button className="btn btn-success" onClick={() => {
                    const amt = document.getElementById('kittyAllocAmt').value;
                    handleAllocateKitty(amt);
                  }}>
                    Transfer Funds
                  </button>
                </div>
              </div>
            )}

            <div className="content-card">
              <h3 className="card-title">Transaction Ledger</h3>
              <div className="table-responsive">
                <table className="scoreboard-table">
                  <thead>
                    <tr>
                      <th>Transaction ID</th>
                      <th>Source Type</th>
                      <th>Fixture ID</th>
                      <th>Total Amount (₹)</th>
                      <th>Referee Kitty (₹)</th>
                      <th>Finals Pool (₹)</th>
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
                        <td>{log.matchId ? `Match #${log.matchId}` : 'N/A'}</td>
                        <td style={{ fontWeight: 'bold' }}>₹{Math.abs(log.amount)}</td>
                        <td style={{ color: log.splitReferee < 0 ? 'var(--loss-red)' : 'var(--win-green)' }}>
                          {log.splitReferee < 0 ? '-' : '+'}₹{Math.abs(log.splitReferee)}
                        </td>
                        <td style={{ color: log.splitFinals < 0 ? 'var(--loss-red)' : 'var(--win-green)' }}>
                          {log.splitFinals < 0 ? '-' : '+'}₹{Math.abs(log.splitFinals)}
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

            {!isAuditor && (
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
                          <option value="r32">Round of 32</option>
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
            )}

            {isAuditor && (
              <p style={{ color: 'var(--text-sub)' }}>
                Auditors do not have permission to execute system controls or modify database states.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
