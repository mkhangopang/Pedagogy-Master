
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './lib/supabase';
import Sidebar from './components/Sidebar';
import Dashboard from './views/Dashboard';
import Documents from './views/Documents';
import Chat from './views/Chat';
import Tools from './views/Tools';
import BrainControl from './views/BrainControl';
import Login from './views/Login';
import { UserRole, SubscriptionPlan, UserProfile, NeuralBrain, Document } from './types';
import { DEFAULT_MASTER_PROMPT, DEFAULT_BLOOM_RULES } from './constants';
import { Loader2 } from 'lucide-react';

const App = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const [brain, setBrain] = useState<NeuralBrain>({
    id: 'b1',
    masterPrompt: DEFAULT_MASTER_PROMPT,
    bloomRules: DEFAULT_BLOOM_RULES,
    version: 1,
    isActive: true,
    updatedAt: new Date().toISOString()
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfileAndDocs(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfileAndDocs(session.user.id);
      else {
        setUserProfile(null);
        setDocuments([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfileAndDocs = async (userId: string) => {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
    
    const initialProfile: UserProfile = profile || {
      id: userId,
      name: session?.user?.email?.split('@')[0] || 'Teacher',
      email: session?.user?.email || '',
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
        content: d.content,
        geminiFileUri: d.gemini_file_uri,
        mimeType: d.mime_type,
        status: d.status,
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
    
    // Update local Supabase if table exists
    await supabase.from('profiles').update({ queries_used: newCount }).eq('id', userProfile.id);
  };

  const canQuery = userProfile ? userProfile.queriesUsed < userProfile.queriesLimit : false;

  const addDocument = async (doc: Document) => {
    setDocuments(prev => [doc, ...prev]);
    await supabase.from('documents').insert([{
      id: doc.id,
      user_id: session.user.id,
      name: doc.name,
      content: doc.content,
      gemini_file_uri: doc.geminiFileUri,
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
    const dbUpdates: any = {};
    if (updates.status) dbUpdates.status = updates.status;
    if (updates.sloTags) dbUpdates.slo_tags = updates.sloTags;
    if (updates.subject) dbUpdates.subject = updates.subject;
    if (updates.geminiFileUri) dbUpdates.gemini_file_uri = updates.geminiFileUri;
    if (updates.mimeType) dbUpdates.mime_type = updates.mimeType;
    await supabase.from('documents').update(dbUpdates).eq('id', id);
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
        return <Chat brain={brain} documents={documents} onQuery={incrementQueries} canQuery={canQuery} />;
      case 'tools':
        return <Tools brain={brain} documents={documents} onQuery={incrementQueries} canQuery={canQuery} />;
      case 'brain':
        return <BrainControl brain={brain} onUpdate={setBrain} />;
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
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
