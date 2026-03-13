/**
 * 配置示例（复制为 config.js 并填写，或通过脚本 UI 注入）
 * 不提交含 cookie 的 config.js
 */

export const DEFAULT_CONFIG = {
  // 打招呼间隔（秒），支持 [min, max] 随机
  greetInterval: [3, 6],
  // 单次运行最多打招呼数量，0 表示不限制（建议设上限）
  runLimit: 20,
  // 是否启用筛选
  filterEnabled: false,
  // 只筛非VIP（不消耗牛人点数）
  filterNonVip: false,
  // 筛选条件（学历等，key 与页面 .filter-wrap .name 对应）
  filterOptions: {},
  // 是否在达到每日上限时自动停止
  stopOnDailyLimit: true,
};

/** 页面 URL 与路由（后续扩展 index、job/list 用） */
export const ROUTES = {
  recommend: 'https://www.zhipin.com/web/chat/recommend',
  index: 'https://www.zhipin.com/web/chat/index',
  jobList: 'https://www.zhipin.com/web/chat/job/list',
};
