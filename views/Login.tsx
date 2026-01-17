
import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { GraduationCap, Loader2, Mail, Lock, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';

interface LoginProps {
  onSession: (user: any) => void;
  onBack?: () => void;
}

type AuthView = 'login' | 'signup' | 'forgot-password' | 'signup-success' | 'reset-sent';

const Login: React.FC<LoginProps> = ({ onSession, onBack }) => {
  const [view, setView] = useState<AuthView>('login');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [honeypot, setHoneypot] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;

    if (!isSupabaseConfigured()) {
      setError("Infrastructure node not yet initialized. Please check your environment variables.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (view === 'login') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) {
           if (authError.message.includes('Email not confirmed')) {
             throw new Error("Confirmation Pending: Please check your inbox or disable 'Confirm Email' in Supabase Auth settings.");
           }
           throw authError;
        }
        if (data.user) onSession(data.user);
      } else if (view === 'signup') {
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        const { data, error: authError } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { role: 'teacher', plan: 'free' } }
        });
        if (authError) throw authError;
        if (data.user && !data.session) setView('signup-success');
        else if (data.user) onSession(data.user);
      } else if (view === 'forgot-password') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
        if (resetError) throw resetError;
        setView('reset-sent');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (view === 'signup-success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md bg-white p-10 rounded-3xl shadow-xl text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h2>
          <p className="text-slate-500 mb-8">Verification link sent to <span className="font-semibold text-slate-800">{email}</span>.</p>
          <button onClick={() => setView('login')} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all">Return to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <button 
            onClick={onBack}
            className="mb-8 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Hub
          </button>
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-200 mb-4">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Pedagogy Master</h1>
          <p className="text-slate-500 mt-2">Elevating education with Neural AI</p>
        </div>

        <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">{view === 'login' ? 'Sign In' : view === 'signup' ? 'Create Account' : 'Reset Password'}</h2>
            {view !== 'login' && (
              <button onClick={() => setView('login')} className="text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1"><ArrowLeft size={14} /> Back</button>
            )}
          </div>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="hidden" aria-hidden="true">
              <input type="text" value={honeypot} onChange={e => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-600 ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-900" placeholder="name@school.edu" required />
              </div>
            </div>

            {view !== 'forgot-password' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-sm font-semibold text-slate-600">Password</label>
                  {view === 'login' && <button type="button" onClick={() => setView('forgot-password')} className="text-[11px] font-bold text-indigo-600 hover:underline">Forgot?</button>}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-slate-900" placeholder="••••••••" required />
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-[11px] font-bold rounded-xl flex items-start gap-2">
                <AlertCircle size={14} className="shrink-0 mt-0.5" /> 
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (
                <>{view === 'login' ? 'Enter Workspace' : view === 'signup' ? 'Get Started' : 'Send Reset Link'}<ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          {view === 'login' && (
            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <button onClick={() => setView('signup')} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">New educator? Create account</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
