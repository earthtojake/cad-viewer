import assert from "node:assert/strict";
import test from "node:test";

import {
  COLOR_SCHEME_STORAGE_KEY,
  DARK_COLOR_SCHEME_ID,
  DEFAULT_COLOR_SCHEME_ID,
  LIGHT_COLOR_SCHEME_ID,
  readColorSchemePreference,
  resolveColorSchemeMode,
  writeColorSchemePreference
} from "./colorScheme.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, String(value));
    },
    removeItem: (key) => {
      values.delete(key);
    }
  };
}

test("color scheme preference persists independently from theme settings", () => {
  const storage = createMemoryStorage();

  assert.equal(readColorSchemePreference(storage), DEFAULT_COLOR_SCHEME_ID);

  assert.equal(writeColorSchemePreference(DARK_COLOR_SCHEME_ID, { storage }), true);
  assert.equal(storage.getItem(COLOR_SCHEME_STORAGE_KEY), DARK_COLOR_SCHEME_ID);
  assert.equal(readColorSchemePreference(storage), DARK_COLOR_SCHEME_ID);
  assert.equal(resolveColorSchemeMode(readColorSchemePreference(storage), { prefersDark: false }), DARK_COLOR_SCHEME_ID);

  assert.equal(writeColorSchemePreference(LIGHT_COLOR_SCHEME_ID, { storage }), true);
  assert.equal(readColorSchemePreference(storage), LIGHT_COLOR_SCHEME_ID);

  assert.equal(writeColorSchemePreference(DEFAULT_COLOR_SCHEME_ID, { storage }), true);
  assert.equal(storage.getItem(COLOR_SCHEME_STORAGE_KEY), null);
  assert.equal(readColorSchemePreference(storage), DEFAULT_COLOR_SCHEME_ID);
  assert.equal(resolveColorSchemeMode(readColorSchemePreference(storage), { prefersDark: true }), DARK_COLOR_SCHEME_ID);
});
