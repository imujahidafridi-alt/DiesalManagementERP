import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import CustomTitleBar from './CustomTitleBar'
import {
  ShortcutProvider,
  ToastContainer,
  DialogContainer,
  SearchDialog,
} from '@/components/ui'

export default function AppShell() {
  return (
    <ShortcutProvider>
      <div className="flex flex-col h-screen w-screen bg-transparent overflow-hidden font-sans">
        <CustomTitleBar />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Collapsible Sidebar */}
          <Sidebar />

          {/* Main Content Pane */}
          <div className="flex flex-col flex-1 h-full min-w-0">
            {/* Routed Content Area */}
            <main className="flex-1 overflow-auto p-6 bg-transparent">
              <div className="max-w-[1600px] mx-auto">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>

      {/* Global Portal Overlays */}
      <ToastContainer />
      <DialogContainer />
      <SearchDialog />
    </ShortcutProvider>
  )
}
