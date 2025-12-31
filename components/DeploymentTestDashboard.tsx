'use client';

import React, { useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader, RefreshCw, Download } from 'lucide-react';
import { supabase } from '../lib/supabase';

type TestStatus = 'pass' | 'fail' | 'warning';

type TestResult = {
  name: string;
  status: TestStatus;
  message: string;
  details?: any;
  fix?: string;
};

type TestResponse = {
  summary: {
    overall: 'pass' | 'fail';
    passed: number;
    failed: number;
    warnings: number;
    total: number;
    timestamp: string;
    readyForProduction: boolean;
  };
  tests: TestResult[];
  recommendations: string[];
};

export default function DeploymentTestDashboard() {
  const [testResults, setTestResults] = useState<TestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch('/api/deployment-test', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Test endpoint failed');
      }
      
      const data = await response.json();
      setTestResults(data);
    } catch (err: any) {
      setError(err.message || 'Failed to run tests');
      console.error('Test error:', err);
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    if (!testResults) return;

    const report = `
# Pedagogy Master Deployment Test Report
Generated: ${testResults.summary.timestamp}

## Summary
- Overall Status: ${testResults.summary.overall.toUpperCase()}
- Tests Passed: ${testResults.summary.passed}/${testResults.summary.total}
- Tests Failed: ${testResults.summary.failed}
- Warnings: ${testResults.summary.warnings}
- Production Ready: ${testResults.summary.readyForProduction ? 'YES' : 'NO'}

## Test Results
${testResults.tests.map(test => `
### ${test.name}
**Status:** ${test.status.toUpperCase()}
**Message:** ${test.message}
${test.details ? `**Details:** ${JSON.stringify(test.details, null, 2)}` : ''}
${test.fix ? `**Fix:** ${test.fix}` : ''}
`).join('\n')}

## Recommendations
${testResults.recommendations.map(r => `- ${r}`).join('\n')}
`;

    const blob = new Blob([report], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedagogy-master-test-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: TestStatus) => {
    switch (status) {
      case 'pass':
        return <CheckCircle size={20} className="text-emerald-500" />;
      case 'fail':
        return <XCircle size={20} className="text-rose-500" />;
      case 'warning':
        return <AlertCircle size={20} className="text-amber-500" />;
    }
  };

  const getStatusColorClass = (status: TestStatus) => {
    switch (status) {
      case 'pass': return 'border-emerald-500';
      case 'fail': return 'border-rose-500';
      case 'warning': return 'border-amber-500';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 bg-slate-900 min-h-screen text-white rounded-[2rem] shadow-2xl overflow-hidden mt-10">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold mb-3 tracking-tight">🚀 System Diagnostics Suite</h1>
        <p className="text-slate-400 text-lg">Infrastructure verification & Production readiness</p>
      </div>

      <div className="flex flex-wrap gap-4 justify-center mb-12">
        <button
          onClick={runTests}
          disabled={loading}
          className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold flex items-center gap-3 transition-all hover:bg-indigo-500 disabled:opacity-50 shadow-xl shadow-indigo-600/20 active:scale-95"
        >
          {loading ? (
            <Loader size={20} className="animate-spin" />
          ) : (
            <RefreshCw size={20} />
          )}
          {loading ? 'Executing Suite...' : 'Initialize Full Test'}
        </button>

        {testResults && (
          <button
            onClick={downloadReport}
            className="px-8 py-4 bg-slate-800 text-slate-100 border border-slate-700 rounded-2xl font-bold flex items-center gap-3 transition-all hover:bg-slate-700 active:scale-95"
          >
            <Download size={20} />
            Download Report
          </button>
        )}
      </div>

      {error && (
        <div className="p-6 bg-rose-500/10 border-2 border-rose-500 rounded-2xl text-rose-200 mb-8 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3 mb-2 font-bold text-lg">
            <XCircle size={24} />
            Diagnostic Failure
          </div>
          <p className="text-sm opacity-90">{error}</p>
        </div>
      )}

      {testResults && (
        <div className="space-y-8 animate-in fade-in duration-700">
          <div className={`p-8 rounded-3xl border-2 shadow-2xl ${testResults.summary.readyForProduction ? 'border-emerald-500 bg-emerald-500/10' : 'border-rose-500 bg-rose-500/10'}`}>
            <h2 className="text-3xl font-bold flex items-center gap-3 mb-6">
              {testResults.summary.readyForProduction ? '✅ Production Validated' : '🚨 Infrastructure Alert'}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div className="bg-slate-950/50 p-6 rounded-2xl backdrop-blur-sm border border-white/5">
                <div className="text-4xl font-black text-emerald-400 mb-1">{testResults.summary.passed}</div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Passed</div>
              </div>
              <div className="bg-slate-950/50 p-6 rounded-2xl backdrop-blur-sm border border-white/5">
                <div className="text-4xl font-black text-rose-400 mb-1">{testResults.summary.failed}</div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Failed</div>
              </div>
              <div className="bg-slate-950/50 p-6 rounded-2xl backdrop-blur-sm border border-white/5">
                <div className="text-4xl font-black text-amber-400 mb-1">{testResults.summary.warnings}</div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Warnings</div>
              </div>
              <div className="bg-slate-950/50 p-6 rounded-2xl backdrop-blur-sm border border-white/5">
                <div className="text-4xl font-black text-indigo-400 mb-1">{testResults.summary.total}</div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Modules</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-bold text-slate-100 flex items-center gap-2 px-2">
              Diagnostic Logs
            </h3>
            <div className="grid gap-4">
              {testResults.tests.map((test, index) => (
                <div
                  key={index}
                  className={`p-6 bg-slate-800/50 border-l-4 rounded-xl backdrop-blur-sm transition-all hover:bg-slate-800 ${getStatusColorClass(test.status)}`}
                >
                  <div className="flex items-center gap-4 mb-3">
                    {getStatusIcon(test.status)}
                    <span className="text-xl font-bold tracking-tight">{test.name}</span>
                  </div>
                  <p className="text-slate-300 text-sm mb-4 leading-relaxed">{test.message}</p>
                  
                  {test.details && (
                    <details className="group">
                      <summary className="text-xs font-bold text-indigo-400 cursor-pointer hover:text-indigo-300 transition-colors uppercase tracking-widest">View System Payload</summary>
                      <pre className="mt-4 p-4 bg-slate-950 rounded-xl text-[11px] text-indigo-300 font-mono overflow-auto border border-white/5 max-h-40">
                        {JSON.stringify(test.details, null, 2)}
                      </pre>
                    </details>
                  )}
                  
                  {test.fix && (
                    <div className="mt-4 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-sm text-indigo-200">
                      <span className="font-bold text-indigo-400">Resolution Guide:</span> {test.fix}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-8 bg-slate-800 border border-slate-700 rounded-3xl shadow-lg">
            <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
              📋 Strategic Recommendations
            </h3>
            <ul className="space-y-4">
              {testResults.recommendations.map((rec, index) => (
                <li key={index} className="flex gap-4 items-start text-slate-300">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full mt-2.5 shrink-0" />
                  <span className="leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!testResults && !loading && (
        <div className="text-center py-20 px-4 bg-slate-950/20 rounded-3xl border-2 border-dashed border-slate-700/50">
          <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-500">
            <RefreshCw size={40} />
          </div>
          <h2 className="text-2xl font-bold text-slate-200 mb-3">Diagnostic Hub Offline</h2>
          <p className="text-slate-500 max-w-sm mx-auto">
            Click "Initialize Full Test" to perform an end-to-end check of environment variables, cloud infrastructure, and AI connectivity.
          </p>
        </div>
      )}
    </div>
  );
}