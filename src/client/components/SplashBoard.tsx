import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { createSplashBoard, nextSplashEncounter } from '../splash-simulation';
import { useMediaQuery } from '../app/useMediaQuery';

const ABSORB_MS = 420;

export function SplashBoard({
  tokenRef,
}: {
  tokenRef: RefObject<HTMLSpanElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    const canvas = canvasRef.current;
    const token = tokenRef.current;
    const brush = canvas?.getContext('2d');
    if (!canvas || !brush || !token) return;
    let board = createSplashBoard();
    let enemies = new Map(
      board.level.tiles.map((tile) => [
        tile.cell,
        board.state.enemies.get(tile.id)!,
      ])
    );
    let encounter = nextSplashEncounter(board.level, board.state);
    let started = performance.now();
    let contactStarted: number | null = null;
    token.style.setProperty('--splash-absorb-duration', `${ABSORB_MS}ms`);
    let request = 0;
    let lastDraw = 0;
    const size = 58;
    const draw = (now: number) => {
      request = requestAnimationFrame(draw);
      if (document.hidden || now - lastDraw < (reducedMotion ? 250 : 32))
        return;
      lastDraw = now;
      const bounds = canvas.getBoundingClientRect();
      const portrait = token.getBoundingClientRect();
      const pixelRatio = Math.min(devicePixelRatio, 2);
      if (
        canvas.width !== Math.round(bounds.width * pixelRatio) ||
        canvas.height !== Math.round(bounds.height * pixelRatio)
      ) {
        canvas.width = Math.round(bounds.width * pixelRatio);
        canvas.height = Math.round(bounds.height * pixelRatio);
      }
      brush.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      brush.clearRect(0, 0, bounds.width, bounds.height);
      const colors = getComputedStyle(canvas);
      const elapsed = reducedMotion ? 0 : now - started;
      const path = encounter?.path ?? [board.state.position];
      const stepInterval = 620;
      const moveDuration = 440;
      const stepCount = Math.max(1, path.length - 1);
      const travelMs = (stepCount - 1) * stepInterval + moveDuration;
      const stepIndex = Math.floor(elapsed / stepInterval);
      const withinStep = Math.min(1, (elapsed % stepInterval) / moveDuration);
      const eased = withinStep * withinStep * (3 - 2 * withinStep);
      const progress = Math.min(path.length - 1, stepIndex + eased);
      const previous = path[Math.floor(progress)]!;
      const next = path[Math.min(path.length - 1, Math.floor(progress) + 1)]!;
      const fraction = progress % 1;
      const cameraX =
        (previous % 51) + ((next % 51) - (previous % 51)) * fraction;
      const cameraY =
        Math.floor(previous / 51) +
        (Math.floor(next / 51) - Math.floor(previous / 51)) * fraction;
      const anchorX = portrait.left - bounds.left + portrait.width / 2;
      const anchorY = portrait.top - bounds.top + portrait.height / 2;
      const contact = elapsed >= travelMs;
      if (contact && contactStarted === null) contactStarted = now;
      const contactElapsed = contactStarted === null ? 0 : now - contactStarted;
      token.dataset.encounter = contact ? 'absorb' : 'walk';
      canvas.dataset.position = `${Math.floor(progress) === path.length - 1 ? next : previous}`;
      canvas.dataset.phase = contact ? 'absorb' : 'walk';
      const fromX = Math.floor(cameraX - anchorX / size) - 1;
      const fromY = Math.floor(cameraY - anchorY / size) - 1;
      for (
        let row = fromY;
        row < fromY + Math.ceil(bounds.height / size) + 3;
        row++
      ) {
        for (
          let column = fromX;
          column < fromX + Math.ceil(bounds.width / size) + 3;
          column++
        ) {
          const x = anchorX + (column - cameraX - 0.5) * size;
          const y = anchorY + (row - cameraY - 0.5) * size;
          brush.strokeStyle = colors.getPropertyValue('--color-floor-edge');
          brush.lineWidth = 1;
          brush.strokeRect(x + 2, y + 2, size - 4, size - 4);
          const value =
            column >= 0 && column < 51 && row >= 0 && row < 51
              ? enemies.get(row * 51 + column)
              : undefined;
          if (value !== undefined) {
            const target = encounter?.path.at(-1) === row * 51 + column;
            const fade =
              target && elapsed >= travelMs
                ? 1 - contactElapsed / ABSORB_MS
                : 1;
            brush.globalAlpha = Math.max(0, fade);
            const palette = [
              '--color-enemy',
              '--color-add',
              '--color-multiply',
              '--color-boss',
              '--color-notice-surface',
            ];
            const colorIndex =
              (row * 17 + column * 31 + Number(value)) % palette.length;
            brush.fillStyle = colors.getPropertyValue(palette[colorIndex]!);
            brush.fillRect(x + 6, y + 6, size - 12, size - 12);
            brush.fillStyle = colors.getPropertyValue('--color-ink');
            brush.font = 'bold 19px Trebuchet MS, sans-serif';
            brush.textAlign = 'center';
            brush.textBaseline = 'middle';
            brush.fillText(value.toString(), x + size / 2, y + size / 2);
            brush.globalAlpha = 1;
          }
        }
      }
      if (!reducedMotion && contact && contactElapsed >= ABSORB_MS) {
        if (encounter) board = { ...board, state: encounter.state };
        encounter = nextSplashEncounter(board.level, board.state);
        if (!encounter) {
          board = createSplashBoard();
          encounter = nextSplashEncounter(board.level, board.state);
        }
        enemies = new Map(
          board.level.tiles
            .filter((tile) => board.state.enemies.has(tile.id))
            .map((tile) => [tile.cell, board.state.enemies.get(tile.id)!])
        );
        started = now;
        contactStarted = null;
      }
    };
    request = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(request);
      delete token.dataset.encounter;
      token.style.removeProperty('--splash-absorb-duration');
    };
  }, [reducedMotion, tokenRef]);
  return (
    <canvas
      className="splash-board-canvas"
      ref={canvasRef}
      aria-hidden="true"
    />
  );
}
