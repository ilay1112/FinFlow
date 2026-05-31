import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/index'
import App from './App.tsx'
import { authService } from './services/auth'

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
