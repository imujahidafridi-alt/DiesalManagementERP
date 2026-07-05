import { NavLink } from 'react-router-dom'
import { useUiStore } from '@/store'
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
  Upload,
} from 'lucide-react'
import clsx from 'clsx'

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
  { path: '/import', label: 'Data Import', icon: Upload },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
]

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore()

  return (
    <aside
      className={clsx(
        'h-full border-r bg-white flex flex-col justify-between transition-all duration-200 select-none ease-in-out',
        sidebarCollapsed ? 'w-14' : 'w-56'
      )}
    >
      <div className="flex flex-col flex-1">
        {/* Brand Header */}
        <div className="h-12 border-b flex items-center px-4 justify-between">
          {!sidebarCollapsed && (
            <span className="font-bold text-sm text-blue-600 tracking-tight">
              MALAK ERP
            </span>
          )}
          <button
            onClick={toggleSidebar}
            className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-900 focus:outline-none transition-colors"
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-2 px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2 text-xs font-medium rounded transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )
                }
              >
                <Icon size={16} className="shrink-0" />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>
      </div>

      {/* Footer / Status */}
      <div className="p-3 border-t text-[10px] text-gray-400 font-mono text-center">
        {!sidebarCollapsed ? 'v1.0.0 (Offline)' : 'v1'}
      </div>
    </aside>
  )
}
