import React, { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Check,
  Copy,
  Download,
  Laptop,
  Lock,
  LogOut,
  Smartphone,
  Upload,
} from 'lucide-react';
import type { DecryptedVaultItem, VaultCategory, VaultProfileDoc } from '../types/vault';
import type { SaveVaultItemInput } from '../lib/vaultService';
import { evaluatePasswordStrength } from '../lib/crypto';

interface DeviceSyncViewProps {
  userEmail: string;
  profile: VaultProfileDoc;
  items: DecryptedVaultItem[];
  onCopy: (value: string, label: string) => void;
  onUpdateAutoLock: (minutes: number) => Promise<void>;
  onImportItems: (inputs: SaveVaultItemInput[]) => Promise<number>;
  onLockVault: () => void;
  onSignOut: () => Promise<void>;
}

const AUTO_LOCK_OPTIONS = [
  { label: '1 minute', value: 1 },
  { label: '5 minutes', value: 5 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: 'Manual lock only', value: 0 },
];

export const DeviceSyncView: React.FC<DeviceSyncViewProps> = ({
  userEmail,
  profile,
  items,
  onCopy,
  onUpdateAutoLock,
  onImportItems,
  onLockVault,
  onSignOut,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [savingAutoLock, setSavingAutoLock] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vaultUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleCopyUrl = () => {
    onCopy(vaultUrl, 'Vault URL');
    setCopiedLink(true);
    window.setTimeout(() => setCopiedLink(false), 1800);
  };

  const handleExportJson = () => {
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      app: 'Keystone Vault',
      entries: items.map((item) => ({
        title: item.title,
        category: item.category,
        domain: item.domain,
        isFavorite: item.isFavorite,
        username: item.secret.username,
        password: item.secret.password,
        url: item.secret.url,
        totpSecret: item.secret.totpSecret,
        notes: item.secret.notes,
      })),
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keystone-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { entries?: Array<Record<string, unknown>> };
      const rawList = Array.isArray(parsed)
        ? (parsed as Array<Record<string, unknown>>)
        : Array.isArray(parsed.entries)
        ? parsed.entries
        : [];

      const validCategories: VaultCategory[] = ['login', 'banking', 'wifi', 'note', 'card'];
      const inputs: SaveVaultItemInput[] = rawList
        .filter((row) => typeof row.title === 'string' && row.title.trim().length > 0)
        .map((row) => {
          const password = typeof row.password === 'string' ? row.password : '';
          const rawCat = typeof row.category === 'string' ? row.category : 'login';
          const category = validCategories.includes(rawCat as VaultCategory)
            ? (rawCat as VaultCategory)
            : 'login';

          return {
            title: String(row.title).trim(),
            category,
            domain: typeof row.domain === 'string' ? row.domain : '',
            isFavorite: Boolean(row.isFavorite),
            strengthScore: evaluatePasswordStrength(password).score,
            secret: {
              username: typeof row.username === 'string' ? row.username : '',
              password,
              url: typeof row.url === 'string' ? row.url : '',
              notes: typeof row.notes === 'string' ? row.notes : '',
              totpSecret: typeof row.totpSecret === 'string' ? row.totpSecret : '',
            },
          };
        });

      if (inputs.length === 0) {
        setImportStatus('No valid vault entries found in that JSON file.');
        return;
      }

      const count = await onImportItems(inputs);
      setImportStatus(`Encrypted and imported ${count} entries into your vault.`);
    } catch {
      setImportStatus('Could not parse JSON backup file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAutoLockChange = async (minutes: number) => {
    setSavingAutoLock(true);
    try {
      await onUpdateAutoLock(minutes);
    } finally {
      setSavingAutoLock(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          Phone & PC Access
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Your vault syncs automatically across any phone or computer signed into{' '}
          <span className="font-medium text-slate-900 dark:text-slate-200">{userEmail}</span>.
        </p>
      </div>

      {/* QR Code Phone/PC Handoff */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-5 flex flex-col items-center justify-center p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="p-3 bg-white rounded-xl">
              <QRCodeSVG value={vaultUrl} size={168} level="M" />
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 text-center">
              Scan with your phone camera to open immediately
            </p>
          </div>

          <div className="md:col-span-7 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Open on Another Device</span>
            </div>

            <ol className="space-y-2.5 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex gap-2.5">
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-200 mt-0.5">
                  01.
                </span>
                <span>Scan the QR code on your phone or open the link below on your PC.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-200 mt-0.5">
                  02.
                </span>
                <span>Sign in with Google using {userEmail}.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-200 mt-0.5">
                  03.
                </span>
                <span>
                  Enter your Master Passphrase—all {items.length} encrypted entries appear immediately.
                </span>
              </li>
            </ol>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <div className="flex-1 min-w-[200px] px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-700 dark:text-slate-300 truncate">
                {vaultUrl}
              </div>
              <button
                type="button"
                onClick={handleCopyUrl}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Security & Backup Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold">Auto-Lock Timer</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Automatically clears the decrypted key from memory when idle.
            </p>
          </div>
          <div className="space-y-2">
            <label htmlFor="autolock-select" className="sr-only">
              Auto-Lock Timer
            </label>
            <select
              id="autolock-select"
              disabled={savingAutoLock}
              value={profile.autoLockMinutes}
              onChange={(e) => void handleAutoLockChange(Number(e.target.value))}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {AUTO_LOCK_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="pt-2 flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onLockVault}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-2 transition-colors"
            >
              <Lock className="w-4 h-4" />
              <span>Lock Vault Now</span>
            </button>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-sm font-medium inline-flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold">Portable Backup</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Export a JSON backup of your entries or import credentials from another export.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleExportJson}
              disabled={items.length === 0}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-sm font-medium inline-flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export JSON</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>Import JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => void handleImportFile(e)}
              className="hidden"
            />
          </div>

          {importStatus && (
            <p className="text-xs text-slate-600 dark:text-slate-300">{importStatus}</p>
          )}

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Laptop className="w-3.5 h-3.5 shrink-0" />
            <span>Keep exported JSON files in a secure offline folder.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
