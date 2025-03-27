// 定义游戏搜索结果接口
export interface GameSearchResult {
  id: string | number;
  name: string;
  image?: string;
  info?: string;
  source?: "bangumi" | "steamgriddb";
  type?: number; // bangumi类型
}

// 定义搜索类型
export type SearchType = 1 | 2 | 3 | 4 | 6; // 对应Bangumi的类型：1=书籍, 2=动画, 3=音乐, 4=游戏, 6=三次元
