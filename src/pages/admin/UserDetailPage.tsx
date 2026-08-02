import { useCallback, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, toPageSize, type PageSize } from "../../api/client";
import type { AdminIamStatus, AdminUserDetail, IamVerdict } from "../../api/types";
import { useAdmin } from "../../context/AdminContext";
import { Avatar } from "../../components/Avatar";
import { Alert, Spinner, StatusBadge, Tabs, type TabItem } from "../../components/ui";
import { PERM, accountStatusTone } from "./shared/constants";
import { DiffDialog } from "./shared/DiffDialog";
import { useAdminPageHeader } from "./shared/header";
import { StaffGuardContext, useAdminAction } from "./shared/useAdminAction";
import { useAdminResource } from "./shared/useAdminResource";
import { useCardEdit, type EditField } from "./shared/useCardEdit";
import { AuditTab } from "./user/AuditTab";
import { BindingsTab } from "./user/BindingsTab";
import { DangerTab } from "./user/DangerTab";
import { GrantsTab } from "./user/GrantsTab";
import { ProfileTab } from "./user/ProfileTab";
import { SecurityTab } from "./user/SecurityTab";
import { SessionsTab } from "./user/SessionsTab";
import styles from "./Admin.module.css";

type TabKey = "profile" | "security" | "sessions" | "bindings" | "grants" | "audit" | "danger";
const TAB_KEYS: readonly TabKey[] = [
  "profile",
  "security",
  "sessions",
  "bindings",
  "grants",
  "audit",
  "danger",
];

/** 用户详情：7 个分区。写操作的门控在这里统一算好再往下传，避免每个分区各判一套。 */
const UserDetailPage = () => {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const { me, hasPermission } = useAdmin();
  const [searchParams, setSearchParams] = useSearchParams();

  const user = useAdminResource<AdminUserDetail>(id ? `/v1/admin/users/${id}` : null);
  // 工作人员判定必须**实时查 IAM**，不能读登录时的快照 —— 那是操作者的缓存，与目标无关。
  const iam = useAdminResource<AdminIamStatus>(id ? `/v1/admin/users/${id}/iam-status` : null);
  const save = useAdminAction();
  const unlockAction = useAdminAction();

  const [notice, setNotice] = useState<string | null>(null);
  const [reviewKeys, setReviewKeys] = useState<readonly string[] | null>(null);

  const rawTab = searchParams.get("tab") as TabKey | null;
  const tab: TabKey = rawTab && TAB_KEYS.includes(rawTab) ? rawTab : "profile";
  const auditPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const auditPageSize = toPageSize(searchParams.get("pageSize"));

  const writeParams = useCallback(
    (patch: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const entity = user.data;
  // 三个都可能为空（纯 Passkey 账户可以没有邮箱，用户名也允许为空），
  // 最后兜一个可读占位，别让界面出现空白的人名。
  const displayName = entity
    ? entity.displayName || entity.username || entity.email || t("admin.users.unnamed")
    : "";
  const isSelf = !!entity && entity.id === me?.userId;
  /**
   * 四值 verdict 直接消费后端给的，**不从权限数组的形状自行推断** ——
   * 「数组缺失 / 为空 / 查询失败」是三件不同的事。
   * 判定还没回来（null）时同样按锁定处理：前端也 fail-closed，
   * 否则加载中的那一瞬间会把一个工作人员账户渲染成可操作的。
   */
  const verdict: IamVerdict | null = iam.data?.verdict ?? (iam.error ? "staff_assumed" : null);
  const lockedStaff =
    !isSelf && (verdict === null || verdict === "staff" || verdict === "staff_assumed");
  const exStaff = verdict === "ex_staff";

  useAdminPageHeader({
    title: displayName || t("admin.head.userDetail.title"),
    back: { to: "/admin/users", label: t("admin.nav.users") },
  });

  const fields = useMemo<ReadonlyArray<EditField<AdminUserDetail>>>(
    () => [
      { key: "displayName", label: t("admin.userDetail.field.displayName") },
      { key: "username", label: t("admin.userDetail.field.username"), risky: true },
      { key: "email", label: t("admin.userDetail.field.email"), risky: true },
      {
        key: "emailVerified",
        label: t("admin.userDetail.field.emailVerified"),
        risky: true,
        format: (v) => (v ? t("common.yes") : t("common.no")),
      },
      { key: "adminNote", label: t("admin.userDetail.field.adminNote") },
    ],
    [t],
  );
  const edit = useCardEdit<AdminUserDetail>(entity, fields);

  const commitSave = async () => {
    if (!entity || !reviewKeys) return;
    const data = await save.run<AdminUserDetail>("save", () =>
      api.patch<AdminUserDetail>(`/v1/admin/users/${entity.id}`, edit.patchFor(reviewKeys), {
        plane: "user",
        // 乐观并发：不带 If-Match 就等于允许两个管理员静默互相覆盖。
        ifMatch: entity.updatedAt,
      }),
    );
    if (data) {
      // 新基线来自服务端返回的完整实体，不用本地草稿顶替（后端会做规范化）。
      user.set(data);
      setNotice(t("admin.save.savedN", { count: reviewKeys.length }));
      setReviewKeys(null);
      save.reset();
    }
  };

  if (user.loading && !entity) return <Spinner size="lg" label={t("common.loading")} />;
  if (!entity) return <Alert tone="error">{user.error ?? t("error.generic")}</Alert>;

  // **自指一律挡住。** 后端所有 `/users/:id/*` 写路径都过 `requireNotSelf`，
  // 前端放开只会摆出一堆点了必然 403 SELF_TARGET_FORBIDDEN 的按钮 ——
  // 那不是「更自由」，是让人以为系统坏了。
  const canEdit = hasPermission(PERM.userWrite) && !lockedStaff && !isSelf;
  // 二次验证因子的操作对自己也要挡住，否则只挡住了危险区那个总按钮、逐项入口却敞开。
  const canReset = hasPermission(PERM.userReset2fa) && !lockedStaff && !isSelf;
  const canRevokeSessions = hasPermission(PERM.userForceLogout) && !lockedStaff && !isSelf;

  const lockHint =
    verdict === null ? t("admin.userDetail.iamPending") : t("admin.userDetail.staffReadOnlyHint");
  const disabledHint = lockedStaff
    ? lockHint
    : isSelf
      ? t("admin.userDetail.selfBlockedHint")
      : t("admin.perm.needed", { perm: PERM.userWrite });
  const resetBlockedHint = lockedStaff
    ? lockHint
    : isSelf
      ? t("admin.userDetail.selfBlockedHint")
      : t("admin.perm.needed", { perm: PERM.userReset2fa });

  const tabs: ReadonlyArray<TabItem<TabKey>> = TAB_KEYS.map((k) => ({
    key: k,
    label: t(`admin.userDetail.tabs.${k}`),
  }));

  const reviewChanges = reviewKeys ? edit.changesFor(reviewKeys) : [];
  // 409 STALE_WRITE：把服务端当前值原样摆出来，让人自己判断要不要覆盖。
  const saveError = save.staleValues ? (
    <span className={styles.stackSm}>
      <span>{save.error}</span>
      <pre className={styles.code}>{JSON.stringify(save.staleValues, null, 2)}</pre>
    </span>
  ) : (
    save.error
  );

  const onSectionDone = (message: string) => {
    setNotice(message);
    user.reload();
  };

  /**
   * 解除登录失败锁定。锁定由连续失败自动加上（持久化在用户行上），
   * 只能等它自然到期的话，「用户打电话说进不去」时管理员什么也做不了。
   */
  const unlock = async () => {
    if (!id || !entity) return;
    const done = await unlockAction.run("unlock", (idem) =>
      api.post(`/v1/admin/users/${id}/unlock`, undefined, { plane: "user", idempotent: idem }),
    );
    if (done !== null) {
      onSectionDone(t("admin.userDetail.account.unlockDone", { name: displayName }));
      unlockAction.reset();
    }
  };

  return (
    <div className={styles.stack}>
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className={styles.detailHead}>
        <Avatar name={displayName} src={entity.avatarUrl} size={56} label={displayName} />
        <div>
          <div className={styles.row}>
            <h2 className={styles.detailName}>{displayName}</h2>
            <StatusBadge
              tone={accountStatusTone(entity.status)}
              label={t(`status.${entity.status}`)}
              size="sm"
            />
            {isSelf && <span className={styles.tagSelf}>{t("admin.users.tagSelf")}</span>}
          </div>
          {entity.username && <p className={styles.detailId}>@{entity.username}</p>}
        </div>
      </div>

      {isSelf && (
        <Alert tone="info">
          <strong>{t("admin.userDetail.selfTitle")}</strong>
          <div>{t("admin.userDetail.selfDesc")}</div>
        </Alert>
      )}

      {/* 判定还没回来时不摆横幅（会误报），但写操作已按 lockedStaff 锁住。 */}
      {lockedStaff && verdict !== null && (
        <Alert tone="error">
          {verdict === "staff_assumed" ? (
            <>
              <strong>{t("admin.userDetail.staffAssumedTitle")}</strong>
              <div>{t("admin.userDetail.staffAssumedDesc")}</div>
              <div>{t("admin.userDetail.staffAssumedNext")}</div>
            </>
          ) : (
            <>
              <strong>{t("admin.userDetail.staffTitle")}</strong>
              <div>
                {t("admin.userDetail.staffDesc", {
                  role: iam.data?.roles?.[0] ?? t("admin.access.directGrant"),
                })}
              </div>
              <div>{t("admin.userDetail.staffUnlock")}</div>
            </>
          )}
        </Alert>
      )}

      {exStaff && !isSelf && (
        <Alert tone="info">
          <strong>{t("admin.userDetail.exStaffTitle")}</strong>
          <div>{t("admin.userDetail.exStaffDesc")}</div>
        </Alert>
      )}

      {iam.error && <Alert tone="error">{iam.error}</Alert>}

      <Tabs
        items={tabs}
        value={tab}
        onChange={(k) => writeParams({ tab: k, page: "" })}
        ariaLabel={t("admin.userDetail.tabsLabel")}
        panelId="admin-user-panel"
      />

      <StaffGuardContext.Provider value={iam.reload}>
        <div id="admin-user-panel">
          {tab === "profile" && (
            <ProfileTab
              user={entity}
              iam={iam.data}
              canEdit={canEdit}
              disabledHint={disabledHint}
              edit={edit}
              onSave={setReviewKeys}
              onUnlock={() => void unlock()}
              unlocking={unlockAction.pending === "unlock"}
            />
          )}
          {tab === "security" && (
            <SecurityTab
              userId={entity.id}
              subject={displayName}
              totpEnabled={entity.security.totpEnabled}
              passkeyCount={entity.security.passkeyCount}
              canReset={canReset}
              blockedHint={resetBlockedHint}
              onDone={onSectionDone}
            />
          )}
          {tab === "sessions" && (
            <SessionsTab
              userId={entity.id}
              subject={displayName}
              canRevoke={canRevokeSessions}
              onDone={onSectionDone}
            />
          )}
          {tab === "bindings" && <BindingsTab userId={entity.id} />}
          {tab === "grants" && (
            <GrantsTab
              userId={entity.id}
              subject={displayName}
              canRevoke={canRevokeSessions}
              onDone={onSectionDone}
            />
          )}
          {tab === "audit" && (
            <AuditTab
              userId={entity.id}
              page={auditPage}
              pageSize={auditPageSize}
              onPage={(p) => writeParams({ page: p > 1 ? String(p) : "" })}
              onPageSize={(s: PageSize) => writeParams({ pageSize: s === 10 ? "" : String(s), page: "" })}
            />
          )}
          {tab === "danger" && (
            <DangerTab
              user={entity}
              subject={displayName}
              isSelf={isSelf}
              lockedStaff={lockedStaff}
              hasPermission={hasPermission}
              onDone={setNotice}
              onChanged={() => {
                user.reload();
                iam.reload();
              }}
            />
          )}
        </div>
      </StaffGuardContext.Provider>

      {reviewKeys && reviewChanges.length > 0 && (
        <DiffDialog
          subject={displayName}
          changes={reviewChanges}
          busy={save.pending === "save"}
          error={saveError}
          forceStepUp={save.stepUpRequired}
          onCancel={() => {
            setReviewKeys(null);
            save.reset();
          }}
          onCommit={() => void commitSave()}
        />
      )}
    </div>
  );
};

export default UserDetailPage;
