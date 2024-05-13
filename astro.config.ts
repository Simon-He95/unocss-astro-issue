import { defineConfig } from 'astro/config';
import UnoCSS from 'unocss/astro';

// change this to `true` and the error will go away.
const SHOULD_INJECT_RESET = false

export default defineConfig({
  integrations: [UnoCSS({
    // injectEntry: false,
    injectReset: SHOULD_INJECT_RESET
  })],
});
