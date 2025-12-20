
'use client';

import React from 'react';
import { FileText, MessageSquare, Zap, Target, TrendingUp, BarChart3, Plus } from 'lucide-react';
import { UserProfile, Document } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  user: UserProfile;
  documents: Document[];
}

const Dashboard: React.FC<DashboardProps> = ({ user, documents }) => {
  const usagePercentage = (user.queriesUsed / user.queriesLimit) * 100;
  const totalSLOs = documents.reduce((acc, doc) => acc + (doc.sloTags?.length || 0), 0);
  
  // Dynamic display name logic
  const displayName = user.name || user.email.split('@')[0];

  const chartData = [
    { name: 'Mon', queries: 4 },
    { name: 'Tue', queries: 7 },
    { name: 'Wed', queries: user.queriesUsed > 10 ? 12 : 5 },
    { name: 'Thu', queries: user.queriesUsed > 20 ? 18 : 8 },
    { name: 'Fri', queries: user.queriesUsed > 30 ? 25 : 12 },
    { name: 'Sat', queries: 6 },
    { name: 'Sun', queries: 9 },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Welcome, {displayName}</h1>
          <p className="text-slate-500 mt-1">Your pedagogical ecosystem is healthy and active.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm w-fit">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-slate-600">Real-time syncing enabled</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Documents" 
          value={documents.length.toString()} 
          icon={<FileText className="w-6 h-6 text-indigo-600" />} 
          trend="In library"
          color="indigo"
        />
        <StatCard 
          title="AI Activity" 
          value={`${user.queriesUsed}/${user.queriesLimit}`} 
          icon={<MessageSquare className="w-6 h-6 text-emerald-600" />} 
          trend={`${Math.round(usagePercentage)}% of monthly quota`}
          color="emerald"
        />
        <StatCard 
          title="SLO Insights" 
          value={totalSLOs.toString()} 
          icon={<Target className="w-6 h-6 text-amber-600" />} 
          trend="Knowledge items mapped"
          color="amber"
        />
        <StatCard 
          title="Subscription" 
          value={user.plan.toUpperCase()} 
          icon={<Zap className="w-6 h-6 text-purple-600" />} 
          trend="Plan Status"
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-500" />
                Query Engagement
              </h2>
              <div className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded">LIVE TREND</div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorQueries" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  />
                  <Area type="monotone" dataKey="queries" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorQueries)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Curriculum Assets</h2>
            <div className="space-y-4">
              {documents.length > 0 ? (
                documents.slice(0, 3).map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                        <FileText className="w-5 h-5 text-indigo-500 group-hover:text-white" />
                      </div>
                      <div>
                        <h3 className="font-medium text-slate-900 truncate max-w-[200px]">{doc.name}</h3>
                        <p className="text-sm text-slate-500">{doc.sloTags?.length || 0} Objectives found</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${doc.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {doc.status.toUpperCase()}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Plus className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">No documents yet. Start by uploading curriculum files.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-indigo-600 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-lg font-bold mb-2">Pro Mastery</h3>
              <p className="text-indigo-100 text-sm mb-6">Unlock deeper Bloom's analysis and full document history management.</p>
              <button className="w-full py-3 bg-white text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition-colors shadow-sm">
                View Plans
              </button>
            </div>
            <div className="absolute top-[-20px] right-[-20px] w-40 h-40 bg-indigo-500 rounded-full opacity-20 blur-3xl"></div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Neural Brain Metrics</h2>
            <div className="p-4 bg-slate-50 rounded-xl space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-medium">Model Engine</span>
                <span className="text-slate-900 font-bold">Gemini 3 Flash</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-medium">Current Load</span>
                <span className="text-emerald-600 font-bold text-[10px] uppercase">Optimal</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500 font-medium">Logic Version</span>
                <span className="text-slate-900 font-bold">1.2.4</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon, trend, color }: { title: string, value: string, icon: React.ReactNode, trend: string, color: string }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-4 hover:shadow-md transition-all">
    <div className="flex items-center justify-between">
      <div className={`p-2 bg-${color}-50 rounded-lg`}>{icon}</div>
      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{title}</span>
    </div>
    <div>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-1">{trend}</div>
    </div>
  </div>
);

export default Dashboard;
