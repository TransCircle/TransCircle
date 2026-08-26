import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { MeProfile } from "../../api/types";
import { isMeProfile, useAuthenticatedUser, useSession } from "../../context/SessionContext";
import { useFormatTs } from "../../utils/datetime";
import {
  Card,
  AdminButton as Button,
  Alert,
  StatusBadge,
  TextField,
} from "../../components/ui";
import { Dialog } from "../../components/ui/Dialog";
import page from "../Page.module.css";
import s from "./Account.module.css";

const PencilIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

/** 个人资料分区:昵称(弹窗编辑)+ 只读账户信息(邮箱 / 用户名 / ID / 注册时间)。 */
export function ProfileSection() {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const { setUser } = useSession();
  const user = useAuthenticatedUser();

  const [notice, setNotice] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);


  const openEdit = () => {
    setDisplayName(user.displayName ?? "");
    setNameError(null);
    setError(null);
    setEditOpen(true);
  };

  const save = async () => {
    if (saving) return; // 防 Enter 连击重复提交(页脚按钮 loading 已禁用,守此处的隐式提交路径)
    setError(null);
    const trimmed = displayName.trim();
    if (!trimmed) {
      setNameError(t("account.profile.displayNameRequired"));
      return;
    }
    setNameError(null);
    setSaving(true);
    try {
      const res = await api.patch<MeProfile>("/v1/me", { displayName: trimmed });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      // 与其它落定档案的入口同一道校验：半截档案写进上下文会让账户中心的
      // `user.security.*` 之类在别处炸掉，而故障现场离真正的原因已经很远。
      // 保存本身是成功的，所以照常提示成功；档案交给下一次拉取补齐。
      if (isMeProfile(res.data)) setUser(res.data);
      setNotice(t("account.profile.saved"));
      setEditOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={s.group}>
      <h2 className={s.groupTitle}>{t("account.nav.profile")}</h2>
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
                <span className={s.rowTitle}>{t("account.profile.displayName")}</span>
                <span className={s.rowMeta}>
                  <span>{user.displayName || "—"}</span>
                </span>
              </div>
            </div>
            <div className={s.rowActions}>
              <button type="button" className={s.rowIconBtn} aria-label={t("common.edit")} onClick={openEdit}>
                <PencilIcon />
              </button>
            </div>
          </li>

          <li className={s.listRow}>
            <div className={s.rowMain}>
              <div className={s.rowText}>
                <span className={s.rowTitle}>
                  {t("account.profile.email")}
                  <StatusBadge
                    size="sm"
                    tone={user.emailVerified ? "green" : "amber"}
                    label={user.emailVerified ? t("account.profile.emailVerified") : t("account.profile.emailUnverified")}
                  />
                </span>
                <span className={s.rowMeta}>
                  <span>{user.email}</span>
                </span>
              </div>
            </div>
          </li>

          <li className={s.listRow}>
            <div className={s.rowMain}>
              <div className={s.rowText}>
                <span className={s.rowTitle}>{t("account.profile.username")}</span>
                <span className={s.rowMeta}>
                  <span>{user.username}</span>
                </span>
              </div>
            </div>
          </li>

          <li className={s.listRow}>
            <div className={s.rowMain}>
              <div className={s.rowText}>
                <span className={s.rowTitle}>{t("account.profile.accountId")}</span>
                <span className={s.rowMeta}>
                  <code className={page.code}>{user.id}</code>
                </span>
              </div>
            </div>
          </li>

          <li className={s.listRow}>
            <div className={s.rowMain}>
              <div className={s.rowText}>
                <span className={s.rowTitle}>{t("account.profile.createdAt")}</span>
                <span className={s.rowMeta}>
                  <span>{fmt(user.createdAt) || "—"}</span>
                </span>
              </div>
            </div>
          </li>
        </ul>
      </Card>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        busy={saving}
        title={t("account.profile.displayNameSection")}
        initialFocusRef={inputRef}
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setEditOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <TextField
            ref={inputRef}
            label={t("account.profile.displayName")}
            hint={nameError ?? t("account.profile.displayNameHint")}
            invalid={!!nameError}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (nameError) setNameError(null);
            }}
            maxLength={50}
            required
          />
        </form>
      </Dialog>
    </section>
  );
}
