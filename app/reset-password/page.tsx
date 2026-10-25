'use client';

import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Login from '../../views/Login';
import { Loader2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    }>
      <Login 
        initialMode="update-password" 
        onSession={() => {
          router.push('/');
        }} 
        onBack={() => {
          router.push('/');
        }} 
      />
    </Suspense>
  );
}
