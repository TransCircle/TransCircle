import styles from "./LicenseFooter.module.css";

function LicenseFooter() {
  return (
    <>
      <footer className={styles.footer}>
        <h2 className={styles.heading}>LICENSE</h2>
        <p>对于此页面的文字和素材：CC BY 4.0 or later</p>
        <p>对于其他人提供的材料，依照她们的版权要求。届时我们会提供单独的版权页面。</p>
      </footer>
      <div className={styles.decor}>✨ 🐾 ✨</div>
    </>
  );
}

export default LicenseFooter;
