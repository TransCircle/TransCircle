import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { AdminMergePreview } from "../../../api/types";
import { Avatar } from "../../../components/Avatar";
import { AdminButton as Button, Alert, Card, Modal, TextField } from "../../../components/ui";
import { StepUpPanel } from "../shared/StepUpPanel";
import { REASON_MIN_LENGTH } from "../shared/constants";
import { useAdminAction } from "../shared/useAdminAction";
import styles from "../Admin.module.css";

interface MergeDialogProps {
  userId: string;
  subject: string;
  onCancel: () => void;
  onDone: (targetName: string) => void;
}

/**
 * 合并账户：两阶段，刻意的。
 *
 * 合并不可逆；让人在看不见「到底会搬走什么」的情况下点确定是不负责任的。
 * 先 preview 只算不改，拿到 previewToken（短 TTL、绑定 actor+source+target）后再提交，
 * 防止预览 A 却提交 B。
 */
export function MergeDialog({ userId, subject, onCancel, onDone }: MergeDialogProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState("");
  const [preview, setPreview] = useState<AdminMergePreview | null>(null);
  const [reason, setReason] = useState("");
  const [stepUp, setStepUp] = useState(false);
  const action = useAdminAction();

  const reasonOk = reason.trim().length >= REASON_MIN_LENGTH;

  const runPreview = async () => {
    const data = await action.run<AdminMergePreview>("preview", () =>
      api.post<AdminMergePreview>(
        `/v1/admin/users/${userId}/merge/preview`,
        { targetUserId: target.trim() },
        { plane: "user" },
      ),
    );
    if (data) setPreview(data);
  };

  const runMerge = async () => {
    if (!preview) return;
    // 按合并目标分作用域：换了目标账户就是另一次操作，不能沿用上一次的幂等键。
    const ok = await action.run(`merge:${preview.target.id}`, (idem) =>
      api.post(
        `/v1/admin/users/${userId}/merge`,
        // targetUserId 必须再带一次：后端提交时会重新解析目标并校验 previewToken
        // 与 (操作者, 源, 目标) 是否吻合，防止「预览 A 却提交 B」。
        { targetUserId: preview.target.id, previewToken: preview.previewToken, reason },
        { plane: "user", idempotent: idem },
      ),
    );
    if (ok !== null) onDone(targetName(preview));
  };

  const targetName = (p: AdminMergePreview) =>
    p.target.displayName || p.target.username || p.target.email || p.target.id;

  return (
    <Modal
      open
      size="md"
      closeOnOverlayClick={!stepUp && action.pending === null}
      onClose={onCancel}
      title={t("admin.userDetail.merge.title")}
      description={subject}
      footer={
        stepUp ? null : preview ? (
          <>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              {t("common.back")}
            </Button>
            <Button variant="danger" disabled={!reasonOk} onClick={() => setStepUp(true)}>
              {t("admin.userDetail.merge.confirm")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={target.trim().length === 0}
              loading={action.pending === "preview"}
              onClick={() => void runPreview()}
            >
              {t("admin.userDetail.merge.preview")}
            </Button>
          </>
        )
      }
    >
      <div className={styles.stackSm}>
        {!preview ? (
          <TextField
            label={t("admin.userDetail.merge.targetLabel")}
            required
            value={target}
            hint={t("admin.userDetail.merge.targetHint")}
            onChange={(e) => setTarget(e.target.value)}
          />
        ) : (
          <>
            <Card tone="subtle" padding="sm">
              <div className={styles.cellPrimary}>
                <Avatar name={targetName(preview)} size={32} />
                <span className={styles.cellText}>
                  <span className={styles.cellName}>{targetName(preview)}</span>
                  <span className={styles.cellSub}>{preview.target.email}</span>
                </span>
              </div>
            </Card>
            <div className={styles.impact}>
              <strong>
                {t("admin.userDetail.merge.impactTitle", { from: subject, to: targetName(preview) })}
              </strong>
              <ul>
                <li>{t("admin.userDetail.merge.impactBindings", { count: preview.migrate.bindings.length })}</li>
                <li>{t("admin.userDetail.merge.impactPasskeys", { count: preview.migrate.passkeys })}</li>
                <li>{t("admin.userDetail.merge.impactGrants", { count: preview.revoke.grants })}</li>
                <li>{t("admin.userDetail.merge.impactSessions", { count: preview.revoke.sessions })}</li>
                {preview.conflicts.bindings.length > 0 && (
                  // 目标账户已占用同一 provider 的绑定 —— 这些迁不过去，必须让操作者事先知道，
                  // 否则合并完才发现「GitHub 绑定丢了」。
                  <li className={styles.conflict}>
                    {t("admin.userDetail.merge.impactConflicts", {
                      count: preview.conflicts.bindings.length,
                      providers: preview.conflicts.bindings.join("、"),
                    })}
                  </li>
                )}
              </ul>
            </div>
            <p className={styles.note}>
              {t("admin.userDetail.merge.irreversible", { name: subject })}
            </p>
            <TextField
              label={t("admin.danger.reasonLabel", { min: REASON_MIN_LENGTH })}
              required
              value={reason}
              hint={t("admin.danger.reasonHint")}
              invalid={reason.length > 0 && !reasonOk}
              onChange={(e) => setReason(e.target.value)}
            />
          </>
        )}
        {action.error && <Alert tone="error">{action.error}</Alert>}
        {stepUp && preview && (
          <StepUpPanel
            what={t("admin.userDetail.merge.stepUpWhat", {
              from: subject,
              to: targetName(preview),
            })}
            onVerified={() => void runMerge()}
            onCancel={() => setStepUp(false)}
          />
        )}
      </div>
    </Modal>
  );
}
