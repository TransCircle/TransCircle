import styles from "./LinkCard.module.css";

const FlowerIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5" />
    <path d="M12 7.5V9" />
    <path d="M7.5 12H9" />
    <path d="M16.5 12H15" />
    <path d="M12 16.5V15" />
    <path d="m8 8 1.88 1.88" />
    <path d="M14.12 9.88 16 8" />
    <path d="m8 16 1.88-1.88" />
    <path d="M14.12 14.12 16 16" />
  </svg>
);

interface LinkCardProps {
  title: string;
  url: string;
  label: string;
  variant?: "button" | "text";
}

function LinkCard({ title, url, label, variant = "text" }: LinkCardProps) {
  const linkClass = variant === "button" ? styles.buttonLink : styles.textLink;

  return (
    <section>
      <h2 className={styles.heading}>
        <span className={styles.headingIcon}><FlowerIcon /></span>
        {title}
      </h2>
      <p>
        <a href={url} className={linkClass}>
          {label}
        </a>
      </p>
    </section>
  );
}

export default LinkCard;
