/**
 * A cursor is comparable only inside the same stream and epoch. Sequence from
 * another ticker or stream must never invalidate the current stream state.
 */
export function compareCursor(left, right) {
  if (!left || !right || left.streamKey !== right.streamKey) return null;
  if (left.epoch !== right.epoch) return left.epoch - right.epoch;
  return left.sequence - right.sequence;
}

export function shouldIgnoreCursor(lastCursor, nextCursor) {
  const comparison = compareCursor(nextCursor, lastCursor);
  return comparison !== null && comparison <= 0;
}

export function hasCursorGap(lastCursor, nextCursor) {
  const comparison = compareCursor(nextCursor, lastCursor);
  return comparison !== null && nextCursor.epoch === lastCursor.epoch && nextCursor.sequence > lastCursor.sequence + 1;
}

export function cursorFor(streamKey, epoch, sequence) {
  return { streamKey, epoch, sequence };
}
