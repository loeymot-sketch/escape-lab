import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  // A production bundle never guesses its API address (see lib/api.ts): say so while building, not only at runtime.
  if (command === 'build' && !loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL) {
    console.warn('\n[escape-lab] VITE_API_URL is not set: this bundle will refuse to start until it is built with the API address.\n');
  }
  return { plugins: [react()], server: { port: 5173 } };
});
