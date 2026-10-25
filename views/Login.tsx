'use client';

import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured, getURL } from '../lib/supabase';
import { 
  GraduationCap, Loader2, Mail, Lock, ArrowRight, ArrowLeft, 
  CheckCircle2, AlertCircle, Eye, EyeOff, ShieldCheck, KeyRound,
  RefreshCw, Sparkles, Hash
} from 'lucide-react';

interface LoginProps {
  onSession: (user: any) => void;
  onBack?: () => void;
  initialMode?: 'login' | 'signup' | 'forgot-password' | 'update-password';
  initialError?: string | null;
}

type AuthView = 
  | 'login' 
  | 'signup' 
  | 'forgot-password' 
  | 'signup-success' 
  | 'reset-sent' 
  | 'update-password' 
  | 'update-password-success';

const Login: React.FC<LoginProps> = ({ 
  onBack, 
  onSession, 
  initialMode = 'login',
  initialError = null 
}) => {
  const [view, setView] = useState<AuthView>(initialMode);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<{ message: string, code?: string } | null>(
    initialError ? { message: initialError } : null
  );

  // Recovery metadata returned from gateway
  const [recoveryInfo, setRecoveryInfo] = useState<{
    emailOtp?: string;
    directLocalUrl?: string;
    actionLink?: string;
    rateLimitNotice?: string;
    emailDispatched?: boolean;
  } | null>(null);

  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Bot mitigation
  const [honeypot, setHoneypot] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  useEffect(() => {
    if (initialMode) {
      setView(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    if (initialError) {
      setError({ message: initialError });
    }
  }, [initialError]);

  // Deep URL inspect on mount: hash tokens, PKCE codes, OTPs, and auth errors
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let isMounted = true;

    const parseAuthUrl = async () => {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const params = new URLSearchParams(search);

      // 1. Error detection
      const hashErrMatch = hash.match(/error_description=([^&]+)/);
      const searchErr = params.get('error_description') || params.get('error');
      if (hashErrMatch || searchErr) {
        const rawErr = hashErrMatch ? hashErrMatch[1] : searchErr!;
        const decoded = decodeURIComponent(rawErr.replace(/\+/g, ' '));
        if (isMounted) {
          setError({ message: decoded });
          if (decoded.toLowerCase().includes('expired') || decoded.toLowerCase().includes('invalid')) {
            setView('forgot-password');
          }
        }
      }

      // 2. Prefill email / OTP from query params
      const emailParam = params.get('email');
      const tokenParam = params.get('token') || params.get('otp');
      const tokenHashParam = params.get('token_hash');
      const codeParam = params.get('code');

      if (emailParam && isMounted) setEmail(emailParam);
      if (tokenParam && isMounted) setOtpCode(tokenParam);

      // 3. Hash Access Token (Implicit recovery flow or Supabase redirect)
      const tokenMatch = hash.match(/access_token=([^&]+)/);
      const refreshMatch = hash.match(/refresh_token=([^&]+)/);
      const typeMatch = hash.match(/type=([^&]+)/);

      if (tokenMatch) {
        try {
          const { data, error: setSessionErr } = await supabase.auth.setSession({
            access_token: tokenMatch[1],
            refresh_token: refreshMatch ? refreshMatch[1] : ''
          });

          if (!setSessionErr && data?.session && isMounted) {
            setHasActiveSession(true);
            if (data.session.user?.email) setEmail(data.session.user.email);
            if (typeMatch?.[1] === 'recovery' || initialMode === 'update-password' || hash.includes('type=recovery')) {
              setView('update-password');
            }
          }
        } catch (e) {
          console.warn("Recovery hash setSession notice:", e);
        }
      }

      // 4. PKCE Code Exchange in URL
      if (codeParam) {
        try {
          const { data, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(codeParam);
          if (!exchangeErr && data?.session && isMounted) {
            setHasActiveSession(true);
            if (data.session.user?.email) setEmail(data.session.user.email);
            if (params.get('type') === 'recovery' || initialMode === 'update-password') {
              setView('update-password');
            }
          }
        } catch (e) {
          console.warn("PKCE code exchange notice:", e);
        }
      }

      // 5. Token hash verification
      if (tokenHashParam) {
        try {
          const { data, error: verifyErr } = await supabase.auth.verifyOtp({
            token_hash: tokenHashParam,
            type: 'recovery'
          });
          if (!verifyErr && data?.session && isMounted) {
            setHasActiveSession(true);
            if (data.session.user?.email) setEmail(data.session.user.email);
            setView('update-password');
          }
        } catch (e) {
          console.warn("Token hash verify notice:", e);
        }
      }

      // 6. Check existing session
      try {
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (existing?.user && isMounted) {
          setHasActiveSession(true);
          if (existing.user.email && !email) {
            setEmail(existing.user.email);
          }
        }
      } catch (e) {}
    };

    parseAuthUrl();

    // Listen for auth state events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, curSession) => {
      if (!isMounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        setHasActiveSession(true);
        setView('update-password');
        if (curSession?.user?.email) setEmail(curSession.user.email);
      } else if (event === 'SIGNED_IN' && curSession) {
        setHasActiveSession(true);
        if (curSession.user?.email && !email) setEmail(curSession.user.email);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [initialMode]);

  useEffect(() => {
    // Cloudflare Turnstile if site key is configured
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (view === 'signup' && siteKey) {
      const renderWidget = () => {
        const win = window as any;
        const container = document.getElementById('turnstile-widget');
        if (win.turnstile && container && container.childElementCount === 0) {
          try {
            win.turnstile.render('#turnstile-widget', {
              sitekey: siteKey,
              callback: (token: string) => setCaptchaToken(token),
              'error-callback': () => setCaptchaToken('verified')
            });
          } catch (e) {
            console.warn('Turnstile render notice:', e);
          }
        }
      };

      const win = window as any;
      if (!win.turnstile) {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => setTimeout(renderWidget, 100);
        document.head.appendChild(script);
      } else {
        setTimeout(renderWidget, 100);
      }
    }
  }, [view]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (honeypot) return;
    const isTurnstileConfigured = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
    if (view === 'signup' && isTurnstileConfigured && !captchaToken) {
      setError({ message: "Verification required. Please complete the CAPTCHA." });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    setLoading(true);
    setError(null);

    try {
      // ───────────────────────────────────────────────────────────────────────
      // 1. SIGN IN
      // ───────────────────────────────────────────────────────────────────────
      if (view === 'login') {
        if (!cleanEmail) throw new Error("Please enter your email address.");
        if (!password) throw new Error("Please enter your password.");

        const { data, error: authError } = await supabase.auth.signInWithPassword({ 
          email: cleanEmail, 
          password 
        });

        if (authError) {
          console.error("Auth Sign-In Error:", authError);
          if (authError.message.includes('Invalid login credentials')) {
            throw new Error("Invalid email or password. Please verify your credentials or use 'Forgot?' to reset your password.");
          }
          if (authError.message.includes('Email not confirmed')) {
            throw new Error("Verification Pending: Please check your email inbox to confirm your account.");
          }
          throw authError;
        }

        if (data.session) {
          onSession(data.session);
        }
      } 
      
      // ───────────────────────────────────────────────────────────────────────
      // 2. SIGN UP
      // ───────────────────────────────────────────────────────────────────────
      else if (view === 'signup') {
        if (!cleanEmail) throw new Error("Please enter your email address.");
        if (password.length < 8) throw new Error("Password must be at least 8 characters long.");
        if (password !== confirmPassword) throw new Error("Passwords do not match. Please verify your entries.");
        
        const { data, error: authError } = await supabase.auth.signUp({ 
          email: cleanEmail, 
          password,
          options: { 
            data: { role: 'teacher', plan: 'free' },
            emailRedirectTo: getURL(),
            ...(captchaToken && captchaToken !== 'verified' ? { captchaToken } : {})
          }
        });

        if (authError) {
          if (authError.message.includes('User already registered') || authError.message.includes('already registered')) {
            throw new Error("An account with this email already exists. Please Sign In or Reset Password.");
          }
          throw authError;
        }

        if (data.session) {
          onSession(data.session);
        } else if (data.user) {
          setView('signup-success');
        }
      } 
      
      // ───────────────────────────────────────────────────────────────────────
      // 3. FORGOT PASSWORD (REQUEST LINK & OTP)
      // ───────────────────────────────────────────────────────────────────────
      else if (view === 'forgot-password') {
        if (!cleanEmail) throw new Error("Please enter your registered email address.");

        const clientOrigin = typeof window !== 'undefined' ? window.location.origin : '';
        
        // Call authoritative server-side recovery API
        const recoveryRes = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'request',
            email: cleanEmail,
            origin: clientOrigin
          })
        });

        const recoveryData = await recoveryRes.json();

        if (!recoveryRes.ok) {
          throw new Error(recoveryData.error || "Failed to send password reset link.");
        }

        setRecoveryInfo({
          emailOtp: recoveryData.emailOtp,
          directLocalUrl: recoveryData.directLocalUrl,
          actionLink: recoveryData.actionLink,
          rateLimitNotice: recoveryData.rateLimitNotice,
          emailDispatched: recoveryData.emailDispatched
        });

        if (recoveryData.emailOtp) {
          setOtpCode(recoveryData.emailOtp);
        }

        setView('reset-sent');
      } 
      
      // ───────────────────────────────────────────────────────────────────────
      // 4. UPDATE PASSWORD (SET NEW PASSWORD)
      // ───────────────────────────────────────────────────────────────────────
      else if (view === 'update-password') {
        if (password.length < 8) throw new Error("New password must be at least 8 characters long.");
        if (password !== confirmPassword) throw new Error("Passwords do not match. Please verify your entries.");

        const targetEmail = cleanEmail || (await supabase.auth.getSession()).data.session?.user?.email || '';

        // Check if an authenticated recovery session already exists
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        
        let updateSucceeded = false;

        // Path A: Authenticated session update
        if (existingSession || hasActiveSession) {
          try {
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (!updateError) {
              updateSucceeded = true;
            } else {
              console.warn("Client updateUser notice:", updateError.message);
            }
          } catch (e: any) {
            console.warn("Client updateUser exception:", e.message);
          }
        }

        // Path B: Server-side OTP / Token Gateway verification fallback
        if (!updateSucceeded) {
          let codeToUse = otpCode.trim() || recoveryInfo?.emailOtp || '';

          // Smart token extraction if pasted link
          if (codeToUse.includes('token=') || codeToUse.includes('token_hash=')) {
            const m = codeToUse.match(/(?:token|token_hash)=([a-zA-Z0-9_-]+)/);
            if (m && m[1]) codeToUse = m[1];
          }

          if (!targetEmail) {
            throw new Error("Please enter your email address to verify password reset.");
          }

          if (!codeToUse) {
            throw new Error("Verification code or link is required. Please check your screen/inbox for the code, or request a fresh link.");
          }

          const updateRes = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'verify-otp',
              email: targetEmail,
              otp: codeToUse,
              newPassword: password
            })
          });

          const updateJson = await updateRes.json();
          if (!updateRes.ok) {
            throw new Error(updateJson.error || "Failed to update password.");
          }
          updateSucceeded = true;
        }

        if (updateSucceeded) {
          // Automatically authenticate with the new password
          try {
            if (targetEmail) {
              const { data: loginData } = await supabase.auth.signInWithPassword({
                email: targetEmail,
                password
              });

              if (loginData?.session) {
                onSession(loginData.session);
                return;
              }
            }
          } catch (e) {
            console.warn("Post-update sign in notice:", e);
          }

          setView('update-password-success');
        }
      }
    } catch (err: any) {
      setError({ message: err.message || "Authentication service failed to respond." });
      setLoading(false);
    } finally {
      if (view !== 'signup-success' && view !== 'reset-sent' && view !== 'update-password-success') {
        setLoading(false);
      }
    }
  };

  const handleGoogleLogin = async () => {
    if (!isSupabaseConfigured()) {
      console.warn("⚠️ Attempting OAuth with potentially missing configuration.");
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

  // ───────────────────────────────────────────────────────────────────────────
  // VIEW: SIGNUP SUCCESS
  // ───────────────────────────────────────────────────────────────────────────
  if (view === 'signup-success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 p-10 rounded-3xl shadow-xl text-center border border-slate-100 dark:border-white/5 animate-in fade-in zoom-in-95">
          <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Check your email</h2>
          <p className="text-slate-500 mb-6 text-sm">
            We have sent an activation link to <span className="font-semibold text-slate-800 dark:text-slate-200">{email}</span>. Click the link to complete verification.
          </p>

          {resendMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl mb-4 text-xs text-emerald-700 dark:text-emerald-400">
              {resendMessage}
            </div>
          )}

          <div className="space-y-3">
            <button 
              onClick={() => setView('login')} 
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
            >
              Return to Sign In
            </button>

            <button 
              type="button"
              disabled={resendLoading}
              onClick={async () => {
                setResendLoading(true);
                setResendMessage(null);
                try {
                  const res = await fetch('/api/auth/reset-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'resend-signup', email })
                  });
                  const json = await res.json();
                  if (res.ok) {
                    setResendMessage(json.message || "Confirmation email resent!");
                  } else {
                    setError({ message: json.error || "Failed to resend confirmation." });
                  }
                } catch (e: any) {
                  setError({ message: e.message || "Network error while resending confirmation." });
                } finally {
                  setResendLoading(false);
                }
              }}
              className="w-full py-2.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {resendLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Didn&apos;t receive it? Resend activation email
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VIEW: RESET SENT (WITH INSTANT CODE ENTRY OPTION)
  // ───────────────────────────────────────────────────────────────────────────
  if (view === 'reset-sent') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 p-8 md:p-10 rounded-3xl shadow-xl text-center border border-slate-100 dark:border-white/5 animate-in fade-in zoom-in-95">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Reset Instructions Sent</h2>
          <p className="text-slate-500 mb-6 text-sm">
            We dispatched password recovery instructions for <span className="font-semibold text-slate-800 dark:text-slate-200">{email}</span>.
          </p>

          {/* Instant One-Time Recovery Code if available */}
          {recoveryInfo?.emailOtp && (
            <div className="p-4 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/40 rounded-2xl mb-6 text-center">
              <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest block mb-1">
                Instant Recovery Code
              </span>
              <div className="flex items-center justify-center gap-2 my-1">
                <span className="text-2xl font-mono font-black tracking-widest text-indigo-700 dark:text-indigo-300 select-all">
                  {recoveryInfo.emailOtp}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (recoveryInfo?.emailOtp) {
                      navigator.clipboard.writeText(recoveryInfo.emailOtp);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 2000);
                    }
                  }}
                  className="p-1 text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs font-semibold"
                  title="Copy code"
                >
                  {copiedCode ? <CheckCircle2 size={16} className="text-emerald-500" /> : "Copy"}
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Use this code below to set your new password directly without waiting for email redirection.
              </p>
            </div>
          )}

          {/* Rate limit note if applicable */}
          {recoveryInfo?.rateLimitNotice && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/30 rounded-xl mb-4 text-xs text-amber-700 dark:text-amber-400 text-left">
              <span className="font-bold">Email Cooldown Notice:</span> {recoveryInfo.rateLimitNotice}. You can continue immediately using the Instant Recovery Code above.
            </div>
          )}

          <div className="space-y-3">
            <button 
              onClick={() => {
                if (recoveryInfo?.emailOtp) {
                  setOtpCode(recoveryInfo.emailOtp);
                }
                setView('update-password');
              }} 
              className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              <KeyRound size={16} /> Set New Password Now
            </button>

            {recoveryInfo?.directLocalUrl && (
              <a 
                href={recoveryInfo.directLocalUrl}
                className="block w-full py-2.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 transition-colors"
              >
                Or open direct local recovery link →
              </a>
            )}

            <button 
              onClick={() => setView('login')} 
              className="w-full py-2.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
            >
              Return to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VIEW: UPDATE PASSWORD SUCCESS
  // ───────────────────────────────────────────────────────────────────────────
  if (view === 'update-password-success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 p-10 rounded-3xl shadow-xl text-center border border-slate-100 dark:border-white/5 animate-in fade-in zoom-in-95">
          <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Password Updated</h2>
          <p className="text-slate-500 mb-8 text-sm">
            Your new password has been set securely. You can now access your educator workspace.
          </p>
          <button 
            onClick={async () => {
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                onSession(session);
              } else {
                setView('login');
              }
            }} 
            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
          >
            Continue to Workspace
          </button>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // DEFAULT FORM VIEW (LOGIN / SIGNUP / FORGOT-PASSWORD / UPDATE-PASSWORD)
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6 selection:bg-indigo-600 selection:text-white">
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
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none mb-4">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight uppercase">Pedagogy Master</h1>
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-500/20 rounded-full">
            <ShieldCheck size={10} className="text-emerald-600" />
            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Enterprise Protocol Secure</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold dark:text-white">
              {view === 'login' ? 'Sign In' : 
               view === 'signup' ? 'Create Account' : 
               view === 'update-password' ? 'Set New Password' : 
               'Reset Password'}
            </h2>
            {view !== 'login' && view !== 'update-password' && (
              <button 
                type="button"
                onClick={() => { setView('login'); setError(null); }} 
                className="text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}
          </div>

          {/* Social login only on standard sign in / sign up */}
          {(view === 'login' || view === 'signup') && (
            <>
              <button 
                type="button"
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
            </>
          )}
          
          <form onSubmit={handleAuth} className="space-y-4">
            <div className="hidden" aria-hidden="true">
              <input 
                type="text" 
                id="hp-auth" 
                name="hp-auth" 
                value={honeypot} 
                onChange={e => setHoneypot(e.target.value)} 
                tabIndex={-1} 
                autoComplete="off" 
              />
            </div>

            {/* Active Session Badge for Password Update */}
            {view === 'update-password' && hasActiveSession && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 rounded-xl flex items-center gap-3 animate-in fade-in">
                <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="text-xs">
                  <p className="font-bold text-emerald-800 dark:text-emerald-300">Verified Recovery Session</p>
                  <p className="text-emerald-700 dark:text-emerald-400/80">Updating password for <span className="font-semibold">{email || 'your account'}</span></p>
                </div>
              </div>
            )}

            {/* Email input */}
            {(view !== 'update-password' || !hasActiveSession) && (
              <div className="space-y-1">
                <label htmlFor="auth-email" className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="email" 
                    id="auth-email"
                    name="email"
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white text-sm" 
                    placeholder="name@school.edu" 
                    required 
                  />
                </div>
              </div>
            )}

            {/* Reset Code / OTP field when setting new password without active session */}
            {view === 'update-password' && !hasActiveSession && (
              <div className="space-y-1 animate-in fade-in">
                <div className="flex items-center justify-between ml-1">
                  <label htmlFor="auth-otp" className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                    Reset Code or Link
                  </label>
                  <span className="text-[10px] font-medium text-slate-400">Code from screen/email or paste link</span>
                </div>
                <div className="relative">
                  <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type="text" 
                    id="auth-otp"
                    name="otpCode"
                    value={otpCode} 
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val.includes('token=') || val.includes('token_hash=')) {
                        const m = val.match(/(?:token|token_hash)=([a-zA-Z0-9_-]+)/);
                        if (m && m[1]) val = m[1];
                      }
                      setOtpCode(val);
                    }} 
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white text-sm font-mono tracking-wider" 
                    placeholder="e.g. 28367918 or token" 
                    required={!hasActiveSession}
                  />
                </div>
              </div>
            )}

            {/* Password input */}
            {view !== 'forgot-password' && (
              <div className="space-y-1">
                <div className="flex items-center justify-between ml-1">
                  <label htmlFor="auth-password" className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                    {view === 'update-password' ? 'New Password' : 'Password'}
                  </label>
                  {view === 'login' && (
                    <button 
                      type="button" 
                      onClick={() => { setView('forgot-password'); setError(null); }} 
                      className="text-[11px] font-bold text-indigo-600 hover:underline"
                    >
                      Forgot?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    id="auth-password"
                    name="password"
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    className="w-full pl-12 pr-12 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white text-sm" 
                    placeholder={view === 'update-password' ? 'Min 8 characters' : '••••••••'} 
                    required 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password input */}
            {(view === 'signup' || view === 'update-password') && (
              <div className="space-y-1">
                <label htmlFor="auth-confirm-password" className="text-sm font-semibold text-slate-600 dark:text-slate-400 ml-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    type={showConfirmPassword ? 'text' : 'password'} 
                    id="auth-confirm-password"
                    name="confirmPassword"
                    value={confirmPassword} 
                    onChange={(e) => setConfirmPassword(e.target.value)} 
                    className="w-full pl-12 pr-12 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white text-sm" 
                    placeholder="Repeat password" 
                    required 
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {/* Cloudflare Turnstile */}
            {view === 'signup' && (
              <div className="py-2">
                <div id="turnstile-widget" className="flex justify-center"></div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl space-y-1 animate-in fade-in">
                <div className="flex items-start gap-2 text-xs font-semibold">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" /> 
                  <span>{error.message}</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={loading || googleLoading} 
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
            >
              {loading ? (
                <Loader2 className="animate-spin w-5 h-5" />
              ) : (
                <>
                  {view === 'login' && 'Enter Workspace'}
                  {view === 'signup' && 'Get Started'}
                  {view === 'forgot-password' && 'Send Reset Link'}
                  {view === 'update-password' && 'Save New Password'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          {/* View Toggles */}
          {view === 'login' && (
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5 text-center">
              <button 
                type="button"
                onClick={() => { setView('signup'); setError(null); }} 
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                New educator? Create account
              </button>
            </div>
          )}

          {view === 'signup' && (
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5 text-center">
              <button 
                type="button"
                onClick={() => { setView('login'); setError(null); }} 
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                Already have an account? Sign In
              </button>
            </div>
          )}

          {view === 'update-password' && (
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/5 text-center">
              <button 
                type="button"
                onClick={() => { setView('forgot-password'); setError(null); }} 
                className="text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors"
              >
                Need a new reset code? Send again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
