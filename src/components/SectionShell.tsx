import { type ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Avatar } from "./Avatar";
import { cx } from "./admin/cx";
import styles from "./SectionShell.module.css";

export interface SectionNavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

export interface SectionIdentity {
  name: string;
  sub?: string | null;
  avatarUrl?: string | null;
}

export interface SectionShellProps {
  eyebrow: string;
  identity: SectionIdentity;
  navItems: SectionNavItem[];
  ariaLabel: string;
}

/**
 * 内容区内的设置式侧栏布局（账户中心 / 管理后台共用），位于全站统一导航栏之下，
 * 使二者与 landing 在同一视觉框架内，消除割裂。移动端侧栏退化为横向标签条。
 */
export function SectionShell({ eyebrow, identity, navItems, ariaLabel }: SectionShellProps) {
  const location = useLocation();
  return (
    <div className={styles.wrap}>
      <aside className={styles.sidebar}>
        <div className={styles.identity}>
          <Avatar name={identity.name} src={identity.avatarUrl} size={44} />
          <span className={styles.idText}>
            <span className={styles.eyebrow}>{eyebrow}</span>
            <span className={styles.idName}>{identity.name}</span>
            {identity.sub && <span className={styles.idSub}>{identity.sub}</span>}
          </span>
        </div>
        <nav className={styles.nav} aria-label={ariaLabel}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
            >
              <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className={styles.content} key={location.pathname}>
        <Outlet />
      </div>
    </div>
  );
}
