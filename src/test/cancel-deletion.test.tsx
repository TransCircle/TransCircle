import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("../api/client", () => ({ api: { post } }));
vi.mock("../utils/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../utils/webauthn", () => ({
  isWebAuthnSupported: () => false,
  performAssertion: vi.fn(),
}));

import CancelDeletionPage from "../pages/CancelDeletionPage";

function renderPage(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <CancelDeletionPage />
    </MemoryRouter>,
  );
}

describe("CancelDeletionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/account/cancel-deletion");
  });

  it("stores the email token in the current history entry and removes it from the address", async () => {
    renderPage("/account/cancel-deletion?token=mail-token");

    await waitFor(() => expect(window.history.state.__transcircleCancelDeletionToken).toBe("mail-token"));
    expect(window.location.search).toBe("");
  });

  it("restores the email token from history after a refresh-like remount", async () => {
    window.history.replaceState(
      { __transcircleCancelDeletionToken: "saved-token" },
      "",
      "/account/cancel-deletion",
    );
    post.mockResolvedValue({ ok: true, data: {} });

    renderPage("/account/cancel-deletion");
    fireEvent.change(screen.getByRole("textbox", { name: /login\.identifier/ }), { target: { value: "alice" } });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: "secret" } });
    fireEvent.submit(screen.getByRole("button", { name: "cancelDeletion.submit" }).closest("form")!);

    await waitFor(() => expect(post).toHaveBeenCalledWith(
      "/v1/me/delete/cancel",
      expect.objectContaining({ cancelToken: "saved-token", identifier: "alice", password: "secret" }),
      { noAuth: true },
    ));
    expect(window.history.state.__transcircleCancelDeletionToken).toBeUndefined();
  });

  it("always shows the optional MFA or recovery-code field", () => {
    renderPage("/account/cancel-deletion?token=mail-token");
    expect(screen.getByLabelText("cancelDeletion.mfaLabel")).toBeInTheDocument();
  });
});
