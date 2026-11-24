import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  Activity,
  Check,
  ChevronRight,
  Copy,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  KeyRound,
  Landmark,
  Lock,
  Moon,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Smartphone,
  Star,
  Sun,
  Trash2,
  Wand2,
  Wifi,
  X,
} from 'lucide-react';
import { auth, signOutFromAllLayers } from './firebase';
import { decryptVaultSecret } from './lib/crypto';
import {
  deleteVaultItem,
  saveVaultItem,
  subscribeVaultItems,
  subscribeVaultProfile,
  toggleFavoriteVaultItem,
  updateAutoLockPreference,
  type SaveVaultItemInput,
} from './lib/vaultService';
import type {
  AppView,
  DecryptedVaultItem,
  EncryptedVaultItemDoc,
  VaultCategory,
  VaultProfileDoc,
} from './types/vault';
import { AuthGate } from './components/AuthGate';
import { DeviceSyncView } from './components/DeviceSyncView';
import { EntryEditorSheet } from './components/EntryEditorSheet';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PasswordGeneratorView } from './components/PasswordGeneratorView';
import { SecurityHealthView } from './components/SecurityHealthView';
import { TotpCodeCard } from './components/TotpCodeCard';

type CategoryFilter = 'all' | 'favorites' | VaultCategory;

const CATEGORY_META: Record<
  VaultCategory,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  login: { label: 'Login', icon: Globe },
  banking: { label: 'Banking', icon: Landmark },
  card: { label: 'Card', icon: CreditCard },
  wifi: { label: 'Wi-Fi', icon: Wifi },
  note: { label: 'Note', icon: FileText },
};

function formatRelativeDate(ms: number): string {
  if (!ms) return 'Just now';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getSafeExternalHref(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function strengthTextLabel(score: number): string {
  switch (score) {
    case 4:
      return 'Very Strong';
    case 3:
      return 'Strong';
    case 2:
      return 'Fair';
    case 1:
      return 'Weak';
    default:
      return 'Very Weak';
  }
}

function VaultWorkspace() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState<VaultProfileDoc | null | undefined>(undefined);
  const [profileLoading, setProfileLoading] = useState(true);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);

  const [encryptedItems, setEncryptedItems] = useState<
    Array<{ id: string; data: EncryptedVaultItemDoc }>
  >([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [decryptedItems, setDecryptedItems] = useState<DecryptedVaultItem[]>([]);
  const [firestoreError, setFirestoreError] = useState<Error | null>(null);

  const [activeView, setActiveView] = useState<AppView>('vault');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [mobileSheetItemId, setMobileSheetItemId] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DecryptedVaultItem | null>(null);
  const [prefilledPassword, setPrefilledPassword] = useState<string | undefined>(undefined);

  const [revealPassword, setRevealPassword] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [clipboardNotice, setClipboardNotice] = useState<{
    label: string;
    secondsLeft: number;
  } | null>(null);

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem('keystone_theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const clipboardTimerRef = useRef<number | null>(null);

  if (firestoreError) {
    throw firestoreError;
  }

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      window.localStorage.setItem('keystone_theme', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('keystone_theme', 'light');
    }
  }, [isDark]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setVaultKey(null);
        setProfile(undefined);
        setEncryptedItems([]);
        setDecryptedItems([]);
        setSelectedItemId(null);
        setMobileSheetItemId(null);
      }
    });
    return () => unsub();
  }, []);

  // VaultProfile listener
  useEffect(() => {
    if (!authReady || !user) {
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const unsub = subscribeVaultProfile(
      user.uid,
      (nextProfile) => {
        setProfile(nextProfile);
        setProfileLoading(false);
      },
      (err) => {
        setProfileLoading(false);
        setFirestoreError(err);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  // Encrypted items listener (only when authenticated AND vault unlocked)
  useEffect(() => {
    if (!authReady || !user || !vaultKey) {
      setEncryptedItems([]);
      setDecryptedItems([]);
      return;
    }

    setItemsLoading(true);
    const unsub = subscribeVaultItems(
      user.uid,
      (rows) => {
        setEncryptedItems(rows);
        setItemsLoading(false);
      },
      (err) => {
        setItemsLoading(false);
        setFirestoreError(err);
      }
    );
    return () => unsub();
  }, [authReady, user, vaultKey]);

  // Decrypt items in memory whenever encryptedItems or vaultKey changes
  useEffect(() => {
    let active = true;
    if (!vaultKey) {
      setDecryptedItems([]);
      return;
    }

    const runDecrypt = async () => {
      const results: DecryptedVaultItem[] = await Promise.all(
        encryptedItems.map(async ({ id, data }) => {
          const createdAtMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : Date.now();
          const updatedAtMs = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : Date.now();
          try {
            const secret = await decryptVaultSecret(vaultKey, data.iv, data.ciphertext);
            return {
              id,
              ownerId: data.ownerId,
              title: data.title,
              category: data.category,
              domain: data.domain,
              isFavorite: data.isFavorite,
              strengthScore: data.strengthScore,
              hasTotp: data.hasTotp,
              createdAtMs,
              updatedAtMs,
              secret,
            };
          } catch {
            return {
              id,
              ownerId: data.ownerId,
              title: data.title,
              category: data.category,
              domain: data.domain,
              isFavorite: data.isFavorite,
              strengthScore: data.strengthScore,
              hasTotp: data.hasTotp,
              createdAtMs,
              updatedAtMs,
              secret: { username: '', password: '', url: '', notes: '', totpSecret: '' },
              decryptionFailed: true,
            };
          }
        })
      );

      if (active) {
        setDecryptedItems(results);
      }
    };

    void runDecrypt();
    return () => {
      active = false;
    };
  }, [encryptedItems, vaultKey]);

  const handleLockVault = useCallback(() => {
    setVaultKey(null);
    setDecryptedItems([]);
    setEncryptedItems([]);
    setSelectedItemId(null);
    setMobileSheetItemId(null);
    setRevealPassword(false);
    setEditorOpen(false);
  }, []);

  // Auto-lock timer
  useEffect(() => {
    if (!vaultKey || !profile || profile.autoLockMinutes <= 0) return;

    const timeoutMs = profile.autoLockMinutes * 60 * 1000;
    let timerId = window.setTimeout(handleLockVault, timeoutMs);

    const resetTimer = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(handleLockVault, timeoutMs);
    };

    window.addEventListener('pointerdown', resetTimer);
    window.addEventListener('keydown', resetTimer);

    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener('pointerdown', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [vaultKey, profile, handleLockVault]);

  // Keyboard shortcut Cmd/Ctrl + K for search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setActiveView('vault');
        window.setTimeout(() => searchInputRef.current?.focus(), 20);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleCopySecret = useCallback(async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      window.setTimeout(() => setCopiedField(null), 1600);

      if (clipboardTimerRef.current) {
        window.clearInterval(clipboardTimerRef.current);
      }

      let remaining = 25;
      setClipboardNotice({ label, secondsLeft: remaining });

      clipboardTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (clipboardTimerRef.current) {
            window.clearInterval(clipboardTimerRef.current);
            clipboardTimerRef.current = null;
          }
          setClipboardNotice(null);
          void navigator.clipboard.writeText('').catch(() => {});
        } else {
          setClipboardNotice({ label, secondsLeft: remaining });
        }
      }, 1000);
    } catch {
      // Clipboard API unavailable
    }
  }, []);

  const handleClearClipboardNow = useCallback(() => {
    if (clipboardTimerRef.current) {
      window.clearInterval(clipboardTimerRef.current);
      clipboardTimerRef.current = null;
    }
    setClipboardNotice(null);
    void navigator.clipboard.writeText('').catch(() => {});
  }, []);

  const counts = useMemo(() => {
    return {
      all: decryptedItems.length,
      favorites: decryptedItems.filter((i) => i.isFavorite).length,
      login: decryptedItems.filter((i) => i.category === 'login').length,
      banking: decryptedItems.filter((i) => i.category === 'banking').length,
      card: decryptedItems.filter((i) => i.category === 'card').length,
      wifi: decryptedItems.filter((i) => i.category === 'wifi').length,
      note: decryptedItems.filter((i) => i.category === 'note').length,
    };
  }, [decryptedItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return decryptedItems.filter((item) => {
      if (categoryFilter === 'favorites' && !item.isFavorite) return false;
      if (
        categoryFilter !== 'all' &&
        categoryFilter !== 'favorites' &&
        item.category !== categoryFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.domain.toLowerCase().includes(q) ||
        item.secret.username.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    });
  }, [decryptedItems, categoryFilter, searchQuery]);

  // Keep desktop selection valid
  const activeItem = useMemo(() => {
    if (filteredItems.length === 0) return null;
    const found = filteredItems.find((i) => i.id === selectedItemId);
    return found ?? filteredItems[0];
  }, [filteredItems, selectedItemId]);

  const mobileSheetItem = useMemo(() => {
    if (!mobileSheetItemId) return null;
    return decryptedItems.find((i) => i.id === mobileSheetItemId) ?? null;
  }, [decryptedItems, mobileSheetItemId]);

  const handleSaveEntry = async (input: SaveVaultItemInput) => {
    if (!user || !vaultKey) return;
    const savedId = await saveVaultItem(user.uid, vaultKey, input);
    setSelectedItemId(savedId);
    setActiveView('vault');
  };

  const handleImportItems = async (inputs: SaveVaultItemInput[]): Promise<number> => {
    if (!user || !vaultKey) return 0;
    let count = 0;
    for (const input of inputs) {
      await saveVaultItem(user.uid, vaultKey, input);
      count += 1;
    }
    return count;
  };

  const handleDeleteEntry = async (itemId: string) => {
    if (!user) return;
    await deleteVaultItem(user.uid, itemId);
    setConfirmDeleteId(null);
    if (mobileSheetItemId === itemId) setMobileSheetItemId(null);
    if (selectedItemId === itemId) setSelectedItemId(null);
  };

  const handleToggleFavorite = async (item: DecryptedVaultItem) => {
    if (!user) return;
    await toggleFavoriteVaultItem(user.uid, item.id, !item.isFavorite);
  };

  const openNewEntry = (passwordPreset?: string) => {
    setEditingItem(null);
    setPrefilledPassword(passwordPreset);
    setEditorOpen(true);
  };

  const openEditEntry = (item: DecryptedVaultItem) => {
    setEditingItem(item);
    setPrefilledPassword(undefined);
    setMobileSheetItemId(null);
    setEditorOpen(true);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !vaultKey || !profile) {
    return (
      <AuthGate
        user={user}
        profile={profile}
        profileLoading={profileLoading}
        onUnlocked={(key) => setVaultKey(key)}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
      />
    );
  }

  const renderInspectorContent = (item: DecryptedVaultItem, isMobileSheet: boolean) => {
    const meta = CATEGORY_META[item.category];
    const CategoryIcon = meta.icon;
    const safeHref = getSafeExternalHref(item.secret.url);

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-700 dark:text-slate-200">
              <CategoryIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="font-display text-xl font-bold tracking-tight truncate">
                {item.title}
              </h2>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{meta.label}</span>
                {item.domain && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate max-w-[180px]">{item.domain}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>Updated {formatRelativeDate(item.updatedAtMs)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void handleToggleFavorite(item)}
              aria-label={item.isFavorite ? 'Remove favorite' : 'Mark favorite'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Star
                className={`w-5 h-5 ${
                  item.isFavorite
                    ? 'fill-amber-500 text-amber-500'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => openEditEntry(item)}
              aria-label="Edit entry"
              className="min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            {isMobileSheet && (
              <button
                type="button"
                onClick={() => {
                  setMobileSheetItemId(null);
                  setConfirmDeleteId(null);
                }}
                aria-label="Close details"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {item.decryptionFailed && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            This entry could not be decrypted with the current passphrase.
          </div>
        )}

        {/* Credential Fields */}
        <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden">
          {item.secret.username && (
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {item.category === 'wifi'
                    ? 'Network Name (SSID)'
                    : item.category === 'card'
                    ? 'Card Identifier'
                    : 'Username / Email'}
                </span>
                <p className="text-sm font-medium break-all select-all">{item.secret.username}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopySecret(item.secret.username, 'Username')}
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 shrink-0 transition-colors"
              >
                {copiedField === 'Username' ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4 text-slate-500" />
                )}
                <span>{copiedField === 'Username' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          )}

          {item.secret.password && (
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{item.category === 'card' ? 'PIN / CVV' : 'Password'}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      item.strengthScore <= 1
                        ? 'text-red-600 dark:text-red-400 font-medium'
                        : item.strengthScore === 2
                        ? 'text-amber-600 dark:text-amber-400 font-medium'
                        : 'text-emerald-600 dark:text-emerald-400 font-medium'
                    }
                  >
                    {strengthTextLabel(item.strengthScore)}
                  </span>
                </div>
                <p className="font-mono text-sm font-medium break-all select-all">
                  {revealPassword ? item.secret.password : '••••••••••••••••'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setRevealPassword((v) => !v)}
                  aria-label={revealPassword ? 'Hide password' : 'Reveal password'}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                >
                  {revealPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopySecret(item.secret.password, 'Password')}
                  className="min-h-[44px] px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  {copiedField === 'Password' ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  <span>{copiedField === 'Password' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          )}

          {item.secret.url && (
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <span className="block text-xs text-slate-500 dark:text-slate-400">Website URL</span>
                <p className="text-sm text-blue-600 dark:text-blue-400 truncate">
                  {item.secret.url}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleCopySecret(item.secret.url, 'URL')}
                  aria-label="Copy URL"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                >
                  {copiedField === 'URL' ? (
                    <Check className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                {safeHref && (
                  <a
                    href={safeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open login URL in new tab"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Live 2FA Authenticator Code */}
        {item.secret.totpSecret && (
          <TotpCodeCard secret={item.secret.totpSecret} onCopy={handleCopySecret} />
        )}

        {/* Encrypted Notes */}
        {item.secret.notes && (
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
            <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Encrypted Notes
            </span>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed break-words">
              {item.secret.notes}
            </p>
          </div>
        )}

        {/* Delete action with inline confirmation */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            End-to-end encrypted · AES-256-GCM
          </span>

          {confirmDeleteId === item.id ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteEntry(item.id)}
                className="min-h-[40px] px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium"
              >
                Confirm Delete
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteId(item.id)}
              className="min-h-[40px] px-3 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Entry</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const CATEGORY_NAV: Array<{ id: CategoryFilter; label: string; count: number }> = [
    { id: 'all', label: 'All Items', count: counts.all },
    { id: 'favorites', label: 'Favorites', count: counts.favorites },
    { id: 'login', label: 'Logins', count: counts.login },
    { id: 'banking', label: 'Banking', count: counts.banking },
    { id: 'card', label: 'Cards', count: counts.card },
    { id: 'wifi', label: 'Wi-Fi', count: counts.wifi },
    { id: 'note', label: 'Notes', count: counts.note },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar: Strict 3-zone contract on desktop, compact 52px bar on mobile */}
      <header className="sticky top-0 z-30 h-[52px] md:h-14 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveView('vault')}
            className="flex items-center gap-2 font-display text-base sm:text-lg font-bold tracking-tight whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Keystone Vault</span>
          </button>

          {/* Zone 2: 4 single-line nav links (Desktop) */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                { id: 'vault', label: 'Vault' },
                { id: 'generator', label: 'Generator' },
                { id: 'health', label: 'Health' },
                { id: 'sync', label: 'Phone Sync' },
              ] as Array<{ id: AppView; label: string }>
            ).map((nav) => (
              <button
                key={nav.id}
                type="button"
                onClick={() => setActiveView(nav.id)}
                className={`py-1.5 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  activeView === nav.id
                    ? 'border-blue-600 dark:border-blue-400 text-slate-900 dark:text-slate-100'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {nav.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => openNewEntry()}
              className="min-h-[40px] px-3.5 sm:px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>New Entry</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-20 md:pb-0 max-w-[1440px] w-full mx-auto flex flex-col">
        {activeView === 'vault' && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[240px_360px_1fr] min-h-[calc(100vh-56px)]">
            {/* Desktop Left Category Rail */}
            <aside className="hidden lg:flex flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <div className="space-y-1">
                <p className="px-3 pb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Categories
                </p>
                {CATEGORY_NAV.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`w-full min-h-[40px] px-3 rounded-xl flex items-center justify-between text-sm font-medium transition-colors ${
                      categoryFilter === cat.id
                        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate">{cat.label}</span>
                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {cat.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="px-3 py-1">
                  <p className="text-xs font-medium truncate">{user.email}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Synced across devices</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDark((d) => !d)}
                    className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                    <span>{isDark ? 'Light' : 'Dark'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleLockVault}
                    className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Lock</span>
                  </button>
                </div>
              </div>
            </aside>

            {/* Middle List Column (Full width on mobile, 360px on desktop) */}
            <section className="border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 flex flex-col">
              {/* Search & Mobile Quick Controls */}
              <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search logins, banks, notes…"
                      className="w-full min-h-[44px] pl-10 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  {/* Mobile-only theme & lock triggers */}
                  <button
                    type="button"
                    onClick={() => setIsDark((d) => !d)}
                    aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={handleLockVault}
                    aria-label="Lock vault"
                    className="lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    <Lock className="w-4 h-4" />
                  </button>
                </div>

                {/* Mobile horizontal category filter */}
                <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-1">
                  {CATEGORY_NAV.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                        categoryFilter === cat.id
                          ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {cat.label} ({cat.count})
                    </button>
                  ))}
                </div>
              </div>

              {/* Vault Entries List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                {itemsLoading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse"
                      />
                    ))}
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div className="p-8 text-center space-y-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
                      <KeyRound className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">
                        {decryptedItems.length === 0
                          ? 'Your vault is ready'
                          : 'No matching entries'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {decryptedItems.length === 0
                          ? 'Add your first password to sync it securely between your phone and PC.'
                          : 'Try clearing your search or switching category filters.'}
                      </p>
                    </div>
                    {decryptedItems.length === 0 && (
                      <button
                        type="button"
                        onClick={() => openNewEntry()}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add First Password</span>
                      </button>
                    )}
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const meta = CATEGORY_META[item.category];
                    const Icon = meta.icon;
                    const isSelected = activeItem?.id === item.id;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedItemId(item.id);
                          setRevealPassword(false);
                          setConfirmDeleteId(null);
                          if (window.innerWidth < 1024) {
                            setMobileSheetItemId(item.id);
                          }
                        }}
                        className={`w-full min-h-[68px] px-4 py-3 flex items-center justify-between gap-3 text-left transition-colors ${
                          isSelected
                            ? 'lg:bg-blue-50/80 lg:dark:bg-blue-950/30'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold truncate">{item.title}</span>
                              {item.isFavorite && (
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                              <span className="truncate">
                                {item.secret.username || item.domain || meta.label}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="shrink-0">{meta.label}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.hasTotp && (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              2FA
                            </span>
                          )}
                          <ChevronRight className="w-4 h-4 text-slate-400 lg:hidden" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {/* Desktop Right Detail Inspector */}
            <section className="hidden lg:block p-6 xl:p-8 overflow-y-auto bg-slate-50 dark:bg-slate-950">
              {activeItem ? (
                <div className="max-w-2xl">
                  {renderInspectorContent(activeItem, false)}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center p-8">
                  <div className="max-w-sm space-y-2">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Select an entry to inspect credentials
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Or press <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono">⌘K</kbd> to search across your encrypted vault.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {activeView === 'generator' && (
          <PasswordGeneratorView
            onCopy={handleCopySecret}
            onSaveToVault={(pwd) => openNewEntry(pwd)}
          />
        )}

        {activeView === 'health' && (
          <SecurityHealthView items={decryptedItems} onEditItem={openEditEntry} />
        )}

        {activeView === 'sync' && (
          <DeviceSyncView
            userEmail={user.email ?? ''}
            profile={profile}
            items={decryptedItems}
            onCopy={handleCopySecret}
            onUpdateAutoLock={(mins) => updateAutoLockPreference(user.uid, mins)}
            onImportItems={handleImportItems}
            onLockVault={handleLockVault}
            onSignOut={signOutFromAllLayers}
          />
        )}
      </main>

      {/* Mobile Bottom Sheet Inspector */}
      {mobileSheetItem && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-h-[88vh] flex flex-col bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 rounded-t-3xl overflow-hidden">
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 pb-safe">
              {renderInspectorContent(mobileSheetItem, true)}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Fixed Bottom Navigation Bar (Natural Thumb Zone) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-4 h-[58px]">
          {(
            [
              { id: 'vault', label: 'Vault', icon: ShieldCheck },
              { id: 'generator', label: 'Generator', icon: Wand2 },
              { id: 'health', label: 'Health', icon: Activity },
              { id: 'sync', label: 'Phone Sync', icon: Smartphone },
            ] as Array<{
              id: AppView;
              label: string;
              icon: React.ComponentType<{ className?: string }>;
            }>
          ).map((tab) => {
            const TabIcon = tab.icon;
            const active = activeView === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <TabIcon className="w-5 h-5" />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Clipboard Auto-Clear Banner */}
      {clipboardNotice && (
        <div className="fixed bottom-20 md:bottom-5 right-4 z-50 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-3 text-xs font-medium">
          <span className="tabular-nums">
            {clipboardNotice.label} copied · Clears in {clipboardNotice.secondsLeft}s
          </span>
          <button
            type="button"
            onClick={handleClearClipboardNow}
            className="underline hover:opacity-80"
          >
            Clear
          </button>
        </div>
      )}

      {/* Create / Edit Entry Modal / Sheet */}
      <EntryEditorSheet
        open={editorOpen}
        initialItem={editingItem}
        prefilledPassword={prefilledPassword}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveEntry}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <VaultWorkspace />
    </ErrorBoundary>
  );
}
