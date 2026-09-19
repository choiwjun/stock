import test from "node:test";
import assert from "node:assert/strict";
import { compareCursor, cursorFor, hasCursorGap, shouldIgnoreCursor } from "../src/domain/cursor.js";
import { createListCursor, paginateList, readListCursor } from "../src/application/list-cursor.js";

test("cursor ordering is scoped to streamKey and epoch", () => {
  const first = cursorFor("signal:005930:default", 1, 10);
  const next = cursorFor("signal:005930:default", 1, 11);
  const otherStream = cursorFor("signal:000660:default", 1, 1);

  assert.equal(compareCursor(next, first), 1);
  assert.equal(compareCursor(first, next), -1);
  assert.equal(compareCursor(otherStream, first), null);
  assert.equal(shouldIgnoreCursor(first, next), false);
  assert.equal(shouldIgnoreCursor(next, first), true);
});

test("cursor gaps are detected without comparing different streams", () => {
  const first = cursorFor("signal:005930:default", 2, 40);
  assert.equal(hasCursorGap(first, cursorFor("signal:005930:default", 2, 41)), false);
  assert.equal(hasCursorGap(first, cursorFor("signal:005930:default", 2, 43)), true);
  assert.equal(hasCursorGap(first, cursorFor("signal:005930:default", 3, 1)), false);
  assert.equal(hasCursorGap(first, cursorFor("signal:000660:default", 2, 43)), false);
});

test("list cursors are signed, scoped, and page-bound", () => {
  const scope = "stocks:search:삼성";
  const token = createListCursor({ scope, offset: 2, pageSize: 2 });
  assert.match(token, /^lc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(readListCursor(token, { scope, pageSize: 2 }), { offset: 2, pageSize: 2 });
  assert.throws(() => readListCursor(token, { scope: "stocks:search:카카오", pageSize: 2 }), { code: "INVALID_CURSOR" });
  assert.throws(() => readListCursor(`${token}x`, { scope, pageSize: 2 }), { code: "INVALID_CURSOR" });

  const firstPage = paginateList(["a", "b", "c"], { scope: "letters", pageSize: 2 });
  assert.deepEqual(firstPage.items, ["a", "b"]);
  assert.ok(firstPage.nextCursor);
  const secondPage = paginateList(["a", "b", "c"], { scope: "letters", pageSize: 2, cursor: firstPage.nextCursor });
  assert.deepEqual(secondPage.items, ["c"]);
  assert.equal(secondPage.nextCursor, null);
});
