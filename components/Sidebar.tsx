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
  Moon,
  ClipboardCheck
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
    { id: 'tracker', label: 'Progress Tracker', icon: ClipboardCheck },
    { id: 'chat', label: 'AI Tutor Chat', icon: MessageSquare },
    { id: 'tools', label: 'Tools', icon: Wrench },
    { id: 'pricing', label: 'Pricing Tiers', icon: CreditCard },
  ];

  if (userProfile.role === UserRole.APP_ADMIN) {
    navItems.push({ id: 'brain', label: 'Neural Brain', icon: BrainCircuit });
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Sign out failed:", e);
      window.location.reload();
    }
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
    <aside className={`h-full bg-indigo-950 dark:bg-slate-950 text-white flex flex-col transition-all duration-300 relative w-full border-r border-transparent dark:border-slate-800 shadow-2xl`}>
      
      {/* DESKTOP COLLAPSE BUTTON */}
      <button 
        onClick={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }}
        className="absolute -right-3 top-20 w-6 h-6 bg-indigo-600 dark:bg-slate-800 rounded-full flex items-center justify-center border-2 border-indigo-950 dark:border-slate-950 hover:bg-indigo-500 z-[110] hidden lg:flex shadow-xl"
        title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      {/* HEADER */}
      <div className={`p-6 flex items-center justify-between`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center w-full' : 'gap-3'}`}>
          <div className="bg-emerald-500 p-2 rounded-xl shrink-0 shadow-lg shadow-emerald-500/20">
            <GraduationCap size={24} />
          </div>
          {!isCollapsed && <span className="text-xl font-black truncate tracking-tight">{APP_NAME}</span>}
        </div>
        
        {/* MOBILE CLOSE BUTTON (Hidden on Desktop) */}
        {onClose && (
          <button 
            onClick={onClose}
            className="p-2 text-indigo-300 hover:text-white transition-colors lg:hidden"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        )}
      </div>

      {/* NAVIGATION */}
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
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-lg font-bold' 
                  : 'text-indigo-200/70 hover:bg-white/5 hover:text-white'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isCollapsed ? item.label : ''}
            >
              <Icon size={20} className={`shrink-0 ${isActive ? 'text-white' : 'group-hover:text-white'}`} />
              {!isCollapsed && <span className="font-medium truncate text-sm">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* PROMO / UPGRADE (Desktop only) */}
      {userProfile.plan === SubscriptionPlan.FREE && !isCollapsed && userProfile.role !== UserRole.APP_ADMIN && (
        <div className="mx-4 mb-4 p-4 bg-white/5 rounded-2xl border border-white/10">
          <div className="flex items-center gap-2 mb-2 text-amber-400">
            <Zap size={14} fill="currentColor" />
            <span className="text-[10px] font-black uppercase tracking-widest">Neural Pro</span>
          </div>
          <button 
            onClick={() => { onViewChange('pricing'); if (onClose) onClose(); }}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black uppercase tracking-widest rounded-lg transition-all shadow-lg active:scale-95"
          >
            Go Enterprise
          </button>
        </div>
      )}

      {/* FOOTER ACTIONS */}
      <div className="p-4 border-t border-white/5 bg-black/10">
        <button 
          onClick={toggleTheme}
          className={`w-full flex items-center gap-3 px-4 py-2.5 mb-2 text-indigo-300/70 dark:text-slate-500 hover:text-white rounded-xl transition-colors group ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? (theme === 'light' ? 'Dark Mode' : 'Light Mode') : ''}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          {!isCollapsed && <span className="text-xs font-medium uppercase tracking-widest">Theme: {theme}</span>}
        </button>

        <div className={`flex items-center gap-3 p-3 bg-white/5 rounded-xl mb-2 border border-white/5 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${roleInfo.color} shadow-sm text-white`}>{roleInfo.icon}</div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <p className="text-[10px] font-black uppercase tracking-tighter text-indigo-300">{userProfile.plan} Node</p>
              <p className="text-[11px] font-medium truncate opacity-60 text-indigo-100">{userProfile.email}</p>
            </div>
          )}
        </div>
        
        <button 
          onClick={handleSignOut} 
          className={`w-full flex items-center gap-3 px-4 py-3 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-xl transition-colors ${isCollapsed ? 'justify-center' : ''}`}
        >
          <LogOut size={18} />
          {!isCollapsed && <span className="text-xs font-black uppercase tracking-widest">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;