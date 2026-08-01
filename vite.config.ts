import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the repo name for GitHub Pages project-page hosting
// (alexkrewson.github.io/timeline2/). Change both together if the repo is renamed.
export default defineConfig({
  base: '/timeline2/',
  plugins: [react()],
})
