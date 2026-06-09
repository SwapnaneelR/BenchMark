import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/leaderboard': 'http://localhost:3000',
      '/submit': 'http://localhost:3000',
    },
  },
});
