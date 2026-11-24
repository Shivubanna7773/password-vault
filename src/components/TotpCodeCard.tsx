import React, { useEffect, useState } from 'react';
import { Check, Copy, ShieldCheck } from 'lucide-react';
import { computeTotpCode } from '../lib/crypto';

interface TotpCodeCardProps {
  secret: string;
  onCopy: (value: string, label: string) => void;
}

export const TotpCodeCard: React.FC<TotpCodeCardProps> = ({ secret, onCopy }) => {
  const [code, setCode] = useState<string>('------');
  const [remaining, setRemaining] = useState<number>(30);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const res = await computeTotpCode(secret);
      if (!active) return;
      if (res) {
        setCode(res.code);
        setRemaining(res.remainingSeconds);
      } else {
        setCode('INVALID');
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 1000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [secret]);

  const formattedCode =
    code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3, 6)}` : code;
  const progress = Math.max(0, Math.min(1, remaining / 30));
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const handleCopy = () => {
    if (code.length !== 6) return;
    onCopy(code, '2FA code');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-4">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>2FA Authenticator Code</span>
        </div>
        <div className="font-mono text-2xl font-semibold tracking-wider text-slate-900 dark:text-slate-100 tabular-nums">
          {formattedCode}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5" title={`Refreshes in ${remaining}s`}>
          <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32" aria-hidden="true">
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-slate-200 dark:text-slate-800"
            />
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className={remaining <= 5 ? 'text-amber-600' : 'text-blue-600 dark:text-blue-400'}
            />
          </svg>
          <span className="font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums w-6 text-right">
            {remaining}s
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          disabled={code.length !== 6}
          className="min-h-[44px] min-w-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
};
