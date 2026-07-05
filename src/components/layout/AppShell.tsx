import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import {
  ShortcutProvider,
  ToastContainer,
  DialogContainer,
  SearchDialog,
} from '@/components/ui'

export default function AppShell() {
  return (
    <ShortcutProvider>
      <div className="flex h-screen w-screen bg-gray-50 overflow-hidden font-sans">
        {/* Collapsible Sidebar */}
        <Sidebar />

        {/* Main Content Pane */}
        <div className="flex flex-col flex-1 h-full min-w-0">
          {/* Topbar Info Header */}
          <Topbar />

          {/* Routed Content Area */}
          <main className="flex-1 overflow-auto p-6 bg-gray-50">
            <div className="max-w-[1600px] mx-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* Global Portal Overlays */}
      <ToastContainer />
      <DialogContainer />
      <SearchDialog />
    </ShortcutProvider>
  )
}
