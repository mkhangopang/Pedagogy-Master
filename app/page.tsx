
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
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES } from '../constants';
import { Loader2 } from 'lucide-react';

/**
 * Main Application Component (Next.js 14 Client Component)
 */
export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

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
        bloom_rules: data.bloom_rules, // Check field name mapping
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
      queriesUsed: profile.queries_used,
      queriesLimit: profile.queries_limit
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
        base64Data: d.base64_data, // Ensure field matches DB
        mimeType: d.mime_type,
        status: d.status as 'processing' | 'completed' | 'failed',
        subject: d.subject,
        gradeLevel: d.grade_level,
        sloTags: d.slo_tags || [],
        createdAt: d.created_at
      }));
      setDocuments(mappedDocs);
    }
  };

  const incrementQueries = async () => {
    if (!userProfile) return;
    const newCount = userProfile.queriesUsed + 1;
    setUserProfile({ ...userProfile, queriesUsed: newCount });
    // Update profile in DB if needed (async)
  };

  const saveChatMessage = async (msg: ChatMessage) => {
    // Optional persistence implementation
  };

  const canQuery = userProfile ? userProfile.queriesUsed < userProfile.queriesLimit : false;

  const addDocument = async (doc: Document) => {
    setDocuments(prev => [doc, ...prev]);
  };

  const updateDocument = async (id: string, updates: Partial<Document>) => {
    setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };

  const updateBrain = async (newBrain: NeuralBrain) => {
    setBrain(newBrain);
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
          />
        );
      case 'chat':
        return <Chat 
          brain={brain} 
          documents={documents} 
          onQuery={incrementQueries} 
          onSaveMessage={saveChatMessage}
          canQuery={canQuery} 
        />;
      case 'tools':
        return <Tools brain={brain} documents={documents} onQuery={incrementQueries} canQuery={canQuery} />;
      case 'brain':
        return <BrainControl brain={brain} onUpdate={updateBrain} />;
      default:
        return <Dashboard user={userProfile} documents={documents} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        userProfile={userProfile} 
      />
      <main className="flex-1 p-8 overflow-y-auto max-h-screen">
        <div className="max-w-6xl mx-auto">
          {renderView()}
        </div>
      </main>
    </div>
  );
}
