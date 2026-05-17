import { useState, useRef, useEffect, type ReactNode } from "react";
import styles from "./Navbar.module.css";

interface NavbarProps {
  customMobileLinks?: (closeMenu: () => void) => ReactNode[];
  customMobileLinkLabel?: string;
}

const Navbar = ({ customMobileLinks, customMobileLinkLabel }: NavbarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const closeMenu = () => setIsOpen(false);

  const openMenu = () => {
    setIsOpen(true);
    requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("a")?.focus();
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        hamburgerRef.current?.focus();
      }
    };
    const handleResize = () => {
      if (window.innerWidth > 768) closeMenu();
    };
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen]);

  const mobileLinks = customMobileLinks?.(closeMenu);

  return (
    <>
      <nav className={styles.navbar} aria-label="主导航">
        <div className={styles.container}>
          <div className={styles.leftSection}>
            <button
              ref={hamburgerRef}
              type="button"
              className={styles.hamburger}
              onClick={() => (isOpen ? closeMenu() : openMenu())}
              aria-label="Toggle menu"
              aria-expanded={isOpen}
              aria-controls="nav-menu"
            >
              <span className={styles.bar}></span>
              <span className={styles.bar}></span>
              <span className={styles.bar}></span>
            </button>
            <div className={styles.logo}>TransCircle</div>
          </div>
          <ul ref={menuRef} id="nav-menu" className={`${styles.navLinks} ${isOpen ? styles.active : ""}`}>
            <li><a href="/" onClick={closeMenu}>首页</a></li>
            <li><a href="#stories" onClick={closeMenu}>故事征集（开发中）</a></li>
            <li><a href="#archive" onClick={closeMenu}>人物归档（开发中）</a></li>
            <li><a href="#community" onClick={closeMenu}>社群互助（开发中）</a></li>
            {mobileLinks && (
              <>
                <li className={styles.mobileDivider}></li>
                {customMobileLinkLabel && (
                  <li className={styles.mobileOnly}>
                    <span className={styles.mobileLinkLabel}>{customMobileLinkLabel}</span>
                  </li>
                )}
                {mobileLinks.map((link, i) => (
                  <li key={i} className={styles.mobileOnly}>{link}</li>
                ))}
              </>
            )}
          </ul>
        </div>
      </nav>
      <div
        className={`${styles.overlay} ${isOpen ? styles.overlayActive : ""}`}
        onClick={closeMenu}
        aria-hidden="true"
      ></div>
    </>
  );
};

export default Navbar;
