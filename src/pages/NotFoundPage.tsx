import { useTranslation } from "react-i18next";
import { StatusScreen } from "../components/ui";

const NotFoundPage = () => {
  const { t } = useTranslation();
  return (
    <StatusScreen
      kind="info"
      title={t("error.notFound")}
      description={t("error.notFoundDetail")}
      detail="404"
      actions={[{ label: t("error.backHome"), to: "/" }]}
    />
  );
};

export default NotFoundPage;
