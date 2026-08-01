import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base is set for GitHub Pages project-page hosting (alexkrewson.github.io/timeline/).
export default defineConfig({
  base: '/timeline/',
  plugins: [react()],
})
