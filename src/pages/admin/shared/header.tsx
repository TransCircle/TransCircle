import { createContext, useContext, useEffect, type ReactNode } from "react";

export interface AdminHeaderState {
  title: string;
  subtitle?: string;
  /** 详情/向导页的返回入口；列表页不给。 */
  back?: { to: string; label: string };
  /** 标题右侧的补充节点（状态徽标、环境标记等）。 */
  badges?: ReactNode;
}

type Setter = (header: AdminHeaderState) => void;

export const AdminHeaderContext = createContext<Setter>(() => {});

/**
 * 页面把自己的标题交给外壳渲染。
 *
 * 标题条在工作区顶部、内容区之外，只能由外壳画；但标题内容（尤其详情页的实体名）
 * 只有页面知道。用一个 setter 把两边接起来，好过让外壳去 pathname 里猜名字。
 */
export function useAdminPageHeader(header: AdminHeaderState): void {
  const set = useContext(AdminHeaderContext);
  const { title, subtitle, back, badges } = header;
  useEffect(() => {
    set({ title, subtitle, back, badges });
    // back / badges 是每次渲染新建的对象，按其内容取依赖，避免无限 setState。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, subtitle, back?.to, back?.label, badges]);
}
