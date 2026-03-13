/**
 * 主流程：推荐牛人页自动打招呼
 * 不包含具体 DOM 实现，仅编排各模块
 */

import { getStoredCookie, setStoredCookie, isLoggedIn, injectCookie } from './auth.js';
import { selectJob, getCurrentJobName } from './job.js';
import { runFilter } from './filter.js';
import { runGreetingLoop } from './greeting.js';

/** 合并默认配置与用户配置 */
function getConfig(userConfig = {}) {
  // const { DEFAULT_CONFIG } = await import('../config.example.js');
  const defaults = {
    greetInterval: [3, 6],
    runLimit: 20,
    filterEnabled: false,
    filterType: 'nonVip',
    filterOptions: {},
    stopOnDailyLimit: true,
  };
  return { ...defaults, ...userConfig };
}

/**
 * 推荐牛人页完整流程
 * @param {Object} userConfig 用户配置（可选）
 * @returns {Promise<{ ok: boolean, greeted: number, message?: string }>}
 */
export async function runRecommendPage(userConfig = {}) {
  const config = getConfig(userConfig);

  // 1. 登录态：若有存储的 Cookie 则注入并刷新/跳转；否则检查当前页是否已登录
  const cookie = getStoredCookie();
  if (cookie) injectCookie(cookie);
  if (!isLoggedIn()) {
    return { ok: false, greeted: 0, message: '未登录，请扫码或配置 Cookie 后重试' };
  }

  // 2. 若不在推荐牛人页，先跳转（可选：由油猴 @match 保证已在推荐页）
  // if (!window.location.href.includes('/web/chat/recommend')) window.location.href = ROUTES.recommend;

  // 3. 岗位：可按配置选择岗位（示例：不传则保持当前岗位）
  if (userConfig.job != null) await selectJob(userConfig.job);

  // 4. 筛选
  await runFilter(
    config.filterEnabled,
    config.filterType,
    config.filterOptions
  );

  // 5. 打招呼循环（支持外部停止）
  let greeted = 0;
  let shouldStop = false;
  const stop = () => { shouldStop = true; };

  await runGreetingLoop({
    interval: config.greetInterval,
    runLimit: config.runLimit,
    shouldStop: () => shouldStop,
    onGreet: ({ count, status }) => {
      if (status === 'ok') greeted = count;
    },
  });

  // 暴露停止方法给 UI
  window.__bp_stopGreeting = stop;

  return { ok: true, greeted };
}

/**
 * 后续扩展：其他页面（index、job/list）的入口
 * @param {string} page 'recommend' | 'index' | 'jobList'
 * @param {Object} userConfig
 */
export async function runPage(page, userConfig = {}) {
  switch (page) {
    case 'recommend':
      return runRecommendPage(userConfig);
    case 'index':
    case 'jobList':
      // 占位：后续实现对应页面逻辑
      return { ok: false, greeted: 0, message: `页面 ${page} 尚未实现` };
    default:
      return { ok: false, greeted: 0, message: '未知页面' };
  }
}
