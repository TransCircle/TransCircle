import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, setUserToken } from "../../api/client";
import { useSession } from "../../context/SessionContext";
import { checkPasswordStrength } from "../../utils/string";
import { StepUpDialog } from "../../components/StepUpDialog";
import {
  Card,
  TextField,
  AdminButton as Button,
  Alert,
} from "../../components/ui";
import { Dialog } from "../../components/ui/Dialog";
import s from "./Account.module.css";

interface ChangeResult {
  passwordChanged?: boolean;
  accessToken?: string;
}

/** 与注册页一致的客户端最短长度规则(api.md §1.1:至少 8 位)。 */
const MIN_PASSWORD_LENGTH = 8;

export interface PasswordSectionProps {
  /**
   * 强制改密引导的开门信号:计数器每递增一次就打开修改密码弹窗。
   * 用计数器而不是布尔量,是为了让「关掉弹窗后再点一次顶部提示」仍然能开。
   */
  openRequest?: number;
  /** 账户被管理员置了新密码(mustChangePassword):弹窗内追加一句缘由说明。 */
  mustChange?: boolean;
}

/** 登录密码分区:一行状态 + 弹窗内修改/设置密码;成功后用轮换的 accessToken 续期会话。 */
export function PasswordSection({ openRequest = 0, mustChange = false }: PasswordSectionProps = {}) {
  const { t } = useTranslation();
  const { user, refresh } = useSession();
  const hasPassword = user?.passwordSet ?? true;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const pendingBody = useRef<Record<string, unknown> | null>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  // 页脚提交按钮在 <form> 外,用 form 属性关联回表单,恢复原生 required 校验(空字段浏览器拦截并提示)。
  const formId = useId();

  const mismatch = confirm.length > 0 && confirm !== next;
  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const strength = next ? checkPasswordStrength(next) : 0;
  const strengthLabels = [
    t("password.strength.weak"),
    t("password.strength.weak"),
    t("password.strength.fair"),
    t("password.strength.good"),
    t("password.strength.strong"),
  ];

  const openEdit = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    setEditOpen(true);
  };

  // 顶部强制改密提示点「立即修改」时开门。首挂载(openRequest=0)不触发,
  // 否则每次进账户中心都会自动弹窗。
  useEffect(() => {
    if (openRequest > 0) openEdit();
    // openEdit 只读常量 setter,不入依赖以免每次渲染重跑。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await api.post<ChangeResult>("/v1/me/password", body);
      if (!res.ok) {
        // 无密码账户首次设置密码需先完成二次验证。
        if (res.status === 403 && res.error.code === "STEP_UP_REQUIRED") {
          pendingBody.current = body;
          setStepUpOpen(true);
          return;
        }
        setError(res.error.message);
        return;
      }
      if (res.data?.accessToken) setUserToken(res.data.accessToken);
      // 刷新会话资料:首次设密码后 passwordSet 变更,避免安全页仍走「无密码」分支。
      await refresh();
      setCurrent("");
      setNext("");
      setConfirm("");
      setEditOpen(false);
      setNotice(t("account.password.saved"));
    } finally {
      setBusy(false);
    }
  };

  const doSubmit = async () => {
    if (busy) return; // 防 Enter 连击重复提交
    setError(null);
    // 客户端先行校验:长度不足 / 两次不一致的错误已就近显示在输入框下。
    if (next.length < MIN_PASSWORD_LENGTH) return;
    if (next !== confirm) {
      setError(t("account.password.mismatch"));
      return;
    }
    const body: Record<string, unknown> = { newPassword: next };
    if (hasPassword) body.currentPassword = current;
    await send(body);
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void doSubmit();
  };

  return (
    <section className={s.group}>
      <h2 className={s.groupTitle}>{t("account.nav.password")}</h2>
      {notice && (
        <div className={s.groupFeedback}>
          <Alert tone="success">{notice}</Alert>
        </div>
      )}
      <Card padding="none">
        <ul className={s.list}>
          <li className={s.listRow}>
            <div className={s.rowMain}>
              <div className={s.rowText}>
                <span className={s.rowTitle}>{t("account.nav.password")}</span>
                <span className={s.rowMeta}>
                  <span>
                    {hasPassword
                      ? t("account.password.subtitle")
                      : t("account.password.noPassword")}
                  </span>
                </span>
              </div>
            </div>
            <div className={s.rowActions}>
              <Button variant="secondary" size="sm" onClick={openEdit}>
                {hasPassword ? t("common.change") : t("account.password.setTitle")}
              </Button>
            </div>
          </li>
        </ul>
      </Card>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        busy={busy}
        title={hasPassword ? t("account.password.title") : t("account.password.setTitle")}
        description={t("account.password.subtitle")}
        initialFocusRef={hasPassword ? currentRef : newRef}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={busy}>
              {t("account.password.submit")}
            </Button>
          </>
        }
      >
        <form id={formId} className={s.form} onSubmit={onFormSubmit}>
          {error && <Alert tone="error">{error}</Alert>}
          {/* 管理员置了新密码:说明为什么此刻被要求改密,改完后端自动清零。 */}
          {mustChange && <Alert tone="info">{t("account.password.mustChangeInDialog")}</Alert>}
          {hasPassword && (
            <TextField
              ref={currentRef}
              label={t("account.password.current")}
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          )}
          <TextField
            ref={newRef}
            label={t("account.password.new")}
            type="password"
            autoComplete="new-password"
            invalid={tooShort}
            hint={
              next
                ? tooShort
                  ? t("account.password.tooShort")
                  : `${t("password.strengthLabel")}: ${strengthLabels[strength]}`
                : t("register.passwordHint")
            }
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <TextField
            label={t("account.password.confirm")}
            type="password"
            autoComplete="new-password"
            invalid={mismatch}
            hint={mismatch ? t("account.password.mismatch") : undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </form>
      </Dialog>

      <StepUpDialog
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onVerified={() => {
          setStepUpOpen(false);
          if (pendingBody.current) void send(pendingBody.current);
        }}
      />
    </section>
  );
}
