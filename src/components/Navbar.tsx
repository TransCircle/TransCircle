import { useState, type ReactNode } from "react";
import styles from "./Navbar.module.css";

interface NavbarProps {
  customMobileLinks?: (closeMenu: () => void) => ReactNode;
}

const Navbar = ({ customMobileLinks }: NavbarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = () => setIsOpen(false);

  return (
    <>
      <nav className={styles.navbar}>
        <div className={styles.container}>
          <div className={styles.leftSection}>
            <button 
              type="button"
              className={styles.hamburger} 
              onClick={() => setIsOpen((prev) => !prev)}
              aria-label="Toggle menu"
              aria-expanded={isOpen}
              aria-haspopup="true"
              aria-controls="nav-menu"
            >
              <span className={styles.bar}></span>
              <span className={styles.bar}></span>
              <span className={styles.bar}></span>
            </button>
            <div className={styles.logo}>TransCircle</div>
          </div>
          <ul id="nav-menu" className={`${styles.navLinks} ${isOpen ? styles.active : ''}`}>
            <li><a href="/" onClick={closeMenu}>首页</a></li>
            <li><a href="#stories" onClick={closeMenu}>故事征集（开发中）</a></li>
            <li><a href="#archive" onClick={closeMenu}>人物归档（开发中）</a></li>
            <li><a href="#community" onClick={closeMenu}>社群互助（开发中）</a></li>
            {customMobileLinks && (
              <>
                <li className={styles.mobileDivider}></li>
                <li className={styles.mobileOnly}>
                  {customMobileLinks(closeMenu)}
                </li>
              </>
            )}
          </ul>
        </div>
      </nav>
      {/* 遮罩层，用于移动端点击外部关闭菜单 */}
      <div 
        className={`${styles.overlay} ${isOpen ? styles.overlayActive : ''}`} 
        onClick={closeMenu}
      ></div>
    </>
  );
};

export default Navbar;
