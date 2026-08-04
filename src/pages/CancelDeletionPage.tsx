import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { isWebAuthnSupported, performAssertion } from "../utils/webauthn";
import { usePageTitle } from "../utils/usePageTitle";
import {
  CenteredCard,
  PageHeader,
  TextField,
  AdminButton as Button,
  Alert,
  StatusScreen,
} from "../components/ui";
import authStyles from "./Auth.module.css";

/**
 * 撤销账户注销：从注销确认邮件的链接 `?token=` 进入。
 *
 * 后端通过注销确认邮件提供一次性撤销链接，本页负责捕获链接中的 token，
 * 并在未登录状态下完成账户身份验证。
 *
 * 身份验证在**未登录**状态下完成：撤销令牌只证明「持有这封邮件」，
 * 还必须再证明「是账户本人」——密码（有 TOTP 的再加验证码），
 * **或者**一次通行密钥断言。
 *
 * 通行密钥这条路不是可选项：纯 Passkey 账户根本没有密码，
 * 只给密码表单等于让他们发起得了注销、却撤销不了。
 */
const CANCEL_TOKEN_STATE_KEY = "__transcircleCancelDeletionToken";

type CancelHistoryState = Record<string, unknown> & {
  [CANCEL_TOKEN_STATE_KEY]?: string;
};

function readHistoryToken(): string {
  const state = window.history.state as CancelHistoryState | null;
  return typeof state?.[CANCEL_TOKEN_STATE_KEY] === "string"
    ? state[CANCEL_TOKEN_STATE_KEY]
    : "";
}

function replaceCancelHistoryToken(token: string | null): void {
  const current = (window.history.state as CancelHistoryState | null) ?? {};
  const next = { ...current };
  if (token) next[CANCEL_TOKEN_STATE_KEY] = token;
  else delete next[CANCEL_TOKEN_STATE_KEY];
  window.history.replaceState(next, "", window.location.pathname);
}

const CancelDeletionPage = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  // URL token 优先；刷新后从当前 history entry 恢复。它不会写入持久存储或复制地址。
  const [token] = useState(() => params.get("token") ?? readHistoryToken());
  useEffect(() => {
    if (token) replaceCancelHistoryToken(token);
  }, [token]);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** 走通行密钥而不是密码。纯 Passkey 账户必须用这条路。 */
  const [passkeyMode, setPasskeyMode] = useState(false);

  usePageTitle(t("cancelDeletion.title"));


  if (done) {
    return (
      <StatusScreen
        kind="success"
        title={t("cancelDeletion.doneTitle")}
        description={t("cancelDeletion.doneDesc")}
        actions={[{ label: t("cancelDeletion.goLogin"), to: "/login" }]}
      />
    );
  }

  const fail = (code: string, message: string): void => {
    const key = `authError.${code}`;
    const localized = t(key);
    setError(localized === key ? message : localized);
  };

  /** 提交撤销。`credential` 为通行密钥断言（走 Passkey 时提供）。 */
  const submitCancel = async (
    credential?: { passkeyAssertion: unknown; challengeId: string },
  ): Promise<void> => {
    const res = await api.post(
      "/v1/me/delete/cancel",
      {
        // 没有令牌也允许提交：**没有邮箱的账户**收不到那封邮件，
        // 一次性链接又可能随响应一起丢失。后端对这种情况放行，
        // 但身份验证门槛不变（账号 + 密码/通行密钥，必要时再加 MFA）。
        ...(token ? { cancelToken: token } : {}),
        identifier: identifier.trim(),
        ...(credential ? credential : { password }),
        ...(mfaCode.trim() ? { mfaCode: mfaCode.trim() } : {}),
      },
      { noAuth: true },
    );
    if (res.ok) {
      replaceCancelHistoryToken(null);
      setDone(true);
      return;
    }
    fail(res.error.code, res.error.message);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    await submitCancel();
    setBusy(false);
  };

  /** 通行密钥撤销：换挑战 → 浏览器断言 → 带断言提交。 */
  const submitWithPasskey = async (): Promise<void> => {
    if (busy) return;
    if (!identifier.trim()) {
      setError(t("cancelDeletion.needIdentifier"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const start = await api.post<{
        challenge: Parameters<typeof performAssertion>[0];
        challengeId: string;
      }>(
        "/v1/me/delete/cancel/passkey/start",
        // 无令牌时按 identifier 定位（仅对无邮箱的待删除账户开放，后端把关）。
        token ? { cancelToken: token } : { identifier: identifier.trim() },
        { noAuth: true },
      );
      if (!start.ok) {
        fail(start.error.code, start.error.message);
        return;
      }
      const assertion = await performAssertion(start.data.challenge);
      await submitCancel({ passkeyAssertion: assertion, challengeId: start.data.challengeId });
    } catch {
      // 用户取消了系统弹窗，或设备不支持 —— 不是错误状态，给一句可执行的提示即可。
      setError(t("cancelDeletion.passkeyFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <CenteredCard>
      <PageHeader
        align="center"
        title={t("cancelDeletion.title")}
        description={token ? t("cancelDeletion.desc") : t("cancelDeletion.descNoToken")}
      />
      <form className={authStyles.form} onSubmit={(e) => void submit(e)}>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField
          label={t("login.identifier")}
          value={identifier}
          autoComplete="username"
          required
          onChange={(e) => setIdentifier(e.target.value)}
        />
        {!passkeyMode && (
          <TextField
            label={t("login.password")}
            type="password"
            value={password}
            autoComplete="current-password"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <TextField
          label={t("cancelDeletion.mfaLabel")}
          // 同时接受动态口令与恢复码，不能限制为纯数字输入。
          value={mfaCode}
          autoComplete="one-time-code"
          hint={t("cancelDeletion.mfaHint")}
          onChange={(e) => setMfaCode(e.target.value)}
        />
        {passkeyMode ? (
          <Button
            type="button"
            variant="primary"
            fullWidth
            loading={busy}
            onClick={() => void submitWithPasskey()}
          >
            {t("cancelDeletion.submitPasskey")}
          </Button>
        ) : (
          <Button type="submit" variant="primary" fullWidth loading={busy}>
            {t("cancelDeletion.submit")}
          </Button>
        )}
        {isWebAuthnSupported() && (
          <button
            type="button"
            className={authStyles.mfaAltLink}
            disabled={busy}
            onClick={() => {
              setPasskeyMode((v) => !v);
              setError(null);
            }}
          >
            {passkeyMode ? t("cancelDeletion.usePassword") : t("cancelDeletion.usePasskey")}
          </button>
        )}
      </form>
      <p className={authStyles.aside}>
        <Link to="/login">{t("common.back")}</Link>
      </p>
    </CenteredCard>
  );
};

export default CancelDeletionPage;
