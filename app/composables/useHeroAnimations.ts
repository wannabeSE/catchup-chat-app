import { Rectangle, Sprite, Texture } from "pixi.js";
import type { Direction } from "~/types/shared";
export type HeroAnimationsProps = {
  texture: Texture;
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
  animationSpeed: number;
}
export const useHeroAnimations = ({ texture, frameWidth, frameHeight, totalFrames, animationSpeed }: HeroAnimationsProps) => {
  const frameRef = ref(0)
  const elapsedTimeRef = ref(0)
  const sprite = ref<Sprite | null>(null)
  const getRowByDirection = (direction: Direction | null) => {
    switch (direction) {
      case "up":
        return 8;
      case "left":
        return 9;
      case "right":
        return 11;
      case "down":
        return 10;
      default:
        return 10;
    }
  };
  const getFrameTexture = (row: number, column: number) => {
    const rectangle = new Rectangle(
      column * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight,
    );
    return new Texture({ source: texture._source, frame: rectangle });
  };

  const updateSprite = (direction: Direction | null, isMoving: boolean) => {
    const row = getRowByDirection(direction);
    let column = 0;
    if (isMoving) {
      elapsedTimeRef.value += animationSpeed;
      if (elapsedTimeRef.value >= 1) {
        elapsedTimeRef.value = 0;
        frameRef.value = (frameRef.value + 1) % totalFrames;
      }
      column = frameRef.value;
    }
    if (sprite.value) {
      sprite.value.texture = getFrameTexture(row, column);
    }
  };

  // Single sprite instance: update its texture each frame instead of replacing it.
  // Avoids remove/add cycle that triggers ObservablePoint _onUpdate null errors.
  const newSprite = new Sprite(getFrameTexture(getRowByDirection(null), 0));
  newSprite.anchor.set(0.5, 1);
  sprite.value = newSprite;

  return { getFrameTexture, updateSprite, sprite };
};
