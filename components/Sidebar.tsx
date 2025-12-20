
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
  ChevronRight
} from 'lucide-react';
import { UserRole, UserProfile } from '../types';
import { supabase } from '../lib/supabase';

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
        return {
          icon: <Shield className="w-5 h-5 text-white" />,
          color: 'bg-amber-500 shadow-amber-500/20',
          label: 'System Admin',
          badgeColor: 'text-amber-400'
        };
      case UserRole.ENTERPRISE_ADMIN:
        return {
          icon: <Building2 className="w-5 h-5 text-white" />,
          color: 'bg-cyan-500 shadow-cyan-500/20',
          label: 'Org Admin',
          badgeColor: 'text-cyan-400'
        };
      default:
        return {
          icon: <UserCircle className="w-6 h-6 text-white" />,
          color: 'bg-indigo-500 shadow-indigo-500/20',
          label: 'Teacher',
          badgeColor: 'text-indigo-200'
        };
    }
  };

  const roleInfo = getRoleDisplay();

  return (
    <aside className={`
      relative h-screen bg-indigo-950 text-white flex flex-col transition-all duration-300
      ${isCollapsed ? 'w-20' : 'w-64'}
    `}>
      {/* Collapse Toggle */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center border-2 border-indigo-950 text-white hover:bg-indigo-500 transition-colors hidden lg:flex"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <div className={`p-6 flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="bg-emerald-500 p-2 rounded-xl shadow-lg shadow-emerald-500/20 shrink-0">
          <GraduationCap className="w-6 h-6 text-white" />
        </div>
        {!isCollapsed && <span className="text-xl font-bold tracking-tight truncate">EduNexus AI</span>}
      </div>

      <nav className="flex-1 px-4 mt-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/50' 
                  : 'text-indigo-200 hover:bg-indigo-900/50 hover:text-white'
              } ${isCollapsed ? 'justify-center' : ''}`}
              title={isCollapsed ? item.label : ''}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && <span className="font-medium truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-4 px-6 space-y-4">
        {!isCollapsed ? (
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
          </div>
        ) : (
          <div className="h-10 w-full flex items-center justify-center">
             <div className="w-1.5 h-full bg-indigo-900 rounded-full overflow-hidden relative">
                <div 
                  className={`absolute bottom-0 w-full transition-all duration-1000 ${usagePercent > 90 ? 'bg-rose-500' : 'bg-emerald-400'}`}
                  style={{ height: `${Math.min(usagePercent, 100)}%` }}
                />
             </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-indigo-900/50 space-y-2">
        <div 
          onClick={onToggleAdmin}
          className={`px-4 py-3 flex items-center gap-3 bg-indigo-900/30 rounded-xl mb-2 cursor-pointer hover:bg-indigo-900/50 transition-all border border-indigo-800/30 group relative ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? 'Cycle Role' : 'Dev Toggle: Cycle Roles'}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg shrink-0 ${roleInfo.color}`}>
            {roleInfo.icon}
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden flex-1">
              <div className="flex items-center gap-1.5">
                <p className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${roleInfo.badgeColor}`}>
                  {userProfile.plan} • {roleInfo.label}
                </p>
              </div>
              <p className="text-sm font-medium text-white truncate">{userProfile.email || 'Testing Mode'}</p>
            </div>
          )}
          {!isCollapsed && (
            <div className="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity">
               <ShieldAlert className="w-4 h-4 text-indigo-400" />
            </div>
          )}
        </div>

        <button 
          onClick={handleSignOut}
          className={`w-full flex items-center gap-3 px-4 py-3 text-indigo-300 hover:text-white hover:bg-rose-900/20 rounded-lg transition-colors group ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? 'Sign Out' : ''}
        >
          <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform shrink-0" />
          {!isCollapsed && <span className="font-medium">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
