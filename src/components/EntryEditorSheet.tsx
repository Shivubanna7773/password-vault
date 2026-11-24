import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, RefreshCw, Star, X } from 'lucide-react';
import { evaluatePasswordStrength, generateStrongPassword } from '../lib/crypto';
import {
  VAULT_LIMITS,
  type DecryptedVaultItem,
  type VaultCategory,
} from '../types/vault';
import type { SaveVaultItemInput } from '../lib/vaultService';

interface EntryEditorSheetProps {
  open: boolean;
  initialItem: DecryptedVaultItem | null;
  prefilledPassword?: string;
  onClose: () => void;
  onSave: (input: SaveVaultItemInput) => Promise<void>;
}

const CATEGORIES: Array<{ value: VaultCategory; label: string }> = [
  { value: 'login', label: 'Login' },
  { value: 'banking', label: 'Banking' },
  { value: 'card', label: 'Card' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'note', label: 'Note' },
];

export const EntryEditorSheet: React.FC<EntryEditorSheetProps> = ({
  open,
  initialItem,
  prefilledPassword,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<VaultCategory>('login');
  const [domain, setDomain] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [notes, setNotes] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setShowPassword(false);

    if (initialItem) {
      setTitle(initialItem.title);
      setCategory(initialItem.category);
      setDomain(initialItem.domain);
      setUsername(initialItem.secret.username);
      setPassword(initialItem.secret.password);
      setUrl(initialItem.secret.url);
      setTotpSecret(initialItem.secret.totpSecret);
      setNotes(initialItem.secret.notes);
      setIsFavorite(initialItem.isFavorite);
    } else {
      setTitle('');
      setCategory('login');
      setDomain('');
      setUsername('');
      setPassword(prefilledPassword ?? '');
      setUrl('');
      setTotpSecret('');
      setNotes('');
      setIsFavorite(false);
    }
  }, [open, initialItem, prefilledPassword]);

  if (!open) return null;

  const strength = evaluatePasswordStrength(password);

  const handleGenerateInline = () => {
    const generated = generateStrongPassword({
      length: 18,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
      excludeAmbiguous: true,
    });
    setPassword(generated);
    setShowPassword(true);
  };

  const handleUrlBlur = () => {
    if (!domain && url.trim()) {
      try {
        const normalized = url.startsWith('http') ? url : `https://${url}`;
        const host = new URL(normalized).hostname.replace(/^www\./, '');
        setDomain(host.slice(0, VAULT_LIMITS.DOMAIN_MAX));
      } catch {
        // ignore invalid URL
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please give this entry a name (e.g. Gmail, HDFC Bank).');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: initialItem?.id,
        title: title.trim().slice(0, VAULT_LIMITS.TITLE_MAX),
        category,
        domain: domain.trim().slice(0, VAULT_LIMITS.DOMAIN_MAX),
        isFavorite,
        strengthScore: strength.score,
        secret: {
          username: username.trim(),
          password,
          url: url.trim(),
          notes: notes.trim(),
          totpSecret: totpSecret.trim().replace(/\s+/g, '').toUpperCase(),
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const strengthBarColor =
    strength.score <= 1
      ? 'bg-red-600'
      : strength.score === 2
      ? 'bg-amber-600'
      : 'bg-emerald-600';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="entry-editor-title"
    >
      <div className="w-full sm:max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl overflow-hidden">
        {/* Mobile grab handle */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <h2 id="entry-editor-title" className="font-display text-lg font-semibold">
            {initialItem ? 'Edit Vault Entry' : 'New Vault Entry'}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsFavorite((v) => !v)}
              aria-label={isFavorite ? 'Remove from favorites' : 'Pin to favorites'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Star
                className={`w-5 h-5 ${
                  isFavorite
                    ? 'fill-amber-500 text-amber-500'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close editor"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Category Segmented Control */}
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Category
            </span>
            <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setCategory(cat.value)}
                  className={`min-h-[38px] px-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    category === cat.value
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="entry-title" className="block text-sm font-medium">
                Entry Title
              </label>
              <input
                id="entry-title"
                type="text"
                required
                maxLength={VAULT_LIMITS.TITLE_MAX}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Google Account, HDFC NetBanking"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="entry-domain" className="block text-sm font-medium">
                Website / App Label
              </label>
              <input
                id="entry-domain"
                type="text"
                maxLength={VAULT_LIMITS.DOMAIN_MAX}
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g. google.com"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="entry-username" className="block text-sm font-medium">
              {category === 'wifi'
                ? 'Network Name (SSID)'
                : category === 'card'
                ? 'Card Number / Holder'
                : 'Username, Email, or Customer ID'}
            </label>
            <input
              id="entry-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={
                category === 'wifi'
                  ? 'Home_5G'
                  : category === 'card'
                  ? '4532 •••• •••• 1234'
                  : 'name@example.com'
              }
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="entry-password" className="block text-sm font-medium">
                {category === 'card' ? 'PIN / CVV' : 'Password or Secret Key'}
              </label>
              <button
                type="button"
                onClick={handleGenerateInline}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline py-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Generate Strong Password
              </button>
            </div>
            <div className="relative">
              <input
                id="entry-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter secret password"
                className="w-full min-h-[44px] pl-3.5 pr-12 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="pt-1 space-y-1">
                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${strengthBarColor}`}
                    style={{ width: `${Math.max(15, (strength.score + 1) * 20)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{strength.label}</span>
                  <span className="tabular-nums">Est. crack time: {strength.crackTime}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="entry-url" className="block text-sm font-medium">
                Login URL (Optional)
              </label>
              <input
                id="entry-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={handleUrlBlur}
                placeholder="https://accounts.google.com"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="entry-totp" className="block text-sm font-medium">
                2FA Secret Key (Base32, Optional)
              </label>
              <input
                id="entry-totp"
                type="text"
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                placeholder="JBSWY3DPEHPK3PXP"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="entry-notes" className="block text-sm font-medium">
              Encrypted Notes
            </label>
            <textarea
              id="entry-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Recovery codes, security questions, expiry date, or billing details…"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 resize-y"
            />
          </div>

          <div className="pt-2 pb-safe flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
            >
              {saving ? 'Encrypting & Saving…' : initialItem ? 'Save Changes' : 'Save to Vault'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
