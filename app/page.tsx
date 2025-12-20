
'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import Dashboard from '../views/Dashboard';
import Documents from '../views/Documents';
import Chat from '../views/Chat';
import Tools from '../views/Tools';
import BrainControl from '../views/BrainControl';
import Login from '../views/Login';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document, ChatMessage } from '../types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES, ROLE_LIMITS } from '../constants';
import { Loader2, Menu, X } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile menu
  const [isCollapsed, setIsCollapsed] = useState(false); // Desktop toggle

  const [brain, setBrain] = useState<NeuralBrain>({
    id: typeof crypto !== 'undefined' ? crypto.randomUUID() : 'initial-brain-id',
    masterPrompt: DEFAULT_MASTER_PROMPT,
    bloomRules: DEFAULT_BLOOM_RULES,
    version: 1,
    isActive: true,
    updatedAt: new Date().toISOString()
  });

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        if (session) {
          fetchProfileAndDocs(session.user.id);
          fetchBrain();
        }
      } catch (err) {
        console.error("Session initialization failed:", err);
      } finally {
        setLoading(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        fetchProfileAndDocs(session.user.id);
        fetchBrain();
      } else {
        setUserProfile(null);
        setDocuments([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchBrain = async () => {
    const { data } = await supabase
      .from('neural_brain')
      .select('*')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (data) {
      setBrain({
        id: data.id,
        masterPrompt: data.master_prompt,
        bloomRules: data.bloom_rules, 
        version: data.version,
        isActive: data.is_active,
        updatedAt: data.updated_at
      } as any);
    }
  };

  const fetchProfileAndDocs = async (userId: string) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    
    const initialProfile: UserProfile = profile ? {
      id: profile.id,
      name: profile.name || 'Teacher',
      email: profile.email || '',
      role: profile.role as UserRole,
      plan: profile.plan as SubscriptionPlan,
      queriesUsed: profile.queries_used || 0,
      queriesLimit: profile.queries_limit || 50
    } : {
      id: userId,
      name: 'Teacher',
      email: '',
      role: UserRole.TEACHER,
      plan: SubscriptionPlan.FREE,
      queriesUsed: 0,
      queriesLimit: 50
    };

    setUserProfile(initialProfile);

    const { data: docs } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (docs) {
      const mappedDocs: Document[] = docs.map(d => ({
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
      }));
      setDocuments(mappedDocs);
    }
  };

  const handleToggleAdmin = () => {
    if (!userProfile) return;
    let newRole: UserRole;
    if (userProfile.role === UserRole.TEACHER) newRole = UserRole.ENTERPRISE_ADMIN;
    else if (userProfile.role === UserRole.ENTERPRISE_ADMIN) newRole = UserRole.APP_ADMIN;
    else newRole = UserRole.TEACHER;
    setUserProfile({ ...userProfile, role: newRole });
    if (newRole !== UserRole.APP_ADMIN && currentView === 'brain') setCurrentView('dashboard');
  };

  const incrementQueries = async () => {
    if (!userProfile) return;
    const newCount = userProfile.queriesUsed + 1;
    setUserProfile({ ...userProfile, queriesUsed: newCount });
    await supabase.from('profiles').update({ queries_used: newCount }).eq('id', userProfile.id);
  };

  const canQuery = userProfile ? userProfile.queriesUsed < userProfile.queriesLimit : false;

  const addDocument = async (doc: Document) => {
    // Check local limit first
    const maxDocs = ROLE_LIMITS[userProfile?.plan || SubscriptionPlan.FREE].docs;
    if (documents.length >= maxDocs) {
      alert(`Limit reached: ${userProfile?.plan} users can only upload ${maxDocs} documents.`);
      return;
    }

    setDocuments(prev => [doc, ...prev]);

    // Persist to Supabase
    await supabase.from('documents').insert([{
      id: doc.id,
      user_id: userProfile?.id,
      name: doc.name,
      base64_data: doc.base64Data,
      mime_type: doc.mimeType,
      status: doc.status,
      subject: doc.subject,
      grade_level: doc.gradeLevel,
      slo_tags: doc.sloTags,
      created_at: doc.createdAt
    }]);
  };

  const updateDocument = async (id: string, updates: Partial<Document>) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    
    // Map internal camelCase keys to Supabase snake_case keys for database update
    const dbUpdates: any = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.sloTags) dbUpdates.slo_tags = updates.sloTags;
    if (updates.subject) dbUpdates.subject = updates.subject;
    
    await supabase.from('documents').update(dbUpdates).eq('id', id);
  };

  const updateBrain = async (newBrain: NeuralBrain) => {
    setBrain(newBrain);
    await supabase.from('neural_brain').update({
      master_prompt: newBrain.masterPrompt,
      bloom_rules: newBrain.bloomRules,
      version: newBrain.version + 1,
      updated_at: new Date().toISOString()
    }).eq('id', newBrain.id);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!session || !userProfile) {
    return <Login onSession={setSession} />;
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard user={userProfile} documents={documents} />;
      case 'documents':
        return (
          <Documents 
            documents={documents} 
            onAddDocument={addDocument} 
            onUpdateDocument={updateDocument}
            brain={brain}
            onQuery={incrementQueries}
            canQuery={canQuery}
            userPlan={userProfile.plan}
          />
        );
      case 'chat':
        return <Chat brain={brain} documents={documents} onQuery={incrementQueries} canQuery={canQuery} />;
      case 'tools':
        return <Tools brain={brain} documents={documents} onQuery={incrementQueries} canQuery={canQuery} />;
      case 'brain':
        return <BrainControl brain={brain} onUpdate={updateBrain} />;
      default:
        return <Dashboard user={userProfile} documents={documents} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 overflow-hidden relative">
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transition-all duration-300 lg:static
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${isCollapsed ? 'w-20' : 'w-64'}
      `}>
        <Sidebar 
          currentView={currentView} 
          onViewChange={(v) => { setCurrentView(v); setIsSidebarOpen(false); }} 
          userProfile={userProfile} 
          onToggleAdmin={handleToggleAdmin}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 max-h-screen overflow-hidden">
        {/* Top Mobile Bar */}
        <header className="lg:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-indigo-950">EduNexus AI</span>
          <div className="w-10" />
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto pb-20">
            {renderView()}
          </div>
        </div>
      </main>
    </div>
  );
}
