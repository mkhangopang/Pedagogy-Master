
'use client';

import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Documents from '../views/Documents';
import Chat from '../views/Chat';
import Tools from '../views/Tools';
import BrainControl from '../views/BrainControl';
import Pricing from '../views/Pricing';
import Login from '../views/Login';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES, ROLE_LIMITS, APP_NAME, ADMIN_EMAILS } from '../constants';
import { paymentService } from '../services/paymentService';
import { Loader2, Menu, DatabaseZap, AlertCircle } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [brain, setBrain] = useState<NeuralBrain>({
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'initial-brain-id',
    masterPrompt: DEFAULT_MASTER_PROMPT,
    bloomRules: DEFAULT_BLOOM_RULES,
    version: 1,
    isActive: true,
    updatedAt: new Date().toISOString()
  });

  useEffect(() => {
    paymentService.init();
    
    const initSession = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
        if (currentSession) {
          await fetchProfileAndDocs(currentSession.user.id, currentSession.user.email);
          await fetchBrain();
        }
      } catch (err) {
        console.error("Session initialization failed:", err);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
      setSession(currentSession);
      if (currentSession) {
        await fetchProfileAndDocs(currentSession.user.id, currentSession.user.email);
        await fetchBrain();
      } else {
        setUserProfile(null);
        setDocuments([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchBrain = async () => {
    const { data, error } = await supabase
      .from('neural_brain')
      .select('*')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) console.error("Error fetching brain:", error);
    
    if (data) {
      setBrain({
        id: data.id,
        masterPrompt: data.master_prompt,
        bloomRules: data.bloom_rules, 
        version: data.version,
        isActive: data.is_active,
        updatedAt: data.updated_at
      });
    }
  };

  const fetchProfileAndDocs = async (userId: string, email?: string) => {
    const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    
    if (profileError) console.error("Error fetching profile:", profileError);
    
    const isSystemAdmin = email && ADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase());
    let activeProfile: UserProfile;

    if (!profile) {
      activeProfile = {
        id: userId,
        name: email?.split('@')[0] || 'Educator',
        email: email || '',
        role: isSystemAdmin ? UserRole.APP_ADMIN : UserRole.TEACHER,
        plan: isSystemAdmin ? SubscriptionPlan.ENTERPRISE : SubscriptionPlan.FREE,
        queriesUsed: 0,
        queriesLimit: isSystemAdmin ? 999999 : 30,
        generationCount: 0,
        successRate: 0,
        editPatterns: { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
      };

      if (isSupabaseConfigured) {
        const { error: insertError } = await supabase.from('profiles').insert([{
          id: userId,
          name: activeProfile.name,
          email: activeProfile.email,
          role: activeProfile.role,
          plan: activeProfile.plan,
          queries_used: 0,
          queries_limit: activeProfile.queriesLimit
        }]);
        if (insertError) console.error("Profile creation failed:", insertError);
      }
    } else {
      activeProfile = {
        id: profile.id,
        name: profile.name || 'Educator',
        email: profile.email || '',
        role: isSystemAdmin ? UserRole.APP_ADMIN : (profile.role as UserRole),
        plan: isSystemAdmin ? SubscriptionPlan.ENTERPRISE : (profile.plan as SubscriptionPlan),
        queriesUsed: profile.queries_used || 0,
        queriesLimit: isSystemAdmin ? 999999 : (profile.queries_limit || 30),
        gradeLevel: profile.grade_level,
        subjectArea: profile.subject_area,
        teachingStyle: profile.teaching_style,
        pedagogicalApproach: profile.pedagogical_approach,
        generationCount: profile.generation_count || 0,
        successRate: profile.success_rate || 0,
        editPatterns: profile.edit_patterns || { avgLengthChange: 0, examplesCount: 0, structureModifications: 0 }
      };
    }

    setUserProfile(activeProfile);

    const { data: docs, error: docsError } = await supabase.from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    
    if (docsError) console.error("Error fetching documents:", docsError);
    
    if (docs) {
      setDocuments(docs.map(d => ({
        id: d.id,
        userId: d.user_id,
        name: d.name,
        base64Data: d.base64_data,
        mimeType: d.mime_type,
        status: d.status as any,
        subject: d.subject,
        gradeLevel: d.grade_level,
        sloTags: d.slo_tags || [],
        createdAt: d.created_at
      })));
    }
  };

  const incrementQueries = async () => {
    if (!userProfile) return;
    if (userProfile.role === UserRole.APP_ADMIN) return;
    const newCount = userProfile.queriesUsed + 1;
    setUserProfile({ ...userProfile, queriesUsed: newCount });
    if (isSupabaseConfigured) {
      const { error } = await supabase.from('profiles').update({ queries_used: newCount }).eq('id', userProfile.id);
      if (error) console.error("Failed to update query count:", error);
    }
  };

  const renderView = () => {
    if (!userProfile) return null;
    switch (currentView) {
      case 'dashboard':
        return <Dashboard user={userProfile} documents={documents} onProfileUpdate={setUserProfile} />;
      case 'documents':
        return (
          <Documents 
            documents={documents} 
            onAddDocument={async (doc) => {
              setDocuments(prev => [doc, ...prev]);
              if (isSupabaseConfigured) {
                const { error } = await supabase.from('documents').insert([{
                  id: doc.id, 
                  user_id: userProfile.id, 
                  name: doc.name, 
                  base64_data: doc.base64Data,
                  mime_type: doc.mimeType, 
                  status: doc.status, 
                  subject: doc.subject,
                  grade_level: doc.gradeLevel, 
                  slo_tags: doc.sloTags, 
                  created_at: doc.createdAt
                }]);
                if (error) {
                  console.error("Document Save Failed:", error);
                  alert("Warning: Could not save document to database. It will disappear if you refresh.");
                }
              }
            }} 
            onUpdateDocument={async (id, updates) => {
              setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
              if (isSupabaseConfigured) {
                const dbUpdates: any = {};
                if (updates.status) dbUpdates.status = updates.status;
                if (updates.sloTags) dbUpdates.slo_tags = updates.sloTags;
                const { error } = await supabase.from('documents').update(dbUpdates).eq('id', id);
                if (error) console.error("Document update failed:", error);
              }
            }}
            onDeleteDocument={async (id) => {
              setDocuments(prev => prev.filter(d => d.id !== id));
              if (isSupabaseConfigured) {
                const { error } = await supabase.from('documents').delete().eq('id', id);
                if (error) console.error("Document deletion failed:", error);
              }
            }}
            brain={brain}
            onQuery={incrementQueries}
            canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN}
            userPlan={userProfile.plan}
          />
        );
      case 'chat':
        return <Chat user={userProfile} brain={brain} documents={documents} onQuery={incrementQueries} canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN} />;
      case 'tools':
        return <Tools user={userProfile} brain={brain} documents={documents} onQuery={incrementQueries} canQuery={userProfile.queriesUsed < userProfile.queriesLimit || userProfile.role === UserRole.APP_ADMIN} />;
      case 'brain':
        return userProfile.role === UserRole.APP_ADMIN ? <BrainControl brain={brain} onUpdate={setBrain} /> : <Dashboard user={userProfile} documents={documents} onProfileUpdate={setUserProfile} />;
      case 'pricing':
        return <Pricing currentPlan={userProfile.plan} onUpgrade={(plan) => {
          const limit = plan === SubscriptionPlan.FREE ? 30 : plan === SubscriptionPlan.PRO ? 1000 : 999999;
          setUserProfile({ ...userProfile, plan, queriesLimit: limit });
          if (isSupabaseConfigured) {
            supabase.from('profiles').update({ plan, queries_limit: limit }).eq('id', userProfile.id);
          }
          setCurrentView('dashboard');
        }} />;
      default:
        return <Dashboard user={userProfile} documents={documents} onProfileUpdate={setUserProfile} />;
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-indigo-600" /></div>;
  if (!session || !userProfile) return <Login onSession={setSession} />;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <div className={`hidden lg:block transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
        <Sidebar currentView={currentView} onViewChange={setCurrentView} userProfile={userProfile} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b shadow-sm">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"><Menu size={24} /></button>
          <span className="font-bold text-indigo-950 tracking-tight">{APP_NAME}</span>
          <div className="w-10" />
        </header>

        {/* Persistence Warning Bar */}
        {!isSupabaseConfigured && (
          <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 flex items-center justify-center gap-2 text-amber-800 text-xs font-bold">
            <AlertCircle size={14} />
            DEMO MODE: Supabase is not configured. Documents will be erased on page refresh.
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">{renderView()}</div>
        </main>
      </div>
    </div>
  );
}
