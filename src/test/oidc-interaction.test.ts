import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearOidcInteraction,
  readOidcInteraction,
  rememberOidcInteraction,
} from "../utils/oidcInteraction";

describe("OIDC interaction continuity", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => sessionStorage.clear());

  it("stores and restores a valid interaction", () => {
    expect(rememberOidcInteraction("abc.DEF_123~xyz-0")).toBe("abc.DEF_123~xyz-0");
    expect(readOidcInteraction(null, true)).toBe("abc.DEF_123~xyz-0");
  });

  it("rejects invalid interactions without overwriting the stored value", () => {
    rememberOidcInteraction("valid-uid");
    expect(readOidcInteraction("contains/slash")).toBeNull();
    expect(readOidcInteraction(null, true)).toBe("valid-uid");
  });

  it("does not restore stored state unless explicitly requested", () => {
    rememberOidcInteraction("valid-uid");
    expect(readOidcInteraction(null)).toBeNull();
  });

  it("clears a completed interaction", () => {
    rememberOidcInteraction("valid-uid");
    clearOidcInteraction();
    expect(readOidcInteraction(null, true)).toBeNull();
  });
});
