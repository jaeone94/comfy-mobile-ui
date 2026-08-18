import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/i18n' // i18n initialization
import { installComfyAuthAxiosInterceptor } from './infrastructure/auth/ComfyAuthService'
import { useConnectionStore } from './ui/store/connectionStore'
import App from './App.tsx'

installComfyAuthAxiosInterceptor()
useConnectionStore.getState().hydrateAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
