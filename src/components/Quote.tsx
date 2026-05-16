import styles from "./Quote.module.css";

interface QuoteProps {
  text: string;
}

function Quote({ text }: QuoteProps) {
  return (
    <blockquote className={styles.quote}>
      " {text}"
    </blockquote>
  );
}

export default Quote;
