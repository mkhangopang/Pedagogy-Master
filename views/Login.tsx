import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured, getURL } from '../lib/supabase';
import { GraduationCap, Loader2, Mail, Lock, ArrowRight, ArrowLeft, CheckCircle2, AlertCircle, HelpCircle, Globe } from 'lucide-react';

interface LoginProps {
  onSession: (user: any) => void;
  onBack?: () => void;
}

type AuthView = 'login' | 'signup' | 'forgot-password' | 'signup-success' | 'reset-sent';

const Login: React.FC<LoginProps> = ({ onBack }) => {
  const [view, setView] = useState<AuthView>('login');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ message: string, code?: string } | null>(null);
  const [isVercel, setIsVercel] = useState(false);
  
  const [honeypot, setHoneypot] = useState('');

  useEffect(() => {
    setIsVercel(window.location.hostname.includes('vercel.app'));
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return;

    if (!isSupabaseConfigured()) {
      setError({ message: "Infrastructure handshake pending. Ensure SUPABASE_URL and SUPABASE_ANON_KEY are set correctly in Vercel." });
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      if (view === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) {
           if (authError.message.includes('Email not confirmed')) {
             throw new Error("Verification Pending: Check your inbox or adjust Supabase Auth settings.");
           }
           throw authError;
        }
      } else if (view === 'signup') {
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        const { data, error: authError } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { role: 'teacher', plan: 'free' } }
        });
        if (authError) throw authError;
        if (data.user && !data.session) setView('signup-success');
      } else if (view === 'forgot-password') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
        if (resetError) throw resetError;
        setView('reset-sent');
      }
    } catch (err: any) {
      setError({ message: err.message || "Authentication node failed to respond." });
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!isSupabaseConfigured()) {
      setError({ message: "Infrastructure configuration missing." });
      return;
    }

    setGoogleLoading(true);
    setError(null);
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getURL(),
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error("OAuth Error:", err);
      setError({ 
        message: err.message || "Google authentication failed.",
        code: err.status === 400 ? 'CONFIG_ERROR' : undefined
      });
      setGoogleLoading(false);
    }
  };

  if (view === 'signup-success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 p-10 rounded-3xl shadow-xl text-center border border-slate-100 dark:border-white/5">
          <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Check your email</h2>
          <p className="text-slate-500 mb-8">Verification link sent to <span className="font-semibold text-slate-800 dark:text-slate-200">{email}</span>.</p>
          <button onClick={() => setView('login')} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all">Return to Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          {onBack && (
            <button 
              onClick={onBack}
              className="mb-8 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
            >
              <ArrowLeft size={14} /> Back to Hub
            </button>
          )}
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-200 mb-4">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Pedagogy Master</h1>
          {isVercel && (
             <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-full">
               <Globe size={10} className="text-emerald-600" />
               <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Production Node Linked</span>
             </div>
          )}
          {!isVercel && <p className="text-slate-500 mt-2 font-medium">Elevating education with Neural AI</p>}
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold dark:text-white">{view === 'login' ? 'Sign In' : view === 'signup' ? 'Create Account' : 'Reset Password'}</h2>
            {view !== 'login' && (
              <button onClick={() => setView('login')} className="text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1"><ArrowLeft size={14} /> Back</button>
            )}
          </div>

          <button 
            onClick={handleGoogleLogin}
            disabled={googleLoading || loading}
            className="w-full py-3.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white rounded-xl font-bold text-sm shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
          >
            {googleLoading ? <Loader2 size={18} className="animate-spin" /> : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            Continue with Google
          </button>

          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-100 dark:border-white/5"></div>
            </div>
            <div className="relative flex justify-center text-[10px] font-black uppercase tracking-[0.2em]">
              <span className="bg-white dark:bg-slate-900 px-4 text-slate-400">Institutional Access</span>
            </div>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="hidden" aria-hidden="true">
              <input type="text" value={honeypot} onChange={e => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white text-sm" placeholder="name@school.edu" required />
              </div>
            </div>

            {view !== 'forgot-password' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-sm font-semibold text-slate-600 dark:text-slate-400">Password</label>
                  {view === 'login' && <button type="button" onClick={() => setView('forgot-password')} className="text-[11px] font-bold text-indigo-600 hover:underline">Forgot?</button>}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white text-sm" placeholder="••••••••" required />
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl space-y-2">
                <div className="flex items-start gap-2 text-[11px] font-bold uppercase tracking-tight">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" /> 
                  <span>{error.message}</span>
                </div>
                {error.code === 'CONFIG_ERROR' && (
                  <div className="pt-2 border-t border-rose-100/50 dark:border-rose-900/30 flex items-start gap-2 text-[10px] leading-relaxed">
                    <HelpCircle size={12} className="shrink-0 mt-0.5" />
                    <p><b>Check Keys:</b> Ensure the Client ID and Client Secret are pasted correctly into your Supabase Auth settings. Do not split the Client ID.</p>
                  </div>
                )}
              </div>
            )}

            <button type="submit" disabled={loading || googleLoading} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95">
              {loading ? <Loader2 className="animate-spin w-5 h-5" /> : (
                <>{view === 'login' ? 'Enter Workspace' : view === 'signup' ? 'Get Started' : 'Send Reset Link'}<ArrowRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          {view === 'login' && (
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5 text-center">
              <button onClick={() => setView('signup')} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">New educator? Create account</button>
            </div>
          )}
        </div>

        {!isSupabaseConfigured() && !loading && (
          <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-dashed border-amber-200 dark:border-amber-900/30 flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
             <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 leading-tight">
               Infrastructure Handshake Pending... Ensure NEXT_PUBLIC_SUPABASE_URL is set in Vercel.
             </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;