import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
  Linking,
  StatusBar,
  Image
} from 'react-native';
import {
  signOut,
  onAuthStateChanged,
  signInWithCredential,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { auth, db } from './src/config/firebase';
import { teamsData } from './src/data/teamsData';

WebBrowser.maybeCompleteAuthSession();

const ADMIN_EMAILS = [
  'cardoza.kian@gmail.com',
  'cardoza.keigs@gmail.com',
  'cardoza.joseph@gmail.com'
];

const API_BASE = Platform.OS === 'web'
  ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://vivafifa2026.vercel.app')
  : 'https://vivafifa2026.vercel.app';

const getTeamFlag = (teamName) => {
  if (!teamName) return null;
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
  if (!code) return null;
  return (
    <Image 
      source={{ uri: `https://flagcdn.com/w40/${code}.png` }} 
      style={{ 
        width: 20, 
        height: 14, 
        marginRight: 6,
        borderRadius: 2,
        borderWidth: 0.5,
        borderColor: 'rgba(0, 0, 0, 0.15)',
        resizeMode: 'cover',
        display: Platform.OS === 'web' ? 'inline-block' : 'flex',
        verticalAlign: 'middle'
      }} 
    />
  );
};

const isToday = (timestamp) => {
  if (!timestamp) return false;
  const matchDate = new Date(timestamp.seconds * 1000);
  
  // Get date strings in Asia/Kolkata timezone (IST)
  const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-CA', options); // returns YYYY-MM-DD
  
  const matchIST = formatter.format(matchDate);
  const nowIST = formatter.format(new Date());
  
  return matchIST === nowIST;
};

const formatISTDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp.seconds * 1000);
  return date.toLocaleDateString('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
};

const getStartingXI = (players) => {
  if (!players || players.length === 0) return [];
  const gks = players.filter(p => p.pos === 'GK').sort((a, b) => b.current - a.current);
  const dfs = players.filter(p => p.pos === 'DF').sort((a, b) => b.current - a.current);
  const mfs = players.filter(p => p.pos === 'MF').sort((a, b) => b.current - a.current);
  const fws = players.filter(p => p.pos === 'FW').sort((a, b) => b.current - a.current);
  
  const starting = [];
  if (gks[0]) starting.push({ ...gks[0], role: 'GK', x: '50%', y: '82%' });
  if (dfs[0]) starting.push({ ...dfs[0], role: 'LB', x: '15%', y: '64%' });
  if (dfs[1]) starting.push({ ...dfs[1], role: 'LCB', x: '38%', y: '66%' });
  if (dfs[2]) starting.push({ ...dfs[2], role: 'RCB', x: '62%', y: '66%' });
  if (dfs[3]) starting.push({ ...dfs[3], role: 'RB', x: '85%', y: '64%' });
  if (mfs[0]) starting.push({ ...mfs[0], role: 'LM', x: '15%', y: '40%' });
  if (mfs[1]) starting.push({ ...mfs[1], role: 'LCM', x: '38%', y: '42%' });
  if (mfs[2]) starting.push({ ...mfs[2], role: 'RCM', x: '62%', y: '42%' });
  if (mfs[3]) starting.push({ ...mfs[3], role: 'RM', x: '85%', y: '40%' });
  if (fws[0]) starting.push({ ...fws[0], role: 'LF', x: '32%', y: '16%' });
  if (fws[1]) starting.push({ ...fws[1], role: 'RF', x: '68%', y: '16%' });
  return starting;
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('home');

  // Real-time collections
  const [matches, setMatches] = useState([]);
  const [myBets, setMyBets] = useState({});
  const [leaderboardMoney, setLeaderboardMoney] = useState([]);
  const [leaderboardAccuracy, setLeaderboardAccuracy] = useState([]);
  const [settings, setSettings] = useState(null);

  // Join Request Registration
  const [nameInput, setNameInput] = useState('');
  const [paymentPlan, setPaymentPlan] = useState('installments');
  const [authError, setAuthError] = useState('');
  const [registering, setRegistering] = useState(false);

  // Betting Form
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [betModalVisible, setBetModalVisible] = useState(false);
  const [teamPrediction, setTeamPrediction] = useState('');
  const [goalsA, setGoalsA] = useState('0');
  const [goalsB, setGoalsB] = useState('0');
  const [betError, setBetError] = useState('');
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [betSaving, setBetSaving] = useState(false);

  // Leaderboard toggle
  const [leaderboardType, setLeaderboardType] = useState('money');

  // New state for user names mapping, group consensus, and history bet expander
  const [allUsers, setAllUsers] = useState({});
  const [firstMatchBets, setFirstMatchBets] = useState([]);
  const [expandedMatchId, setExpandedMatchId] = useState(null);
  const [bracketZoom, setBracketZoom] = useState(1.0);
  const [selectedTeamGroup, setSelectedTeamGroup] = useState('A');
  const [selectedTeamName, setSelectedTeamName] = useState('Mexico');
  const [teamsViewMode, setTeamsViewMode] = useState('roster');
  const [expandedMatchBets, setExpandedMatchBets] = useState([]);

  // Google Auth Request Config for Mobile Native fallback
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: '56297030289-cdc4aathp3lsfskrsj1q3r9u5irqecbv.apps.googleusercontent.com',
  });

  // Handle Web or Mobile Google sign-in
  const handleGoogleSignIn = async () => {
    try {
      setAuthError('');
      if (Platform.OS === 'web') {
        setLoading(true);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(auth, provider);
      } else {
        promptAsync();
      }
    } catch (err) {
      console.error("Google Sign-In failed:", err);
      setAuthError(`Sign-in failed: ${err.message}`);
      setLoading(false);
    }
  };

  // Handle Google mobile token response
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.authentication;
      const credential = GoogleAuthProvider.credential(id_token);
      setLoading(true);
      signInWithCredential(auth, credential)
        .catch(err => {
          setAuthError(`Google Sign-In failed: ${err.message}`);
          setLoading(false);
        });
    }
  }, [response]);

  // Deep link listener (general URL handler)
  useEffect(() => {
    const parseUrl = (url) => {
      if (!url) return;
      console.log('Opened with URL:', url);
    };

    Linking.getInitialURL().then(parseUrl);
    const subscription = Linking.addEventListener('url', (event) => parseUrl(event.url));
    return () => subscription.remove();
  }, []);

  // Monitor Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setAuthError('');
      try {
        if (user) {
          // Fetch user document from Firestore to check if they are registered
          const userRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userRef);

          if (userDoc.exists()) {
            setCurrentUser(user);
            setUserProfile(userDoc.data());
          } else {
            // Unregistered user: store authenticated user temporarily in state
            // to show the registration screen, but do not consider them fully logged in.
            setCurrentUser(user);
            setUserProfile(null); // Triggers registration form
            setNameInput(user.displayName || '');
          }
        } else {
          setCurrentUser(null);
          setUserProfile(null);
        }
      } catch (err) {
        console.error("Mobile auth sync error:", err);
        setAuthError(`Connection Error: ${err.message}`);
        setCurrentUser(null);
        setUserProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load Realtime Data when authenticated and profile exists
  useEffect(() => {
    if (!currentUser || !userProfile) return;

    const qMatches = query(collection(db, 'matches'), orderBy('kickoffTimeIST', 'asc'));
    const unsubMatches = onSnapshot(qMatches, (snap) => {
      const list = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setMatches(list);
    });

    const qBets = query(collection(db, 'bets'), where('userId', '==', currentUser.uid));
    const unsubBets = onSnapshot(qBets, (snap) => {
      const map = {};
      snap.forEach(doc => {
        map[doc.data().matchId] = doc.data();
      });
      setMyBets(map);
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) setSettings(snap.data());
    });

    const qMoney = query(collection(db, 'leaderboard'), orderBy('netProfit', 'desc'));
    const unsubMoney = onSnapshot(qMoney, (snap) => {
      const list = [];
      snap.forEach(doc => list.push(doc.data()));
      setLeaderboardMoney(list);
    });

    const qAccuracy = query(collection(db, 'leaderboard'), orderBy('accuracyPercent', 'desc'), orderBy('correctPredictions', 'desc'));
    const unsubAccuracy = onSnapshot(qAccuracy, (snap) => {
      const list = [];
      snap.forEach(doc => list.push(doc.data()));
      setLeaderboardAccuracy(list);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const map = {};
      snap.forEach(doc => {
        map[doc.id] = doc.data();
      });
      setAllUsers(map);
    });

    return () => {
      unsubMatches();
      unsubBets();
      unsubSettings();
      unsubMoney();
      unsubAccuracy();
      unsubUsers();
    };
  }, [currentUser, userProfile]);

  const firstUpcomingMatch = matches.find(m => m.status === 'upcoming');

  useEffect(() => {
    if (!currentUser || !userProfile || !firstUpcomingMatch?.id) {
      setFirstMatchBets([]);
      return;
    }
    const q = query(collection(db, 'bets'), where('matchId', '==', firstUpcomingMatch.id));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach(doc => list.push(doc.data()));
      setFirstMatchBets(list);
    });
    return () => unsub();
  }, [currentUser, userProfile, firstUpcomingMatch?.id]);

  useEffect(() => {
    if (!currentUser || !userProfile || !expandedMatchId) {
      setExpandedMatchBets([]);
      return;
    }
    const q = query(collection(db, 'bets'), where('matchId', '==', expandedMatchId));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach(doc => list.push(doc.data()));
      setExpandedMatchBets(list);
    });
    return () => unsub();
  }, [currentUser, userProfile, expandedMatchId]);

  const handleRegister = async () => {
    if (!nameInput.trim()) {
      setAuthError('Please enter your name to submit the join request.');
      return;
    }
    setRegistering(true);
    setAuthError('');
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/requestToJoin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          name: nameInput.trim(),
          paymentPlan: paymentPlan
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      // Re-fetch user document to sync profile (will be pending)
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        setUserProfile(userDoc.data());
      }
    } catch (err) {
      setAuthError(`Request error: ${err.message}`);
    } finally {
      setRegistering(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setUserProfile(null);
  };

  // Betting actions
  const handleOpenBet = (match) => {
    setSelectedMatch(match);
    const existingBet = myBets[match.matchId];
    if (existingBet) {
      setTeamPrediction(existingBet.teamPrediction);
      setGoalsA(String(existingBet.goalsTeamA));
      setGoalsB(String(existingBet.goalsTeamB));
    } else {
      setTeamPrediction('');
      setGoalsA('0');
      setGoalsB('0');
    }
    setBetError('');
    setBetModalVisible(true);
  };

  const handleValidateBet = () => {
    setBetError('');
    const numA = Number(goalsA);
    const numB = Number(goalsB);

    if (!teamPrediction) {
      setBetError('Please select a team prediction.');
      return;
    }
    if (isNaN(numA) || isNaN(numB) || numA < 0 || numB < 0) {
      setBetError('Goals must be non-negative integers.');
      return;
    }

    if (teamPrediction === 'teamA' && numA <= numB) {
      setBetError(`Inconsistent: If you pick ${selectedMatch.teamA} to win, their goals must be strictly greater.`);
      return;
    }
    if (teamPrediction === 'teamB' && numB <= numA) {
      setBetError(`Inconsistent: If you pick ${selectedMatch.teamB} to win, their goals must be strictly greater.`);
      return;
    }
    if (teamPrediction === 'draw' && numA !== numB) {
      setBetError('Inconsistent: Draw prediction requires equal goals for both teams.');
      return;
    }

    setConfirmModalVisible(true);
  };

  const handleConfirmBetSubmit = async () => {
    setBetSaving(true);
    try {
      const betId = `${currentUser.uid}_${selectedMatch.matchId}`;
      const betRef = doc(db, 'bets', betId);

      const newBet = {
        betId,
        userId: currentUser.uid,
        matchId: selectedMatch.matchId,
        teamPrediction,
        goalsTeamA: Number(goalsA),
        goalsTeamB: Number(goalsB),
        placedAt: new Date(),
        isDefault: false
      };

      await setDoc(betRef, newBet);
      setConfirmModalVisible(false);
      setBetModalVisible(false);
      setSelectedMatch(null);
    } catch (err) {
      alert(`Failed to save bet: ${err.message}`);
    } finally {
      setBetSaving(false);
    }
  };

  const netProfit = userProfile ? (leaderboardMoney.find(l => l.userId === currentUser.uid)?.netProfit || 0) : 0;
  const accuracy = userProfile ? (leaderboardAccuracy.find(l => l.userId === currentUser.uid)?.accuracyPercent || 0) : 0;
  const rankMoney = leaderboardMoney.findIndex(l => l.userId === currentUser.uid) + 1;

  const renderMatchCard = (match) => {
    const bet = myBets[match.matchId];
    const isLocked = new Date().getTime() >= (match.bettingLockTimeIST ? match.bettingLockTimeIST.seconds * 1000 : 0);
    return (
      <View style={[styles.matchCard, styles.glassCard]} key={match.id}>
        <View style={styles.matchHeaderRow}>
          <Text style={styles.matchStage}>{match.stage.toUpperCase()}</Text>
          <Text style={styles.matchTime}>
            {new Date(match.kickoffTimeIST.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} IST
          </Text>
        </View>
        <View style={styles.matchTeamsContainer}>
          <Text style={styles.matchTeamText}>{getTeamFlag(match.teamA)} {match.teamA}</Text>
          <Text style={styles.matchVS}>VS</Text>
          <Text style={styles.matchTeamText}>{match.teamB} {getTeamFlag(match.teamB)}</Text>
        </View>
        <View style={styles.matchFooterRow}>
          {bet ? (
            <View style={styles.betPlacedBadge}>
              <Text style={styles.betPlacedText}>
                Bet Placed: {bet.teamPrediction === 'teamA' ? <>{getTeamFlag(match.teamA)} {match.teamA}</> : (bet.teamPrediction === 'teamB' ? <>{match.teamB} {getTeamFlag(match.teamB)}</> : 'Draw')} ({bet.goalsTeamA}-{bet.goalsTeamB})
              </Text>
            </View>
          ) : (
            <Text style={styles.noBetPlacedText}>No bet submitted</Text>
          )}
          {!isLocked && match.status === 'upcoming' ? (
            <TouchableOpacity style={styles.btnAction} onPress={() => handleOpenBet(match)}>
              <Text style={styles.btnActionText}>{bet ? 'Edit Bet' : 'Bet Now'}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.lockedBadge}>
              <Text style={styles.lockedText}>LOCKED</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffd700" />
        <Text style={styles.loadingText}>Connecting to VivaFifa2026...</Text>
      </View>
    );
  }

  // 1. SIGN IN SCREEN (Google Sign-In is primary and only method)
  if (!currentUser) {
    return (
      <View style={styles.loginContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.loginLogo}>VIVAFIFA2026</Text>
        <Text style={styles.loginSubtitle}>World Cup 2026 Private Arena</Text>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>Authentication Required</Text>
          <Text style={{ color: '#82776a', fontSize: 14, marginBottom: 20, textAlign: 'center', lineHeight: 20 }}>
            This betting arena is closed. Only authorized members can enter. Sign in with your Google Account below.
          </Text>
          <TouchableOpacity
            style={styles.btnPrimary}
            disabled={Platform.OS !== 'web' && !request}
            onPress={handleGoogleSignIn}
          >
            <Text style={styles.btnText}>Sign in with Google</Text>
          </TouchableOpacity>
        </View>

        {authError ? (
          <Text style={styles.errorText}>{authError}</Text>
        ) : null}
      </View>
    );
  }

  // 2. REGISTRATION SCREEN (Unregistered users who just signed in with Google)
  if (currentUser && !userProfile) {
    return (
      <ScrollView contentContainerStyle={styles.loginContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.loginLogo}>REQUEST TO JOIN</Text>
        <Text style={styles.loginSubtitle}>{currentUser.email}</Text>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>Submit Join Request</Text>
          <Text style={{ color: '#82776a', fontSize: 13, marginBottom: 18, textAlign: 'center', lineHeight: 20 }}>
            Enter your name and select a payment plan. Your request will be sent to the referee for approval.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            placeholderTextColor="#64748b"
            value={nameInput}
            onChangeText={setNameInput}
          />
          <View style={styles.paymentSelect}>
            <Text style={styles.paymentLabel}>Payment Plan:</Text>
            <TouchableOpacity
              style={[styles.paymentBtn, paymentPlan === 'installments' && styles.paymentActive]}
              onPress={() => setPaymentPlan('installments')}
            >
              <Text style={styles.paymentBtnText}>Installments</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.paymentBtn, paymentPlan === 'lumpsum' && styles.paymentActive]}
              onPress={() => setPaymentPlan('lumpsum')}
            >
              <Text style={styles.paymentBtnText}>Lumpsum</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.btnSuccess} onPress={handleRegister} disabled={registering}>
            {registering ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.btnText}>Send Join Request</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecondary} onPress={handleLogout}>
            <Text style={styles.btnSecondaryText}>Cancel / Sign Out</Text>
          </TouchableOpacity>
        </View>

        {authError ? (
          <Text style={styles.errorText}>{authError}</Text>
        ) : null}
      </ScrollView>
    );
  }

  // 2b. PENDING APPROVAL SCREEN (Request submitted but referee hasn't approved yet)
  if (currentUser && userProfile && userProfile.role === 'pending') {
    return (
      <ScrollView contentContainerStyle={styles.loginContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.loginLogo}>⏳ AWAITING APPROVAL</Text>
        <Text style={styles.loginSubtitle}>{currentUser.email}</Text>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>Request Submitted ✓</Text>
          <Text style={{ color: '#82776a', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 20 }}>
            Your join request has been sent to the referee.{'\n\n'}You will automatically gain access once your account is approved. Please check back shortly.
          </Text>
          <View style={{ backgroundColor: '#fdfcf9', borderRadius: 10, padding: 16, marginBottom: 20, borderWidth: 1.5, borderColor: 'rgba(62, 56, 48, 0.15)', gap: 8 }}>
            <View style={[styles.paymentSelect, { justifyContent: 'flex-start', marginBottom: 0 }]}>
              <Text style={{ color: '#b45309', fontWeight: '700', fontSize: 13, width: 60 }}>Name: </Text>
              <Text style={{ color: '#302b25', fontWeight: '600', fontSize: 13 }}>{userProfile.name}</Text>
            </View>
            <View style={[styles.paymentSelect, { justifyContent: 'flex-start', marginBottom: 0 }]}>
              <Text style={{ color: '#b45309', fontWeight: '700', fontSize: 13, width: 60 }}>Plan: </Text>
              <Text style={{ color: '#302b25', fontWeight: '600', fontSize: 13, textTransform: 'capitalize' }}>{userProfile.paymentPlan}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.btnSecondary} onPress={handleLogout}>
            <Text style={styles.btnSecondaryText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }


  // 3. MAIN DASHBOARD VIEW
  const isPast7PM = new Date().getHours() >= 19;

  const getProfitHistory = () => {
    const settledBets = [];
    matches.forEach(m => {
      const bet = myBets[m.matchId];
      if (bet && (bet.amountWon !== undefined || bet.amountLost !== undefined)) {
        settledBets.push({
          matchId: m.matchId,
          kickoff: m.kickoffTimeIST?.seconds || 0,
          profit: (bet.amountWon || 0) - (bet.amountLost || 0)
        });
      }
    });

    settledBets.sort((a, b) => a.kickoff - b.kickoff);

    let cumulative = 0;
    const data = [0];
    settledBets.forEach(b => {
      cumulative += b.profit;
      data.push(cumulative);
    });

    if (data.length === 1) {
      data.push(0);
    }
    return data;
  };

  const renderProfitChart = () => {
    const data = getProfitHistory();
    const width = 300;
    const height = 100;
    const padding = 10;

    const max = Math.max(...data, 100);
    const min = Math.min(...data, -100);
    const range = max - min || 1;

    const points = data.map((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return { x, y };
    });

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
      : '';

    const isProfit = netProfit >= 0;
    const strokeColor = isProfit ? '#00e676' : '#ff3d71';
    const gradId = `profitGrad_${Math.random().toString(36).substr(2, 9)}`;

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="rgba(62, 56, 48, 0.2)" strokeWidth="1" strokeDasharray="3" />
        {areaPath ? <path d={areaPath} fill={`url(#${gradId})`} /> : null}
        {linePath ? <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map((p, idx) => (
          <circle key={idx} cx={p.x} cy={p.y} r="3" fill="#f1ebd9" stroke={strokeColor} strokeWidth="1.5" />
        ))}
      </svg>
    );
  };

  const renderAccuracyRing = () => {
    const radius = 26;
    const stroke = 5;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (accuracy / 100) * circumference;

    return (
      <svg width="70" height="70" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={radius} stroke="rgba(62, 56, 48, 0.15)" strokeWidth={stroke} fill="transparent" />
        <circle
          cx="35"
          cy="35"
          r={radius}
          stroke="#b45309"
          strokeWidth={stroke}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 35 35)"
        />
      </svg>
    );
  };

  return (
    <View style={styles.appContainer}>
      <View style={styles.ambientGlow1} />
      <View style={styles.ambientGlow2} />
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>VIVAFIFA2026</Text>
        <Text style={styles.headerUser}>{currentUser.email}</Text>
      </View>

      {isPast7PM && matches.some(m => m.status === 'upcoming' && !myBets[m.matchId]) && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerText}>⚠️ Warning: You have unplaced bets for today! Cutoff is 8:00 PM IST.</Text>
        </View>
      )}

      {userProfile && (userProfile.paymentStatus === 'unpaid' || userProfile.paymentStatus === 'partially_paid') && (
        <View style={styles.paymentBanner}>
          <Text style={styles.paymentBannerText}>📢 Payment Status: {userProfile.paymentStatus.toUpperCase()}. Please complete details.</Text>
        </View>
      )}

      <ScrollView style={styles.mainScroll}>

        {/* TAB 1: HOME */}
        {activeTab === 'home' && (
          <View>
            <View style={styles.statsCardGrid}>
              <View style={[styles.statWidget, styles.glassCard, { borderLeftColor: '#ffd700' }]}>
                <Text style={styles.statWidgetLabel}>Net Profit</Text>
                <Text style={[styles.statWidgetValue, { color: netProfit >= 0 ? '#00e676' : '#ff3d71' }]}>
                  ₹{netProfit}
                </Text>
              </View>
              <View style={[styles.statWidget, styles.glassCard, { borderLeftColor: '#74acdf' }]}>
                <Text style={styles.statWidgetLabel}>Accuracy</Text>
                <Text style={styles.statWidgetValue}>{accuracy}%</Text>
              </View>
              <View style={[styles.statWidget, styles.glassCard, { borderLeftColor: '#ff2d37' }]}>
                <Text style={styles.statWidgetLabel}>Leaderboard</Text>
                <Text style={styles.statWidgetValue}>#{rankMoney || '-'}</Text>
              </View>
            </View>

            {/* ANALYTICS CHARTS SECTION */}
            <View style={styles.analyticsSection}>
              <View style={[styles.chartCard, styles.glassCard]}>
                <Text style={styles.chartTitle}>Profit Trend</Text>
                {renderProfitChart()}
                <View style={styles.chartFooter}>
                  <Text style={styles.chartFooterText}>Start</Text>
                  <Text style={styles.chartFooterText}>Current: ₹{netProfit}</Text>
                </View>
              </View>

              <View style={[styles.ringCard, styles.glassCard]}>
                <Text style={styles.chartTitle}>Accuracy</Text>
                <View style={styles.ringContainer}>
                  {renderAccuracyRing()}
                  <View style={styles.ringLabelContainer}>
                    <Text style={styles.ringPercentText}>{accuracy}%</Text>
                    <Text style={styles.ringSubText}>Correct</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* GROUP CONSENSUS CARD (Earliest sequence match) */}
            {firstUpcomingMatch && (
              <View style={[styles.mainConsensusCard, styles.glassCard]}>
                <View style={styles.consensusHeader}>
                  <Text style={styles.consensusHeaderLabel}>🔥 NEXT MATCH CONSENSUS</Text>
                  <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>OPEN</Text></View>
                </View>

                <View style={styles.consensusTeamsRow}>
                  <View style={styles.consensusTeamContainer}>
                    <Text style={styles.consensusTeamFlag}>{getTeamFlag(firstUpcomingMatch.teamA)}</Text>
                    <Text style={styles.consensusTeamName}>{firstUpcomingMatch.teamA}</Text>
                  </View>
                  <Text style={styles.consensusVs}>VS</Text>
                  <View style={styles.consensusTeamContainer}>
                    <Text style={styles.consensusTeamName}>{firstUpcomingMatch.teamB}</Text>
                    <Text style={styles.consensusTeamFlag}>{getTeamFlag(firstUpcomingMatch.teamB)}</Text>
                  </View>
                </View>

                <View style={styles.consensusStatsRow}>
                  <Text style={styles.consensusStatLabel}>Group Predictions Distribution (Anonymous):</Text>
                </View>

                {(() => {
                  const total = firstMatchBets.length;
                  const countA = firstMatchBets.filter(b => b.teamPrediction === 'teamA').length;
                  const countB = firstMatchBets.filter(b => b.teamPrediction === 'teamB').length;
                  const countD = firstMatchBets.filter(b => b.teamPrediction === 'draw').length;

                  const pctA = total > 0 ? Math.round((countA / total) * 100) : 0;
                  const pctB = total > 0 ? Math.round((countB / total) * 100) : 0;
                  const pctD = total > 0 ? Math.round((countD / total) * 100) : 0;

                  return (
                    <View style={{ width: '100%', marginTop: 8 }}>
                      <View style={styles.consensusBar}>
                        {pctA > 0 && (
                          <View style={[styles.consensusBarSegment, { width: `${pctA}%`, backgroundColor: '#5489be' }]} />
                        )}
                        {pctD > 0 && (
                          <View style={[styles.consensusBarSegment, { width: `${pctD}%`, backgroundColor: '#82776a' }]} />
                        )}
                        {pctB > 0 && (
                          <View style={[styles.consensusBarSegment, { width: `${pctB}%`, backgroundColor: '#b45309' }]} />
                        )}
                        {total === 0 && (
                          <View style={[styles.consensusBarSegment, { width: '100%', backgroundColor: '#eae2d3' }]} />
                        )}
                      </View>

                      <View style={styles.consensusLabelsRow}>
                        <Text style={[styles.consensusLabelText, { color: '#5489be' }]}>
                          {firstUpcomingMatch.teamA}: {countA} ({pctA}%)
                        </Text>
                        <Text style={[styles.consensusLabelText, { color: '#82776a' }]}>
                          Draw: {countD} ({pctD}%)
                        </Text>
                        <Text style={[styles.consensusLabelText, { color: '#b45309' }]}>
                          {firstUpcomingMatch.teamB}: {countB} ({pctB}%)
                        </Text>
                      </View>

                      <Text style={styles.consensusTotalLabel}>Total Bets Placed: {total}</Text>

                      <View style={{ marginTop: 16, alignItems: 'center' }}>
                        {(() => {
                          const bet = myBets[firstUpcomingMatch.matchId];
                          return (
                            <TouchableOpacity
                              style={styles.consensusActionButton}
                              onPress={() => handleOpenBet(firstUpcomingMatch)}
                            >
                              <Text style={styles.consensusActionText}>
                                {bet ? '✏️ EDIT YOUR Prediction' : '🎯 PLACE Prediction NOW'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })()}
                      </View>
                    </View>
                  );
                })()}
              </View>
            )}

            {/* Today's Fixtures */}
            <Text style={styles.sectionHeader}>Today's Fixtures</Text>
            {(() => {
              const todayMatches = matches.filter(m => (m.status === 'upcoming' || m.status === 'betting_closed' || m.status === 'live') && isToday(m.kickoffTimeIST));
              if (todayMatches.length === 0) {
                return (
                  <Text style={{ color: '#82776a', fontSize: 13, fontStyle: 'italic', marginBottom: 24, textAlign: 'center', paddingVertical: 10 }}>
                    No fixtures scheduled for today.
                  </Text>
                );
              }
              return todayMatches.map((match) => renderMatchCard(match));
            })()}

            {/* Upcoming Fixtures */}
            <Text style={styles.sectionHeader}>Upcoming Fixtures</Text>
            {(() => {
              const futureMatches = matches.filter(m => (m.status === 'upcoming' || m.status === 'betting_closed') && !isToday(m.kickoffTimeIST));
              if (futureMatches.length === 0) {
                return (
                  <Text style={{ color: '#82776a', fontSize: 13, fontStyle: 'italic', marginBottom: 24, textAlign: 'center', paddingVertical: 10 }}>
                    No upcoming fixtures.
                  </Text>
                );
              }

              // Group wagers by formatted date string
              const groups = {};
              futureMatches.forEach(m => {
                const dateStr = formatISTDate(m.kickoffTimeIST);
                if (!groups[dateStr]) groups[dateStr] = [];
                groups[dateStr].push(m);
              });

              return Object.keys(groups).map(dateStr => (
                <View key={dateStr} style={{ marginBottom: 18 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#b45309', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    📅 {dateStr}
                  </Text>
                  {groups[dateStr].map(match => renderMatchCard(match))}
                </View>
              ));
            })()}
          </View>
        )}

        {/* TAB 2: RANKS */}
        {activeTab === 'leaderboard' && (
          <View>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, leaderboardType === 'money' && styles.toggleActive]}
                onPress={() => setLeaderboardType('money')}
              >
                <Text style={styles.toggleText}>Money (Net Profit)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, leaderboardType === 'accuracy' && styles.toggleActive]}
                onPress={() => setLeaderboardType('accuracy')}
              >
                <Text style={styles.toggleText}>Accuracy (%)</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tableCard}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeadCell, { flex: 1 }]}>Rank</Text>
                <Text style={[styles.tableHeadCell, { flex: 3 }]}>Name</Text>
                {leaderboardType === 'money' ? (
                  <Text style={[styles.tableHeadCell, { flex: 2, textAlign: 'right' }]}>Profit (₹)</Text>
                ) : (
                  <Text style={[styles.tableHeadCell, { flex: 2, textAlign: 'right' }]}>Accuracy</Text>
                )}
              </View>

              {(leaderboardType === 'money' ? leaderboardMoney : leaderboardAccuracy).map((player, idx) => {
                const isMe = player.userId === currentUser.uid;
                return (
                  <View style={[styles.tableDataRow, isMe && styles.meRow]} key={player.userId}>
                    <Text style={[styles.tableCell, { flex: 1, fontWeight: '800' }]}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                    </Text>
                    <Text style={[styles.tableCell, { flex: 3, fontWeight: '700' }]}>{player.userName}</Text>
                    {leaderboardType === 'money' ? (
                      <Text style={[styles.tableCell, { flex: 2, textAlign: 'right', fontWeight: '800', color: player.netProfit >= 0 ? '#00e676' : '#ff3d71' }]}>
                        ₹{player.netProfit}
                      </Text>
                    ) : (
                      <Text style={[styles.tableCell, { flex: 2, textAlign: 'right', fontWeight: '800', color: '#ffd700' }]}>
                        {player.accuracyPercent}%
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* TAB 3: HISTORY */}
        {activeTab === 'history' && (
          <View>
            <Text style={styles.sectionHeader}>Settled Matches</Text>
            {matches.filter(m => m.status === 'completed' || m.status === 'postponed').map((match) => {
              const bet = myBets[match.matchId];
              const isPostponed = match.status === 'postponed';
              const isExpanded = expandedMatchId === match.matchId;

              const toggleExpand = () => {
                if (isExpanded) {
                  setExpandedMatchId(null);
                } else {
                  setExpandedMatchId(match.matchId);
                }
              };

              return (
                <View key={match.id}>
                  <TouchableOpacity style={[styles.historyCard, styles.glassCard]} onPress={toggleExpand}>
                    <View style={styles.matchHeaderRow}>
                      <Text style={styles.matchStage}>{match.stage.toUpperCase()}</Text>
                      <Text style={styles.matchTime}>{isExpanded ? '▼ Hide Details' : '▶ Show Details'}</Text>
                    </View>
                    <View style={styles.matchTeamsContainer}>
                      <Text style={styles.matchTeamText}>{getTeamFlag(match.teamA)} {match.teamA}</Text>
                      <Text style={styles.scoreText}>
                        {isPostponed ? 'P-P' : `${match.resultTeamAGoals} - ${match.resultTeamBGoals}`}
                      </Text>
                      <Text style={styles.matchTeamText}>{match.teamB} {getTeamFlag(match.teamB)}</Text>
                    </View>
                    <View style={styles.historyBetRow}>
                      {bet ? (
                        <View style={{ flex: 1 }}>
                          <Text style={styles.historyBetTitle}>Your Prediction:</Text>
                          <Text style={styles.historyBetValue}>
                            {bet.teamPrediction === 'teamA' ? <>{getTeamFlag(match.teamA)} {match.teamA}</> : (bet.teamPrediction === 'teamB' ? <>{match.teamB} {getTeamFlag(match.teamB)}</> : 'Draw')} ({bet.goalsTeamA}-{bet.goalsTeamB})
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <View style={[styles.badge, bet.teamBetResult === 'won' || bet.teamBetResult === 'draw_win' ? styles.badgeWin : styles.badgeLoss]}>
                              <Text style={styles.badgeText}>Team: {bet.teamBetResult ? bet.teamBetResult.toUpperCase() : 'LOST'}</Text>
                            </View>
                            <View style={[styles.badge, bet.goalBetResult === 'won' ? styles.badgeWin : styles.badgeLoss]}>
                              <Text style={styles.badgeText}>Goal: {bet.goalBetResult ? bet.goalBetResult.toUpperCase() : 'LOST'}</Text>
                            </View>
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.historyNoBet}>Forfeited (Did not place bet)</Text>
                      )}

                      {bet && (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 11, color: '#94a3b8' }}>Payout</Text>
                          <Text style={[styles.payoutText, (bet.amountWon - bet.amountLost) >= 0 ? { color: '#00e676' } : { color: '#ff3d71' }]}>
                            {(bet.amountWon - bet.amountLost) >= 0 ? '+' : ''}₹{bet.amountWon - bet.amountLost}
                          </Text>
                        </View>
                      )}
                    </View>

                    {isExpanded && (
                      <View style={styles.expandedBetsContainer}>
                        <View style={styles.expandedBetsDivider} />
                        <Text style={styles.expandedBetsTitle}>All Player Predictions</Text>
                        {expandedMatchBets.length === 0 ? (
                          <Text style={styles.expandedBetsEmpty}>Loading or no bets placed...</Text>
                        ) : (
                          <View style={styles.expandedBetsTable}>
                            <View style={styles.expandedBetsHeader}>
                              <Text style={[styles.expandedBetsHeadCell, { flex: 2.2 }]}>Player</Text>
                              <Text style={[styles.expandedBetsHeadCell, { flex: 2 }]}>Prediction</Text>
                              <Text style={[styles.expandedBetsHeadCell, { flex: 1.5, textAlign: 'center' }]}>Goals</Text>
                              <Text style={[styles.expandedBetsHeadCell, { flex: 1.3, textAlign: 'right' }]}>Net</Text>
                            </View>
                            {expandedMatchBets.map((b) => {
                              const u = allUsers[b.userId] || { name: 'Player' };
                              const net = (b.amountWon || 0) - (b.amountLost || 0);
                              return (
                                <View style={styles.expandedBetsRow} key={b.betId}>
                                  <Text style={[styles.expandedBetsCell, { flex: 2.2, fontWeight: '700' }]} numberOfLines={1}>
                                    {u.name}
                                  </Text>
                                  <Text style={[styles.expandedBetsCell, { flex: 2 }]}>
                                    {b.teamPrediction === 'teamA' ? getTeamFlag(match.teamA) : (b.teamPrediction === 'teamB' ? getTeamFlag(match.teamB) : 'Draw')} {b.teamPrediction === 'teamA' ? match.teamA : (b.teamPrediction === 'teamB' ? match.teamB : 'Draw')}
                                  </Text>
                                  <Text style={[styles.expandedBetsCell, { flex: 1.5, textAlign: 'center', fontWeight: '800', color: '#ffd700' }]}>
                                    {b.goalsTeamA < 0 ? 'N/A' : `${b.goalsTeamA} - ${b.goalsTeamB}`}
                                  </Text>
                                  <Text style={[styles.expandedBetsCell, { flex: 1.3, textAlign: 'right', fontWeight: '800', color: net >= 0 ? '#00e676' : '#ff3d71' }]}>
                                    {net >= 0 ? '+' : ''}₹{net}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* TAB 4: BRACKET */}
        {activeTab === 'bracket' && (
          <View style={{ paddingBottom: 20 }}>
            <View style={styles.bracketHeaderRow}>
              <Text style={styles.sectionHeader}>Tournament Bracket</Text>
              
              {/* Zoom Controls */}
              <View style={styles.zoomControls}>
                <TouchableOpacity style={styles.zoomBtn} onPress={() => setBracketZoom(Math.max(0.5, bracketZoom - 0.1))}>
                  <Text style={styles.zoomBtnText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.zoomText}>{Math.round(bracketZoom * 100)}%</Text>
                <TouchableOpacity style={styles.zoomBtn} onPress={() => setBracketZoom(Math.min(1.5, bracketZoom + 0.1))}>
                  <Text style={styles.zoomBtnText}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.zoomResetBtn} onPress={() => setBracketZoom(1.0)}>
                  <Text style={styles.zoomResetText}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView horizontal={true} style={styles.bracketHorizontalScroll} contentContainerStyle={styles.bracketHorizontalScrollContent}>
              <View style={[styles.bracketScaleContainer, { transform: [{ scale: bracketZoom }] }]}>
                {['r32', 'r16', 'qf', 'sf', 'final'].map((stage) => {
                  let stageMatches = matches.filter(m => m.stage === stage);
                  if (stage === 'final') {
                    const thirdPlaceMatches = matches.filter(m => m.stage === 'third_place');
                    stageMatches = [...stageMatches, ...thirdPlaceMatches];
                  }
                  
                  const expectedMatchCount = { 'r32': 16, 'r16': 8, 'qf': 4, 'sf': 2, 'final': 2 }[stage];
                  const placeholdersNeeded = expectedMatchCount - stageMatches.length;
                  const displayMatches = [...stageMatches];
                  for (let idx = 0; idx < placeholdersNeeded; idx++) {
                    displayMatches.push({
                      id: `placeholder_${stage}_${idx}`,
                      teamA: 'TBD',
                      teamB: 'TBD',
                      status: 'upcoming',
                      stage: stage === 'final' && idx === 1 ? 'third_place' : stage
                    });
                  }

                  return (
                    <View style={styles.bracketColumn} key={stage}>
                      <Text style={styles.bracketColumnTitle}>
                        {stage === 'r32' ? 'Round of 32' : stage === 'r16' ? 'Round of 16' : stage === 'qf' ? 'Quarter-Finals' : stage === 'sf' ? 'Semi-Finals' : 'Finals'}
                      </Text>
                      <View style={styles.bracketColumnMatches}>
                        {displayMatches.map(m => {
                          const isPlaceholder = String(m.id).startsWith('placeholder');
                          const teamAFlag = isPlaceholder ? null : getTeamFlag(m.teamA);
                          const teamBFlag = isPlaceholder ? null : getTeamFlag(m.teamB);
                          return (
                            <View style={[styles.bracketMatchCard, styles.glassCard]} key={m.id}>
                              <View style={[styles.bracketTeamRow, m.status === 'completed' && m.winner === 'teamB' && styles.bracketTeamLost]}>
                                <Text style={styles.bracketTeamText} numberOfLines={1}>
                                  {teamAFlag} {m.teamA}
                                </Text>
                                {m.status === 'completed' && <Text style={styles.bracketScore}>{m.resultTeamAGoals}</Text>}
                              </View>
                              
                              <View style={styles.bracketDivider} />
                              
                              <View style={[styles.bracketTeamRow, m.status === 'completed' && m.winner === 'teamA' && styles.bracketTeamLost]}>
                                <Text style={styles.bracketTeamText} numberOfLines={1}>
                                  {teamBFlag} {m.teamB}
                                </Text>
                                {m.status === 'completed' && <Text style={styles.bracketScore}>{m.resultTeamBGoals}</Text>}
                              </View>
                              
                              {m.stage === 'third_place' && (
                                <View style={styles.thirdPlaceBadge}>
                                  <Text style={styles.thirdPlaceBadgeText}>3rd Place Playoff</Text>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        )}

        {/* TAB 4.5: TEAMS */}
        {activeTab === 'teams' && (
          <View style={{ paddingBottom: 30 }}>
            <Text style={styles.sectionHeader}>Tournament Teams</Text>
            
            {/* Group Selector */}
            <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} style={styles.groupScroll} contentContainerStyle={{ gap: 8 }}>
              {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[styles.groupBtn, selectedTeamGroup === g && styles.groupBtnActive]}
                  onPress={() => {
                    setSelectedTeamGroup(g);
                    const firstTeam = Object.keys(teamsData).find(name => teamsData[name].group === g);
                    if (firstTeam) setSelectedTeamName(firstTeam);
                  }}
                >
                  <Text style={[styles.groupBtnText, selectedTeamGroup === g && styles.groupBtnTextActive]}>
                    Group {g}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Team Picker Grid */}
            <View style={styles.teamSelectorGrid}>
              {Object.keys(teamsData)
                .filter(name => teamsData[name].group === selectedTeamGroup)
                .map(teamName => (
                  <TouchableOpacity
                    key={teamName}
                    style={[styles.teamGridBtn, selectedTeamName === teamName && styles.teamGridBtnActive]}
                    onPress={() => setSelectedTeamName(teamName)}
                  >
                    <Text style={styles.teamGridFlag}>{getTeamFlag(teamName)}</Text>
                    <Text style={[styles.teamGridName, selectedTeamName === teamName && styles.teamGridNameActive]} numberOfLines={1}>
                      {teamName}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>

            {/* Selected Team Detail */}
            {teamsData[selectedTeamName] && (() => {
              const team = teamsData[selectedTeamName];
              const squadAvg = Math.round(team.players.reduce((sum, p) => sum + p.current, 0) / team.players.length);
              const peakAvg = Math.round(team.players.reduce((sum, p) => sum + p.peak, 0) / team.players.length);
              const startingXI = getStartingXI(team.players);
              const startingNames = new Set(startingXI.map(p => p.name));
              const substitutes = team.players.filter(p => !startingNames.has(p.name));

              return (
                <View style={[styles.teamDetailsCard, styles.glassCard]}>
                  {/* Header */}
                  <View style={styles.teamDetailsHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 28 }}>{getTeamFlag(selectedTeamName)}</Text>
                      <View>
                        <Text style={styles.teamDetailsTitle}>{selectedTeamName}</Text>
                        <Text style={styles.teamDetailsSub}>Group {team.group} • 26-Man Squad</Text>
                      </View>
                    </View>
                    <View style={styles.avgRatingWidget}>
                      <Text style={styles.avgRatingLabel}>AVG RATING</Text>
                      <Text style={styles.avgRatingVal}>{squadAvg}</Text>
                    </View>
                  </View>

                  {/* View Mode Switcher */}
                  <View style={styles.viewModeToggleRow}>
                    <TouchableOpacity
                      style={[styles.viewModeBtn, teamsViewMode === 'roster' && styles.viewModeBtnActive]}
                      onPress={() => setTeamsViewMode('roster')}
                    >
                      <Text style={[styles.viewModeText, teamsViewMode === 'roster' && styles.viewModeTextActive]}>Full Squad (26)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.viewModeBtn, teamsViewMode === 'pitch' && styles.viewModeBtnActive]}
                      onPress={() => setTeamsViewMode('pitch')}
                    >
                      <Text style={[styles.viewModeText, teamsViewMode === 'pitch' && styles.viewModeTextActive]}>Tactical pitch (11)</Text>
                    </TouchableOpacity>
                  </View>

                  {/* View 1: Roster View */}
                  {teamsViewMode === 'roster' && (
                    <View style={{ marginTop: 12 }}>
                      <View style={styles.statsSummaryBar}>
                        <Text style={styles.statsSummaryText}>Avg 2026 Rating: <Text style={{fontWeight:'800',color:'#b45309'}}>{squadAvg}</Text></Text>
                        <Text style={styles.statsSummaryText}>Avg Peak Rating: <Text style={{fontWeight:'800',color:'#27773f'}}>{peakAvg}</Text></Text>
                      </View>
                      
                      {['GK', 'DF', 'MF', 'FW'].map(pos => {
                        const posPlayers = team.players.filter(p => p.pos === pos);
                        if (posPlayers.length === 0) return null;
                        return (
                          <View key={pos} style={styles.posSection}>
                            <Text style={styles.posSectionTitle}>
                              {pos === 'GK' ? '🛡️ Goalkeepers' : pos === 'DF' ? '🛡️ Defenders' : pos === 'MF' ? '⚙️ Midfielders' : '🚀 Forwards'}
                            </Text>
                            {posPlayers.map(p => (
                              <View key={p.name} style={styles.playerRow}>
                                <View style={styles.playerInfoCol}>
                                  <Text style={styles.playerName}>{p.name}</Text>
                                  <Text style={styles.playerPositionBadge}>{p.pos}</Text>
                                </View>
                                <View style={styles.playerRatingsCol}>
                                  <View style={styles.ratingBarContainer}>
                                    <Text style={styles.ratingSubLabel}>Peak {p.peak}</Text>
                                    <View style={styles.ratingTrack}>
                                      <View style={[styles.ratingBar, { width: `${(p.peak / 100) * 100}%`, backgroundColor: '#4caf50' }]} />
                                    </View>
                                  </View>
                                  <View style={styles.ratingBarContainer}>
                                    <Text style={styles.ratingSubLabel}>Current {p.current}</Text>
                                    <View style={styles.ratingTrack}>
                                      <View style={[styles.ratingBar, { width: `${(p.current / 100) * 100}%`, backgroundColor: '#b45309' }]} />
                                    </View>
                                  </View>
                                </View>
                              </View>
                            ))}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* View 2: Tactical Starting 11 */}
                  {teamsViewMode === 'pitch' && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.pitchIntroText}>Predicted Starting XI (4-4-2 based on current ratings):</Text>
                      
                      {/* Football Pitch */}
                      <View style={styles.footballPitch}>
                        <View style={styles.pitchCenterCircle} />
                        <View style={styles.pitchCenterLine} />
                        <View style={styles.pitchPenaltyBoxTop} />
                        <View style={styles.pitchPenaltyBoxBottom} />
                        
                        {/* Render nodes */}
                        {startingXI.map(p => (
                          <View
                            key={p.name}
                            style={[
                              styles.pitchPlayerNode,
                              { left: p.x, top: p.y }
                            ]}
                          >
                            <View style={styles.pitchPlayerCircle}>
                              <Text style={styles.pitchPlayerCircleVal}>{p.current}</Text>
                            </View>
                            <Text style={styles.pitchPlayerName} numberOfLines={1}>
                              {p.name.split(' ').pop()}
                            </Text>
                            <Text style={styles.pitchPlayerRole}>
                              {p.role}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {/* Substitutes */}
                      <Text style={styles.substitutesHeader}>Reserves & Bench</Text>
                      <View style={styles.substitutesGrid}>
                        {substitutes.map(p => (
                          <View key={p.name} style={styles.subCard}>
                            <Text style={styles.subName} numberOfLines={1}>{p.name}</Text>
                            <Text style={styles.subMeta}>{p.pos} • Rating {p.current}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              );
            })()}
          </View>
        )}

        {/* TAB 5: PROFILE */}
        {activeTab === 'profile' && (
          <View>
            <View style={styles.profileCard}>
              <Text style={styles.profileName}>{userProfile?.name || 'Player'}</Text>
              <Text style={styles.profileEmail}>{currentUser.email}</Text>

              <View style={styles.profileDivider} />

              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Payment Plan:</Text>
                <Text style={styles.profileValue}>{userProfile?.paymentPlan?.toUpperCase() || 'INSTALLMENTS'}</Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Payment Status:</Text>
                <Text style={[styles.profileValue, userProfile?.paymentStatus === 'paid' ? { color: '#00e676' } : { color: '#ffd700' }]}>
                  {userProfile?.paymentStatus?.toUpperCase() || 'UNPAID'}
                </Text>
              </View>
              <View style={styles.profileRow}>
                <Text style={styles.profileLabel}>Late Entry:</Text>
                <Text style={styles.profileValue}>{userProfile?.isLateEntry ? 'Yes (₹1500 Entry)' : 'No'}</Text>
              </View>

              <TouchableOpacity style={styles.btnSecondary} onPress={handleLogout}>
                <Text style={styles.btnSecondaryText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </ScrollView>

      {/* FOOTER TAB BAR */}
      <View style={styles.footerTabBar}>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'home' && styles.tabActive]} onPress={() => setActiveTab('home')}>
          <Text style={styles.tabText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'leaderboard' && styles.tabActive]} onPress={() => setActiveTab('leaderboard')}>
          <Text style={styles.tabText}>Ranks</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'history' && styles.tabActive]} onPress={() => setActiveTab('history')}>
          <Text style={styles.tabText}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'bracket' && styles.tabActive]} onPress={() => setActiveTab('bracket')}>
          <Text style={styles.tabText}>Bracket</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'teams' && styles.tabActive]} onPress={() => setActiveTab('teams')}>
          <Text style={styles.tabText}>Teams</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem, activeTab === 'profile' && styles.tabActive]} onPress={() => setActiveTab('profile')}>
          <Text style={styles.tabText}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* BET INPUT MODAL */}
      {selectedMatch && (
        <Modal animationType="slide" transparent={true} visible={betModalVisible}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalHeader}>Place Your Bet</Text>
              <Text style={styles.modalSubHeader}>{getTeamFlag(selectedMatch.teamA)} {selectedMatch.teamA} vs {selectedMatch.teamB} {getTeamFlag(selectedMatch.teamB)}</Text>

              <Text style={styles.inputLabel}>Step 1: Pick Match Outcome</Text>
              <View style={styles.teamSelectRow}>
                <TouchableOpacity
                  style={[styles.teamSelectBtn, teamPrediction === 'teamA' && styles.teamSelectActive]}
                  onPress={() => setTeamPrediction('teamA')}
                >
                  <Text style={styles.teamSelectText}>{getTeamFlag(selectedMatch.teamA)} {selectedMatch.teamA}</Text>
                </TouchableOpacity>

                {selectedMatch.stage === 'group' && (
                  <TouchableOpacity
                    style={[styles.teamSelectBtn, teamPrediction === 'draw' && styles.teamSelectActive]}
                    onPress={() => setTeamPrediction('draw')}
                  >
                    <Text style={styles.teamSelectText}>Draw</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.teamSelectBtn, teamPrediction === 'teamB' && styles.teamSelectActive]}
                  onPress={() => setTeamPrediction('teamB')}
                >
                  <Text style={styles.teamSelectText}>{selectedMatch.teamB} {getTeamFlag(selectedMatch.teamB)}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Step 2: Predict Exact Scoreline</Text>
              <View style={styles.scoreInputRow}>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: '#82776a', fontSize: 12, marginBottom: 4 }}>{getTeamFlag(selectedMatch.teamA)} {selectedMatch.teamA}</Text>
                  <TextInput style={styles.scoreInput} keyboardType="numeric" value={goalsA} onChangeText={setGoalsA} />
                </View>
                <Text style={styles.scoreDivider}>:</Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: '#82776a', fontSize: 12, marginBottom: 4 }}>{selectedMatch.teamB} {getTeamFlag(selectedMatch.teamB)}</Text>
                  <TextInput style={styles.scoreInput} keyboardType="numeric" value={goalsB} onChangeText={setGoalsB} />
                </View>
              </View>

              {betError ? <Text style={styles.modalError}>{betError}</Text> : null}

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.btnPrimary} onPress={handleValidateBet}>
                  <Text style={styles.btnText}>Submit Bet</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setBetModalVisible(false)}>
                  <Text style={styles.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* CONFIRMATION DIALOG */}
      {selectedMatch && (
        <Modal animationType="fade" transparent={true} visible={confirmModalVisible}>
          <View style={styles.modalOverlay}>
            <View style={[styles.confirmContent, styles.glassCard]}>
              <Text style={styles.confirmHeader}>Confirm Submission</Text>
              <Text style={{ color: '#82776a', fontSize: 13, textAlign: 'center', marginVertical: 12 }}>You can edit this bet until the lock time.</Text>

              <View style={styles.confirmDetails}>
                <Text style={styles.confirmText}>Outcome: <Text style={{ fontWeight: '800', color: '#b45309' }}>
                  {teamPrediction === 'teamA' ? <>{getTeamFlag(selectedMatch.teamA)} {selectedMatch.teamA}</> : (teamPrediction === 'teamB' ? <>{selectedMatch.teamB} {getTeamFlag(selectedMatch.teamB)}</> : 'Draw')}
                </Text></Text>
                <Text style={styles.confirmText}>Exact Score: <Text style={{ fontWeight: '800', color: '#b45309' }}>{goalsA} - {goalsB}</Text></Text>
              </View>

              <View style={styles.modalBtnRow}>
                <TouchableOpacity style={styles.btnSuccess} onPress={handleConfirmBetSubmit} disabled={betSaving}>
                  {betSaving ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Lock & Confirm</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setConfirmModalVisible(false)}>
                  <Text style={styles.btnSecondaryText}>Go Back</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1ebd9',
  },
  loadingText: {
    color: '#82776a',
    marginTop: 14,
    fontSize: 16,
    fontWeight: '600'
  },
  appContainer: {
    flex: 1,
    backgroundColor: '#f1ebd9',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    width: '100%',
  },
  header: {
    height: 60,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(62, 56, 48, 0.12)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#e8dfc7'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#b45309',
    letterSpacing: 1
  },
  headerUser: {
    fontSize: 12,
    color: '#82776a'
  },
  mainScroll: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loginContainer: {
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1ebd9',
    minHeight: '100%',
    width: '100%',
    flex: 1,
  },
  loginLogo: {
    fontSize: 32,
    fontWeight: '900',
    color: '#b45309',
    letterSpacing: 2,
    marginTop: 20
  },
  loginSubtitle: {
    color: '#82776a',
    fontSize: 14,
    marginBottom: 40,
    textTransform: 'uppercase',
    letterSpacing: 1.5
  },
  card: {
    backgroundColor: 'rgba(250, 247, 238, 0.85)',
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    marginBottom: 20,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  glassCard: {
    backgroundColor: 'rgba(250, 247, 238, 0.85)',
    borderColor: 'rgba(62, 56, 48, 0.15)',
    borderWidth: 1,
    backdropFilter: 'blur(10px)', // For web compatibility
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#302b25',
    marginBottom: 16,
    textTransform: 'uppercase',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 56, 48, 0.12)',
    paddingBottom: 8,
    textAlign: 'center'
  },
  input: {
    backgroundColor: '#faf7ee',
    borderWidth: 1.5,
    borderColor: 'rgba(62, 56, 48, 0.15)',
    color: '#302b25',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 14,
  },
  paymentSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8
  },
  paymentLabel: {
    color: '#82776a',
    fontSize: 13
  },
  paymentBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#e6dcbf',
    borderRadius: 6,
  },
  paymentActive: {
    backgroundColor: '#b45309',
    borderWidth: 1,
    borderColor: '#d97706'
  },
  paymentBtnText: {
    color: '#302b25',
    fontSize: 12,
    fontWeight: '700'
  },
  btnPrimary: {
    backgroundColor: '#b45309',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  btnSuccess: {
    backgroundColor: '#27773f',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  btnSecondary: {
    backgroundColor: '#e6dcbf',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.15)',
    marginTop: 10,
    width: '100%'
  },
  btnSecondaryText: {
    color: '#302b25',
    fontWeight: '700'
  },
  btnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: '#b92028',
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center'
  },
  warningBanner: {
    backgroundColor: '#b9202814',
    borderColor: '#b92028',
    borderWidth: 1,
    padding: 10,
    alignItems: 'center'
  },
  warningBannerText: {
    color: '#b92028',
    fontSize: 12,
    fontWeight: '700'
  },
  paymentBanner: {
    backgroundColor: '#d9770614',
    borderColor: '#d97706',
    borderWidth: 1,
    padding: 10,
    alignItems: 'center'
  },
  paymentBannerText: {
    color: '#d97706',
    fontSize: 12,
    fontWeight: '700'
  },
  statsCardGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    flexWrap: 'wrap'
  },
  statWidget: {
    flex: 1,
    minWidth: 90,
    backgroundColor: 'rgba(250, 247, 238, 0.85)',
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderWidth: 1.5,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  statWidgetLabel: {
    fontSize: 10,
    color: '#82776a',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  statWidgetValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 6,
    color: '#302b25'
  },
  analyticsSection: {
    flexDirection: 'column',
    gap: 16,
    marginBottom: 24,
    width: '100%',
  },
  chartCard: {
    width: '100%',
    backgroundColor: 'rgba(250, 247, 238, 0.85)',
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  ringCard: {
    width: '100%',
    backgroundColor: 'rgba(250, 247, 238, 0.85)',
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  chartTitle: {
    fontSize: 11,
    color: '#82776a',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  chartFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  chartFooterText: {
    color: '#82776a',
    fontSize: 10,
    fontWeight: '600',
  },
  ringContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabelContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercentText: {
    fontSize: 15,
    color: '#b45309',
    fontWeight: '900',
  },
  ringSubText: {
    fontSize: 8,
    color: '#82776a',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#302b25',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.2
  },
  matchCard: {
    backgroundColor: 'rgba(250, 247, 238, 0.85)',
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  matchHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  matchStage: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b45309',
    letterSpacing: 0.5
  },
  matchTime: {
    fontSize: 11,
    color: '#82776a',
    fontWeight: '600'
  },
  matchTeamsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12
  },
  matchTeamText: {
    color: '#302b25',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center'
  },
  matchVS: {
    color: '#b45309',
    backgroundColor: '#e6dcbf',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontWeight: '900',
    fontSize: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.15)',
    overflow: 'hidden',
  },
  scoreText: {
    color: '#b45309',
    fontWeight: '800',
    fontSize: 16,
    marginHorizontal: 10
  },
  matchFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(62, 56, 48, 0.12)',
    paddingTop: 14,
    marginTop: 8
  },
  betPlacedBadge: {
    backgroundColor: '#27773f14',
    borderColor: '#27773f',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10
  },
  betPlacedText: {
    color: '#27773f',
    fontSize: 11,
    fontWeight: '700'
  },
  noBetPlacedText: {
    color: '#b92028',
    fontSize: 11,
    fontWeight: '700'
  },
  lockedBadge: {
    backgroundColor: '#e6dcbf',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.15)'
  },
  lockedText: {
    color: '#82776a',
    fontSize: 10,
    fontWeight: '800'
  },
  btnAction: {
    backgroundColor: '#b45309',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    shadowColor: '#b45309',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  btnActionText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 12
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#e6dcbf',
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderWidth: 1.5,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  toggleActive: {
    backgroundColor: '#b45309',
    borderColor: '#d97706'
  },
  toggleText: {
    color: '#302b25',
    fontWeight: '700',
    fontSize: 13
  },
  tableCard: {
    backgroundColor: 'rgba(250, 247, 238, 0.85)',
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    backdropFilter: 'blur(10px)',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(62, 56, 48, 0.12)'
  },
  tableHeadCell: {
    color: '#82776a',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  tableDataRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 56, 48, 0.08)',
    alignItems: 'center'
  },
  meRow: {
    backgroundColor: '#b4530914',
    borderWidth: 1.5,
    borderColor: '#b45309',
  },
  tableCell: {
    color: '#302b25',
    fontSize: 14
  },
  historyCard: {
    backgroundColor: 'rgba(250, 247, 238, 0.85)',
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    backdropFilter: 'blur(10px)',
  },
  historyBetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(62, 56, 48, 0.12)',
    paddingTop: 14,
    marginTop: 8
  },
  historyBetTitle: {
    fontSize: 10,
    color: '#82776a',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  historyBetValue: {
    fontSize: 13,
    color: '#302b25',
    fontWeight: '700',
    marginTop: 4
  },
  historyNoBet: {
    color: '#b92028',
    fontWeight: '700',
    fontSize: 12
  },
  payoutText: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2
  },
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeWin: {
    backgroundColor: '#27773f14',
    borderColor: '#27773f',
    borderWidth: 0.8
  },
  badgeLoss: {
    backgroundColor: '#b9202814',
    borderColor: '#b92028',
    borderWidth: 0.8
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#302b25',
    textTransform: 'uppercase'
  },
  bracketStageCard: {
    backgroundColor: 'rgba(250, 247, 238, 0.85)',
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    backdropFilter: 'blur(10px)',
  },
  bracketStageTitle: {
    color: '#b45309',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(62, 56, 48, 0.12)',
    paddingBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  bracketMatchRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    alignItems: 'center',
    gap: 8
  },
  bracketTeamLeft: {
    color: '#302b25',
    fontWeight: '700',
    fontSize: 13,
    flex: 1,
    textAlign: 'left'
  },
  bracketTeamRight: {
    color: '#302b25',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'right'
  },
  bracketRightContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8
  },
  bracketVs: {
    color: '#82776a',
    fontSize: 11,
    width: 24,
    textAlign: 'center'
  },
  bracketWinner: {
    color: '#27773f',
    fontWeight: '800',
    fontSize: 12
  },
  profileCard: {
    backgroundColor: 'rgba(250, 247, 238, 0.85)',
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#302b25'
  },
  profileEmail: {
    color: '#82776a',
    fontSize: 14,
    marginTop: 4
  },
  profileDivider: {
    height: 1.5,
    backgroundColor: 'rgba(62, 56, 48, 0.12)',
    width: '100%',
    marginVertical: 20
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 14
  },
  profileLabel: {
    color: '#82776a',
    fontSize: 14,
    fontWeight: '600'
  },
  profileValue: {
    color: '#302b25',
    fontWeight: '700',
    fontSize: 14
  },
  footerTabBar: {
    height: 65,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(62, 56, 48, 0.12)',
    flexDirection: 'row',
    backgroundColor: '#e8dfc7',
    paddingBottom: Platform.OS === 'ios' ? 15 : 0,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  tabActive: {
    borderTopWidth: 3,
    borderTopColor: '#b45309',
    backgroundColor: '#faf7ee'
  },
  tabText: {
    color: '#82776a',
    fontSize: 11,
    fontWeight: '700'
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(62, 56, 48, 0.4)',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#f1ebd9',
    borderColor: '#b45309',
    borderWidth: 2,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 15,
  },
  confirmContent: {
    backgroundColor: '#f1ebd9',
    borderColor: '#b92028',
    borderWidth: 2,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 15,
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#302b25',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  confirmHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#b92028',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  modalSubHeader: {
    color: '#82776a',
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 20
  },
  confirmWarning: {
    color: '#d97706',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 12,
    lineHeight: 18
  },
  confirmDetails: {
    backgroundColor: '#faf7ee',
    padding: 16,
    borderRadius: 10,
    marginVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.15)'
  },
  confirmText: {
    color: '#302b25',
    fontSize: 14
  },
  inputLabel: {
    color: '#82776a',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  teamSelectRow: {
    flexDirection: 'row',
    gap: 8,
  },
  teamSelectBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#e6dcbf',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(62, 56, 48, 0.15)'
  },
  teamSelectActive: {
    backgroundColor: '#b45309',
    borderColor: '#d97706'
  },
  teamSelectText: {
    color: '#302b25',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center'
  },
  scoreInputRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginVertical: 12
  },
  scoreInput: {
    backgroundColor: '#faf7ee',
    borderWidth: 2,
    borderColor: 'rgba(62, 56, 48, 0.15)',
    color: '#302b25',
    fontSize: 24,
    fontWeight: '800',
    width: 65,
    height: 55,
    textAlign: 'center',
    borderRadius: 10
  },
  scoreDivider: {
    color: '#302b25',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 20
  },
  modalError: {
    color: '#b92028',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center'
  },
  modalBtnRow: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 20
  },
  // Ambient Glows
  ambientGlow1: {
    position: 'absolute',
    top: -120,
    left: -120,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: 'rgba(180, 83, 9, 0.1)',
    filter: 'blur(80px)',
    pointerEvents: 'none',
  },
  ambientGlow2: {
    position: 'absolute',
    bottom: 80,
    right: -150,
    width: 450,
    height: 450,
    borderRadius: 225,
    backgroundColor: 'rgba(217, 119, 6, 0.05)',
    filter: 'blur(100px)',
    pointerEvents: 'none',
  },
  // Highlight Consensus Card
  mainConsensusCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  consensusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  consensusHeaderLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#b45309',
    letterSpacing: 1.2,
  },
  liveBadge: {
    backgroundColor: '#b4530915',
    borderColor: '#b45309',
    borderWidth: 1.2,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveBadgeText: {
    color: '#b45309',
    fontSize: 9,
    fontWeight: '900',
  },
  consensusTeamsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    gap: 14,
  },
  consensusTeamContainer: {
    flex: 1,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  consensusTeamFlag: {
    fontSize: 24,
  },
  consensusTeamName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#302b25',
  },
  consensusVs: {
    fontSize: 11,
    fontWeight: '900',
    color: '#b45309',
    backgroundColor: '#e6dcbf',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.15)',
    overflow: 'hidden',
  },
  consensusStatsRow: {
    marginBottom: 8,
  },
  consensusStatLabel: {
    fontSize: 12,
    color: '#82776a',
    fontWeight: '700',
  },
  consensusBar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e6dcbf',
    flexDirection: 'row',
    overflow: 'hidden',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.15)',
  },
  consensusBarSegment: {
    height: '100%',
  },
  consensusLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  consensusLabelText: {
    fontSize: 11,
    fontWeight: '800',
  },
  consensusTotalLabel: {
    fontSize: 10,
    color: '#82776a',
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '600',
  },
  consensusActionButton: {
    backgroundColor: '#b45309',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d97706',
    shadowColor: '#b45309',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  consensusActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  // Expanded Bets Table Styles
  expandedBetsContainer: {
    marginTop: 16,
    width: '100%',
  },
  expandedBetsDivider: {
    height: 1.5,
    backgroundColor: 'rgba(62, 56, 48, 0.12)',
    marginBottom: 12,
  },
  expandedBetsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b45309',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  expandedBetsEmpty: {
    fontSize: 12,
    color: '#82776a',
    textAlign: 'center',
    paddingVertical: 10,
  },
  expandedBetsTable: {
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#faf7ee',
  },
  expandedBetsHeader: {
    flexDirection: 'row',
    backgroundColor: '#e6dcbf',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 56, 48, 0.12)',
  },
  expandedBetsHeadCell: {
    fontSize: 10,
    fontWeight: '800',
    color: '#82776a',
    textTransform: 'uppercase',
  },
  expandedBetsRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 0.8,
    borderBottomColor: 'rgba(62, 56, 48, 0.08)',
    alignItems: 'center',
  },
  expandedBetsCell: {
    fontSize: 12,
    color: '#302b25',
  },
  // Bracket Zoom & Flowchart Styles
  bracketHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 8,
  },
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(230, 220, 191, 0.8)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 8,
  },
  zoomBtn: {
    backgroundColor: '#b45309',
    width: 24,
    height: 24,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  zoomText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#302b25',
    minWidth: 32,
    textAlign: 'center',
  },
  zoomResetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#faf7ee',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.15)',
  },
  zoomResetText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#82776a',
  },
  bracketHorizontalScroll: {
    flexDirection: 'row',
    width: '100%',
    marginTop: 10,
    backgroundColor: 'rgba(232, 223, 199, 0.3)',
    borderRadius: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.08)',
  },
  bracketHorizontalScrollContent: {
    paddingRight: 50,
  },
  bracketScaleContainer: {
    flexDirection: 'row',
    height: 1450,
    transformOrigin: 'top left',
    paddingHorizontal: 15,
  },
  bracketColumn: {
    width: 230,
    marginRight: 24,
    height: '100%',
  },
  bracketColumnTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b45309',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 0.8,
    marginBottom: 16,
    backgroundColor: '#e6dcbf',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.12)',
  },
  bracketColumnMatches: {
    flex: 1,
    justifyContent: 'space-around',
    paddingVertical: 10,
  },
  bracketMatchCard: {
    width: '100%',
    padding: 10,
    borderRadius: 10,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    position: 'relative',
  },
  bracketTeamRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  bracketTeamLost: {
    opacity: 0.5,
  },
  bracketTeamText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#302b25',
    flex: 1,
  },
  bracketScore: {
    fontSize: 12,
    fontWeight: '800',
    color: '#b45309',
    marginLeft: 6,
  },
  bracketDivider: {
    height: 1,
    backgroundColor: 'rgba(62, 56, 48, 0.1)',
    marginVertical: 4,
  },
  thirdPlaceBadge: {
    position: 'absolute',
    bottom: -8,
    right: 8,
    backgroundColor: '#74acdf',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  thirdPlaceBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  // Teams Selector Tab Styles
  groupScroll: {
    marginBottom: 12,
  },
  groupBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#e6dcbf',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.15)',
  },
  groupBtnActive: {
    backgroundColor: '#b45309',
    borderColor: '#d97706',
  },
  groupBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#302b25',
  },
  groupBtnTextActive: {
    color: '#ffffff',
  },
  teamSelectorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  teamGridBtn: {
    width: '48%',
    backgroundColor: 'rgba(230, 220, 191, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.12)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamGridBtnActive: {
    backgroundColor: '#faf7ee',
    borderColor: '#b45309',
    borderWidth: 1.5,
  },
  teamGridFlag: {
    fontSize: 16,
  },
  teamGridName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#82776a',
    flex: 1,
  },
  teamGridNameActive: {
    color: '#b45309',
    fontWeight: '800',
  },
  teamDetailsCard: {
    padding: 16,
    borderRadius: 14,
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  teamDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(62, 56, 48, 0.12)',
    paddingBottom: 12,
    marginBottom: 12,
  },
  teamDetailsTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#302b25',
  },
  teamDetailsSub: {
    fontSize: 11,
    color: '#82776a',
    fontWeight: '600',
  },
  avgRatingWidget: {
    backgroundColor: '#b4530914',
    borderWidth: 1,
    borderColor: '#b4530930',
    borderRadius: 8,
    padding: 6,
    alignItems: 'center',
  },
  avgRatingLabel: {
    fontSize: 8,
    color: '#82776a',
    fontWeight: '800',
  },
  avgRatingVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#b45309',
  },
  viewModeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#e6dcbf',
    borderRadius: 8,
    padding: 3,
    marginBottom: 14,
  },
  viewModeBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  viewModeBtnActive: {
    backgroundColor: '#faf7ee',
    shadowColor: '#3e3830',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  viewModeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#82776a',
  },
  viewModeTextActive: {
    color: '#b45309',
    fontWeight: '800',
  },
  statsSummaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#faf7ee',
    borderRadius: 8,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(62, 56, 48, 0.1)',
  },
  statsSummaryText: {
    fontSize: 11,
    color: '#82776a',
    fontWeight: '600',
  },
  posSection: {
    marginBottom: 16,
  },
  posSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#302b25',
    textTransform: 'uppercase',
    marginBottom: 10,
    backgroundColor: '#e6dcbf60',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    overflow: 'hidden',
  },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.8,
    borderBottomColor: 'rgba(62, 56, 48, 0.06)',
  },
  playerInfoCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#302b25',
  },
  playerPositionBadge: {
    fontSize: 9,
    fontWeight: '800',
    backgroundColor: 'rgba(62, 56, 48, 0.1)',
    color: '#82776a',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  playerRatingsCol: {
    flexDirection: 'row',
    gap: 12,
    minWidth: 140,
  },
  ratingBarContainer: {
    flex: 1,
  },
  ratingSubLabel: {
    fontSize: 8,
    color: '#82776a',
    fontWeight: '700',
    marginBottom: 2,
  },
  ratingTrack: {
    height: 4,
    backgroundColor: 'rgba(62, 56, 48, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  ratingBar: {
    height: '100%',
    borderRadius: 2,
  },

  // Football Pitch Styles
  pitchIntroText: {
    fontSize: 12,
    color: '#82776a',
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  footballPitch: {
    height: 340,
    width: '100%',
    backgroundColor: '#1b4d22',
    backgroundImage: 'linear-gradient(180deg, #1b4d22 0%, #2e7d32 100%)',
    borderRadius: 14,
    borderWidth: 3,
    borderColor: '#ffffff50',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  pitchCenterCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#ffffff30',
    marginTop: -40,
    marginLeft: -40,
  },
  pitchCenterLine: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#ffffff30',
  },
  pitchPenaltyBoxTop: {
    position: 'absolute',
    top: 0,
    left: '50%',
    width: 140,
    height: 60,
    borderWidth: 2,
    borderColor: '#ffffff30',
    borderTopWidth: 0,
    marginLeft: -70,
  },
  pitchPenaltyBoxBottom: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    width: 140,
    height: 60,
    borderWidth: 2,
    borderColor: '#ffffff30',
    borderBottomWidth: 0,
    marginLeft: -70,
  },
  pitchPlayerNode: {
    position: 'absolute',
    width: 62,
    marginLeft: -31,
    alignItems: 'center',
    zIndex: 10,
  },
  pitchPlayerCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    borderWidth: 2.5,
    borderColor: '#b45309',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  pitchPlayerCircleVal: {
    fontSize: 10,
    fontWeight: '900',
    color: '#302b25',
  },
  pitchPlayerName: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  pitchPlayerNodeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
    textAlign: 'center',
  },
  pitchPlayerRole: {
    color: '#ffd700',
    fontSize: 7,
    fontWeight: '900',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  substitutesHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: '#302b25',
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(62, 56, 48, 0.12)',
    paddingBottom: 4,
  },
  substitutesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  subCard: {
    width: '48%',
    backgroundColor: 'rgba(62, 56, 48, 0.05)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 0.8,
    borderColor: 'rgba(62, 56, 48, 0.08)',
  },
  subName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#302b25',
  },
  subMeta: {
    fontSize: 9,
    color: '#82776a',
    marginTop: 2,
    fontWeight: '600',
  }
});

