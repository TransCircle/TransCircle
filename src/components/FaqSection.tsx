import { useTranslation } from "react-i18next";

import { getFaqEntries } from "../seo/faq";
import styles from "./FaqSection.module.css";

interface FaqSectionProps {
  /** 外层 section 的节奏样式（发丝线、间距）由所在页面决定。 */
  readonly className?: string;
  /** 与页面其他分区标题共用同一套样式。 */
  readonly headingClassName?: string;
}

const Chevron = () => (
  <svg className={styles.chevron} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * 首页常见问题。用原生 <details>/<summary>：键盘（Tab + Enter/Space）与读屏的
 * 展开/收起语义由浏览器提供，无需自造 aria-expanded。
 * 答案始终在 DOM 里（仅折叠），爬虫与 FAQPage JSON-LD 读到的是同一份文案。
 */
export function FaqSection({ className, headingClassName }: FaqSectionProps) {
  const { t } = useTranslation();
  const entries = getFaqEntries(t);

  return (
    <section id="faq" className={className} aria-labelledby="faq-heading">
      <h2 id="faq-heading" className={headingClassName}>
        {t("landing.faqHeading")}
      </h2>
      <div className={styles.list}>
        {entries.map(({ key, question, answer }) => (
          <details key={key} id={`faq-${key}`} className={styles.item}>
            <summary className={styles.question}>
              <span>{question}</span>
              <Chevron />
            </summary>
            <p className={styles.answer}>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
