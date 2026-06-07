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
  StatusBar
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
  if (!teamName) return '';
  const flags = {
    'Mexico': '🇲🇽',
    'South Africa': '🇿🇦',
    'South Korea': '🇰🇷',
    'Czechia': '🇨🇿',
    'Canada': '🇨🇦',
    'Bosnia and Herzegovina': '🇧🇦',
    'Qatar': '🇶🇦',
    'Switzerland': '🇨🇭',
    'Brazil': '🇧🇷',
    'Haiti': '🇭🇹',
    'Morocco': '🇲🇦',
    'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
    'USA': '🇺🇸',
    'Australia': '🇦🇺',
    'Paraguay': '🇵🇾',
    'Turkiye': '🇹🇷',
    'Germany': '🇩🇪',
    'Ecuador': '🇪🇨',
    'Curacao': '🇨🇼',
    'Ivory Coast': '🇨🇮',
    'Netherlands': '🇳🇱',
    'Japan': '🇯🇵',
    'Sweden': '🇸🇪',
    'Tunisia': '🇹🇳',
    'Belgium': '🇧🇪',
    'Egypt': '🇪🇬',
    'Iran': '🇮🇷',
    'New Zealand': '🇳🇿',
    'Spain': '🇪🇸',
    'Saudi Arabia': '🇸🇦',
    'Cape Verde': '🇨🇻',
    'Uruguay': '🇺🇾',
    'France': '🇫🇷',
    'Iraq': '🇮🇶',
    'Norway': '🇳🇴',
    'Senegal': '🇸🇳',
    'Argentina': '🇦🇷',
    'Algeria': '🇩🇿',
    'Austria': '🇦🇹',
    'Jordan': '🇯🇴',
    'Portugal': '🇵🇹',
    'Colombia': '🇨🇴',
    'DR Congo': '🇨🇩',
    'Uzbekistan': '🇺🇿',
    'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'Croatia': '🇭🇷',
    'Ghana': '🇬🇭',
    'Panama': '🇵🇦'
  };
  return flags[teamName] || '';
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

  // Invite Registration Forms
  const [nameInput, setNameInput] = useState('');
  const [inviteIdInput, setInviteIdInput] = useState('');
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

  // Deep link listener (inviteId extractor)
  useEffect(() => {
    const parseUrl = (url) => {
      if (!url) return;
      console.log('Opened with URL:', url);
      const inviteIdParam = url.split('inviteId=')[1];
      if (inviteIdParam) {
        const code = inviteIdParam.split('&')[0];
        setInviteIdInput(code);
        setAuthError(`Invite code ${code} loaded from link!`);
      }
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

    return () => {
      unsubMatches();
      unsubBets();
      unsubSettings();
      unsubMoney();
      unsubAccuracy();
    };
  }, [currentUser, userProfile]);

  const handleRegister = async () => {
    if (!nameInput || !inviteIdInput) {
      setAuthError('Name and Invite Code are required to complete signup.');
      return;
    }
    setRegistering(true);
    setAuthError('');
    try {
      const idToken = await currentUser.getIdToken();
      const response = await fetch(`${API_BASE}/api/registerWithInvite`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          name: nameInput,
          inviteId: inviteIdInput,
          paymentPlan: paymentPlan
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      // Re-fetch user document to sync profile
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        setUserProfile(userDoc.data());
      }
    } catch (err) {
      setAuthError(`Registration error: ${err.message}`);
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
          <Text style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20, textAlign: 'center', lineHeight: 20 }}>
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
        <Text style={styles.loginLogo}>COMPLETE REGISTRATION</Text>
        <Text style={styles.loginSubtitle}>{currentUser.email}</Text>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>Enter Invite Credentials</Text>
          <TextInput 
            style={styles.input} 
            placeholder="Full Name" 
            placeholderTextColor="#64748b"
            value={nameInput}
            onChangeText={setNameInput}
          />
          <TextInput 
            style={styles.input} 
            placeholder="Invite Code (e.g., AD3K98F)" 
            placeholderTextColor="#64748b"
            value={inviteIdInput}
            onChangeText={setInviteIdInput}
            autoCapitalize="characters"
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
              <Text style={styles.btnText}>Verify & Join Arena</Text>
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
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25"/>
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <line x1={padding} y1={height/2} x2={width-padding} y2={height/2} stroke="#1e294b" strokeWidth="1" strokeDasharray="3" />
        {areaPath ? <path d={areaPath} fill={`url(#${gradId})`} /> : null}
        {linePath ? <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.map((p, idx) => (
          <circle key={idx} cx={p.x} cy={p.y} r="3" fill="#131b2e" stroke={strokeColor} strokeWidth="1.5" />
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
        <circle cx="35" cy="35" r={radius} stroke="#1e294b" strokeWidth={stroke} fill="transparent" />
        <circle 
          cx="35" 
          cy="35" 
          r={radius} 
          stroke="#ffd700" 
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
              <View style={[styles.statWidget, { borderLeftColor: '#ffd700' }]}>
                <Text style={styles.statWidgetLabel}>Net Profit</Text>
                <Text style={[styles.statWidgetValue, { color: netProfit >= 0 ? '#00e676' : '#ff3d71' }]}>
                  ₹{netProfit}
                </Text>
              </View>
              <View style={[styles.statWidget, { borderLeftColor: '#74acdf' }]}>
                <Text style={styles.statWidgetLabel}>Accuracy</Text>
                <Text style={styles.statWidgetValue}>{accuracy}%</Text>
              </View>
              <View style={[styles.statWidget, { borderLeftColor: '#ff2d37' }]}>
                <Text style={styles.statWidgetLabel}>Leaderboard</Text>
                <Text style={styles.statWidgetValue}>#{rankMoney || '-'}</Text>
              </View>
            </View>

            {/* ANALYTICS CHARTS SECTION */}
            <View style={styles.analyticsSection}>
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Profit Trend</Text>
                {renderProfitChart()}
                <View style={styles.chartFooter}>
                  <Text style={styles.chartFooterText}>Start</Text>
                  <Text style={styles.chartFooterText}>Current: ₹{netProfit}</Text>
                </View>
              </View>
              
              <View style={styles.ringCard}>
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

            <Text style={styles.sectionHeader}>Today's Fixtures</Text>
            {matches.filter(m => m.status === 'upcoming' || m.status === 'betting_closed' || m.status === 'live').map((match) => {
              const bet = myBets[match.matchId];
              return (
                <View style={styles.matchCard} key={match.id}>
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
                          Bet Placed: {bet.teamPrediction === 'teamA' ? `${getTeamFlag(match.teamA)} ${match.teamA}` : (bet.teamPrediction === 'teamB' ? `${match.teamB} ${getTeamFlag(match.teamB)}` : 'Draw')} ({bet.goalsTeamA}-{bet.goalsTeamB})
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.noBetPlacedText}>No bet submitted</Text>
                    )}
                    {match.status === 'upcoming' ? (
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
            })}
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

              return (
                <View style={styles.historyCard} key={match.id}>
                  <View style={styles.matchHeaderRow}>
                    <Text style={styles.matchStage}>{match.stage.toUpperCase()}</Text>
                    <Text style={styles.matchTime}>Completed</Text>
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
                          {bet.teamPrediction === 'teamA' ? `${getTeamFlag(match.teamA)} ${match.teamA}` : (bet.teamPrediction === 'teamB' ? `${match.teamB} ${getTeamFlag(match.teamB)}` : 'Draw')} ({bet.goalsTeamA}-{bet.goalsTeamB})
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
                </View>
              );
            })}
          </View>
        )}

        {/* TAB 4: BRACKET */}
        {activeTab === 'bracket' && (
          <View style={{ paddingBottom: 20 }}>
            <Text style={styles.sectionHeader}>Tournament Bracket</Text>
            {['r32', 'r16', 'qf', 'sf', 'third_place', 'final'].map((stage) => {
              const stageMatches = matches.filter(m => m.stage === stage);
              return (
                <View style={styles.bracketStageCard} key={stage}>
                  <Text style={styles.bracketStageTitle}>{stage.toUpperCase()}</Text>
                  {stageMatches.map(m => (
                    <View style={styles.bracketMatchRow} key={m.id}>
                      <Text style={styles.bracketTeamLeft}>{getTeamFlag(m.teamA)} {m.teamA}</Text>
                      <Text style={styles.bracketVs}>vs</Text>
                      <View style={styles.bracketRightContainer}>
                        <Text style={styles.bracketTeamRight}>{m.teamB} {getTeamFlag(m.teamB)}</Text>
                        {m.status === 'completed' && (
                          <Text style={styles.bracketWinner}>({m.winner === 'teamA' ? `${getTeamFlag(m.teamA)} ${m.teamA}` : `${m.teamB} ${getTeamFlag(m.teamB)}`})</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
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
                  <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>{getTeamFlag(selectedMatch.teamA)} {selectedMatch.teamA}</Text>
                  <TextInput style={styles.scoreInput} keyboardType="numeric" value={goalsA} onChangeText={setGoalsA} />
                </View>
                <Text style={styles.scoreDivider}>:</Text>
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 4 }}>{selectedMatch.teamB} {getTeamFlag(selectedMatch.teamB)}</Text>
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
            <View style={styles.confirmContent}>
              <Text style={styles.confirmHeader}>Confirm Submission</Text>
              <Text style={styles.confirmWarning}>⚠️ Bets cannot be edited or withdrawn once confirmed.</Text>
              
              <View style={styles.confirmDetails}>
                <Text style={styles.confirmText}>Outcome: <Text style={{ fontWeight: '800', color: '#ffd700' }}>
                  {teamPrediction === 'teamA' ? `${getTeamFlag(selectedMatch.teamA)} ${selectedMatch.teamA}` : (teamPrediction === 'teamB' ? `${selectedMatch.teamB} ${getTeamFlag(selectedMatch.teamB)}` : 'Draw')}
                </Text></Text>
                <Text style={styles.confirmText}>Exact Score: <Text style={{ fontWeight: '800', color: '#ffd700' }}>{goalsA} - {goalsB}</Text></Text>
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
    backgroundColor: '#0b0f19',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 14,
    fontSize: 16,
    fontWeight: '600'
  },
  appContainer: {
    flex: 1,
    backgroundColor: '#0b0f19',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    width: '100%',
  },
  header: {
    height: 60,
    borderBottomWidth: 1.5,
    borderBottomColor: '#1e294b',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    backgroundColor: '#0d1324'
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffd700',
    letterSpacing: 1
  },
  headerUser: {
    fontSize: 12,
    color: '#94a3b8'
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
    backgroundColor: '#0b0f19',
    minHeight: '100%',
    width: '100%',
    flex: 1,
  },
  loginLogo: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffd700',
    letterSpacing: 2,
    marginTop: 20
  },
  loginSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 40,
    textTransform: 'uppercase',
    letterSpacing: 1.5
  },
  card: {
    backgroundColor: '#131b2e',
    borderColor: '#1e294b',
    borderWidth: 2,
    borderRadius: 12,
    padding: 24,
    width: '100%',
    marginBottom: 20
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 16,
    textTransform: 'uppercase',
    borderBottomWidth: 1,
    borderBottomColor: '#1e294b',
    paddingBottom: 8,
    textAlign: 'center'
  },
  input: {
    backgroundColor: '#0b0f19',
    borderWidth: 1.5,
    borderColor: '#1e294b',
    color: '#f8fafc',
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
    color: '#94a3b8',
    fontSize: 13
  },
  paymentBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#1e294b',
    borderRadius: 6,
  },
  paymentActive: {
    backgroundColor: '#3b82f6',
    borderWidth: 1,
    borderColor: '#93c5fd'
  },
  paymentBtnText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700'
  },
  btnPrimary: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  btnSuccess: {
    backgroundColor: '#009c3b',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%'
  },
  btnSecondary: {
    backgroundColor: '#1e294b',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 10,
    width: '100%'
  },
  btnSecondaryText: {
    color: '#f8fafc',
    fontWeight: '700'
  },
  btnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: '#ff3d71',
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center'
  },
  warningBanner: {
    backgroundColor: '#ff3d711f',
    borderColor: '#ff3d71',
    borderWidth: 1,
    padding: 10,
    alignItems: 'center'
  },
  warningBannerText: {
    color: '#ff3d71',
    fontSize: 12,
    fontWeight: '700'
  },
  paymentBanner: {
    backgroundColor: '#ffa0001f',
    borderColor: '#ffa000',
    borderWidth: 1,
    padding: 10,
    alignItems: 'center'
  },
  paymentBannerText: {
    color: '#ffa000',
    fontSize: 12,
    fontWeight: '700'
  },
  statsCardGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20
  },
  statWidget: {
    flex: 1,
    backgroundColor: '#131b2e',
    borderColor: '#1e294b',
    borderWidth: 1.5,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  statWidgetLabel: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  statWidgetValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 6,
    color: 'white'
  },
  analyticsSection: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
    width: '100%',
  },
  chartCard: {
    flex: 2,
    backgroundColor: '#131b2e',
    borderColor: '#1e294b',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  ringCard: {
    flex: 1.2,
    backgroundColor: '#131b2e',
    borderColor: '#1e294b',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  chartTitle: {
    fontSize: 11,
    color: '#94a3b8',
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
    color: '#64748b',
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
    color: '#ffd700',
    fontWeight: '900',
  },
  ringSubText: {
    fontSize: 8,
    color: '#64748b',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: '#f8fafc',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.2
  },
  matchCard: {
    backgroundColor: '#131b2e',
    borderColor: '#1e294b',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
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
    color: '#ffd700',
    letterSpacing: 0.5
  },
  matchTime: {
    fontSize: 11,
    color: '#94a3b8',
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
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center'
  },
  matchVS: {
    color: '#ffd700',
    backgroundColor: '#1e294b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontWeight: '900',
    fontSize: 10,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  scoreText: {
    color: '#ffd700',
    fontWeight: '800',
    fontSize: 16,
    marginHorizontal: 10
  },
  matchFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1.5,
    borderTopColor: '#1e294b',
    paddingTop: 14,
    marginTop: 8
  },
  betPlacedBadge: {
    backgroundColor: '#009c3b1a',
    borderColor: '#009c3b',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10
  },
  betPlacedText: {
    color: '#00e676',
    fontSize: 11,
    fontWeight: '700'
  },
  noBetPlacedText: {
    color: '#ff3d71',
    fontSize: 11,
    fontWeight: '700'
  },
  lockedBadge: {
    backgroundColor: '#1e293b',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155'
  },
  lockedText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800'
  },
  btnAction: {
    backgroundColor: '#2563eb',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
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
    backgroundColor: '#131b2e',
    borderColor: '#1e294b',
    borderWidth: 1.5,
    borderRadius: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  toggleActive: {
    backgroundColor: '#2563eb',
    borderColor: '#3b82f6'
  },
  toggleText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 13
  },
  tableCard: {
    backgroundColor: '#131b2e',
    borderColor: '#1e294b',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#1e294b'
  },
  tableHeadCell: {
    color: '#94a3b8',
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
    borderBottomColor: '#1e294b',
    alignItems: 'center'
  },
  meRow: {
    backgroundColor: '#2563eb1f',
    borderWidth: 1.5,
    borderColor: '#2563eb',
  },
  tableCell: {
    color: '#f8fafc',
    fontSize: 14
  },
  historyCard: {
    backgroundColor: '#131b2e',
    borderColor: '#1e294b',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  historyBetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1.5,
    borderTopColor: '#1e294b',
    paddingTop: 14,
    marginTop: 8
  },
  historyBetTitle: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  historyBetValue: {
    fontSize: 13,
    color: 'white',
    fontWeight: '700',
    marginTop: 4
  },
  historyNoBet: {
    color: '#ff3d71',
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
    backgroundColor: '#00e6761f',
    borderColor: '#00e676',
    borderWidth: 0.8
  },
  badgeLoss: {
    backgroundColor: '#ff3d711f',
    borderColor: '#ff3d71',
    borderWidth: 0.8
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: 'white',
    textTransform: 'uppercase'
  },
  bracketStageCard: {
    backgroundColor: '#131b2e',
    borderColor: '#1e294b',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  bracketStageTitle: {
    color: '#ffd700',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#1e294b',
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
    color: 'white',
    fontWeight: '700',
    fontSize: 13,
    flex: 1,
    textAlign: 'left'
  },
  bracketTeamRight: {
    color: 'white',
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
    color: '#94a3b8',
    fontSize: 11,
    width: 24,
    textAlign: 'center'
  },
  bracketWinner: {
    color: '#00e676',
    fontWeight: '800',
    fontSize: 12
  },
  profileCard: {
    backgroundColor: '#131b2e',
    borderColor: '#1e294b',
    borderWidth: 1.5,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc'
  },
  profileEmail: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4
  },
  profileDivider: {
    height: 1.5,
    backgroundColor: '#1e294b',
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
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600'
  },
  profileValue: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14
  },
  footerTabBar: {
    height: 65,
    borderTopWidth: 1.5,
    borderTopColor: '#1e294b',
    flexDirection: 'row',
    backgroundColor: '#0d1324',
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
    borderTopColor: '#2563eb',
    backgroundColor: '#141c30'
  },
  tabText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700'
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000bb',
    padding: 20
  },
  modalContent: {
    backgroundColor: '#131b2e',
    borderColor: '#ffd700',
    borderWidth: 2,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  confirmContent: {
    backgroundColor: '#131b2e',
    borderColor: '#ff2d37',
    borderWidth: 2,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  confirmHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ff3d71',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  modalSubHeader: {
    color: '#94a3b8',
    textAlign: 'center',
    fontSize: 13,
    marginBottom: 20
  },
  confirmWarning: {
    color: '#ffa000',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginVertical: 12,
    lineHeight: 18
  },
  confirmDetails: {
    backgroundColor: '#0b0f19',
    padding: 16,
    borderRadius: 10,
    marginVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#1e294b'
  },
  confirmText: {
    color: 'white',
    fontSize: 14
  },
  inputLabel: {
    color: '#94a3b8',
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
    backgroundColor: '#1e294b',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#334155'
  },
  teamSelectActive: {
    backgroundColor: '#2563eb',
    borderColor: '#60a5fa'
  },
  teamSelectText: {
    color: 'white',
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
    backgroundColor: '#0b0f19',
    borderWidth: 2,
    borderColor: '#1e294b',
    color: 'white',
    fontSize: 24,
    fontWeight: '800',
    width: 65,
    height: 55,
    textAlign: 'center',
    borderRadius: 10
  },
  scoreDivider: {
    color: 'white',
    fontSize: 24,
    fontWeight: '800',
    marginTop: 20
  },
  modalError: {
    color: '#ff3d71',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center'
  },
  modalBtnRow: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 20
  }
});
