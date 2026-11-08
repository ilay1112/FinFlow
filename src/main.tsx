import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/index'
import App from './App.tsx'
import { authService } from './services/auth'
import { completeWebAuthInPopup } from './services/webAuth'

// If this window is the Google sign-in popup returning with a code, finish the exchange
// and close — don't boot the app (or the SocialLogin plugin, which could try to claim
// the redirect itself).
if (!completeWebAuthInPopup()) {
  // Initialize social login plugin for web/native compatibility
  console.log('Starting SocialLogin initialization...');
  authService.initialize().then(() => {
    console.log('SocialLogin initialization complete');
  });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
