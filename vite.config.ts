import { defineConfig } from 'vite';

// Pages では main をルート(/shiroari-bojo/)、nightly を /shiroari-bojo/nightly/ に置く。
// CI では BASE_PATH を切り替えてビルドする。
const base = process.env.BASE_PATH ?? '/shiroari-bojo/';

export default defineConfig({
  base: base.endsWith('/') ? base : `${base}/`,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
