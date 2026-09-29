import { useTranslation } from "react-i18next";

import { Avatar } from "./Avatar";
import { githubProfileUrl, TEAM_MEMBERS } from "../data/team";
import styles from "./TeamSection.module.css";

interface TeamSectionProps {
  /** 外层 section 的节奏样式（发丝线、间距）由所在页面决定。 */
  readonly className?: string;
  /** 与页面其他分区标题共用同一套样式。 */
  readonly headingClassName?: string;
}

const AVATAR_SIZE = 64;

/**
 * 首页团队成员：头像 + 昵称 + 职位，整张卡片链接到成员的 GitHub 主页。
 * 名单来自 src/data/team.json，昵称与头像构建时取自 GitHub，头像由本站同源提供；
 * 没有头像或加载失败时回退为昵称首字。
 */
export function TeamSection({ className, headingClassName }: TeamSectionProps) {
  const { t } = useTranslation();

  return (
    <section id="team" className={className} aria-labelledby="team-heading">
      <h2 id="team-heading" className={headingClassName}>
        {t("landing.teamHeading")}
      </h2>
      <ul className={styles.grid}>
        {TEAM_MEMBERS.map(({ github, name, role, avatar }) => (
          <li key={github}>
            <a
              href={githubProfileUrl(github)}
              className={styles.member}
              target="_blank"
              rel="nofollow noopener noreferrer"
              aria-label={t("landing.teamMemberLink", { name, role })}
            >
              <Avatar
                name={name}
                src={avatar}
                size={AVATAR_SIZE}
                className={styles.avatar}
              />
              <span className={styles.name}>{name}</span>
              <span className={styles.role}>{role}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
