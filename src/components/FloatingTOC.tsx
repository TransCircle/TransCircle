import { useTranslation } from 'react-i18next';
import styles from './FloatingTOC.module.css';

export interface TOCItem {
  href: string;
  label: string;
}

interface FloatingTOCProps {
  items: TOCItem[];
  /** 缺省时使用 i18n 的 toc.label(「目录」)。 */
  label?: string;
}

const FloatingTOC = ({ items, label }: FloatingTOCProps) => {
  const { t } = useTranslation();
  const resolvedLabel = label ?? t('toc.label');

  return (
    <nav className={styles.toc} aria-label={resolvedLabel}>
      <span className={styles.heading} aria-hidden="true">{resolvedLabel}</span>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href} className={styles.link}>{item.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default FloatingTOC;
