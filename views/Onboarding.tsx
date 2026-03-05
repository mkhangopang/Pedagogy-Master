'use client';

import React, { useState } from 'react';
import { UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { 
  GraduationCap, 
  ArrowRight, 
  CheckCircle2, 
  BookOpen, 
  Target, 
  Sparkles,
  Loader2
} from 'lucide-react';

interface OnboardingProps {
  user: UserProfile;
  onComplete: (profile: UserProfile) => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ user, onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user.name || '',
    school_name: '',
    grade_level: '',
    subject: '',
    pedagogical_approach: '5E Model'
  });

  const handleComplete = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from('profiles').update({
        name: formData.name,
        school_name: formData.school_name,
        grade_level: formData.grade_level,
        subject: formData.subject,
        pedagogical_approach: formData.pedagogical_approach,
        onboarding_completed: true
      }).eq('id', user.id);

      if (!error) {
        onComplete({
          ...user,
          name: formData.name,
          onboarding_completed: true
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5 overflow-hidden">
        <div className="flex">
          {/* Sidebar */}
          <div className="w-1/3 bg-indigo-600 p-10 text-white hidden md:flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-8">
                <GraduationCap className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight uppercase mb-4">Onboarding</h2>
              <p className="text-indigo-100 text-sm leading-relaxed opacity-80">
                Configure your pedagogical node to align with your institutional standards.
              </p>
            </div>
            
            <div className="space-y-4">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border ${step === s ? 'bg-white text-indigo-600 border-white' : 'border-white/30 text-white/50'}`}>
                    {s}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${step === s ? 'text-white' : 'text-white/50'}`}>
                    {s === 1 ? 'Identity' : s === 2 ? 'Context' : 'Finalize'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-8 md:p-12">
            {step === 1 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight uppercase">Identity Node</h3>
                  <p className="text-slate-500 text-sm mt-1">How should the system address you?</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all dark:text-white"
                      placeholder="e.g. Dr. Sarah Jenkins"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Institution</label>
                    <input 
                      type="text" 
                      value={formData.school_name}
                      onChange={(e) => setFormData({...formData, school_name: e.target.value})}
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all dark:text-white"
                      placeholder="e.g. Westside High School"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => setStep(2)}
                  disabled={!formData.name || !formData.school_name}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  Continue to Context <ArrowRight size={18} />
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight uppercase">Pedagogical Context</h3>
                  <p className="text-slate-500 text-sm mt-1">Define your teaching environment.</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Grade Level</label>
                    <select 
                      value={formData.grade_level}
                      onChange={(e) => setFormData({...formData, grade_level: e.target.value})}
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all dark:text-white"
                    >
                      <option value="">Select...</option>
                      <option value="09">Grade 9</option>
                      <option value="10">Grade 10</option>
                      <option value="11">Grade 11</option>
                      <option value="12">Grade 12</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subject</label>
                    <input 
                      type="text" 
                      value={formData.subject}
                      onChange={(e) => setFormData({...formData, subject: e.target.value})}
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-2xl font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all dark:text-white"
                      placeholder="e.g. Biology"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Primary Framework</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['5E Model', 'Bloom-Scaled', 'UbD', 'Direct Instruction'].map((f) => (
                      <button 
                        key={f}
                        onClick={() => setFormData({...formData, pedagogical_approach: f})}
                        className={`px-4 py-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${formData.pedagogical_approach === f ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 dark:bg-black/20 border-slate-200 dark:border-white/10 text-slate-500'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setStep(1)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Back</button>
                  <button 
                    onClick={() => setStep(3)}
                    disabled={!formData.grade_level || !formData.subject}
                    className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                  >
                    Finalize Setup <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 text-center">
                <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Sparkles className="w-10 h-10 text-emerald-500" />
                </div>
                
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight uppercase">Neural Grid Ready</h3>
                  <p className="text-slate-500 text-sm mt-1">Your pedagogical node has been successfully initialized.</p>
                </div>

                <div className="bg-slate-50 dark:bg-black/20 p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 text-left space-y-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="text-emerald-500" size={16} />
                    <span className="text-xs font-semibold dark:text-white">Identity: {formData.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="text-emerald-500" size={16} />
                    <span className="text-xs font-semibold dark:text-white">Node: {formData.school_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="text-emerald-500" size={16} />
                    <span className="text-xs font-semibold dark:text-white">Framework: {formData.pedagogical_approach}</span>
                  </div>
                </div>

                <button 
                  onClick={handleComplete}
                  disabled={loading}
                  className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-bold text-xs uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <><CheckCircle2 size={20} /> Enter Workspace</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
