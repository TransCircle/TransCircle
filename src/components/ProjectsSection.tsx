import { useTranslation } from "react-i18next";

import { PROJECTS } from "../seo/site";
import styles from "./ProjectsSection.module.css";

interface ProjectsSectionProps {
  /** 外层 section 的节奏样式（发丝线、间距）由所在页面决定。 */
  readonly className?: string;
  /** 与页面其他分区标题共用同一套样式。 */
  readonly headingClassName?: string;
}

const ArrowIcon = () => (
  <svg className={styles.arrow} width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M6 2h8v8" />
    <path d="M14 2 4 12" />
  </svg>
);

/** 去掉协议与尾斜杠，只露出子域名作为可见地址。 */
function displayHost(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * 首页「项目列表」：每个项目一张可点击卡片（标题 + 简介 + 地址）；成员个人维护的项目标注「外部」。
 * 项目列表与 JSON-LD 的子站 WebSite 节点同源于 src/seo/site.ts 的 PROJECTS；
 * 尚未上线的项目渲染为不可点击的卡片，并以「圆点 + 文字」标注状态（不单靠颜色）。
 */
export function ProjectsSection({ className, headingClassName }: ProjectsSectionProps) {
  const { t } = useTranslation();

  return (
    <section id="projects" className={className} aria-labelledby="projects-heading">
      <h2 id="projects-heading" className={headingClassName}>
        {t("landing.projectsHeading")}
      </h2>
      <ul className={styles.grid}>
        {PROJECTS.map(({ key, url, kind }) => {
          const title = t(`landing.projects.${key}.title`);
          const desc = t(`landing.projects.${key}.desc`);
          return (
            <li key={key}>
              {url ? (
                // 不加 nofollow：这些是本组织自己的站点（与 JSON-LD 子站同源），需要搜索引擎跟进建立关联；
                // 成员个人项目也属项目组，同样保留。noopener noreferrer 照旧。
                <a href={url} className={styles.card} target="_blank" rel="noopener noreferrer">
                  <span className={styles.title}>
                    <span className={styles.titleText}>
                      {title}
                      {kind === "other" && <span className={styles.tag}>{t("landing.projectsOther")}</span>}
                    </span>
                    <ArrowIcon />
                  </span>
                  <span className={styles.desc}>{desc}</span>
                  <span className={styles.url}>{displayHost(url)}</span>
                </a>
              ) : (
                <div className={`${styles.card} ${styles.cardPending}`}>
                  <span className={styles.title}>{title}</span>
                  <span className={styles.desc}>{desc}</span>
                  <span className={styles.status}>
                    <span className={styles.dot} aria-hidden="true" />
                    {t("landing.projectsInDevelopment")}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
