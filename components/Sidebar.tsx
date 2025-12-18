
import React from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  MessageSquare, 
  Wrench, 
  BrainCircuit, 
  LogOut,
  GraduationCap,
  UserCircle,
  Zap
} from 'lucide-react';
import { UserRole, UserProfile } from '../types';
import { supabase } from '../lib/supabase';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  userProfile: UserProfile;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, userProfile }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'documents', label: 'Curriculum Docs', icon: FileText },
    { id: 'chat', label: 'AI Tutor Chat', icon: MessageSquare },
    { id: 'tools', label: 'Gen Tools', icon: Wrench },
  ];

  if (userProfile.role === UserRole.APP_ADMIN) {
    navItems.push({ id: 'brain', label: 'Neural Brain', icon: BrainCircuit });
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const usagePercent = (userProfile.queriesUsed / userProfile.queriesLimit) * 100;

  return (
    <aside className="w-64 bg-indigo-950 text-white flex flex-col h-screen sticky top-0">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-emerald-500 p-2 rounded-xl">
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight">EduNexus AI</span>
      </div>

      <nav className="flex-1 px-4 mt-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' 
                  : 'text-indigo-200 hover:bg-indigo-900/50 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 px-6 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold text-indigo-300 uppercase tracking-widest">
            <span>AI Capacity</span>
            <span>{userProfile.queriesUsed}/{userProfile.queriesLimit}</span>
          </div>
          <div className="h-1.5 w-full bg-indigo-900 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${usagePercent > 90 ? 'bg-rose-500' : 'bg-emerald-400'}`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>
          {usagePercent >= 100 && (
            <p className="text-[10px] text-rose-400 font-bold animate-pulse">Limit reached - Upgrade required</p>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-indigo-900 space-y-2">
        <div className="px-4 py-3 flex items-center gap-3 bg-indigo-900/30 rounded-xl mb-2">
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center">
            <UserCircle className="w-6 h-6" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-indigo-200 uppercase tracking-wider">{userProfile.plan} Plan</p>
            <p className="text-sm font-medium text-white truncate">{userProfile.email}</p>
          </div>
        </div>
        <button 
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 text-indigo-300 hover:text-white hover:bg-rose-900/20 rounded-lg transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
