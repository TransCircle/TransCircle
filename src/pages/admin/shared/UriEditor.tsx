import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cx } from "../../../components/admin/cx";
import { AdminButton as Button, Card, TextField } from "../../../components/ui";
import type { ClientApplicationType } from "../../../api/types";
import { checkRedirect } from "./redirect";
import { IconCheck, IconWarn, IconX } from "./icons";
import styles from "../Admin.module.css";

interface UriEditorProps {
  label: string;
  hint?: string;
  placeholder?: string;
  type: ClientApplicationType;
  value: readonly string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
  removeLabel: (uri: string) => string;
}

/** 回调 / 登出回跳地址编辑器：边敲边校验，校验不过就不让加进列表。 */
export function UriEditor({
  label,
  hint,
  placeholder,
  type,
  value,
  disabled,
  onChange,
  removeLabel,
}: UriEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const check = checkRedirect(draft, type);
  const blocked = disabled || !check || check.level === "bad";

  const add = () => {
    const v = draft.trim();
    if (blocked || !v) return;
    if (!value.includes(v)) onChange([...value, v]);
    setDraft("");
  };

  const levelClass =
    check?.level === "ok" ? styles.uriOk : check?.level === "warn" ? styles.uriWarn : styles.uriBad;

  return (
    <div className={styles.stackSm}>
      <TextField
        label={label}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        invalid={check?.level === "bad"}
        hint={hint}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
      />
      {check && (
        <p className={cx(styles.uriCheck, levelClass)} role="status">
          <span aria-hidden="true">
            {check.level === "ok" ? <IconCheck /> : check.level === "warn" ? <IconWarn /> : <IconX />}
          </span>
          <span>{t(`admin.uriCheck.${check.reason}`)}</span>
        </p>
      )}
      <div>
        <Button variant="secondary" size="sm" disabled={blocked} onClick={add}>
          {t("common.add")}
        </Button>
      </div>
      {value.length > 0 && (
        <Card tone="subtle" padding="sm">
          <div className={styles.stackSm}>
            {value.map((v) => (
              <div key={v} className={styles.uriRow}>
                <code className={styles.mono}>{v}</code>
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={removeLabel(v)}
                    onClick={() => onChange(value.filter((x) => x !== v))}
                  >
                    {t("common.remove")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
