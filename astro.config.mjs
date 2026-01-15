import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel/static';

export default defineConfig({
  output: 'static',
  adapter: vercel(),
  integrations: [tailwind()],
  // COOP/COEP headers for SharedArrayBuffer are configured in vercel.json for production
  // They're disabled in dev to avoid browser extension conflicts
});
