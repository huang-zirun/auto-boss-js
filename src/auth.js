/**
 * 登录态 / Cookie 管理
 * 依赖：GM_getValue / GM_setValue（油猴）或 localStorage
 */

/**
 * 读取已保存的 Cookie 字符串（如从 F12 复制后存入）
 * @returns {string} Cookie 字符串，未配置时为空
 */
export function getStoredCookie() {
  // 示例：return typeof GM_getValue !== 'undefined' ? GM_getValue('bp_cookie', '') : localStorage.getItem('bp_cookie') ?? '';
  return '';
}

/**
 * 保存 Cookie 字符串（用户通过配置/UI 写入）
 * @param {string} cookie
 */
export function setStoredCookie(cookie) {
  // 示例：GM_setValue?.('bp_cookie', cookie) ?? localStorage.setItem('bp_cookie', cookie);
}

/**
 * 判断当前页面是否已登录
 * @returns {boolean}
 */
export function isLoggedIn() {
  // 方案 A：检查关键 cookie（如 wt2）是否存在
  // 方案 B：检查页面上仅登录后出现的元素（SELECTORS.loggedIn）
  return false;
}

/**
 * 向当前页面注入 Cookie，实现免扫码登录
 * 应在页面加载早期执行（如 before load 或 document_start）
 * @param {string} cookieString
 */
export function injectCookie(cookieString) {
  if (!cookieString) return;
  // 将 cookieString 拆成 name=value 逐条设置到 document.cookie
  // 注意：HttpOnly 的 cookie 无法通过 JS 注入，若 wt2 为 HttpOnly，需用油猴的 @run-at 或请求头注入等方式
}
