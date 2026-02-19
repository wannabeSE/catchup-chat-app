import type * as PIXI from 'pixi.js';

declare module 'nuxt/schema' {
  interface NuxtApp {
    pixi: typeof PIXI;
  }
}

export {};
