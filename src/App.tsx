import { type ReactNode } from "react";
import Navbar from './components/Navbar';
import FloatingTOC, { type TOCItem } from './components/FloatingTOC';
import LicenseFooter from './components/LicenseFooter';
import styles from './App.module.css';

const GitHubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
  </svg>
);

const XIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const BlueskyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 568 501" fill="currentColor" aria-hidden="true">
    <path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.738-.017-2.87-1.169.511-3.631 7.738-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.889-129.52 80.653-149.07-65.72 11.185-139.6-7.295-159.875-79.748C9.945 203.66 0 75.293 0 57.947 0-28.906 76.134-1.611 123.121 33.664z"/>
  </svg>
);

const TOC_ITEMS: TOCItem[] = [
  { href: '#about', label: '关于项目' },
  { href: '#join',  label: '加入项目' },
  { href: '#follow', label: '关注我们' },
];

const mobileLinks = (close: () => void): ReactNode[] =>
  TOC_ITEMS.map(({ href, label }) => (
    <a key={href} href={href} onClick={close}>{label}</a>
  ));

const App = () => (
  <div className={styles.appContainer}>
    <Navbar
      customMobileLinkLabel="目录"
      customMobileLinks={mobileLinks}
    />
    <FloatingTOC items={TOC_ITEMS} />

    <main className={styles.mainContent}>
      <header className={styles.contentHeader}>
        <h1 className={styles.mainTitle}>TransCircle Project</h1>
        <p className={styles.subTitle}>我们的存在，就是对恶意最大的反抗。</p>
      </header>

      <section id="about" className={styles.introSection}>
        <p className={styles.greeting}>您好！我们正在进行 TransCircleProject 的初期准备。</p>
        <div className={styles.readmeContent}>
          <p>长此以往，中文 MtF 社群有个很奇怪的现象：我们确实有比较全面的社群 wiki，HRT 指南等，但几乎没有一个能见证我们社群存在与抗争的地方。</p>
          <p>跨性别社群流动性极大，这里发生过很多故事，但没有人把它们完整地记录下来过。</p>
          <p>因此，这个女性倾向跨性别社群史官工程应运而生。我们希望，把我们的故事归档记录，团结社群，争取跨性别权利。</p>
        </div>
        <p className={styles.emphasis}>
          我们深信历史终将向前。这份记录，就是我们走过长夜的铁证。
        </p>
      </section>

      <section id="join" className={styles.actionSection}>
        <h2 className={styles.sectionHeading}>加入项目</h2>
        <div className={styles.ctaRow}>
          <a href="https://transcircle.org/s/join" className={styles.ctaPrimary} target="_blank" rel="noopener noreferrer">
            填写申请表单
          </a>
          <a href="https://x.com/i/chat/group_join/g2053071552552603876/fw9lZ8e4SH" className={styles.ctaSecondary} target="_blank" rel="noopener noreferrer">
            加入 X 聊天群
          </a>
        </div>
      </section>

      <section id="follow" className={styles.followSection}>
        <h2 className={styles.sectionHeading}>关注我们</h2>
        <ul className={styles.socialList}>
          <li>
            <a href="https://github.com/TransCircle/TransCircle" className={styles.socialLink} target="_blank" rel="noopener noreferrer">
              <span className={styles.socialIcon}><GitHubIcon /></span>
              <span className={styles.socialName}>GitHub</span>
              <span className={styles.socialHandle}>github.com/TransCircle/TransCircle</span>
            </a>
          </li>
          <li>
            <a href="https://x.com/TransCircleOrg" className={styles.socialLink} target="_blank" rel="noopener noreferrer">
              <span className={styles.socialIcon}><XIcon /></span>
              <span className={styles.socialName}>X (Twitter)</span>
              <span className={styles.socialHandle}>@TransCircleOrg</span>
            </a>
          </li>
          <li>
            <a href="https://bsky.app/profile/TransCircle.org" className={styles.socialLink} target="_blank" rel="noopener noreferrer">
              <span className={styles.socialIcon}><BlueskyIcon /></span>
              <span className={styles.socialName}>Bluesky</span>
              <span className={styles.socialHandle}>TransCircle.org</span>
            </a>
          </li>
        </ul>
      </section>
    </main>

    <LicenseFooter />
  </div>
);

export default App;
