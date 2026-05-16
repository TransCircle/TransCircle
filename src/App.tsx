import Header from "./components/Header";
import Quote from "./components/Quote";
import LinkCard from "./components/LinkCard";
import LicenseFooter from "./components/LicenseFooter";
import styles from "./App.module.css";

function App() {
  return (
    <main className={styles.container}>
      <Header />

      <Quote
        text="我们的存在，就是对恶意最大的反抗。"
      />

      <LinkCard
        title="加入此项目"
        url="https://x.com/i/chat/group_join/g2053071552552603876/fw9lZ8e4SH"
        label="加入 X 群组"
        variant="button"
      />

      <LinkCard
        title="GitHub 仓库"
        url="https://github.com/epheiamoe/TransCircle"
        label="github.com/epheiamoe/TransCircle"
      />

      <LinkCard
        title="联系"
        url="https://x.com/nyaepheia"
        label="Epheia"
      />

      <LicenseFooter />
    </main>
  );
}

export default App;
