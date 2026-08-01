import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The time core and model layer are headless by design (§12) — no DOM needed.
// The one .tsx suite opts into jsdom with a per-file @vitest-environment docblock.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
