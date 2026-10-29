import { createTailwindPreset } from '@sudobility/design';

/** @type {import('tailwindcss').Config} */
export default {
  // The design system's default-theme tokens (bg-primary, border-input, ...)
  // map to hsl(var(--primary)) etc.; the variable values are injected at runtime
  // by generateThemeCSS(defaultTheme) in src/main.tsx.
  presets: [createTailwindPreset()],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './node_modules/@sudobility/components/**/*.{js,jsx,ts,tsx}',
    './node_modules/@sudobility/design/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: [],
};
