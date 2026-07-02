import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { MeProfile } from "../../api/types";
import { useSession } from "../../context/SessionContext";
import { useFormatTs } from "../../utils/datetime";
import { usePageTitle } from "../../utils/usePageTitle";
import { Avatar } from "../../components/Avatar";
import {
  PageHeader,
  SectionLabel,
  DescriptionList,
  TextField,
  AdminButton as Button,
  Alert,
  StatusBadge,
} from "../../components/ui";
import page from "../Page.module.css";
import s from "./Account.module.css";

/** 将所选图片缩放为 ≤256px 方形并导出为 JPEG data URL（控制体积，匹配后端 512KB 限制）。 */
async function resizeToDataUrl(file: File, max = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-unsupported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.9);
}

/** 个人资料：节式布局 —— 头像 / 只读账户信息 / 可改昵称,均平铺不包卡。 */
const ProfilePage = () => {
  const { t } = useTranslation();
  const fmt = useFormatTs();
  const { user, setUser, refresh } = useSession();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  usePageTitle(t("account.nav.profile"));

  useEffect(() => {
    setDisplayName(user?.displayName ?? "");
  }, [user]);

  if (!user) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    // 纯空格昵称不可提交:trim 后为空视为无效,错误就近显示在输入框下。
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
      setUser(res.data);
      setNotice(t("account.profile.saved"));
    } finally {
      setSaving(false);
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    setAvatarBusy(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      const res = await api.post<{ avatarUrl: string }>("/v1/me/avatar", { image: dataUrl });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      await refresh();
      setNotice(t("account.profile.avatarUpdated"));
    } catch {
      setError(t("account.profile.avatarFailed"));
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setError(null);
    setNotice(null);
    setAvatarBusy(true);
    try {
      const res = await api.del("/v1/me/avatar");
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      await refresh();
      setNotice(t("account.profile.avatarRemoved"));
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <div className={`${page.page} ${page.pageNarrow}`}>
      <PageHeader title={t("account.profile.title")} description={t("account.profile.subtitle")} />
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <section className={s.sectionFirst}>
        <SectionLabel>{t("account.profile.avatar")}</SectionLabel>
        <div className={s.avatarRow}>
          <Avatar name={user.displayName || user.username} src={user.avatarUrl} size={72} />
          <div className={s.avatarActions}>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => void onFile(e)}
            />
            <div className={s.actions}>
              <Button variant="secondary" loading={avatarBusy} onClick={() => fileRef.current?.click()}>
                {t("account.profile.changeAvatar")}
              </Button>
              {user.avatarUrl && (
                <Button variant="ghost" disabled={avatarBusy} onClick={() => void removeAvatar()}>
                  {t("account.profile.removeAvatar")}
                </Button>
              )}
            </div>
            <p className={s.muted}>{t("account.profile.avatarHint")}</p>
          </div>
        </div>
      </section>

      <section className={s.section}>
        <SectionLabel>{t("account.profile.info")}</SectionLabel>
        <div className={s.stackSm}>
          <DescriptionList
            items={[
              {
                term: t("account.profile.email"),
                value: (
                  <span className={s.rowTitle}>
                    {user.email}
                    <StatusBadge
                      size="sm"
                      tone={user.emailVerified ? "green" : "amber"}
                      label={user.emailVerified ? t("account.profile.emailVerified") : t("account.profile.emailUnverified")}
                    />
                  </span>
                ),
              },
              { term: t("account.profile.username"), value: user.username },
              { term: t("account.profile.accountId"), value: <code className={page.code}>{user.id}</code> },
              { term: t("account.profile.createdAt"), value: fmt(user.createdAt) || "—" },
            ]}
            columns={1}
          />
          <p className={s.muted}>{t("account.profile.usernameImmutable")}</p>
        </div>
      </section>

      <section className={s.section}>
        <SectionLabel>{t("account.profile.displayNameSection")}</SectionLabel>
        <form className={`${s.form} ${s.formNarrow}`} onSubmit={save}>
          <TextField
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
          <div className={s.actions}>
            <Button type="submit" variant="primary" loading={saving}>
              {t("account.profile.save")}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default ProfilePage;
