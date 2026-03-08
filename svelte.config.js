
import adapterNetlify from '@sveltejs/adapter-netlify';
import adapterNode from '@sveltejs/adapter-node';

const adapter = process.env.DEPLOYMENT_TARGET === 'northflank' 
  ? adapterNode() 
  : adapterNetlify();



import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      edge: false,
      split: false
    })
  }
};
