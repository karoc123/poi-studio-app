'use client';

import React, { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui';
import {
  Sparkles,
  Lock,
  Unlock,
  ArrowRight,
  Eye,
  EyeOff,
  UserCheck,
  AlertCircle,
} from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setErrorMessage('Please enter a username');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmedUsername,
          password: password ? password : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.code === 'PASSWORD_REQUIRED') {
          setShowPasswordField(true);
          setErrorMessage('This account is password-protected. Please enter your password.');
          setTimeout(() => {
            passwordInputRef.current?.focus();
          }, 50);
          setIsLoading(false);
          return;
        }

        throw new Error(data.error || 'Failed to sign in');
      }

      if (data.isNewUser) {
        setSuccessNotice(`Welcome to POI Studio, ${data.user.username}! Account created.`);
      } else {
        setSuccessNotice(`Welcome back, ${data.user.username}!`);
      }

      // Smooth redirect
      const destination = redirectParam && redirectParam.startsWith('/')
        ? redirectParam
        : '/';

      setTimeout(() => {
        router.push(destination);
        router.refresh();
      }, 400);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred during login');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-100 mb-4">
          <Sparkles className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Welcome to POI Studio
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Collaborative trip planner with interactive maps & routes
        </p>
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500 mt-0.5" />
          <div>{errorMessage}</div>
        </div>
      )}

      {successNotice && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-start gap-3">
          <UserCheck className="w-5 h-5 flex-shrink-0 text-emerald-500 mt-0.5" />
          <div>{successNotice}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Username Field */}
        <div>
          <label
            htmlFor="username"
            className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            required
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. wanderer42"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
          />
        </div>

        {/* Optional Password Toggle / Field */}
        <div>
          {!showPasswordField ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordField(true);
                  setTimeout(() => passwordInputRef.current?.focus(), 50);
                }}
                className="text-xs text-indigo-600 hover:text-indigo-700 font-medium inline-flex items-center gap-1 hover:underline focus:outline-none"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Add optional password</span>
              </button>
            </div>
          ) : (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordField(false);
                    setPassword('');
                  }}
                  className="text-xs text-slate-400 hover:text-slate-600 font-medium"
                >
                  Clear password
                </button>
              </div>

              <div className="relative">
                <input
                  id="password"
                  ref={passwordInputRef}
                  type={showPasswordText ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (optional for new accounts)"
                  className="w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-300 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswordText(!showPasswordText)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  aria-label={showPasswordText ? 'Hide password' : 'Show password'}
                >
                  {showPasswordText ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isLoading}
            className="w-full"
            icon={<ArrowRight className="w-4 h-4" />}
          >
            {showPasswordField && password ? 'Sign In / Register' : 'Continue'}
          </Button>
        </div>
      </form>

      {/* Info notice about frictionless auth */}
      <div className="mt-8 pt-6 border-t border-slate-100 text-xs text-slate-500 space-y-2">
        <div className="flex items-start gap-2">
          <Unlock className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Frictionless access:</strong> If your username is new, an account will be created immediately. Passwords are fully optional.
          </span>
        </div>
      </div>
    </div>
  );
}
