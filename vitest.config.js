import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup/canvas.js'],
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js', 'server/**/*.js'],
      exclude: [
        'src/main.js',
        'src/ChaseMusic.js',
        'src/Sfx.js',
        'src/Environment.js',
        'server/debug.js',
        'server/index.js',
      ],
    },
  },
});
