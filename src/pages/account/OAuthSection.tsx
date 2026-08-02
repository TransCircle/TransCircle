import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { OAuthBinding } from "../../api/types";
import { useFormatTs } from "../../utils/datetime";
import { StepUpDialog } from "../../components/StepUpDialog";
import {
  Card,
  AdminButton as Button,
  Alert,
  Spinner,
  StatusBadge,
} from "../../components/ui";
import { Dialog, ConfirmDialog } from "../../components/ui/Dialog";
import s from "./Account.module.css";

const GithubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.82.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12Z" />
  </svg>
);
const XIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.24 2.25h3.31l-7.23 8.26L23.04 21.75h-6.66l-4.71-6.23-5.4 6.23H2.96l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12L17.08 19.77Z" />
  </svg>
);
/** 统一身份：盾牌 + 对钩，与「工作人员身份」的语义对上，且不与第三方品牌图标混淆。 */
const IamIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 8.5-4.1-.9-7-4.3-7-8.5V6l7-3Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

/**
 * 门户已知提供商的**图标与兜底展示名**。
 *
 * ⚠️ 这里**不是**「有哪些提供商」的名单 —— 那件事只有后端知道
 * （`GET /v1/auth/oauth/providers` 只列已配置的，缺客户端凭据的提供商点了必然 502，
 * 不如不显示）。前端自己维护第二份名单必然漂移：要么少了新加的提供商，
 * 要么留着一个后端根本没配的死按钮。本表只负责「认识的提供商长什么样」。
 */
const PROVIDER_ICONS: Record<string, ReactNode> = {
  github: <GithubIcon />,
  x: <XIcon />,
  iam: <IamIcon />,
};
const PROVIDER_LABEL_KEYS: Record<string, string> = {
  github: "account.oauth.provider.github",
  x: "account.oauth.provider.x",
  iam: "account.oauth.provider.iam",
};

/**
 * label 与 unbindable 已进入公共 `OAuthBinding` 类型（design/api-delta.md §5b.1/§5b.2），
 * 不再需要本地扩展别名。
 */
type OAuthBindingItem = OAuthBinding;

/** GET /v1/me/oauth/:provider/bind/start */
interface BindStart {
  authorizationUrl: string;
  /** 该 provider 绑定后是否不可自行解除；为真时必须先让用户确认再跳转。 */
  permanent?: boolean;
  label?: string;
}

/** 待确认的不可逆绑定：先弹确认框讲清后果，用户点「继续」后再换一条带确认标记的新授权地址。 */
interface PendingPermanentBind {
  provider: string;
  label: string;
}

/** 第三方与统一身份的账号绑定：绑定 / 解绑（解绑需 step-up；统一身份不可自行解绑）。 */
export function OAuthSection() {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const [bindings, setBindings] = useState<OAuthBindingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 正在发起绑定跳转的 provider id（防重复点击 + 按钮 busy 态）。 */
  const [bindingId, setBindingId] = useState<string | null>(null);
  const [unbindTarget, setUnbindTarget] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingUnbind, setPendingUnbind] = useState<string | null>(null);
  const [permanentBind, setPermanentBind] = useState<PendingPermanentBind | null>(null);
  /** confirmPermanentBind 换新地址期间的忙态/错误——独立于外层 busy，弹框内就近展示。 */
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  /** 后端给出的可用提供商（已配置的才在里面）；null = 没拿到，退回本地已知集合。 */
  const [available, setAvailable] = useState<Array<{ provider: string; label?: string }> | null>(
    null,
  );

  const load = async () => {
    setLoading(true);
    // 两个请求一起发，一起收：分开会让列表先按兜底名单渲染再抖一下。
    const [bound, offered] = await Promise.all([
      api.get<OAuthBindingItem[]>("/v1/me/oauth"),
      api.get<{ providers: Array<{ provider: string; label?: string }> }>(
        "/v1/auth/oauth/providers",
      ),
    ]);
    if (bound.ok) setBindings(bound.data);
    else setError(bound.error.message);
    // 拿不到名单不算致命：退回本地已知集合，用户至少还能操作既有绑定。
    if (offered.ok) setAvailable(offered.data.providers);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  /** 未绑定时的展示名：先用后端 label，再回落本地文案，最后才是原始 id。 */
  const fallbackLabel = (id: string) => {
    const fromBackend = available?.find((p) => p.provider === id)?.label;
    if (fromBackend) return fromBackend;
    const key = PROVIDER_LABEL_KEYS[id];
    if (!key) return id;
    const text = t(key);
    return text === key ? id : text;
  };

  const bind = async (provider: string) => {
    setError(null);
    setNotice(null);
    setBindingId(provider);
    const res = await api.get<BindStart>(`/v1/me/oauth/${encodeURIComponent(provider)}/bind/start`);
    if (res.ok && res.data.authorizationUrl) {
      if (res.data.permanent === true) {
        // 不可逆绑定：先弹确认框讲清后果，用户点「继续」才真正发起跳转（换一条带确认
        // 标记的新地址，见下方 confirmPermanentBind）。这次拿到的 authorizationUrl 不用，
        // 对应的 state 会在 10 分钟后自然过期，不必特地作废。
        setPermanentBind({
          provider,
          label: res.data.label || fallbackLabel(provider),
        });
        setBindingId(null);
        return;
      }
      // 保持 busy 态直到浏览器完成跳转，避免等待期间重复点击。
      window.location.href = res.data.authorizationUrl;
      return;
    }
    setError(res.ok ? t("error.generic") : res.error.message);
    setBindingId(null);
  };

  /**
   * 用户在不可逆确认框里点了「继续绑定」：带着 ?ack=true 重新调用 bind/start，
   * 把「已确认」记进这一次新 state 的服务端 metadata，再跳转到这条新地址。
   *
   * 不复用弹框前那次 bind/start 返回的地址——那条 state 没有确认标记，落地页会在
   * complete-binding 时被后端拒绝（ACK_REQUIRED）。确认结果必须和「即将实际使用的
   * 这次授权」绑在一起，而不是事后再补。
   */
  const confirmPermanentBind = async () => {
    if (!permanentBind) return;
    const { provider } = permanentBind;
    setDialogBusy(true);
    setDialogError(null);
    const res = await api.get<BindStart>(
      `/v1/me/oauth/${encodeURIComponent(provider)}/bind/start?ack=true`,
    );
    if (res.ok && res.data.authorizationUrl) {
      setBindingId(provider);
      window.location.href = res.data.authorizationUrl;
      return;
    }
    setDialogError(res.ok ? t("error.generic") : res.error.message);
    setDialogBusy(false);
  };

  const cancelPermanentBind = () => {
    setPermanentBind(null);
    setDialogBusy(false);
    setDialogError(null);
  };

  const doUnbind = async (provider: string) => {
    setBusy(true);
    setError(null);
    const res = await api.del(`/v1/me/oauth/${encodeURIComponent(provider)}`);
    if (res.ok) {
      setNotice(t("account.oauth.unboundOk"));
      await load();
    } else if (res.error.code === "IAM_BINDING_PERMANENT") {
      // 界面本就不该渲染这个按钮；真走到这里说明列表数据过期，重新拉一次让界面自洽。
      setError(t("account.oauth.permanentRejected"));
      await load();
    } else if (res.error.code === "STEP_UP_REQUIRED" || res.status === 403) {
      // 需要二次验证：弹出 step-up，验证通过后重试
      setPendingUnbind(provider);
      setStepUpOpen(true);
    } else {
      setError(res.error.message);
    }
    setBusy(false);
    setUnbindTarget(null);
  };

  // 可绑定的（后端名单）在前、只在绑定记录里出现的历史/已下线 provider 在后。
  // 后者也必须看得见，否则用户会以为绑定丢了 —— 哪怕它已经不在可绑定名单里。
  const offeredIds = available ? available.map((p) => p.provider) : Object.keys(PROVIDER_ICONS);
  const rowIds = [...new Set([...offeredIds, ...bindings.map((b) => b.provider)])];
  const rows = rowIds.map((id) => ({
    id,
    icon: PROVIDER_ICONS[id] ?? null,
    bound: bindings.find((b) => b.provider === id) ?? null,
  }));

  const unbindTargetLabel =
    bindings.find((b) => b.provider === unbindTarget)?.label ??
    (unbindTarget ? fallbackLabel(unbindTarget) : "");

  // 已绑统一身份:把「权限怎么生效」写在这里 —— 用户绑完最常问的就是「然后呢」。
  const iamBound = !loading && bindings.some((b) => b.provider === "iam");

  return (
    <section className={s.group}>
      <h2 className={s.groupTitle}>{t("account.nav.oauth")}</h2>
      {(error || notice || iamBound) && (
        <div className={s.groupFeedback}>
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
          {iamBound && <Alert tone="info">{t("account.oauth.iamBoundHint")}</Alert>}
        </div>
      )}

      {loading ? (
        <Spinner size="lg" label={t("common.loading")} />
      ) : (
        <Card padding="none">
          <ul className={s.list}>
            {rows.map((row) => {
              const bound = row.bound;
              const label = bound?.label || fallbackLabel(row.id);
              // unbindable 缺省按「可解绑」处理，与后端注册表外的历史 provider 降级口径一致。
              const unbindable = bound ? bound.unbindable !== false : true;
              return (
                <li key={row.id} className={s.listRow}>
                  <div className={s.rowMain}>
                    {row.icon && (
                      <span className={s.providerIcon} aria-hidden="true">
                        {row.icon}
                      </span>
                    )}
                    <div className={s.rowText}>
                      <span className={s.rowTitle}>
                        {label}
                        <StatusBadge
                          size="sm"
                          tone={bound ? "green" : "neutral"}
                          label={bound ? t("account.oauth.bound") : t("account.oauth.notBound")}
                        />
                      </span>
                      {bound && (
                        <span className={s.rowMeta}>
                          {bound.providerUsername && <span>@{bound.providerUsername}</span>}
                          <span>{`${t("account.oauth.boundAt")}: ${fmt(bound.boundAt) || "—"}`}</span>
                        </span>
                      )}
                      {/* 不可解绑：不渲染一个必然失败的按钮，直接把原因写在行内。 */}
                      {bound && !unbindable && (
                        <span className={s.rowNote}>{t("account.oauth.permanentNote")}</span>
                      )}
                    </div>
                  </div>
                  {/* 不可解绑的已绑定项没有任何操作:整个操作区都不渲染,
                      免得在窄屏留下一条满宽的空行。 */}
                  {(!bound || unbindable) && (
                    <div className={s.rowActions}>
                      {bound ? (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busy || bindingId !== null}
                          onClick={() => setUnbindTarget(row.id)}
                        >
                          {t("account.oauth.unbind")}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={bindingId === row.id}
                          disabled={bindingId !== null && bindingId !== row.id}
                          onClick={() => void bind(row.id)}
                        >
                          {t("account.oauth.bind")}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* 不可逆绑定的事前确认：必须在跳转授权页之前，且必须把「其他工作人员将无法修改此账户」讲明白。 */}
      <Dialog
        open={!!permanentBind}
        onClose={cancelPermanentBind}
        busy={dialogBusy}
        tone="danger"
        title={t("account.oauth.permanentTitle", { provider: permanentBind?.label ?? "" })}
        footer={
          <>
            <Button variant="secondary" disabled={dialogBusy} onClick={cancelPermanentBind}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" loading={dialogBusy} onClick={() => void confirmPermanentBind()}>
              {t("account.oauth.permanentConfirm")}
            </Button>
          </>
        }
      >
        <div className={s.stackSm}>
          {dialogError && <Alert tone="error">{dialogError}</Alert>}
          <Alert tone="error">{t("account.oauth.permanentLead")}</Alert>
          <ul className={s.bulletList}>
            <li>{t("account.oauth.permanentPoint1")}</li>
            <li>{t("account.oauth.permanentPoint2")}</li>
            <li>{t("account.oauth.permanentPoint3")}</li>
          </ul>
          <p className={s.muted}>{t("account.oauth.permanentAdminHint")}</p>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!unbindTarget}
        title={t("account.oauth.unbindTitle", { provider: unbindTargetLabel })}
        message={t("account.oauth.unbindMessage")}
        confirmText={t("account.oauth.unbind")}
        cancelText={t("common.cancel")}
        tone="danger"
        loading={busy}
        onConfirm={() => unbindTarget && void doUnbind(unbindTarget)}
        onCancel={() => setUnbindTarget(null)}
      />

      <StepUpDialog
        open={stepUpOpen}
        onClose={() => { setStepUpOpen(false); setPendingUnbind(null); }}
        onVerified={() => {
          const provider = pendingUnbind;
          setStepUpOpen(false);
          setPendingUnbind(null);
          if (provider) void doUnbind(provider);
        }}
      />
    </section>
  );
}
