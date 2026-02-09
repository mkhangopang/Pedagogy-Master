
import React from 'react';
import { 
  LayoutDashboard, 
  FileText, 
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
  ClipboardCheck,
  Scale,
  ShieldAlert,
  SearchCheck,
  BarChart3,
  Eye
} from 'lucide-react';
import { UserRole, UserProfile, StakeholderRole, SubscriptionPlan } from '../types';
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
  if (!userProfile) return null;

  const isDev = userProfile.role === UserRole.APP_ADMIN;
  const isStakeholder = !!userProfile.stakeholderRole;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'documents', label: 'Curriculum Vault', icon: FileText },
    { id: 'tools', label: 'Neural Tools', icon: Wrench },
    { id: 'tracker', label: 'Progress Tracker', icon: ClipboardCheck },
  ];

  // 🏛️ STAKEHOLDER LENS INJECTION (ZERO COST)
  if (userProfile.stakeholderRole === StakeholderRole.GOVT_AUDITOR) {
    navItems.push({ id: 'audit_logs', label: 'Alignment Registry', icon: SearchCheck });
  }
  if (userProfile.stakeholderRole === StakeholderRole.NGO_OBSERVER) {
    navItems.push({ id: 'impact_metrics', label: 'Impact Narrative', icon: BarChart3 });
  }

  if (userProfile.role !== UserRole.APP_ADMIN) {
    navItems.push({ id: 'pricing', label: 'Pricing Tiers', icon: CreditCard });
  }

  if (isDev) {
    navItems.push({ id: 'brain', label: 'Master Recipe', icon: BrainCircuit });
    navItems.push({ id: 'audit', label: 'System Audit', icon: Scale });
    navItems.push({ id: 'mission', label: 'Mission Control', icon: ShieldAlert });
  }

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      window.location.reload();
    }
  };

  const getRoleDisplay = () => {
    if (userProfile.stakeholderRole === StakeholderRole.GOVT_AUDITOR) return { icon: <Scale size={18} />, color: 'bg-blue-600', label: 'Govt Auditor' };
    if (userProfile.stakeholderRole === StakeholderRole.NGO_OBSERVER) return { icon: <Eye size={18} />, color: 'bg-emerald-600', label: 'NGO Observer' };
    
    switch(userProfile.role) {
      case UserRole.APP_ADMIN: return { icon: <Shield size={18} />, color: 'bg-amber-500', label: 'Developer' };
      case UserRole.ENTERPRISE_ADMIN: return { icon: <Building2 size={18} />, color: 'bg-cyan-500', label: 'SME Node' };
      default: return { icon: <UserCircle size={18} />, color: 'bg-indigo-500', label: 'Educator' };
    }
  };

  const roleInfo = getRoleDisplay();

  return (
    <aside className={`h-full bg-indigo-950 dark:bg-slate-950 text-white flex flex-col transition-all duration-300 relative w-full border-r border-transparent dark:border-slate-800 shadow-2xl`}>
      <button onClick={(e) => { e.stopPropagation(); setIsCollapsed(!isCollapsed); }} className="absolute -right-3 top-20 w-6 h-6 bg-indigo-600 dark:bg-slate-800 rounded-full flex items-center justify-center border-2 border-indigo-950 dark:border-slate-950 hover:bg-indigo-500 z-[110] hidden lg:flex shadow-xl">
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      <div className={`p-6 flex items-center justify-between`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center w-full' : 'gap-3'}`}>
          <div className="bg-emerald-500 p-2 rounded-xl shrink-0 shadow-lg shadow-emerald-500/20"><GraduationCap size={24} /></div>
          {!isCollapsed && <span className="text-xl font-black truncate tracking-tight uppercase">{APP_NAME}</span>}
        </div>
        {onClose && <button onClick={onClose} className="p-2 text-indigo-300 hover:text-white transition-colors lg:hidden"><X size={24} /></button>}
      </div>

      <nav className="flex-1 px-4 mt-2 space-y-1 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button key={item.id} onClick={() => { onViewChange(item.id); if (onClose) onClose(); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${isActive ? 'bg-indigo-600 text-white shadow-lg font-bold' : 'text-indigo-200/70 hover:bg-white/5 hover:text-white'} ${isCollapsed ? 'justify-center px-0' : ''}`}>
              <Icon size={20} className={`shrink-0 ${isActive ? 'text-white' : 'group-hover:text-white'}`} />
              {!isCollapsed && <span className="font-medium truncate text-sm uppercase tracking-tight">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5 bg-black/10">
        <button onClick={toggleTheme} className={`w-full flex items-center gap-3 px-4 py-2.5 mb-2 text-indigo-300/70 hover:text-white rounded-xl transition-colors ${isCollapsed ? 'justify-center' : ''}`}>
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          {!isCollapsed && <span className="text-[10px] font-black uppercase tracking-widest">Theme: {theme}</span>}
        </button>

        <div className={`flex items-center gap-3 p-3 bg-white/5 rounded-xl mb-2 border border-white/5 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${roleInfo.color} shadow-sm text-white`}>{roleInfo.icon}</div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <p className="text-[10px] font-black uppercase tracking-tighter text-indigo-300">{roleInfo.label}</p>
              <p className="text-[11px] font-medium truncate opacity-60 text-indigo-100">{userProfile.email}</p>
            </div>
          )}
        </div>
        
        <button onClick={handleSignOut} className={`w-full flex items-center gap-3 px-4 py-3 text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors ${isCollapsed ? 'justify-center' : ''}`}>
          <LogOut size={18} />
          {!isCollapsed && <span className="text-xs font-black uppercase tracking-widest">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
