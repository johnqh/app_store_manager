import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { configureTheme } from '@sudobility/design';
import { defaultTheme, generateThemeCSS } from '@sudobility/design/themes';
import App from './App';
import './index.css';

// Activate the default design-system theme so @sudobility components and the
// semantic Tailwind tokens (bg-primary, text-foreground, ...) resolve, and
// inject the token values (:root / .dark) that the Tailwind preset references.
configureTheme(defaultTheme);
const styleEl = document.createElement('style');
styleEl.id = 'sudobility-design-theme';
styleEl.textContent = generateThemeCSS(defaultTheme);
document.head.appendChild(styleEl);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
