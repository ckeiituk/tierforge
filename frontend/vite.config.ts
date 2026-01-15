import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: 'http://localhost:8081',
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
