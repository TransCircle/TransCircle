import type { ReactNode } from "react";

/** 控制台图标：一律装饰性（aria-hidden），语义由旁边的可见文字承担。 */
function svg(children: ReactNode, size = 17) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconHome = () => svg(<><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>);
export const IconUsers = () =>
  svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>);
export const IconApps = () =>
  svg(<><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 9h18" /><path d="M8 14h.01" /><path d="M12 14h4" /></>);
export const IconAudit = () =>
  svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h4" /></>);
export const IconStaff = () =>
  svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>);
export const IconShield = () => svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />);
export const IconBack = () => svg(<path d="M15 18l-6-6 6-6" />, 15);
export const IconChevron = () => svg(<path d="M9 18l6-6-6-6" />, 15);
export const IconCheck = () => svg(<path d="M20 6L9 17l-5-5" />, 14);
export const IconX = () => svg(<><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>, 14);
export const IconWarn = () =>
  svg(
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>,
    14,
  );
export const IconArrowRight = () => svg(<><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></>, 18);
