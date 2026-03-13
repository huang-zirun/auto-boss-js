/**
 * 常量与选择器占位
 * 具体选择器由 F12 获取后填入，此处仅作占位与说明
 */

/** 元素选择器占位（实际值在实现时替换） */
export const SELECTORS = {
  // 登录态：存在即认为已登录（如带 wt2 的 cookie 或页面某元素）
  loggedIn: '', // 例: '[data-login="true"]' 或依赖 cookie 不依赖 DOM

  // 岗位栏
  jobTrigger: '',   // 点击展开岗位列表的按钮/区域
  jobList: '',      // 岗位列表容器
  jobItem: '',      // 单个岗位项

  // 筛选
  filterTrigger: '',  // 筛选按钮
  filterPanel: '',   // 筛选面板（VIP / 非 VIP 可能不同）
  filterConfirm: '', // 确定按钮
  filterClear: '',   // 清除按钮

  // 推荐牛人列表
  candidateList: '',   // 列表容器
  candidateCard: '',   // 单张候选人卡片
  greetButton: '.btn.btn-greet',  // 未沟通卡片上的打招呼按钮（type=button）
  continueButton: '',  // 继续沟通（已沟通，需跳过）

  // 每日上限弹窗
  dailyLimitPopup: '',
  dailyLimitClose: '',
};

/** 按钮文案（用于辅助定位或校验） */
export const LABELS = {
  greet: '打招呼',
  continue: '继续沟通',
};
