
import React, { useState } from 'react';
import { Save, RefreshCw, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { NeuralBrain } from '../types';

interface BrainControlProps {
  brain: NeuralBrain;
  onUpdate: (brain: NeuralBrain) => void;
}

const BrainControl: React.FC<BrainControlProps> = ({ brain, onUpdate }) => {
  const [formData, setFormData] = useState(brain);
  const [isSaving, setIsSaving] = useState(false);
  const [showStatus, setShowStatus] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    // Simulate API delay
    setTimeout(() => {
      onUpdate({
        ...formData,
        version: formData.version + 1,
        updatedAt: new Date().toISOString()
      });
      setIsSaving(false);
      setShowStatus(true);
      setTimeout(() => setShowStatus(false), 3000);
    }, 800);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Neural Brain Control</h1>
          <p className="text-slate-500 mt-1">Manage the core pedagogical logic and master AI instructions.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-full">
            Version: {formData.version}.0.4
          </span>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
          >
            {isSaving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Deploy Updates
          </button>
        </div>
      </header>

      {showStatus && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <p className="font-medium">Master Brain instructions deployed successfully across all AI instances.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-700">Master System Prompt</h3>
            </div>
            <textarea 
              value={formData.masterPrompt}
              onChange={(e) => setFormData({...formData, masterPrompt: e.target.value})}
              className="w-full h-80 p-6 focus:outline-none font-mono text-sm leading-relaxed text-slate-800"
              spellCheck={false}
            />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-slate-700">Bloom's Taxonomy Logic Rules</h3>
            </div>
            <textarea 
              value={formData.bloomRules}
              onChange={(e) => setFormData({...formData, bloomRules: e.target.value})}
              className="w-full h-48 p-6 focus:outline-none font-mono text-sm leading-relaxed text-slate-800"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-indigo-900 text-white p-6 rounded-2xl shadow-xl space-y-4">
            <h3 className="text-lg font-bold">Brain Metrics</h3>
            <div className="space-y-3">
              <div className="flex justify-between text-indigo-200 text-sm">
                <span>Total API Calls</span>
                <span className="text-white font-mono">14,204</span>
              </div>
              <div className="flex justify-between text-indigo-200 text-sm">
                <span>Avg Latency</span>
                <span className="text-white font-mono">1.2s</span>
              </div>
              <div className="flex justify-between text-indigo-200 text-sm">
                <span>Token Efficiency</span>
                <span className="text-white font-mono">92%</span>
              </div>
            </div>
            <div className="pt-4 border-t border-indigo-800">
              <p className="text-xs text-indigo-300 italic">
                Updating these prompts affects every chat session and tool generation in real-time.
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-900">Safety Guidelines</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked readOnly className="mt-1 rounded text-indigo-600 focus:ring-indigo-500" />
                <p className="text-xs text-slate-600">Enforce pedagogical neutrality in curriculum analysis.</p>
              </div>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked readOnly className="mt-1 rounded text-indigo-600 focus:ring-indigo-500" />
                <p className="text-xs text-slate-600">Restrict generated content to academic use only.</p>
              </div>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked readOnly className="mt-1 rounded text-indigo-600 focus:ring-indigo-500" />
                <p className="text-xs text-slate-600">Automatically redact PII from processed documents.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrainControl;
