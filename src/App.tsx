import React from 'react';
import Navbar from './components/Navbar';
import LicenseFooter from './components/LicenseFooter';
import LinkCard from './components/LinkCard';
import styles from './App.module.css';

const App: React.FC = () => {
  const getSidebarLinks = (closeHandler?: () => void) => (
    <>
      <a href="#" className={styles.sidebarLink} onClick={closeHandler}>TransCircle</a>
    </>
  );

  return (
    <div className={styles.appContainer}>
      <Navbar customMobileLinks={(close) => getSidebarLinks(close)} />
      
      <div className={styles.layoutContainer}>
        {/* 左侧侧边栏 (占据 1/5 宽度) */}
        <aside className={styles.sidebar}>
          <nav className={styles.sidebarNav}>
            {getSidebarLinks()}
          </nav>
        </aside>

        {/* 垂直分割线 */}
        <div className={styles.verticalDivider}></div>

        {/* 右侧正文 */}
        <main className={styles.mainContent}>
          <header className={styles.contentHeader}>
            <h1 className={styles.mainTitle}>TransCircle Project</h1>
            <p className={styles.subTitle}>我们的存在，就是对恶意最大的反抗。</p>
          </header>

          <section className={styles.introSection}>
            <p className={styles.greeting}>您好！我们正在进行 TransCircleProject 的初期准备。</p>
            
            <div className={styles.readmeContent}>
              <p>长此以往，中文 MtF 社群有个很奇怪的现象：我们确实有比较全面的社群 wiki，HRT 指南等，但几乎没有一个能见证我们社群存在与抗争的地方。</p>
              <p>跨性别社群流动性极大，这里发生过很多故事，但没有人把它们完整地记录下来过。</p>
              <p>因此，这个女性倾向跨性别社群史官工程应运而生。我们希望，把我们的故事归档记录，团结社群，争取跨性别权利。</p>
              
              <p className={styles.emphasis}>
                我们深信历史终将向前。这份记录，就是我们走过长夜的铁证。
              </p>
            </div>

            <div className={styles.linksGrid}>
              <LinkCard
                title="加入此项目"
                url="https://x.com/i/chat/group_join/g2053071552552603876/fw9lZ8e4SH"
                label="加入 X 群组"
                variant="button"
              />

              <LinkCard
                title="GitHub 仓库"
                url="https://github.com/TransCircle/TransCircle"
                label="github.com/TransCircle/TransCircle"
              />

              <LinkCard
                title="X (Twitter)"
                url="https://x.com/TransCircleOrg"
                label="@TransCircleOrg"
              />

              <LinkCard
                title="Bluesky"
                url="https://bsky.app/profile/TransCircle.org"
                label="TransCircle.org"
              />
            </div>
          </section>
        </main>
      </div>

      <LicenseFooter />
    </div>
  );
};

export default App;
