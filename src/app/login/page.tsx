import React, { Suspense } from 'react';
import { LoginForm } from '@/components/auth';
import { Loader2 } from 'lucide-react';

export const metadata = {
  title: 'Sign In / Register - POI Studio',
  description: 'Frictionless sign-in for POI Studio Collaborative Trip Planner',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200/80 p-8 flex flex-col items-center justify-center min-h-[360px]">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="mt-4 text-sm text-slate-500">Loading sign-in form...</p>
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
