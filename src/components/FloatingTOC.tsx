import styles from './FloatingTOC.module.css';

export interface TOCItem {
  href: string;
  label: string;
}

interface FloatingTOCProps {
  items: TOCItem[];
  label?: string;
}

const FloatingTOC = ({ items, label = '目录' }: FloatingTOCProps) => (
  <nav className={styles.toc} aria-label={label}>
    <span className={styles.heading} aria-hidden="true">{label}</span>
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.href}>
          <a href={item.href} className={styles.link}>{item.label}</a>
        </li>
      ))}
    </ul>
  </nav>
);

export default FloatingTOC;
