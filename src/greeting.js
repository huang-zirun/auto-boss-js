/**
 * 打招呼循环：遍历候选人卡片，点击「打招呼」，跳过「继续沟通」
 */

import { SELECTORS, LABELS } from './constants.js';

/** 随机延迟（秒） */
function delaySeconds(range) {
  const [min, max] = Array.isArray(range) ? range : [range, range];
  const s = min + Math.random() * (max - min);
  return new Promise(r => setTimeout(r, s * 1000));
}

/**
 * 获取当前列表内所有候选人卡片（含未沟通/已沟通状态）
 * @returns {Element[]}
 */
export function getCandidateCards() {
  // const list = document.querySelector(SELECTORS.candidateList);
  // return Array.from(list?.querySelectorAll(SELECTORS.candidateCard) ?? []);
  return [];
}

/**
 * 判断卡片是否已沟通（显示「继续沟通」）
 * @param {Element} card
 * @returns {boolean}
 */
export function isAlreadyGreeted(card) {
  // const btn = card.querySelector(SELECTORS.continueButton) ?? card.querySelector(`:contains("${LABELS.continue}")`);
  // return !!btn;
  return false;
}

/**
 * 获取卡片上的「打招呼」按钮（未沟通才有）
 * @param {Element} card
 * @returns {Element|null}
 */
export function getGreetButton(card) {
  return card.querySelector(SELECTORS.greetButton) ?? null;
}

/**
 * 检测是否出现每日上限弹窗
 * @returns {boolean}
 */
export function isDailyLimitPopupVisible() {
  // const popup = document.querySelector(SELECTORS.dailyLimitPopup);
  // return popup?.offsetParent != null;
  return false;
}

/**
 * 关闭每日上限弹窗（可选）
 */
export function closeDailyLimitPopup() {
  // document.querySelector(SELECTORS.dailyLimitClose)?.click();
}

/**
 * 执行单次打招呼：找到下一个未沟通卡片并点击打招呼
 * @param {Element[]} cards 当前卡片列表（可传入已过滤的）
 * @returns {Promise<'ok'|'skip'|'limit'|'no_more'>} ok 成功点击，skip 跳过，limit 达到上限，no_more 没有更多
 */
export async function greetOne(cards) {
  // if (isDailyLimitPopupVisible()) { closeDailyLimitPopup(); return 'limit'; }
  // const card = cards.find(c => !isAlreadyGreeted(c));
  // if (!card) return 'no_more';
  // const btn = getGreetButton(card);
  // if (!btn) return 'skip';
  // btn.click();
  return 'no_more';
}

/**
 * 打招呼主循环：间隔、上限、手动停止
 * @param {Object} options
 * @param {[number,number]} options.interval 间隔范围 [min, max] 秒
 * @param {number} options.runLimit 单次最多次数，0 不限制
 * @param {() => boolean} options.shouldStop 外部控制是否停止（如 UI 按钮）
 * @param {(event: { count: number, status: string }) => void} options.onGreet 每次打招呼后回调
 */
export async function runGreetingLoop(options) {
  const { interval, runLimit, shouldStop, onGreet } = options;
  let count = 0;

  while (true) {
    if (shouldStop?.()) break;
    if (runLimit > 0 && count >= runLimit) break;

    let cards = getCandidateCards();
    const result = await greetOne(cards);
    onGreet?.({ count, status: result });

    if (result === 'ok') count++;
    if (result === 'limit' || result === 'no_more') break;

    await delaySeconds(interval);
    // 可选：滚动加载更多后再 getCandidateCards()
  }
}
