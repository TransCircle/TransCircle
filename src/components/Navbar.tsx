import {
  useState,
  useRef,
  useEffect,
  type ReactNode,
} from "react";

import { Link } from "react-router-dom";

import ThemeToggle from "./ThemeToggle";

import styles from "./Navbar.module.css";

interface MobileLink {
  key: string;
  node: ReactNode;
}

interface NavbarProps {
  customMobileLinks?: (
    closeMenu: () => void
  ) => MobileLink[];

  customMobileLinkLabel?: string;
}

const MOBILE_BREAKPOINT = 1200;

const Navbar = ({
  customMobileLinks,
  customMobileLinkLabel,
}: NavbarProps) => {
  const [isOpen, setIsOpen] =
    useState(false);

  const [isMobile, setIsMobile] =
    useState(
      window.innerWidth <=
        MOBILE_BREAKPOINT
    );

  const hamburgerRef =
    useRef<HTMLButtonElement>(null);

  const menuRef =
    useRef<HTMLUListElement>(null);

  const closeMenu = () =>
    setIsOpen(false);

  const openMenu = () => {
    setIsOpen(true);

    requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        ?.focus();
    });
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile =
        window.innerWidth <=
        MOBILE_BREAKPOINT;

      setIsMobile(mobile);

      if (!mobile) {
        closeMenu();
      }
    };

    const handleKeyDown = (
      e: KeyboardEvent
    ) => {
      if (e.key === "Escape") {
        closeMenu();

        hamburgerRef.current?.focus();
      }
    };

    window.addEventListener(
      "resize",
      handleResize
    );

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleResize
      );

      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, []);

  useEffect(() => {
    const main =
      document.querySelector<HTMLElement>(
        "main"
      );

    if (!main) return;

    main.inert =
      isMobile && isOpen;

    return () => {
      main.inert = false;
    };
  }, [isOpen, isMobile]);

  const mobileLinks =
    customMobileLinks?.(
      closeMenu
    );

  return (
    <>
      <nav
        className={styles.navbar}
        aria-label="主导航"
      >
        <div
          className={styles.container}
        >
          <div
            className={
              styles.leftSection
            }
          >
            <button
              ref={hamburgerRef}
              type="button"
              className={
                styles.hamburger
              }
              onClick={() =>
                isOpen
                  ? closeMenu()
                  : openMenu()
              }
              aria-label={
                isOpen
                  ? "关闭菜单"
                  : "打开菜单"
              }
              aria-expanded={
                isOpen
              }
              aria-controls="nav-menu"
            >
              <span
                className={
                  styles.bar
                }
              ></span>

              <span
                className={
                  styles.bar
                }
              ></span>

              <span
                className={
                  styles.bar
                }
              ></span>
            </button>

            <div
              className={styles.logo}
            >
              TransCircle
            </div>
          </div>

          <ul
            ref={menuRef}
            id="nav-menu"
            inert={
              isMobile
                ? !isOpen
                : undefined
            }
            className={`${
              styles.navLinks
            } ${
              isOpen
                ? styles.active
                : ""
            }`}
          >
            <li>
              <Link
                to="/"
                onClick={closeMenu}
              >
                首页
              </Link>
            </li>

            <li>
              <Link
                to="/submit"
                onClick={closeMenu}
              >
                故事征集
              </Link>
            </li>

            <li>
              <a
                href="#archive"
                onClick={closeMenu}
              >
                人物归档（开发中）
              </a>
            </li>

            <li>
              <a
                href="#community"
                onClick={closeMenu}
              >
                社群互助（开发中）
              </a>
            </li>

            {mobileLinks && (
              <>
                <li
                  className={
                    styles.mobileDivider
                  }
                ></li>

                {customMobileLinkLabel && (
                  <li
                    className={
                      styles.mobileOnly
                    }
                  >
                    <span
                      className={
                        styles.mobileLinkLabel
                      }
                    >
                      {
                        customMobileLinkLabel
                      }
                    </span>
                  </li>
                )}

                <li
                  className={
                    styles.mobileOnly
                  }
                >
                  <div
                    className={
                      styles.mobileTOCGroup
                    }
                  >
                    <li className={styles.mobileOnly}>
                      <div className={styles.mobileTOCGroup}>
                        {mobileLinks.map(({ key, node }) => (
                          <div key={key} className={styles.mobileTOCItem}>{node}</div>
                        ))}
                      </div>
                    </li>
                  </div>
                </li>
              </>
            )}

            <li
              className={
                styles.mobileDivider
              }
            ></li>

            <li
              className={`${styles.mobileOnly} ${styles.mobileThemeToggle}`}
            >
              <div
                className={
                  styles.mobileThemeLabel
                }
              >
                主题
              </div>

              <ThemeToggle
                className={
                  styles.mobileThemeToggleGroup
                }
              />
            </li>
          </ul>

          <div
            className={
              styles.rightSection
            }
          >
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <div
        className={`${
          styles.overlay
        } ${
          isOpen
            ? styles.overlayActive
            : ""
        }`}
        onClick={closeMenu}
        aria-hidden="true"
      ></div>
    </>
  );
};

export default Navbar;