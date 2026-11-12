/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

/**
 * public/ holds the static files (logo, pdf.js worker, icons) served at the site root. It still contains the old
 * Create React App index.html, which must never replace the built one, so the folder is copied by hand without it.
 */
const copyPublicWithoutIndexHtml = (): Plugin => ({
    name: 'copy-public-without-index-html',
    apply: 'build',
    closeBundle() {
        const from = resolve(__dirname, 'public');
        if (!existsSync(from)) return;
        cpSync(from, resolve(__dirname, 'build'), {
            recursive: true,
            filter: (source) => basename(source).toLowerCase() !== 'index.html',
        });
    },
});

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), copyPublicWithoutIndexHtml()],
    // Settings keep their REACT_APP_ names, so existing .env files keep working.
    envPrefix: 'REACT_APP_',
    server: {
        port: 3000, // the API allows http://localhost:3000 (AllowedCorsOrigin)
        strictPort: true,
    },
    preview: {
        port: 3000,
    },
    build: {
        outDir: 'build', // same folder as before, so deployment does not change
        copyPublicDir: false, // done by copyPublicWithoutIndexHtml
        target: 'es2022', // pdfjs-dist uses top-level await
        // One stylesheet for the whole app, as with Create React App: several screens use classes defined in
        // another screen's .scss, which would be missing when a page's code (and CSS) loads on its own.
        cssCodeSplit: false,
        sourcemap: false,
        chunkSizeWarningLimit: 1500,
        rollupOptions: {
            output: {
                // Large libraries in their own files: cached by the browser across releases of the app.
                manualChunks: {
                    react: ['react', 'react-dom', 'react-router-dom', 'react-redux', '@reduxjs/toolkit'],
                    primereact: ['primereact/api'],
                    editor: ['jodit-react'],
                    pdf: ['pdfjs-dist', 'jspdf'],
                    charts: ['chart.js', 'react-chartjs-2'],
                },
            },
        },
    },
    optimizeDeps: {
        esbuildOptions: { target: 'es2022' },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: './src/setupTests.ts',
        css: false,
    },
});
