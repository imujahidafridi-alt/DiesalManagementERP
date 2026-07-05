import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel } from '../ipc/ipc-types'

// Safely bridge Electron APIs to the Renderer process using contextBridge.
// This ensures that the Renderer is sandboxed and does not have access to full Node.js APIs.
contextBridge.exposeInMainWorld('api', {
  invoke: (channel: IpcChannel, ...args: unknown[]) => {
    // Whitelist channel prefix check or explicit channels for security
    return ipcRenderer.invoke(channel, ...args)
  },
})
