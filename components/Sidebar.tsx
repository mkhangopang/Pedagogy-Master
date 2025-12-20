
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
  ShieldAlert,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Zap
} from 'lucide-react';
import { UserRole, UserProfile, SubscriptionPlan } from '../types';
import { supabase } from '../lib/supabase';
import { APP_NAME } from '../constants';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  userProfile: UserProfile;
  onToggleAdmin: () => void;
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onViewChange, 
  userProfile, 
  onToggleAdmin,
  isCollapsed,
  setIsCollapsed
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'documents', label: 'Curriculum Docs', icon: FileText },
    { id: 'chat', label: 'AI Tutor Chat', icon: MessageSquare },
    { id: 'tools', label: 'Gen Tools', icon: Wrench },
    { id: 'pricing', label: 'Pricing Tiers', icon: CreditCard },
  ];

  if (userProfile.role === UserRole.APP_ADMIN) {
    navItems.push({ id: 'brain', label: 'Neural Brain', icon: BrainCircuit });
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const usagePercent = (userProfile.queriesUsed / userProfile.queriesLimit) * 100;

  const getRoleDisplay = () => {
    switch(userProfile.role) {
      case UserRole.APP_ADMIN:
        return { icon: <Shield size={18} />, color: 'bg-amber-500', label: 'System Admin' };
      case UserRole.ENTERPRISE_ADMIN:
        return { icon: <Building2 size={18} />, color: 'bg-cyan-500', label: 'Org Admin' };
      default:
        return { icon: <UserCircle size={18} />, color: 'bg-indigo-500', label: 'Educator' };
    }
  };

  const roleInfo = getRoleDisplay();

  return (
    <aside className={`h-screen bg-indigo-950 text-white flex flex-col transition-all duration-300 relative ${isCollapsed ? 'w-20' : 'w-64'}`}>
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-16 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center border-2 border-indigo-950 hover:bg-indigo-500 z-50 hidden lg:flex"
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>

      <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="bg-emerald-500 p-2 rounded-xl shrink-0"><GraduationCap size={24} /></div>
        {!isCollapsed && <span className="text-xl font-bold truncate tracking-tight">{APP_NAME}</span>}
      </div>

      <nav className="flex-1 px-4 mt-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                isActive ? 'bg-indigo-600 shadow-lg' : 'text-indigo-200 hover:bg-indigo-900/50 hover:text-white'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? item.label : ''}
            >
              <Icon size={20} className="shrink-0" />
              {!isCollapsed && <span className="font-medium truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {userProfile.plan === SubscriptionPlan.FREE && !isCollapsed && (
        <div className="mx-4 mb-4 p-4 bg-indigo-900/40 rounded-2xl border border-indigo-800">
          <div className="flex items-center gap-2 mb-2 text-amber-400">
            <Zap size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Upgrade to Pro</span>
          </div>
          <button 
            onClick={() => onViewChange('pricing')}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-xs font-bold rounded-lg transition-colors shadow-lg shadow-indigo-900"
          >
            Unlock Full Access
          </button>
        </div>
      )}

      <div className="p-4 border-t border-indigo-900/50">
        <div 
          onClick={onToggleAdmin}
          className={`flex items-center gap-3 p-3 bg-indigo-900/30 rounded-xl mb-2 cursor-pointer hover:bg-indigo-900/50 border border-transparent hover:border-indigo-800 ${isCollapsed ? 'justify-center' : ''}`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${roleInfo.color}`}>{roleInfo.icon}</div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <p className="text-[10px] font-bold uppercase tracking-tighter text-indigo-300">{userProfile.plan} • {roleInfo.label}</p>
              <p className="text-xs font-medium truncate">{userProfile.email}</p>
            </div>
          )}
        </div>
        <button onClick={handleSignOut} className={`w-full flex items-center gap-3 px-4 py-3 text-indigo-300 hover:text-white ${isCollapsed ? 'justify-center' : ''}`}>
          <LogOut size={18} />
          {!isCollapsed && <span className="text-sm font-medium">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
