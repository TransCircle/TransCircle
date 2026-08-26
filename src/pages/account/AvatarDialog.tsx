import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { useAuthenticatedUser, useSession } from "../../context/SessionContext";
import { AdminButton as Button, Alert } from "../../components/ui";
import { Dialog } from "../../components/ui/Dialog";
import { ImageCropper } from "./ImageCropper";
import s from "./Account.module.css";

interface AvatarDialogProps {
  open: boolean;
  onClose: () => void;
}

const UploadIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    <path d="M12 3v12" />
    <path d="m7 8 5-5 5 5" />
  </svg>
);

/**
 * 头像更换弹窗:方形圆角上传瓦片 → 选图后进入编辑器(旋转/裁剪)→ 应用上传,即时生效。
 * 上传中锁定关闭,成功/失败就近提示。
 */
export function AvatarDialog({ open, onClose }: AvatarDialogProps) {
  const { t } = useTranslation();
  const { refresh } = useSession();
  const user = useAuthenticatedUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 每次打开清空上一轮的提示与待裁剪文件,避免残留旧态。
  useEffect(() => {
    if (open) {
      setError(null);
      setNotice(null);
      setCropFile(null);
    }
  }, [open]);


  // 选好文件后不直接上传,先进入编辑器裁剪;裁剪产出的 dataURL 再上传。
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    setCropFile(file);
  };

  const upload = async (image: string) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await api.post<{ avatarUrl: string }>("/v1/me/avatar", { image });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      await refresh();
      setNotice(t("account.profile.avatarUpdated"));
    } catch {
      setError(t("account.profile.avatarFailed"));
    } finally {
      setBusy(false);
    }
  };

  const removeAvatar = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await api.del("/v1/me/avatar");
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      await refresh();
      setNotice(t("account.profile.avatarRemoved"));
    } finally {
      setBusy(false);
    }
  };

  const cropping = cropFile !== null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      busy={busy}
      title={cropping ? t("account.profile.cropTitle") : t("account.profile.changeAvatar")}
      description={cropping ? undefined : t("account.profile.avatarHint")}
      footer={
        cropping ? undefined : (
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("common.close")}
          </Button>
        )
      }
    >
      {cropping ? (
        <ImageCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onApply={(dataUrl) => {
            setCropFile(null);
            void upload(dataUrl);
          }}
        />
      ) : (
        <>
          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}
          <div className={s.avatarUpload}>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={onFile}
            />
            <button
              type="button"
              className={s.uploadTile}
              disabled={busy}
              aria-label={t("account.profile.uploadNew")}
              onClick={() => fileRef.current?.click()}
            >
              <span className={s.uploadTileIcon} aria-hidden="true">
                <UploadIcon />
              </span>
              <span>{t("account.profile.uploadNew")}</span>
            </button>
            {user.avatarUrl && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void removeAvatar()}>
                {t("account.profile.removeAvatar")}
              </Button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}
