import adapterNetlify from '@sveltejs/adapter-netlify';
import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// 1. Select the function (do NOT add () here)
const selectedAdapter = process.env.DEPLOYMENT_TARGET === 'northflank' 
  ? adapterNode 
  : adapterNetlify;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // 2. Execute the selected adapter with conditional options
    adapter: selectedAdapter(
      process.env.DEPLOYMENT_TARGET === 'northflank' 
        ? { out: 'build' } // Node options
        : { edge: false, split: false } // Netlify options
    )
  }
};

export default config;
