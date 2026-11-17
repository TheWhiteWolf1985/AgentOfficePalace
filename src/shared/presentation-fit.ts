/** UV range for a letterboxed video: preserve aspect ratio on the wide delivered board. */
export function presentationFit(boardAspect: number, videoAspect: number) {
  if (!(boardAspect > 0) || !(videoAspect > 0) || !Number.isFinite(boardAspect + videoAspect)) return { x: 1, y: 1 };
  return videoAspect < boardAspect ? { x: boardAspect / videoAspect, y: 1 } : { x: 1, y: videoAspect / boardAspect };
}
