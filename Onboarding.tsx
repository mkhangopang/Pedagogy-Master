'use client';

import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { GraduationCap, Globe, School, BookOpen, Users, ChevronRight, Check, Loader2 } from 'lucide-react';

interface OnboardingProps {
  userId: string;
  userEmail: string;
  onComplete: (profile: any) => void;
}

const COUNTRIES = [
  'Pakistan', 'India', 'Bangladesh', 'Nigeria', 'Kenya', 'Ghana', 'South Africa',
  'UAE', 'Saudi Arabia', 'Egypt', 'Turkey', 'Indonesia', 'Malaysia', 'Philippines',
  'United Kingdom', 'United States', 'Canada', 'Australia', 'Other'
];

const SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'English Language',
  'English Literature', 'Urdu', 'Arabic', 'History', 'Geography',
  'Computer Science', 'Islamic Studies', 'Pakistan Studies', 'General Science',
  'Social Studies', 'Economics', 'Business Studies', 'Other'
];

const GRADE_LEVELS = [
  'Pre-K / KG', 'Grade 1–3 (Primary)', 'Grade 4–5 (Primary)',
  'Grade 6–8 (Middle)', 'Grade 9–10 (Secondary)', 'Grade 11–12 (Higher Secondary)',
  'University / College', 'Adult Education'
];

const CURRICULUM_STANDARDS = [
  'Pakistan National Curriculum (PNC)',
  'Cambridge IGCSE / O-Level',
  'Cambridge A-Level',
  'Matric (Federal Board)',
  'Matric (Punjab Board)',
  'Matric (Sindh Board)',
  'AKU-EB',
  'Nigerian National Curriculum',
  'Kenya CBC',
  'UK National Curriculum',
  'US Common Core',
  'IB (International Baccalaureate)',
  'Other / Custom'
];

const STEPS = [
  { id: 1, title: 'Welcome', icon: GraduationCap },
  { id: 2, title: 'Location', icon: Globe },
  { id: 3, title: 'Your Class', icon: BookOpen },
  { id: 4, title: 'Ready!', icon: Check },
];

export default function Onboarding({ userId, userEmail, onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: userEmail.split('@')[0].replace(/[._]/g, ' '),
    school_name: '',
    country: '',
    subject: '',
    grade_level: '',
    curriculum_standard: '',
  });

  const update = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const canProceed = () => {
    if (step === 1) return form.name.trim().length > 0;
    if (step === 2) return form.country !== '' && form.school_name.trim().length > 0;
    if (step === 3) return form.subject !== '' && form.grade_level !== '' && form.curriculum_standard !== '';
    return true;
  };

  const handleComplete = async () => {
    setSaving(true);
    setError('');
    try {
      const { error: err } = await supabase.from('profiles').update({
        name: form.name.trim(),
        school_name: form.school_name.trim(),
        country: form.country,
        subject: form.subject,
        grade_level: form.grade_level,
        curriculum_standard: form.curriculum_standard,
        onboarding_completed: true,
      }).eq('id', userId);

      if (err) throw err;

      onComplete({
        ...form,
        onboarding_completed: true,
        id: userId,
        email: userEmail,
      });
    } catch (e: any) {
      setError(e.message || 'Save failed. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                step === s.id ? 'bg-indigo-500 text-white' :
                step > s.id ? 'bg-green-500 text-white' :
                'bg-white/10 text-white/40'
              }`}>
                {step > s.id ? <Check size={12} /> : <s.icon size={12} />}
                <span className="hidden sm:inline">{s.title}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-6 rounded ${step > s.id ? 'bg-green-500' : 'bg-white/10'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8">

          {/* ── STEP 1: Name ── */}
          {step === 1 && (
            <div>
              <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6">
                <GraduationCap className="text-indigo-600" size={28} />
              </div>
              <h1 className="text-2xl font-black text-slate-900 mb-1">Welcome to Pedagogy Master!</h1>
              <p className="text-slate-500 mb-8">Let's set up your teaching profile in 2 minutes.</p>

              <label className="block text-sm font-bold text-slate-700 mb-2">Your Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => update('name', e.target.value)}
                placeholder="e.g. Ms. Fatima Khan"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:border-indigo-500 focus:outline-none text-base"
              />
            </div>
          )}

          {/* ── STEP 2: Location ── */}
          {step === 2 && (
            <div>
              <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-6">
                <Globe className="text-blue-600" size={28} />
              </div>
              <h1 className="text-2xl font-black text-slate-900 mb-1">Where do you teach?</h1>
              <p className="text-slate-500 mb-8">We'll personalise your curriculum tools for your region.</p>

              <label className="block text-sm font-bold text-slate-700 mb-2">School Name</label>
              <input
                type="text"
                value={form.school_name}
                onChange={e => update('school_name', e.target.value)}
                placeholder="e.g. Beacon House Lahore"
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:border-indigo-500 focus:outline-none mb-5"
              />

              <label className="block text-sm font-bold text-slate-700 mb-2">Country</label>
              <select
                value={form.country}
                onChange={e => update('country', e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:border-indigo-500 focus:outline-none bg-white"
              >
                <option value="">Select your country...</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* ── STEP 3: Subject & Grade ── */}
          {step === 3 && (
            <div>
              <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mb-6">
                <BookOpen className="text-purple-600" size={28} />
              </div>
              <h1 className="text-2xl font-black text-slate-900 mb-1">What do you teach?</h1>
              <p className="text-slate-500 mb-6">This powers your AI curriculum alignment tools.</p>

              <label className="block text-sm font-bold text-slate-700 mb-2">Subject</label>
              <select
                value={form.subject}
                onChange={e => update('subject', e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:border-indigo-500 focus:outline-none bg-white mb-4"
              >
                <option value="">Select subject...</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>

              <label className="block text-sm font-bold text-slate-700 mb-2">Grade Level</label>
              <select
                value={form.grade_level}
                onChange={e => update('grade_level', e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:border-indigo-500 focus:outline-none bg-white mb-4"
              >
                <option value="">Select grade level...</option>
                {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>

              <label className="block text-sm font-bold text-slate-700 mb-2">Curriculum Standard</label>
              <select
                value={form.curriculum_standard}
                onChange={e => update('curriculum_standard', e.target.value)}
                className="w-full border-2 border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:border-indigo-500 focus:outline-none bg-white"
              >
                <option value="">Select curriculum...</option>
                {CURRICULUM_STANDARDS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* ── STEP 4: Complete ── */}
          {step === 4 && (
            <div className="text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="text-green-600" size={36} />
              </div>
              <h1 className="text-2xl font-black text-slate-900 mb-2">You're all set, {form.name.split(' ')[0]}!</h1>
              <p className="text-slate-500 mb-6">Your profile is ready. Upload your first curriculum document to unlock AI-powered lesson planning.</p>

              <div className="bg-slate-50 rounded-2xl p-4 text-left space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">School</span>
                  <span className="font-bold text-slate-800">{form.school_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Country</span>
                  <span className="font-bold text-slate-800">{form.country}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subject</span>
                  <span className="font-bold text-slate-800">{form.subject}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Grade</span>
                  <span className="font-bold text-slate-800">{form.grade_level}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Curriculum</span>
                  <span className="font-bold text-slate-800">{form.curriculum_standard}</span>
                </div>
              </div>

              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-3 mt-8">
            {step > 1 && step < 4 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex-1 py-3 border-2 border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
            )}
            {step < 3 && (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canProceed()}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue <ChevronRight size={18} />
              </button>
            )}
            {step === 3 && (
              <button
                onClick={() => setStep(4)}
                disabled={!canProceed()}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Review <ChevronRight size={18} />
              </button>
            )}
            {step === 4 && (
              <button
                onClick={handleComplete}
                disabled={saving}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                {saving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Check size={18} /> Go to Dashboard</>}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          Pedagogy Master AI · Empowering educators worldwide
        </p>
      </div>
    </div>
  );
}
