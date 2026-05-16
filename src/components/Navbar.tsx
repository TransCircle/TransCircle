import React, { useState, ReactNode } from 'react';
import styles from './Navbar.module.css';

interface NavbarProps {
  customMobileLinks?: ReactNode;
}

const Navbar: React.FC<NavbarProps> = ({ customMobileLinks }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <nav className={styles.navbar}>
        <div className={styles.container}>
          <div className={styles.leftSection}>
            <button 
              className={styles.hamburger} 
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
            >
              <span className={styles.bar}></span>
              <span className={styles.bar}></span>
              <span className={styles.bar}></span>
            </button>
            <div className={styles.logo}>TransCircle</div>
          </div>
          <ul className={`${styles.navLinks} ${isOpen ? styles.active : ''}`}>
            <li><a href="/" onClick={() => setIsOpen(false)}>首页</a></li>
            <li><a href="#stories" onClick={() => setIsOpen(false)}>故事征集</a></li>
            <li><a href="#archive" onClick={() => setIsOpen(false)}>人物归档</a></li>
            <li><a href="#community" onClick={() => setIsOpen(false)}>社群互助</a></li>
            {customMobileLinks && (
              <>
                <li className={styles.mobileDivider}></li>
                <li className={styles.mobileOnly} onClick={() => setIsOpen(false)}>
                  {customMobileLinks}
                </li>
              </>
            )}
          </ul>
        </div>
      </nav>
      {/* 遮罩层，用于移动端点击外部关闭菜单 */}
      <div 
        className={`${styles.overlay} ${isOpen ? styles.overlayActive : ''}`} 
        onClick={() => setIsOpen(false)}
      ></div>
    </>
  );
};

export default Navbar;
