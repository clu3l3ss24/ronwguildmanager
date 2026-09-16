import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Enables React's automatic JSX runtime for every .jsx component.
export default defineConfig({
  plugins: [react()],
});
