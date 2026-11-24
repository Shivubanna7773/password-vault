import React, { useEffect, useState } from 'react';
import { Check, Copy, Plus, RefreshCw } from 'lucide-react';
import {
  evaluatePasswordStrength,
  generateMemorablePassphrase,
  generateStrongPassword,
} from '../lib/crypto';

interface PasswordGeneratorViewProps {
  onCopy: (value: string, label: string) => void;
  onSaveToVault: (password: string) => void;
}

export const PasswordGeneratorView: React.FC<PasswordGeneratorViewProps> = ({
  onCopy,
  onSaveToVault,
}) => {
  const [mode, setMode] = useState<'random' | 'passphrase'>('random');
  const [length, setLength] = useState(18);
  const [wordCount, setWordCount] = useState(4);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(true);
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  const regenerate = () => {
    if (mode === 'random') {
      setOutput(
        generateStrongPassword({
          length,
          uppercase,
          lowercase,
          numbers,
          symbols,
          excludeAmbiguous,
        })
      );
    } else {
      setOutput(generateMemorablePassphrase(wordCount));
    }
  };

  useEffect(() => {
    regenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, length, wordCount, uppercase, lowercase, numbers, symbols, excludeAmbiguous]);

  const strength = evaluatePasswordStrength(output);

  const handleCopy = () => {
    onCopy(output, 'Generated password');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const strengthColor =
    strength.score <= 1
      ? 'text-red-600 dark:text-red-400'
      : strength.score === 2
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">Password Generator</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Cryptographically random credentials generated locally in your browser.
        </p>
      </div>

      {/* Mode Switch */}
      <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setMode('random')}
          className={`min-h-[40px] px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            mode === 'random'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          Random Characters
        </button>
        <button
          type="button"
          onClick={() => setMode('passphrase')}
          className={`min-h-[40px] px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            mode === 'passphrase'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          Memorable Passphrase
        </button>
      </div>

      {/* Generated Output Surface */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <p className="font-mono text-lg sm:text-xl font-medium tracking-wide break-all select-all text-slate-900 dark:text-slate-100">
            {output}
          </p>
          <button
            type="button"
            onClick={regenerate}
            aria-label="Generate new password"
            className="min-h-[44px] min-w-[44px] shrink-0 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${strengthColor}`}>{strength.label}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{strength.entropyBits} bits entropy</span>
            <span aria-hidden="true">·</span>
            <span>Crack time: {strength.crackTime}</span>
          </div>
          <span className="tabular-nums font-mono">{output.length} chars</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[46px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy Password'}</span>
          </button>
          <button
            type="button"
            onClick={() => onSaveToVault(output)}
            className="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Save to Vault</span>
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
        {mode === 'random' ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <label htmlFor="gen-length" className="font-medium">
                  Length
                </label>
                <span className="font-mono font-semibold tabular-nums">{length} characters</span>
              </div>
              <input
                id="gen-length"
                type="range"
                min={8}
                max={64}
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              {[
                { label: 'Uppercase (A–Z)', checked: uppercase, set: setUppercase },
                { label: 'Lowercase (a–z)', checked: lowercase, set: setLowercase },
                { label: 'Numbers (0–9)', checked: numbers, set: setNumbers },
                { label: 'Symbols (!@#$%)', checked: symbols, set: setSymbols },
                {
                  label: 'Avoid ambiguous (0, O, l, 1)',
                  checked: excludeAmbiguous,
                  set: setExcludeAmbiguous,
                },
              ].map((opt) => (
                <label
                  key={opt.label}
                  className="min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer select-none"
                >
                  <span className="text-sm">{opt.label}</span>
                  <input
                    type="checkbox"
                    checked={opt.checked}
                    onChange={(e) => opt.set(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded"
                  />
                </label>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <label htmlFor="gen-words" className="font-medium">
                Word Count
              </label>
              <span className="font-mono font-semibold tabular-nums">{wordCount} words</span>
            </div>
            <input
              id="gen-words"
              type="range"
              min={3}
              max={8}
              value={wordCount}
              onChange={(e) => setWordCount(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
          </div>
        )}
      </div>
    </div>
  );
};
