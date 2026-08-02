import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, setUserToken } from "../api/client";
import type { LoginResult } from "../api/types";
import { useSession } from "../context/SessionContext";
import { sanitizeRedirect } from "../utils/url";
import { usePageTitle } from "../utils/usePageTitle";
import {
  CenteredCard,
  PageHeader,
  StatusScreen,
  TextField,
  AdminButton as Button,
  Alert,
} from "../components/ui";
import authStyles from "./Auth.module.css";

// ============================================================================
// 登录第二因素由统一身份接管时的交接数据
//
// 流程：登录页拿到 mfaRequired + availableMethods 含 'iam' → POST /v1/auth/mfa/iam/start
// → 整页跳到 IAM 的验证页 → IAM 验证完回跳本页（?verification_id=&status=）。
//
// 整页跳转会清空 React 状态，而回查 POST /v1/auth/mfa/iam/verify 必须带上
// mfaChallengeToken —— 它只在登录页的内存里。因此跳转前必须把它落到 sessionStorage。
// 用 sessionStorage 而非 localStorage：挑战是一次性的，关掉标签就该作废。
// ============================================================================

export const IAM_MFA_HANDOFF_KEY = "pass_iam_mfa_handoff";

export interface IamMfaHandoff {
  /** 本次登录的 MFA 挑战令牌（后端回查与恢复码兜底都要用它）。 */
  mfaChallengeToken: string;
  /** /mfa/iam/start 返回的验证请求 id，仅用于让后端比对，不作信任凭据。 */
  verificationId?: string;
  /** 登录成功后的站内去向（使用时仍会再净化一次）。 */
  redirect?: string;
  /** OIDC 交互 uid：有值时回登录页由既有交互续跑逻辑接手。 */
  oidc?: string;
}

export function saveIamMfaHandoff(handoff: IamMfaHandoff): void {
  try {
    sessionStorage.setItem(IAM_MFA_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    // sessionStorage 不可用时不阻断跳转：回来后本页会给出「重新登录」的出路。
  }
}

/** 逐字段校验后再返回：存储可能被手改，形状不对就当没有。 */
export function readIamMfaHandoff(): IamMfaHandoff | null {
  try {
    const raw = sessionStorage.getItem(IAM_MFA_HANDOFF_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.mfaChallengeToken !== "string" || !o.mfaChallengeToken) return null;
    return {
      mfaChallengeToken: o.mfaChallengeToken,
      verificationId: typeof o.verificationId === "string" ? o.verificationId : undefined,
      redirect: typeof o.redirect === "string" ? o.redirect : undefined,
      oidc: typeof o.oidc === "string" ? o.oidc : undefined,
    };
  } catch {
    return null;
  }
}

export function clearIamMfaHandoff(): void {
  try {
    sessionStorage.removeItem(IAM_MFA_HANDOFF_KEY);
  } catch {
    /* noop */
  }
}

// ─── 轮询节奏 ────────────────────────────────────────────────────

/** 2 秒一次：与后端 30 次/分的限流留出余量，撞到限流也只退避不失败。 */
const POLL_INTERVAL_MS = 2000;
/** 总预算约 2 分钟；超出即判超时并给出路，不无限转圈。 */
const POLL_BUDGET_MS = 120_000;
/** 限流 / 网络抖动时的退避。 */
const BACKOFF_MS = 5000;

/** 回跳 URL 里 status 的「已通过」取值域；其余值只当提示，权威结果一律以后端回查为准。 */
const OK_STATUSES = new Set(["verified", "success", "approved", "ok", "completed"]);

/** POST /v1/auth/mfa/iam/verify：未完成时 200 {verified:false}，完成时返回登录结果。 */
type IamVerifyResult = LoginResult & { verified?: boolean; status?: string };

type Phase = "polling" | "landing" | "missing" | "failed" | "timeout" | "recovery";

/**
 * /auth/mfa/done —— 统一身份完成第二因素后的落地页。
 *
 * 三条铁律：
 * 1. 回跳参数（verification_id / status）只作提示，绝不可作信任凭据；真正的结论
 *    来自 POST /v1/auth/mfa/iam/verify 的后端回查，且回查用的是交接数据里的
 *    verificationId（后端还会再与挑战里记着的那一个比对）。
 * 2. 后端未完成时返回 200 {verified:false}，需要轮询——有节制地轮询。
 * 3. 失败/超时必须给出路：重试，或改用恢复码登录（恢复码是接管开启时唯一的破窗通道）。
 */
const AuthMfaDonePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refresh } = useSession();
  const [params] = useSearchParams();

  usePageTitle(t("mfa.done.title"));

  // 只在挂载时读一次：轮询期间不该被别处改写。
  const [handoff] = useState<IamMfaHandoff | null>(() => readIamMfaHandoff());
  const [phase, setPhase] = useState<Phase>("polling");
  const [failure, setFailure] = useState<{ code: string; message: string } | null>(null);
  /** 重试计数：递增即重跑轮询 effect。 */
  const [round, setRound] = useState(0);

  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);

  // IAM 回跳时自称的状态：只用来给一句提示，不参与任何判定。
  const hintedStatus = params.get("status");
  const hintedFailure = !!hintedStatus && !OK_STATUSES.has(hintedStatus.toLowerCase());

  /** 邮箱未验证：与登录页同一条出路（重发验证邮件）。 */
  const goVerifyEmail = useCallback(
    (email?: unknown) => {
      const q = new URLSearchParams({ reason: "email_not_verified" });
      if (typeof email === "string" && email) q.set("email", email);
      navigate(`/verify-email?${q.toString()}`, { replace: true });
    },
    [navigate],
  );

  /** 验证通过：落地会话并跳转，与登录页的成功路径一致。 */
  const land = useCallback(
    async (data: IamVerifyResult) => {
      clearIamMfaHandoff();
      if (data.accessToken) setUserToken(data.accessToken);
      await refresh();
      if (handoff?.oidc) {
        // OIDC 交互的续跑（含 consent 分支）已在登录页实现，不在这里复制第二份：
        // 会话此刻已建立，登录页看到 user + oidc 会直接续跑，不再要求输密码。
        navigate(`/login?oidc=${encodeURIComponent(handoff.oidc)}`, { replace: true });
        return;
      }
      // mustChangePassword 为真时不做特判：账户中心顶部已有强制改密提示，
      // 这里硬拐弯反而会把用户原本要去的地方吞掉。
      navigate(sanitizeRedirect(handoff?.redirect, "/account"), { replace: true });
    },
    [handoff, navigate, refresh],
  );

  useEffect(() => {
    if (phase !== "polling") return;
    if (!handoff) {
      setPhase("missing");
      return;
    }

    let alive = true;
    const deadline = Date.now() + POLL_BUDGET_MS;
    // 卸载/重试时要能立刻唤醒挂在 sleep 上的循环，否则它会永远挂着不释放闭包。
    let wake: (() => void) | null = null;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        wake = resolve;
        timerRef.current = window.setTimeout(() => {
          wake = null;
          resolve();
        }, ms);
      });

    void (async () => {
      while (alive && Date.now() < deadline) {
        const body: Record<string, unknown> = { mfaChallengeToken: handoff.mfaChallengeToken };
        if (handoff.verificationId) body.verificationId = handoff.verificationId;
        const res = await api.post<IamVerifyResult>("/v1/auth/mfa/iam/verify", body, {
          noAuth: true,
        });
        if (!alive) return;

        if (res.ok) {
          if (res.data?.accessToken) {
            setPhase("landing");
            await land(res.data);
            return;
          }
          // 后端明确回「尚未完成」：挑战没被消费，继续等。
          await sleep(POLL_INTERVAL_MS);
          continue;
        }

        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(res.error.data?.email);
          return;
        }
        // 网络抖动(status 0)与轮询限流(429)都不是结论，退避后继续。
        if (res.status === 0 || res.status === 429) {
          await sleep(BACKOFF_MS);
          continue;
        }
        setFailure({ code: res.error.code, message: res.error.message });
        setPhase("failed");
        return;
      }
      if (alive) setPhase("timeout");
    })();

    return () => {
      alive = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      // 唤醒后循环立刻走到 !alive 分支退出，闭包随之释放。
      wake?.();
    };
  }, [phase, round, handoff, land, goVerifyEmail]);

  /** 恢复码兜底：统一身份不可达时唯一能登进来的方式（后端在接管开启时仍接受恢复码）。 */
  const submitRecovery = async (e: FormEvent) => {
    e.preventDefault();
    if (recoveryBusy || !handoff || !recoveryCode) return;
    setRecoveryError(null);
    setRecoveryBusy(true);
    try {
      const res = await api.post<IamVerifyResult>(
        "/v1/auth/mfa/totp/verify",
        { mfaChallengeToken: handoff.mfaChallengeToken, code: recoveryCode },
        { noAuth: true },
      );
      if (!res.ok) {
        if (res.error.code === "EMAIL_NOT_VERIFIED") {
          goVerifyEmail(res.error.data?.email);
          return;
        }
        setRecoveryError(res.error.message);
        return;
      }
      setPhase("landing");
      await land(res.data);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const startRecovery = () => {
    setRecoveryCode("");
    setRecoveryError(null);
    setPhase("recovery");
  };

  const retry = () => {
    setFailure(null);
    setRound((n) => n + 1);
    setPhase("polling");
  };

  const backToLogin = () => {
    clearIamMfaHandoff();
    navigate("/login", { replace: true });
  };

  // ── 恢复码兜底界面 ──
  if (phase === "recovery") {
    return (
      <CenteredCard>
        <PageHeader
          align="center"
          size="card"
          as="h1"
          title={t("mfa.done.recoveryTitle")}
          description={t("mfa.done.recoveryDesc")}
        />
        <form className={authStyles.form} onSubmit={submitRecovery}>
          {recoveryError && <Alert tone="error">{recoveryError}</Alert>}
          <TextField
            label={t("mfa.done.recoveryLabel")}
            autoComplete="one-time-code"
            autoFocus
            className={`${authStyles.mfaCode} ${authStyles.mfaCodeLong}`}
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            required
          />
          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={recoveryBusy}
            disabled={!recoveryCode || recoveryBusy}
          >
            {t("mfa.done.recoverySubmit")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            fullWidth
            disabled={recoveryBusy}
            onClick={retry}
          >
            {t("mfa.done.backToIam")}
          </Button>
          {/* 恢复码也用不了时的最后一条出路，别把人困在这两个按钮之间。 */}
          <button
            type="button"
            className={authStyles.mfaAltLink}
            disabled={recoveryBusy}
            onClick={backToLogin}
          >
            {t("mfa.done.backToLogin")}
          </button>
        </form>
      </CenteredCard>
    );
  }

  // ── 交接数据缺失：无从回查，只能重新登录 ──
  if (phase === "missing") {
    return (
      <StatusScreen
        kind="error"
        title={t("mfa.done.missingTitle")}
        description={t("mfa.done.missingDesc")}
        actions={
          user
            ? [{ label: t("account.title"), to: "/account" }]
            : [{ label: t("mfa.done.backToLogin"), onClick: backToLogin }]
        }
      />
    );
  }

  // ── 回查失败：给重试与恢复码两条出路 ──
  if (phase === "failed" && failure) {
    // 优先用本地化的错误说明，未收录的错误码回落后端 message。
    const key = `mfa.done.error.${failure.code}`;
    const localized = t(key);
    // 挑战已失效/耗尽时重试没有意义，只留「重新登录」。
    const terminal =
      failure.code === "TOKEN_INVALID_OR_EXPIRED" ||
      failure.code === "MFA_CHALLENGE_EXHAUSTED" ||
      failure.code === "IAM_MFA_USER_MISMATCH" ||
      failure.code === "MFA_IAM_NOT_STARTED";
    return (
      <StatusScreen
        kind="error"
        title={t("mfa.done.errorTitle")}
        description={localized === key ? failure.message : localized}
        detail={failure.code}
        actions={
          terminal
            ? [{ label: t("mfa.done.backToLogin"), onClick: backToLogin }]
            : [
                { label: t("mfa.done.retry"), onClick: retry },
                { label: t("mfa.done.useRecovery"), onClick: startRecovery },
                { label: t("mfa.done.backToLogin"), variant: "ghost" as const, onClick: backToLogin },
              ]
        }
      />
    );
  }

  // ── 超时：两分钟没等到结论 ──
  if (phase === "timeout") {
    return (
      <StatusScreen
        kind="error"
        title={t("mfa.done.timeoutTitle")}
        description={t("mfa.done.timeoutDesc")}
        actions={[
          { label: t("mfa.done.retry"), onClick: retry },
          { label: t("mfa.done.useRecovery"), onClick: startRecovery },
          { label: t("mfa.done.backToLogin"), variant: "ghost" as const, onClick: backToLogin },
        ]}
      />
    );
  }

  // ── 轮询中 / 正在落地 ──
  return (
    <StatusScreen
      kind="loading"
      title={phase === "landing" ? t("mfa.done.successTitle") : t("mfa.done.title")}
      description={
        phase === "landing" ? (
          t("mfa.done.successDesc")
        ) : (
          <>
            {t("mfa.done.desc")}
            {/* IAM 自称未通过时也照样回查——它只是提示，不是结论。 */}
            {hintedFailure && (
              <>
                {" "}
                {t("mfa.done.hintedFailure")}
              </>
            )}
          </>
        )
      }
      actions={
        phase === "landing"
          ? undefined
          : [{ label: t("mfa.done.useRecovery"), variant: "secondary" as const, onClick: startRecovery }]
      }
    />
  );
};

export default AuthMfaDonePage;
