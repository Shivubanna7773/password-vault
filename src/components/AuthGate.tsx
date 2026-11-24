import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithCredential, signInWithPopup, type User } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  ShieldCheck,
  Smartphone,
  Sun,
  Moon,
} from 'lucide-react';
import { auth, googleProvider, signOutFromAllLayers } from '../firebase';
import { evaluatePasswordStrength, verifyMasterPassphrase } from '../lib/crypto';
import { createVaultProfile } from '../lib/vaultService';
import type { VaultProfileDoc } from '../types/vault';

interface AuthGateProps {
  user: User | null;
  profile: VaultProfileDoc | null | undefined;
  profileLoading: boolean;
  onUnlocked: (key: CryptoKey) => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  user,
  profile,
  profileLoading,
  onUnlocked,
  isDark,
  onToggleTheme,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const strength = evaluatePasswordStrength(passphrase);

  const handleGoogleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const result = await FirebaseAuthentication.signInWithGoogle();
        const idToken = result.credential?.idToken;
        if (!idToken) {
          throw new Error('Google Sign-In did not return an ID token. Check the Android Firebase configuration and SHA-1 fingerprint.');
        }
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      if (msg.includes('popup-blocked')) {
        setError('Sign-in popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (msg.includes('popup-closed-by-user')) {
        setError('Sign-in window was closed before completing authentication.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCreateMasterPassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);

    if (passphrase.length < 8) {
      setError('Master passphrase must be at least 8 characters long.');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match.');
      return;
    }

    setBusy(true);
    try {
      const key = await createVaultProfile(user.uid, passphrase, 15);
      setPassphrase('');
      setConfirmPassphrase('');
      onUnlocked(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize vault.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);

    if (!passphrase) {
      setError('Enter your master passphrase to unlock your vault.');
      return;
    }

    setBusy(true);
    try {
      const key = await verifyMasterPassphrase(
        passphrase,
        profile.salt,
        profile.kdfIterations,
        profile.verifierIv,
        profile.verifierCiphertext
      );
      if (!key) {
        setError('Incorrect master passphrase. Please check and try again.');
        return;
      }
      setPassphrase('');
      onUnlocked(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unlock vault.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setPassphrase('');
    setConfirmPassphrase('');
    await signOutFromAllLayers();
  };

  const strengthColor =
    strength.score <= 1
      ? 'bg-red-600'
      : strength.score === 2
      ? 'bg-amber-600'
      : 'bg-emerald-600';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="font-display text-lg font-bold tracking-tight">Keystone Vault</span>
          </div>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Context Column */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-medium tracking-wide text-blue-600 dark:text-blue-400">
                Phone & Desktop Sync · Zero-Knowledge Encryption
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">
                One encrypted vault for your phone and computer.
              </h1>
              <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
                Every password, banking PIN, Wi-Fi key, and 2FA code is encrypted on your device using AES-256-GCM before it ever syncs to the cloud.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="pt-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Mobile Ready</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Thumb-friendly cards and one-tap copy on any phone browser.
                </p>
              </div>
              <div className="pt-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Laptop className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Desktop Workspace</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Instant search, keyboard shortcuts, and live QR handoff.
                </p>
              </div>
              <div className="pt-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span>Local Keys Only</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Your master passphrase never leaves your browser memory.
                </p>
              </div>
            </div>
          </div>

          {/* Right Auth / Unlock Card */}
          <div className="lg:col-span-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
              {!user ? (
                <>
                  <div className="space-y-1.5">
                    <h2 className="font-display text-xl font-semibold">Sign in to sync your vault</h2>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Use the same Google account on your phone and PC to keep your encrypted entries synchronized in real time.
                    </p>
                  </div>

                  {error && (
                    <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
                      {error}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleGoogleSignIn}
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium text-sm flex items-center justify-center gap-2.5 transition-colors"
                  >
                    <Lock className="w-4 h-4" />
                    {busy ? 'Connecting…' : 'Continue with Google'}
                  </button>
                </>
              ) : profileLoading ? (
                <div className="py-10 text-center space-y-3">
                  <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-sm text-slate-600 dark:text-slate-400">Loading encrypted vault profile…</p>
                </div>
              ) : !profile ? (
                <form onSubmit={handleCreateMasterPassphrase} className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h2 className="font-display text-xl font-semibold">Create your Master Passphrase</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Signed in as {user.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="min-h-[40px] px-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Switch
                    </button>
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                    This passphrase encrypts and unlocks your vault across all devices. Choose something memorable and strong—we cannot reset it for you.
                  </p>

                  {error && (
                    <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
                      {error}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="new-master-pass" className="block text-sm font-medium">
                        Master Passphrase
                      </label>
                      <div className="relative">
                        <input
                          id="new-master-pass"
                          type={showPassphrase ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={passphrase}
                          onChange={(e) => setPassphrase(e.target.value)}
                          placeholder="Minimum 8 characters"
                          className="w-full min-h-[46px] pl-3.5 pr-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassphrase((v) => !v)}
                          aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                          className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                        >
                          {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {passphrase.length > 0 && (
                        <div className="pt-1 space-y-1">
                          <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${strengthColor}`}
                              style={{ width: `${Math.max(15, (strength.score + 1) * 20)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <span>Strength: {strength.label}</span>
                            <span className="tabular-nums">{strength.entropyBits} bits</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="confirm-master-pass" className="block text-sm font-medium">
                        Confirm Master Passphrase
                      </label>
                      <input
                        id="confirm-master-pass"
                        type={showPassphrase ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassphrase}
                        onChange={(e) => setConfirmPassphrase(e.target.value)}
                        placeholder="Re-enter your master passphrase"
                        className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium text-sm transition-colors"
                  >
                    {busy ? 'Encrypting & Creating Vault…' : 'Create Encrypted Vault'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleUnlock} className="space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h2 className="font-display text-xl font-semibold">Unlock Your Vault</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Account: {user.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="min-h-[40px] px-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 inline-flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Switch
                    </button>
                  </div>

                  {error && (
                    <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
                      {error}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label htmlFor="unlock-passphrase" className="block text-sm font-medium">
                      Master Passphrase
                    </label>
                    <div className="relative">
                      <input
                        id="unlock-passphrase"
                        type={showPassphrase ? 'text' : 'password'}
                        autoComplete="current-password"
                        autoFocus
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                        placeholder="Enter master passphrase"
                        className="w-full min-h-[46px] pl-3.5 pr-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassphrase((v) => !v)}
                        aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                        className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <Lock className="w-4 h-4" />
                    {busy ? 'Deriving Key…' : 'Unlock Vault'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
