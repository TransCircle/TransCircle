import styles from "./LinkCard.module.css";

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
      <h2 className={styles.heading}>{title}</h2>
      <p>
        <a href={url} className={linkClass}>
          {label}
        </a>
      </p>
    </section>
  );
}

export default LinkCard;
