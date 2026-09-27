import Link from 'next/link';
import { ArrowLeft, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 p-10 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5 text-center space-y-6">
        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-950/40 rounded-full flex items-center justify-center mx-auto text-indigo-600 dark:text-indigo-400">
          <Compass className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">404 - Node Not Found</h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs font-medium">
            The requested curriculum route or resource does not exist in the neural registry.
          </p>
        </div>
        <Link
          href="/"
          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-xl active:scale-95 text-xs uppercase tracking-widest"
        >
          <ArrowLeft size={16} />
          Return to Workspace
        </Link>
      </div>
    </div>
  );
}
