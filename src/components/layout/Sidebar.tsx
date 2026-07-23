import { NavLink } from 'react-router-dom'
import { useUiStore, useAppStore } from '@/store'
import Logo from '@/components/common/Logo'
import {
  LayoutDashboard,
  ShoppingBag,
  ArrowLeftRight,
  Receipt,
  Truck,
  Users,
  Building2,
  Database,
  BarChart3,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  History,
  Info,
  Lock,
} from 'lucide-react'
import clsx from 'clsx'
import { appConfig } from '@/config/appConfig'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/purchases', label: 'Purchases', icon: ShoppingBag },
  { path: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { path: '/sales', label: 'Sales', icon: Receipt },
  { path: '/drivers', label: 'Drivers', icon: Truck },
  { path: '/customers', label: 'Customers', icon: Users },
  { path: '/suppliers', label: 'Suppliers', icon: Building2 },
  { path: '/inventory', label: 'Inventory', icon: Database },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/audit', label: 'Audit Trail', icon: History },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
  { path: '/about', label: 'About', icon: Info },
]

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore()
  const { dbConnected } = useAppStore()

  return (
    <aside
      className={clsx(
        'h-full border-r border-slate-800/80 sidebar-gradient flex flex-col justify-between transition-all duration-300 select-none ease-in-out shadow-xl shrink-0 text-slate-300',
        sidebarCollapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className="flex flex-col flex-1">
        {/* Brand Header & Toggle */}
        {sidebarCollapsed ? (
          <div className="h-12 border-b border-slate-800/50 flex items-center justify-center">
            <button
              onClick={toggleSidebar}
              className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white focus:outline-none transition-colors"
              title="Expand Sidebar"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="border-b border-slate-800/50 pb-3 flex flex-col">
            <div className="flex justify-end px-2 pt-1">
              <button
                onClick={toggleSidebar}
                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white focus:outline-none transition-colors"
                title="Collapse Sidebar"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
            <div className="flex flex-col items-center px-4 mt-1 select-none">
              <Logo className="w-full h-auto max-h-16 invert opacity-90 brightness-200" />
              <span className="text-[9px] font-bold text-slate-400 mt-2 uppercase text-center tracking-wider leading-tight">
                Sahara Group General Transport
              </span>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 py-3 px-2 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  clsx(
                    'relative flex items-center gap-3 px-3 py-2.5 text-xs font-semibold rounded-xl transition-all duration-200 group',
                    isActive
                      ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white active-glow'
                      : 'text-slate-400 hover:bg-white/5 hover:text-white'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/4 bottom-1/4 w-1 bg-white rounded-r-md" />
                    )}
                    <Icon
                      size={16}
                      className={clsx(
                        'shrink-0 transition-transform duration-200 group-hover:scale-110',
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                      )}
                    />
                    {!sidebarCollapsed && <span>{item.label}</span>}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* Lock Application Button */}
      <div className="p-2 px-3 border-t border-slate-800/80">
        <button
          onClick={() => useAppStore.getState().lockApp()}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold text-slate-300 hover:text-white bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 transition-all cursor-pointer shadow-sm',
            sidebarCollapsed ? 'justify-center px-0' : 'justify-start'
          )}
          title="Lock Application Session"
        >
          <Lock size={16} className="text-amber-400 shrink-0" />
          {!sidebarCollapsed && <span>Lock Application</span>}
        </button>
      </div>

      {/* Footer / Status */}
      <div className="p-3 border-t border-slate-800/50 text-[10px] text-slate-500 font-mono text-center">
        {!sidebarCollapsed ? `${appConfig.version} (${dbConnected ? 'Online' : 'Offline'})` : (dbConnected ? 'ON' : 'OFF')}
      </div>
    </aside>
  )
}
