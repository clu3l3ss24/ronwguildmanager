import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import Navbar from './components/Navbar'; import Dashboard from './pages/Dashboard'; import Members from './pages/Members'; import Teams from './pages/Teams';
import { auth, db, firebaseEnabled } from './firebase/config';

const blankTeams = () => ({ top: [], middle: [], bottom: [], flex: [] });
const autoBalanceTeams = () => ({ top: Array.from({ length: 3 }, () => Array(5).fill(null)), middle: Array.from({ length: 3 }, () => Array(5).fill(null)), bottom: Array.from({ length: 3 }, () => Array(5).fill(null)), flex: Array.from({ length: 3 }, () => Array(5).fill(null)) });
// Preserves saved manual parties, including legacy single-party lane saves.
const normalizeTeams = teams => Object.fromEntries(['top', 'middle', 'bottom', 'flex'].map(lane => [lane, Array.isArray(teams?.[lane]?.[0]) ? teams[lane] : Array.isArray(teams?.[lane]) ? [teams[lane]] : []]));
const seedMembers = [];
const stored = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
export default function App() {
  const [page, setPage] = useState('dashboard'); const [role, setRole] = useState('Guild Master');
  const [user, setUser] = useState(null);
  const [members, setMembers] = useState(() => stored('row-members') || seedMembers); const [teams, setTeams] = useState(() => normalizeTeams(stored('row-teams') || blankTeams()));
  const [savedTeams, setSavedTeams] = useState(() => stored('row-saved-teams') || []);
  useEffect(() => { if (!firebaseEnabled) return; return onSnapshot(collection(db, 'members'), snap => setMembers(snap.docs.map(item => ({ id: item.id, ...item.data() })))); }, []);
  useEffect(() => { if (!firebaseEnabled) return; return onAuthStateChanged(auth, setUser); }, []);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-members', JSON.stringify(members)); }, [members]);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-saved-teams', JSON.stringify(savedTeams)); }, [savedTeams]);
  useEffect(() => { if (!firebaseEnabled) localStorage.setItem('row-teams', JSON.stringify(teams)); else setDoc(doc(db, 'guilds', 'default'), { teams, updatedAt: new Date().toISOString() }); }, [teams]);
  useEffect(() => { if (!firebaseEnabled) return; return onSnapshot(doc(db, 'guilds', 'default'), snap => { if (snap.exists()?.teams) setTeams(normalizeTeams(snap.data().teams)); }); }, []);
  useEffect(() => { if (!firebaseEnabled) return; return onSnapshot(collection(db, 'savedTeams'), snap => setSavedTeams(snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))))); }, []);
  const importMembers = async roster => { const seen = new Set(); const unique = roster.filter(member => { const key = member.ign.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).map(member => ({ ...member, id: crypto.randomUUID() }));
    if (firebaseEnabled) { const current = await getDocs(collection(db, 'members')); const batch = writeBatch(db); current.docs.forEach(item => batch.delete(item.ref)); unique.forEach(member => batch.set(doc(db, 'members', member.id), member)); await batch.commit(); } else setMembers(unique); setTeams(blankTeams()); return { added: unique.length, duplicates: roster.length - unique.length }; };
  const deleteMember = async id => { if (firebaseEnabled) await deleteDoc(doc(db, 'members', id)); else setMembers(current => current.filter(member => member.id !== id)); setTeams(current => Object.fromEntries(Object.entries(current).map(([key, parties]) => [key, parties.map(slots => slots.map(item => item === id ? null : item))]))); };
  const saveTeams = next => setTeams(next);
  const autoBalance = () => { const sorted = [...members].sort((a, b) => b.gearScore - a.gearScore); const groups = { tank: sorted.filter(m => /knight|tank/i.test(m.className)), healer: sorted.filter(m => /priest|healer|support/i.test(m.className)), dps: sorted.filter(m => !/knight|tank|priest|healer|support/i.test(m.className)) }; const selected = [];
    const bestRemaining = () => Object.values(groups).flat().sort((a, b) => b.gearScore - a.gearScore)[0]; const take = role => { const member = groups[role].shift() || bestRemaining(); if (!member) return; Object.values(groups).forEach(group => { const index = group.findIndex(item => item.id === member.id); if (index >= 0) group.splice(index, 1); }); selected.push(member); };
    for (let party = 0; party < 12 && selected.length < 60; party += 1) ['tank', 'healer', 'dps', 'dps', 'dps'].forEach(take); const next = autoBalanceTeams(); selected.slice(0, 60).forEach((member, index) => { const lane = ['top','middle','bottom','flex'][Math.floor(index / 5) % 4]; const partyIndex = Math.floor(index / 20); next[lane][partyIndex][index % 5] = member.id; }); setTeams(next); };
  // Clear recreates the clean, lane-only battlefield; roster records remain untouched.
  const clearTeams = () => setTeams(blankTeams());
  const saveTeam = async () => { const name = window.prompt('Enter a name for this team setup:'); if (!name?.trim()) return; const snapshot = { id: crypto.randomUUID(), name: name.trim(), createdAt: new Date().toISOString(), teams }; if (firebaseEnabled) await setDoc(doc(db, 'savedTeams', snapshot.id), snapshot); else setSavedTeams(current => [snapshot, ...current]); };
  const loadTeam = snapshot => setTeams(normalizeTeams(snapshot.teams));
  const deleteSavedTeam = async id => { if (firebaseEnabled) await deleteDoc(doc(db, 'savedTeams', id)); else setSavedTeams(current => current.filter(snapshot => snapshot.id !== id)); };
  const active = page === 'dashboard' ? <Dashboard members={members} teams={teams} onImport={importMembers} role={role} /> : page === 'members' ? <Members members={members} onDelete={deleteMember} canDelete={role === 'Guild Master'} /> : <Teams members={members} teams={teams} onTeamsChange={saveTeams} editable={role !== 'Member'} generate={autoBalance} clear={clearTeams} save={saveTeam} savedTeams={savedTeams} load={loadTeam} deleteSaved={deleteSavedTeam} />;
  const login = () => signInWithPopup(auth, new GoogleAuthProvider());
  const logout = () => firebaseEnabled && signOut(auth);
  return <><Navbar page={page} setPage={setPage} role={role} setRole={setRole} memberCount={members.length} user={user} firebaseEnabled={firebaseEnabled} onLogin={login} onLogout={logout} /><div className="app-shell">{active}</div></>;
}
