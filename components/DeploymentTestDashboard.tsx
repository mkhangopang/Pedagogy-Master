'use client';

import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader2, RefreshCw, Download } from 'lucide-react';

export default function DeploymentTestDashboard() {
  const [testResults, setTestResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runTests = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/deployment-test');
      const data = await response.json();
      setTestResults(data);
    } catch (err) {
      console.error('Test error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8 bg-slate-900 min-h-screen text-white rounded-3xl mt-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">System Diagnostics</h1>
        <p className="text-slate-400">Verifying infrastructure and AI engine readiness.</p>
      </div>

      <div className="flex justify-center gap-4">
        <button
          onClick={runTests}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
        >
          {loading ? <Loader2 className="animate-spin" size={20} /> : <RefreshCw size={20} />}
          {loading ? 'Running Suite...' : 'Run System Test'}
        </button>
      </div>

      {testResults && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className={`p-6 rounded-2xl border-2 ${testResults.summary.overall === 'pass' ? 'border-emerald-500 bg-emerald-500/10' : 'border-rose-500 bg-rose-500/10'}`}>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {testResults.summary.overall === 'pass' ? <CheckCircle className="text-emerald-400" /> : <XCircle className="text-rose-400" />}
              {testResults.summary.overall === 'pass' ? 'System Ready' : 'System Compromised'}
            </h2>
            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div className="bg-slate-800 p-4 rounded-xl">
                <p className="text-2xl font-bold text-emerald-400">{testResults.summary.passed}</p>
                <p className="text-xs text-slate-400 uppercase font-bold">Passed</p>
              </div>
              <div className="bg-slate-800 p-4 rounded-xl">
                <p className="text-2xl font-bold text-rose-400">{testResults.summary.failed}</p>
                <p className="text-xs text-slate-400 uppercase font-bold">Failed</p>
              </div>
              <div className="bg-slate-800 p-4 rounded-xl">
                <p className="text-2xl font-bold text-slate-100">{testResults.summary.total}</p>
                <p className="text-xs text-slate-400 uppercase font-bold">Total</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {testResults.tests.map((test: any, i: number) => (
              <div key={i} className="bg-slate-800 border border-slate-700 p-5 rounded-xl flex items-start gap-4">
                {test.status === 'pass' ? <CheckCircle className="text-emerald-400 mt-1 shrink-0" /> : <AlertCircle className="text-rose-400 mt-1 shrink-0" />}
                <div>
                  <h3 className="font-bold">{test.name}</h3>
                  <p className="text-sm text-slate-400">{test.message}</p>
                  {test.details && (
                    <pre className="mt-2 p-3 bg-slate-950 rounded text-[10px] text-indigo-300 overflow-x-auto">
                      {JSON.stringify(test.details, null, 2)}
                    </pre>
                  )}
                  {test.fix && (
                    <p className="mt-2 text-xs font-bold text-indigo-400 bg-indigo-400/10 px-3 py-1.5 rounded border border-indigo-400/20">
                      FIX: {test.fix}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}