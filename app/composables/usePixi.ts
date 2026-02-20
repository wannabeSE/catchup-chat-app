import { Application } from "pixi.js";
export async function usePixi() {
  const app = new Application();
  await app.init({
    background: "#2B1B34",
    resizeTo: window,
    backgroundAlpha: 1,
  });
  return app;
}
