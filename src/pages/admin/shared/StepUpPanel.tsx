import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { AdminStepUpStart } from "../../../api/types";
import { AdminButton as Button, Alert, Spinner } from "../../../components/ui";
import styles from "../Admin.module.css";

interface StepUpPanelProps {
  /** 一句话说明「验证通过后会继续做什么」，让人知道自己在验证什么。 */
  what: string;
  onVerified: () => void;
  onCancel: () => void;
}

/**
 * 二次验证面板 —— **就地覆盖在原操作的对话框里**，不另开一层弹窗。
 *
 * 这一点是刻意的：轮换密钥、吊销旧密钥这些动作发生时，页面上往往正显示着
 * 一份只出现一次的密钥。换成新对话框或跳转页面，回来时那份密钥就没了。
 * 验证成功后原地回调，原对话框的状态一个字节都不丢。
 *
 * 走 IAM 代理 2FA：start 拿到 verifyUrl（用户手势点开新标签，避免被拦截），
 * 之后每 3 秒回查一次；通过即续跑。5 分钟窗口记在当前 Pass 会话上。
 */
export function StepUpPanel({ what, onVerified, onCancel }: StepUpPanelProps) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<AdminStepUpStart | null>(null);
  const [starting, setStarting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  // onVerified 存 ref：轮询定时器只在 info 变化时重建，不该被父级每次渲染的新回调打断。
  const verifiedRef = useRef(onVerified);
  verifiedRef.current = onVerified;
  /**
   * 只放行一次。3 秒的自动轮询与「我已完成验证」按钮可能在同一瞬间都拿到 verified，
   * 而每个请求带的是新的幂等键 —— 放行两次就会创建两个客户端、轮两次密钥。
   */
  const doneRef = useRef(false);

  const fireOnce = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    verifiedRef.current();
  };

  const start = async (): Promise<void> => {
    setStarting(true);
    setError(null);
    const res = await api.post<AdminStepUpStart>("/v1/admin/step-up/iam/start", undefined, {
      plane: "user",
    });
    setStarting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setInfo(res.data);
  };

  // 挂载即发起一次；失败后由「重试」手动重发（startedRef 只挡自动重复发起）。
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
    // start 是稳定的局部函数，只应在挂载时跑一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 串行轮询，不是 setInterval。
   *
   * 定时器版本有三个问题：IAM 慢于 3 秒时请求会**重叠堆积**；没有总时限，
   * 用户把标签页丢在一边就会一直打下去；后端抖动时也不退避，反而加剧。
   * 这里每轮等上一轮结束再排下一轮，间隔逐步放宽，到 5 分钟（挑战本身的窗口）为止。
   */
  useEffect(() => {
    if (!info) return;
    let alive = true;
    let timer = 0;
    // 截止时刻取后端下发的 expiresAt —— 写死 5 分钟的话，IAM 侧改了挑战 TTL
    // 前后端窗口就会漂移：要么我们提前放弃一个还有效的挑战，要么对着一个
    // 早就过期的挑战一直轮询。拿不到才回落 5 分钟。
    const deadline = info.expiresAt ?? Date.now() + 300_000;
    let delay = 2000;

    const tick = async (): Promise<void> => {
      if (!alive || doneRef.current) return;
      if (Date.now() > deadline) {
        setError(t("admin.stepup.timeout"));
        return;
      }
      const res = await api.post<{ verified: boolean }>(
        "/v1/admin/step-up/iam/poll",
        { verificationId: info.verificationId },
        { plane: "user" },
      );
      if (!alive || doneRef.current) return;
      if (res.ok && res.data.verified) {
        fireOnce();
        return;
      }
      // 未通过就退避；请求本身失败（网络/5xx）退得更快，避免打垮正在恢复的后端。
      delay = Math.min(res.ok ? delay + 1000 : delay * 2, 15_000);
      timer = window.setTimeout(() => void tick(), delay);
    };

    timer = window.setTimeout(() => void tick(), delay);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // fireOnce 只读 ref，跨渲染行为一致；t 只影响文案，都不列入依赖以免重建轮询。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info]);

  const pollNow = async (): Promise<void> => {
    if (!info || doneRef.current) return;
    setPolling(true);
    setError(null);
    const res = await api.post<{ verified: boolean }>(
      "/v1/admin/step-up/iam/poll",
      { verificationId: info.verificationId },
      { plane: "user" },
    );
    setPolling(false);
    if (res.ok && res.data.verified) {
      fireOnce();
      return;
    }
    setError(res.ok ? t("admin.stepup.notYet") : res.error.message);
  };

  return (
    <div className={styles.stepup}>
      <p className={styles.stepupWhat}>
        <strong>{t("admin.stepup.title")}</strong> {t("admin.stepup.continueWith", { what })}
      </p>
      {error && <Alert tone="error">{error}</Alert>}
      {starting && (
        <span className={styles.stepupWaiting}>
          <Spinner size="sm" inline />
          {t("common.loading")}
        </span>
      )}
      {info ? (
        <div className={styles.row}>
          {/* 用户手势打开，避免被浏览器拦截弹窗。 */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => window.open(info.verifyUrl, "_blank", "noopener,noreferrer")}
          >
            {t("admin.stepup.open")}
          </Button>
          <Button variant="secondary" size="sm" loading={polling} onClick={() => void pollNow()}>
            {t("admin.stepup.poll")}
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      ) : (
        !starting && (
          <div className={styles.row}>
            <Button variant="secondary" size="sm" onClick={() => void start()}>
              {t("common.retry")}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          </div>
        )
      )}
      {info && <p className={styles.note}>{t("admin.stepup.waiting")}</p>}
    </div>
  );
}
