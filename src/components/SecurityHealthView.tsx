import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle2, Clock, CopyCheck, KeyRound, ShieldAlert } from 'lucide-react';
import type { DecryptedVaultItem } from '../types/vault';

interface SecurityHealthViewProps {
  items: DecryptedVaultItem[];
  onEditItem: (item: DecryptedVaultItem) => void;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export const SecurityHealthView: React.FC<SecurityHealthViewProps> = ({
  items,
  onEditItem,
}) => {
  const analysis = useMemo(() => {
    const now = Date.now();
    const passwordCounts = new Map<string, number>();

    for (const item of items) {
      const pwd = item.secret.password;
      if (pwd && pwd.length > 0 && item.category !== 'note') {
        passwordCounts.set(pwd, (passwordCounts.get(pwd) ?? 0) + 1);
      }
    }

    const weakItems: DecryptedVaultItem[] = [];
    const reusedItems: DecryptedVaultItem[] = [];
    const agingItems: DecryptedVaultItem[] = [];
    let totpEnabledCount = 0;

    for (const item of items) {
      if (item.hasTotp) totpEnabledCount += 1;

      const pwd = item.secret.password;
      if (pwd && item.category !== 'note') {
        if (item.strengthScore <= 1) {
          weakItems.push(item);
        }
        if ((passwordCounts.get(pwd) ?? 0) > 1) {
          reusedItems.push(item);
        }
      }

      if (item.updatedAtMs > 0 && now - item.updatedAtMs > NINETY_DAYS_MS) {
        agingItems.push(item);
      }
    }

    return {
      weakItems,
      reusedItems,
      agingItems,
      totpEnabledCount,
    };
  }, [items]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Vault Health Audit</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Analyzed locally on your device after decryption—your credentials never leave memory unencrypted.
        </p>
      </div>

      {/* 4-column summary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5 text-red-600 dark:text-red-400 shrink-0" />
            <span>Weak Passwords</span>
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums">
            {analysis.weakItems.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <CopyCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Reused Passwords</span>
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums">
            {analysis.reusedItems.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span>Older than 90d</span>
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums">
            {analysis.agingItems.length}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <KeyRound className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>2FA Protected</span>
          </div>
          <div className="font-mono text-2xl font-bold tabular-nums">
            {analysis.totpEnabledCount}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-medium">No vault entries to audit yet.</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Add your first password to start monitoring strength and reuse.
          </p>
        </div>
      ) : analysis.weakItems.length === 0 && analysis.reusedItems.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">All checked passwords look strong and unique</h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              None of your saved entries use weak or duplicated passwords.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {analysis.weakItems.length > 0 && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <h2 className="text-sm font-semibold">Weak Passwords ({analysis.weakItems.length})</h2>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Recommended: Rotate</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {analysis.weakItems.map((item) => (
                  <div
                    key={item.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {item.secret.username || item.domain || item.category}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditItem(item)}
                      className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
                    >
                      Update Password
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {analysis.reusedItems.length > 0 && (
            <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CopyCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <h2 className="text-sm font-semibold">
                    Reused Passwords ({analysis.reusedItems.length})
                  </h2>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">Use unique passwords</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {analysis.reusedItems.map((item) => (
                  <div
                    key={item.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {item.secret.username || item.domain || item.category}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onEditItem(item)}
                      className="min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
                    >
                      Make Unique
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
