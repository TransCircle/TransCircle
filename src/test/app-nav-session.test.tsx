import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MeProfile } from "../api/types";

const session = vi.hoisted(() => ({
  user: null as MeProfile | null,
  loading: true,
  logout: vi.fn(),
}));

vi.mock("../context/SessionContext", () => ({
  useSession: () => session,
}));
vi.mock("../context/AdminContext", () => ({
  useAdmin: () => ({ state: "anonymous" }),
}));
vi.mock("../components/ThemeToggle", () => ({ default: () => null }));
vi.mock("../components/ui", () => ({ LanguageToggle: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "zh-CN", changeLanguage: vi.fn() },
  }),
}));

import { AppNav } from "../components/AppNav";

function renderNav() {
  return render(
    <MemoryRouter>
      <AppNav />
    </MemoryRouter>,
  );
}

const profile: MeProfile = {
  id: "usr_1",
  username: "alice",
  email: "alice@example.com",
  displayName: "Alice",
  avatarUrl: null,
  emailVerified: true,
  status: "active",
  passwordSet: true,
  security: {
    hasPassword: true,
    totpEnabled: false,
    passkeyCount: 1,
    oauthProviders: [],
  },
};

describe("AppNav session bootstrap", () => {
  afterEach(() => {
    cleanup();
    session.user = null;
    session.loading = true;
    vi.clearAllMocks();
  });

  it("does not show login or account controls while the session is loading", () => {
    renderNav();

    expect(screen.queryByRole("link", { name: "nav.login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nav\.account/ })).not.toBeInTheDocument();
    const placeholder = screen.getByTestId("session-placeholder");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).not.toHaveAttribute("tabindex");
  });

  it("shows login only after the session is confirmed anonymous", () => {
    session.loading = false;
    renderNav();

    const loginLinks = screen.getAllByRole("link", { name: "nav.login" });
    expect(loginLinks).toHaveLength(2);
    expect(loginLinks[0]).toHaveAttribute("href", "/login");
  });

  it("shows the account trigger for an authenticated user without flashing login", () => {
    session.loading = false;
    session.user = profile;
    renderNav();

    expect(screen.queryByRole("link", { name: "nav.login" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alice · nav.account" })).toBeInTheDocument();
  });

  it("keeps login hidden when loading resolves to an authenticated user", () => {
    const { rerender } = renderNav();
    expect(screen.queryByRole("link", { name: "nav.login" })).not.toBeInTheDocument();

    session.loading = false;
    session.user = profile;
    rerender(
      <MemoryRouter>
        <AppNav />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "nav.login" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alice · nav.account" })).toBeInTheDocument();
  });
});
