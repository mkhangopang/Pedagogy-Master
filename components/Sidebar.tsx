
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
  Shield,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Zap,
  X,
  Sun,
  Moon
} from 'lucide-react';
import { UserRole, UserProfile, SubscriptionPlan } from '../types';
import { supabase } from '../lib/supabase';
import { APP_NAME } from '../constants';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  userProfile: UserProfile;
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  onClose?: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onViewChange, 
  userProfile, 
  isCollapsed,
  setIsCollapsed,
  onClose,
  theme,
  toggleTheme
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'documents', label: 'Curriculum Docs', icon: FileText },
    { id: 'chat', label: 'AI Tutor Chat', icon: MessageSquare },
    { id: 'tools', label: 'Tools', icon: Wrench },
    { id: 'pricing', label: 'Pricing Tiers', icon: CreditCard },
  ];

  if (userProfile.role === UserRole.APP_ADMIN) {
    navItems.push({ id: 'brain', label: 'Neural Brain', icon: BrainCircuit });
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const getRoleDisplay = () => {
    switch(userProfile.role) {
      case UserRole.APP_ADMIN:
        return { icon: <Shield size={18} />, color: 'bg-amber-500', label: 'Developer' };
      case UserRole.ENTERPRISE_ADMIN:
        return { icon: <Building2 size={18} />, color: 'bg-cyan-500', label: 'Org Admin' };
      default:
        return { icon: <UserCircle size={18} />, color: 'bg-indigo-500', label: 'Educator' };
    }
  };

  const roleInfo = getRoleDisplay();

  return (
    <aside className={`h-full bg-indigo-950 dark:bg-slate-950 text-white flex flex-col transition-all duration-300 relative w-full border-r border-transparent dark:border-slate-900`}>
      {/* Desktop Collapse Toggle */}
      {!onClose && (
        <button 
          onClick={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
          className="absolute -right-3 top-16 w-6 h-6 bg-indigo-600 dark:bg-slate-800 rounded-full flex items-center justify-center border-2 border-indigo-950 dark:border-slate-950 hover:bg-indigo-500 z-[60] hidden lg:flex"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      )}

      {/* Mobile Close Button */}
      {onClose && (
        <button 
          onClick={onClose}
          className="absolute right-4 top-6 p-2 text-indigo-300 hover:text-white transition-colors lg:hidden focus:outline-none z-[60]"
          aria-label="Close menu"
        >
          <X size={24} />
        </button>
      )}

      <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="bg-emerald-500 p-2 rounded-xl shrink-0 shadow-lg shadow-emerald-500/20">
          <GraduationCap size={24} />
        </div>
        {!isCollapsed && <span className="text-xl font-bold truncate tracking-tight">{APP_NAME}</span>}
      </div>

      <nav className="flex-1 px-4 mt-2 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onViewChange(item.id);
                if (onClose) onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive ? 'bg-indigo-600 dark:bg-indigo-500 shadow-lg text-white font-bold' : 'text-indigo-200 dark:text-slate-400 hover:bg-indigo-900/50 dark:hover:bg-slate-900/50 hover:text-white'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? item.label : ''}
            >
              <Icon size={20} className="shrink-0" />
              {!isCollapsed && <span className="font-medium truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {userProfile.plan === SubscriptionPlan.FREE && !isCollapsed && userProfile.role !== UserRole.APP_ADMIN && (
        <div className="mx-4 mb-4 p-4 bg-indigo-900/40 dark:bg-slate-900/40 rounded-2xl border border-indigo-800 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-2 text-amber-400">
            <Zap size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Upgrade to Pro</span>
          </div>
          <button 
            onClick={() => {
              onViewChange('pricing');
              if (onClose) onClose();
            }}
            className="w-full py-2 bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-500 dark:hover:bg-indigo-400 text-xs font-bold rounded-lg transition-colors shadow-lg shadow-indigo-900"
          >
            Unlock Full Access
          </button>
        </div>
      )}

      <div className="p-4 border-t border-indigo-900/50 dark:border-slate-900">
        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className={`w-full flex items-center gap-3 px-4 py-3 mb-2 text-indigo-300 dark:text-slate-400 hover:text-white rounded-lg transition-colors group ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? (theme === 'light' ? 'Dark Mode' : 'Light Mode') : ''}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          {!isCollapsed && <span className="text-sm font-medium">{theme === 'light' ? 'Night Mode' : 'Day Mode'}</span>}
        </button>

        <div 
          className={`flex items-center gap-3 p-3 bg-indigo-900/30 dark:bg-slate-900/30 rounded-xl mb-2 border border-indigo-800/20 dark:border-slate-800/20 ${isCollapsed ? 'justify-center' : ''}`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${roleInfo.color} shadow-sm`}>{roleInfo.icon}</div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <p className="text-[10px] font-bold uppercase tracking-tighter text-indigo-300 dark:text-slate-500">{userProfile.plan} • {roleInfo.label}</p>
              <p className="text-xs font-medium truncate opacity-90">{userProfile.email}</p>
            </div>
          )}
        </div>
        <button onClick={handleSignOut} className={`w-full flex items-center gap-3 px-4 py-3 text-indigo-300 dark:text-slate-400 hover:text-white rounded-lg transition-colors ${isCollapsed ? 'justify-center' : ''}`}>
          <LogOut size={18} />
          {!isCollapsed && <span className="text-sm font-medium">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
