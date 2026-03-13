/**
 * 岗位切换
 * 点击岗位栏 → 展开列表 → 选择岗位
 */

import { SELECTORS } from './constants.js';

/**
 * 打开岗位下拉列表
 * @returns {Promise<boolean>} 是否成功打开
 */
export async function openJobList() {
  // const el = document.querySelector(SELECTORS.jobTrigger);
  // if (!el) return false;
  // el.click();
  // await delay(300);
  return false;
}

/**
 * 获取当前展示的岗位列表项（文案或 DOM）
 * @returns {Promise<Array<{ text: string, element: Element }>>}
 */
export async function getJobItems() {
  // const list = document.querySelector(SELECTORS.jobList);
  // const items = list?.querySelectorAll(SELECTORS.jobItem) ?? [];
  // return Array.from(items).map(el => ({ text: el.textContent?.trim(), element: el }));
  return [];
}

/**
 * 按文案或索引选择岗位
 * @param {string|number} job 岗位名称或列表中的索引
 * @returns {Promise<boolean>}
 */
export async function selectJob(job) {
  // await openJobList();
  // const items = await getJobItems();
  // const target = typeof job === 'number' ? items[job] : items.find(i => i.text.includes(job));
  // if (target) target.element.click();
  return false;
}

/**
 * 获取当前选中的岗位名称（用于日志或分配次数）
 * @returns {Promise<string>}
 */
export async function getCurrentJobName() {
  // const trigger = document.querySelector(SELECTORS.jobTrigger);
  // return trigger?.textContent?.trim() ?? '';
  return '';
}
