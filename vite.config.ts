import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Khi chạy thử cục bộ với PostgREST (không có Supabase), đặt THU_POSTGREST=http://127.0.0.1:3000
const postgrest = process.env.THU_POSTGREST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: postgrest
    ? { proxy: { '/rest/v1': { target: postgrest, changeOrigin: true, rewrite: (p) => p.replace(/^\/rest\/v1/, '') } } }
    : undefined,
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/xlsx')) return 'xlsx';
          if (id.includes('node_modules/docx')) return 'docx';
          if (id.includes('node_modules/@supabase')) return 'supabase';
        },
      },
    },
  },
});
