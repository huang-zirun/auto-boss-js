// ==UserScript==
// @name         BOSS直聘-推荐牛人自动打招呼
// @description  招聘端推荐牛人页：岗位切换、筛选、自动点击打招呼
// @match        https://www.zhipin.com/*
// @noframes     仅在主页面运行，不注入 iframe，避免出现两个面板
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document_idle
// ==/UserScript==

(function () {
  'use strict';

  // 防止脚本重复执行：清理已存在的面板和样式
  const existingPanel = document.getElementById('bp-control-panel');
  const existingStyle = document.getElementById('bp-panel-styles');
  if (existingPanel) {
    console.log('[BP] 发现已存在的面板，移除旧面板');
    existingPanel.remove();
  }
  if (existingStyle) {
    existingStyle.remove();
  }

  // 全局命名空间：避免脚本重复执行时 interval / popstate / history 补丁累积
  const _g = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  if (!_g.__bp_control) _g.__bp_control = {};
  const _bp = _g.__bp_control;
  if (_bp.intervalId != null) {
    clearInterval(_bp.intervalId);
    _bp.intervalId = null;
  }
  if (_bp.popstateHandler) {
    window.removeEventListener('popstate', _bp.popstateHandler);
    _bp.popstateHandler = null;
  }

  // ---------- 配置（默认值，可被 GM_getValue 覆盖） ----------
  const DEFAULT_CONFIG = {
    greetInterval: [3, 6],
    runLimit: 20,
    filterEnabled: false,
    // 学历要求多选，数组。选「不限」时等价于 ['不限']，与其它互斥
    filterDegree: ['不限'],
    filterOptions: {},
    // VIP 筛选：自动检测 + 可手动勾选「我是 VIP」
    filterVipEnabled: true,
    filterVipManual: false,
    filterVipSchool: ['双一流院校', '985', '211'],
    filterVipExchangeResume: '近一个月没有',
    filterVipMajor: [],          // 专业多选，空数组=不限
    filterVipRecentNotView: '不限', // 近期没有看过：'不限' 或 '近14天没有'
    stopOnDailyLimit: true,
  };

  /** 每日打招呼上限（自然日 0 点重置）测试时暂设为 10 */
  const DAILY_GREET_LIMIT = 100;
  const DAILY_STATE_KEY_PREFIX = 'bp_daily_';

  const LOG_PREFIX = '[BP]';
  function logAction(msg) {
    let text;
    if (typeof msg === 'string') {
      text = msg;
    } else if (msg && typeof msg === 'object' && 'result' in msg) {
      text = `已打招呼 ${(msg.count || 0) + 1} 次 · ${msg.result}`;
    } else {
      text = msg?.message || JSON.stringify(msg);
    }
    console.log(LOG_PREFIX, text);
  }

  function getConfig() {
    try {
      const saved = GM_getValue('bp_config', '{}');
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  function setConfig(config) {
    GM_setValue('bp_config', JSON.stringify(config));
  }

  // ---------- 控制面板 ----------
  let panelEl = null;
  let panelState = {
    isRunning: false,
    greetedCount: 0,
    isMinimized: false,
  };

  const PANEL_STYLES = `
    #bp-control-panel {
      position: fixed;
      right: 20px;
      bottom: 20px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      z-index: 999999;
      overflow: hidden;
      transition: all 0.3s ease;
    }
    #bp-control-panel.minimized {
      width: 50px;
      height: 32px;
    }
    #bp-control-panel:not(.minimized) {
      width: 220px;
    }
    .bp-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      background: linear-gradient(135deg, #00b3bd 0%, #00a0a8 100%);
      color: #fff;
      cursor: pointer;
      user-select: none;
    }
    .bp-panel-title {
      font-weight: 600;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .bp-panel-toggle {
      font-size: 14px;
      line-height: 1;
      opacity: 0.9;
    }
    .bp-panel-body {
      padding: 10px;
    }
    .minimized .bp-panel-body {
      display: none;
    }
    .bp-btn-group {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }
    .bp-btn {
      flex: 1;
      padding: 6px 8px;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: 500;
    }
    .bp-btn-start {
      background: #00b3bd;
      color: #fff;
    }
    .bp-btn-start:hover:not(:disabled) {
      background: #009ba4;
    }
    .bp-btn-start:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .bp-btn-pause {
      background: #ff6b6b;
      color: #fff;
    }
    .bp-btn-pause:hover:not(:disabled) {
      background: #ff5252;
    }
    .bp-btn-pause:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .bp-section {
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #f0f0f0;
    }
    .bp-section:last-of-type {
      border-bottom: none;
      margin-bottom: 0;
    }
    .bp-checkbox-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      cursor: pointer;
    }
    .bp-checkbox-row:last-child {
      margin-bottom: 0;
    }
    .bp-checkbox {
      width: 14px;
      height: 14px;
      margin: 0;
      cursor: pointer;
    }
    .bp-label {
      color: #333;
      cursor: pointer;
      user-select: none;
    }
    .bp-degree-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .bp-degree-item {
      display: flex;
      align-items: center;
      gap: 3px;
      cursor: pointer;
    }
    .bp-degree-item input {
      width: 12px;
      height: 12px;
      margin: 0;
      cursor: pointer;
    }
    .bp-degree-item label {
      font-size: 11px;
      color: #555;
      cursor: pointer;
      user-select: none;
    }
    .bp-status {
      text-align: center;
      color: #666;
      font-size: 11px;
      padding-top: 6px;
    }
    .bp-status-count {
      color: #00b3bd;
      font-weight: 600;
    }
  `;

  function createControlPanel() {
    // 仅在顶层窗口创建，iframe 内不创建（避免出现两个面板）
    if (window.self !== window.top) return;
    // 先移除 DOM 中已存在的所有同 ID 面板（防止重复注入或竞态导致出现两个面板）
    const existing = document.querySelectorAll('#bp-control-panel');
    existing.forEach((el) => el.remove());
    panelEl = null;

    // 若当前闭包下面板仍在且未被移除，不再创建（理论上上面已清空）
    if (panelEl && document.body.contains(panelEl)) return;
    if (document.getElementById('bp-control-panel')) return;

    // 避免重复添加样式
    if (!document.getElementById('bp-panel-styles')) {
      const style = document.createElement('style');
      style.id = 'bp-panel-styles';
      style.textContent = PANEL_STYLES;
      document.head.appendChild(style);
    }

    panelEl = document.createElement('div');
    panelEl.id = 'bp-control-panel';

    const config = getConfig();

    panelEl.innerHTML = `
      <div class="bp-panel-header">
        <div class="bp-panel-title">🤖 自动打招呼</div>
        <div class="bp-panel-toggle">─</div>
      </div>
      <div class="bp-panel-body">
        <div class="bp-btn-group">
          <button class="bp-btn bp-btn-start" id="bp-start">▶ 开始</button>
          <button class="bp-btn bp-btn-pause" id="bp-pause" disabled>⏸ 暂停</button>
        </div>
        <div class="bp-section">
          <div class="bp-checkbox-row">
            <input type="checkbox" class="bp-checkbox" id="bp-filter-enable" ${config.filterEnabled ? 'checked' : ''}>
            <label class="bp-label" for="bp-filter-enable">启用筛选</label>
          </div>
          <div class="bp-checkbox-row">
            <input type="checkbox" class="bp-checkbox" id="bp-filter-vip-manual" ${config.filterVipManual ? 'checked' : ''}>
            <label class="bp-label" for="bp-filter-vip-manual">我是 VIP（手动）</label>
          </div>
          <div class="bp-checkbox-row">
            <input type="checkbox" class="bp-checkbox" id="bp-filter-vip-enable" ${config.filterVipEnabled ? 'checked' : ''}>
            <label class="bp-label" for="bp-filter-vip-enable">使用 VIP 筛选</label>
          </div>
        </div>
        <div class="bp-section">
          <div class="bp-label" style="margin-bottom: 6px; display: block;">学历要求:</div>
          <div class="bp-degree-row">
            <div class="bp-degree-item">
              <input type="checkbox" id="bp-degree-本科" ${config.filterDegree.includes('本科') ? 'checked' : ''}>
              <label for="bp-degree-本科">本科</label>
            </div>
            <div class="bp-degree-item">
              <input type="checkbox" id="bp-degree-硕士" ${config.filterDegree.includes('硕士') ? 'checked' : ''}>
              <label for="bp-degree-硕士">硕士</label>
            </div>
            <div class="bp-degree-item">
              <input type="checkbox" id="bp-degree-博士" ${config.filterDegree.includes('博士') ? 'checked' : ''}>
              <label for="bp-degree-博士">博士</label>
            </div>
          </div>
        </div>
        <div class="bp-section bp-vip-section">
          <div class="bp-label" style="margin-bottom: 6px; display: block;">院校（VIP）:</div>
          <div class="bp-degree-row">
            <div class="bp-degree-item">
              <input type="checkbox" id="bp-vip-school-双一流院校" ${config.filterVipSchool.includes('双一流院校') ? 'checked' : ''}>
              <label for="bp-vip-school-双一流院校">双一流</label>
            </div>
            <div class="bp-degree-item">
              <input type="checkbox" id="bp-vip-school-985" ${config.filterVipSchool.includes('985') ? 'checked' : ''}>
              <label for="bp-vip-school-985">985</label>
            </div>
            <div class="bp-degree-item">
              <input type="checkbox" id="bp-vip-school-211" ${config.filterVipSchool.includes('211') ? 'checked' : ''}>
              <label for="bp-vip-school-211">211</label>
            </div>
            <div class="bp-degree-item">
              <input type="checkbox" id="bp-vip-school-留学" ${config.filterVipSchool.includes('留学') ? 'checked' : ''}>
              <label for="bp-vip-school-留学">留学</label>
            </div>
            <div class="bp-degree-item">
              <input type="checkbox" id="bp-vip-school-国内外名校" ${config.filterVipSchool.includes('国内外名校') ? 'checked' : ''}>
              <label for="bp-vip-school-国内外名校">国内外名校</label>
            </div>
            <div class="bp-degree-item">
              <input type="checkbox" id="bp-vip-school-公办本科" ${config.filterVipSchool.includes('公办本科') ? 'checked' : ''}>
              <label for="bp-vip-school-公办本科">公办本科</label>
            </div>
          </div>
        </div>
        <div class="bp-section bp-vip-section">
          <div class="bp-label" style="margin-bottom: 6px; display: block;">交换简历（VIP）:</div>
          <div class="bp-degree-row">
            <div class="bp-degree-item">
              <input type="radio" name="bp-vip-exchange" id="bp-vip-exchange-不限" ${config.filterVipExchangeResume === '不限' ? 'checked' : ''} value="不限">
              <label for="bp-vip-exchange-不限">不限</label>
            </div>
            <div class="bp-degree-item">
              <input type="radio" name="bp-vip-exchange" id="bp-vip-exchange-近一个月没有" ${config.filterVipExchangeResume === '近一个月没有' ? 'checked' : ''} value="近一个月没有">
              <label for="bp-vip-exchange-近一个月没有">近一个月没有</label>
            </div>
          </div>
        </div>
        <div class="bp-section bp-vip-section">
          <div class="bp-label" style="margin-bottom: 6px; display: block;">近期没有看过（VIP）:</div>
          <div class="bp-degree-row">
            <div class="bp-degree-item">
              <input type="radio" name="bp-vip-recent-not-view" id="bp-vip-recent-not-view-不限" ${config.filterVipRecentNotView === '不限' ? 'checked' : ''} value="不限">
              <label for="bp-vip-recent-not-view-不限">不限</label>
            </div>
            <div class="bp-degree-item">
              <input type="radio" name="bp-vip-recent-not-view" id="bp-vip-recent-not-view-近14天没有" ${config.filterVipRecentNotView === '近14天没有' ? 'checked' : ''} value="近14天没有">
              <label for="bp-vip-recent-not-view-近14天没有">近14天没有</label>
            </div>
          </div>
        </div>
        <div class="bp-section bp-vip-section">
          <div class="bp-label" style="margin-bottom: 6px; display: block;">
            专业（VIP）:
            <span id="bp-vip-major-refresh" style="cursor:pointer;font-size:11px;color:#4a90e2;margin-left:6px;" title="从页面读取当前岗位的专业选项">↻ 刷新</span>
          </div>
          <div id="bp-vip-major-list" class="bp-degree-row" style="flex-wrap:wrap;gap:4px;">
            <span style="color:#999;font-size:12px;">点击「↻ 刷新」从页面读取专业选项</span>
          </div>
        </div>
        <div class="bp-status">
          已打招呼: <span class="bp-status-count" id="bp-count">0</span>/${DAILY_GREET_LIMIT}
        </div>
        <div class="bp-status bp-job-progress" id="bp-job-progress" style="display: none;"></div>
      </div>
    `;

    document.body.appendChild(panelEl);

    const dailyState = getDailyState();
    updatePanelState({ greetedCount: dailyState.total });

    // 绑定事件
    bindPanelEvents();

    // 恢复最小化状态
    const savedMinimized = GM_getValue('bp_panel_minimized', false);
    if (savedMinimized) {
      togglePanel(true);
    }
  }

  function bindPanelEvents() {
    const header = panelEl.querySelector('.bp-panel-header');
    header.addEventListener('click', (e) => {
      if (e.target.closest('.bp-panel-header')) {
        togglePanel();
      }
    });

    const startBtn = panelEl.querySelector('#bp-start');
    const pauseBtn = panelEl.querySelector('#bp-pause');

    startBtn.addEventListener('click', async () => {
      updatePanelState({ isRunning: true });
      const result = await runRecommendPage();
      if (!result.ok) {
        logAction(result.message);
        updatePanelState({ isRunning: false });
      }
    });

    pauseBtn.addEventListener('click', () => {
      stopGreeting();
      updatePanelState({ isRunning: false });
    });

    // 筛选设置变更
    const filterEnable = panelEl.querySelector('#bp-filter-enable');
    const filterVipManual = panelEl.querySelector('#bp-filter-vip-manual');
    const filterVipEnable = panelEl.querySelector('#bp-filter-vip-enable');
    const degreeCheckboxes = panelEl.querySelectorAll('[id^="bp-degree-"]');
    const vipSchoolCheckboxes = panelEl.querySelectorAll('[id^="bp-vip-school-"]');
    const vipExchangeRadios = panelEl.querySelectorAll('input[name="bp-vip-exchange"]');
    const vipRecentNotViewRadios = panelEl.querySelectorAll('input[name="bp-vip-recent-not-view"]');

    const saveSettings = () => {
      const config = getConfig();
      config.filterEnabled = filterEnable.checked;
      config.filterVipManual = filterVipManual.checked;
      config.filterVipEnabled = filterVipEnable.checked;

      const selectedDegrees = [];
      degreeCheckboxes.forEach(cb => {
        if (cb.checked) {
          const degree = cb.id.replace('bp-degree-', '');
          selectedDegrees.push(degree);
        }
      });
      config.filterDegree = selectedDegrees.length > 0 ? selectedDegrees : ['不限'];

      const selectedSchools = [];
      vipSchoolCheckboxes.forEach(cb => {
        if (cb.checked) {
          const school = cb.id.replace('bp-vip-school-', '');
          selectedSchools.push(school);
        }
      });
      config.filterVipSchool = selectedSchools.length > 0 ? selectedSchools : ['不限'];

      const exchangeChecked = Array.from(vipExchangeRadios).find(r => r.checked);
      config.filterVipExchangeResume = exchangeChecked ? exchangeChecked.value : '近一个月没有';

      const recentNotViewChecked = Array.from(vipRecentNotViewRadios).find(r => r.checked);
      config.filterVipRecentNotView = recentNotViewChecked ? recentNotViewChecked.value : '不限';

      // 专业：从动态渲染的 checkbox 读取
      const majorList = panelEl.querySelector('#bp-vip-major-list');
      if (majorList) {
        const selectedMajors = [];
        majorList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          if (cb.checked) selectedMajors.push(cb.value);
        });
        config.filterVipMajor = selectedMajors;
      }

      // 同步到 filterOptions
      if (selectedDegrees.length > 0) {
        config.filterOptions = { '学历要求': selectedDegrees };
      } else {
        config.filterOptions = {};
      }

      setConfig(config);
    };

    filterEnable.addEventListener('change', saveSettings);
    filterVipManual.addEventListener('change', saveSettings);
    filterVipEnable.addEventListener('change', saveSettings);
    degreeCheckboxes.forEach(cb => cb.addEventListener('change', saveSettings));
    vipSchoolCheckboxes.forEach(cb => cb.addEventListener('change', saveSettings));
    vipExchangeRadios.forEach(r => r.addEventListener('change', saveSettings));
    vipRecentNotViewRadios.forEach(r => r.addEventListener('change', saveSettings));

    // 专业刷新按钮：从页面 VIP 筛选区读取当前岗位的专业选项
    const majorRefreshBtn = panelEl.querySelector('#bp-vip-major-refresh');
    if (majorRefreshBtn) {
      majorRefreshBtn.addEventListener('click', async () => {
        majorRefreshBtn.style.pointerEvents = 'none';
        majorRefreshBtn.textContent = '⏳ 读取中...';
        await refreshMajorOptions(saveSettings);
        majorRefreshBtn.textContent = '↻ 刷新';
        majorRefreshBtn.style.pointerEvents = '';
      });
    }
  }

  /**
   * 从页面 VIP 筛选区读取「专业」选项，动态渲染到面板的专业列表中
   * 若筛选面板未打开，会自动打开后再读取
   * @param {Function} onChangeCb - 选项变更后的回调（用于保存配置）
   */
  async function refreshMajorOptions(onChangeCb) {
    const majorListEl = panelEl && panelEl.querySelector('#bp-vip-major-list');
    if (!majorListEl) return;

    majorListEl.innerHTML = '<span style="color:#999;font-size:12px;">正在读取...</span>';

    /** 在所有 doc 里找「专业」filter-wrap */
    const findMajorWrap = () => {
      const docs = getFilterDocs();
      for (const d of docs) {
        const wraps = getVipFilterWraps(d);
        const w = wraps.find((w) => (w.querySelector('.name')?.textContent || '').trim().includes('专业'));
        if (w) return w;
      }
      return null;
    };

    // 先尝试直接找（面板已打开的情况）
    let majorWrap = findMajorWrap();

    // 找不到则自动打开筛选面板，最多等 3 秒
    if (!majorWrap) {
      logAction('专业刷新：筛选面板未打开，自动打开中...');
      const docs = getFilterDocs();
      for (const d of docs) {
        if (await openFilterPanel(d)) break;
      }
      // 轮询等待专业 wrap 出现，最多 3s
      for (let i = 0; i < 15; i++) {
        await delaySeconds(0.2);
        majorWrap = findMajorWrap();
        if (majorWrap) break;
      }
    }

    if (!majorWrap) {
      majorListEl.innerHTML = '<span style="color:#f5a623;font-size:12px;">未找到专业筛选项（当前岗位可能无专业筛选）</span>';
      return;
    }

    // 收集所有选项（排除「不限」）
    const optionEls = majorWrap.querySelectorAll('.check-box .option');
    const options = [];
    for (const el of optionEls) {
      const text = (el.textContent || '').trim();
      if (text && text !== '不限') options.push(text);
    }

    if (options.length === 0) {
      majorListEl.innerHTML = '<span style="color:#999;font-size:12px;">未找到专业选项</span>';
      return;
    }

    const config = getConfig();
    // 若从未保存过专业配置（空数组），则默认全选
    const savedMajors = Array.isArray(config.filterVipMajor) && config.filterVipMajor.length > 0
      ? new Set(config.filterVipMajor)
      : null; // null 表示全选

    majorListEl.innerHTML = options.map((opt) => `
      <div class="bp-degree-item">
        <input type="checkbox" id="bp-vip-major-${encodeURIComponent(opt)}" value="${opt}" ${savedMajors === null || savedMajors.has(opt) ? 'checked' : ''}>
        <label for="bp-vip-major-${encodeURIComponent(opt)}" style="font-size:12px;">${opt}</label>
      </div>
    `).join('');

    // 绑定 change 事件
    majorListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', onChangeCb);
    });

    logAction(`专业选项已刷新，共 ${options.length} 项`);
  }

  function togglePanel(forceMinimize) {
    const isMinimized = forceMinimize !== undefined ? forceMinimize : !panelEl.classList.contains('minimized');

    if (isMinimized) {
      panelEl.classList.add('minimized');
      panelEl.querySelector('.bp-panel-toggle').textContent = '+';
    } else {
      panelEl.classList.remove('minimized');
      panelEl.querySelector('.bp-panel-toggle').textContent = '─';
    }

    GM_setValue('bp_panel_minimized', isMinimized);
  }

  function updatePanelState(state) {
    if (!panelEl) return;

    if (state.isRunning !== undefined) {
      panelState.isRunning = state.isRunning;
      const startBtn = panelEl.querySelector('#bp-start');
      const pauseBtn = panelEl.querySelector('#bp-pause');

      if (state.isRunning) {
        startBtn.disabled = true;
        pauseBtn.disabled = false;
      } else {
        startBtn.disabled = false;
        pauseBtn.disabled = true;
      }
    }

    if (state.greetedCount !== undefined) {
      panelState.greetedCount = state.greetedCount;
      const countEl = panelEl.querySelector('#bp-count');
      if (countEl) {
        countEl.textContent = state.greetedCount;
      }
    }

    if (state.jobProgress !== undefined) {
      const jobEl = panelEl.querySelector('#bp-job-progress');
      if (jobEl) {
        if (state.jobProgress) {
          jobEl.textContent = `职位 ${state.jobProgress}`;
          jobEl.style.display = '';
        } else {
          jobEl.style.display = 'none';
        }
      }
    }
  }

  // ---------- 登录 ----------
  function isLoggedIn() {
    if (/(?:^|;\s*)wt2\s*=/.test(document.cookie)) return true;
    if (/\/web\/chat\/recommend/.test(location.pathname) && document.querySelector('.btn.btn-greet')) return true;
    // 能打开推荐牛人页且未跳转登录，即视为已登录（列表可能尚未加载出打招呼按钮）
    if (/\/web\/chat\/recommend/.test(location.pathname)) return true;
    return false;
  }

  // ---------- 每日进度（自然日，按职位分配） ----------
  function getTodayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getDailyState() {
    const key = DAILY_STATE_KEY_PREFIX + getTodayKey();
    try {
      const raw = GM_getValue(key, '{}');
      const o = JSON.parse(raw);
      return {
        total: typeof o.total === 'number' ? o.total : 0,
        byJob: o.byJob && typeof o.byJob === 'object' ? o.byJob : {},
      };
    } catch {
      return { total: 0, byJob: {} };
    }
  }

  function saveDailyState(state) {
    const key = DAILY_STATE_KEY_PREFIX + getTodayKey();
    GM_setValue(key, JSON.stringify(state));
  }

  /** 分配方案：前 (100 % N) 个职位多 1 次，其余相等。返回长度为 N 的数组。 */
  function computeAllocation(jobCount) {
    if (jobCount <= 0) return [];
    const base = Math.floor(DAILY_GREET_LIMIT / jobCount);
    const extra = DAILY_GREET_LIMIT % jobCount;
    const arr = [];
    for (let i = 0; i < jobCount; i++) {
      arr.push(base + (i < extra ? 1 : 0));
    }
    return arr;
  }

  // ---------- 职位下拉（主文档，非 iframe） ----------
  const JOB_SELECTORS = {
    wrap: '.job-selecter-wrap',
    label: '.job-selecter-wrap .ui-dropmenu-label',
    list: '.job-selecter-wrap .job-list',
    item: '.job-selecter-wrap li.job-item',
  };

  /** 在 doc 或其 Shadow DOM 中查找 .job-selecter-wrap */
  function findJobWrapInDoc(doc) {
    if (!doc || !doc.querySelector) return null;
    let found = doc.querySelector(JOB_SELECTORS.wrap);
    if (found) return found;
    function walk(root) {
      const q = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (const node of q) {
        if (node.shadowRoot) {
          found = node.shadowRoot.querySelector(JOB_SELECTORS.wrap);
          if (found) return;
          walk(node.shadowRoot);
        }
      }
    }
    walk(doc.body || doc);
    return found;
  }

  /** 当前页面中职位下拉的 wrap 元素（主文档或 iframe/Shadow 内） */
  function getJobWrap() {
    return findJobWrapInDoc(getJobDoc());
  }

  /** 获取「页面文档」：职位下拉所在 document（沙箱/iframe 下用 unsafeWindow，并搜索页面内 iframe） */
  function getJobDoc() {
    const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : (window.top || window);
    const doc = root.document;
    if (!doc) return document;
    const hasWrap = (d) => d && findJobWrapInDoc(d);
    const hasFrame = (d) => d && d.querySelector("iframe[name='recommendFrame']");
    if (hasWrap(doc)) return doc;
    try {
      const iframes = doc.querySelectorAll('iframe');
      for (const ifr of iframes) {
        try {
          const cd = ifr.contentDocument;
          if (cd && hasWrap(cd)) return cd;
        } catch (_) {}
      }
    } catch (_) {}
    if (hasFrame(doc)) return doc;
    try {
      for (const ifr of doc.querySelectorAll('iframe')) {
        try {
          if (ifr.contentDocument && hasFrame(ifr.contentDocument)) return ifr.contentDocument;
        } catch (_) {}
      }
    } catch (_) {}
    return doc;
  }

  /** 等待职位下拉容器出现（SPA 下可能稍晚挂载），最多等待 timeoutMs 毫秒 */
  function waitForJobDropdown(timeoutMs) {
    return new Promise((resolve) => {
      let wrap = getJobWrap();
      if (wrap) {
        resolve(wrap);
        return;
      }
      const deadline = Date.now() + (timeoutMs || 10000);
      const timer = setInterval(() => {
        if (Date.now() > deadline) {
          clearInterval(timer);
          resolve(null);
          return;
        }
        const el = getJobWrap();
        if (el) {
          clearInterval(timer);
          resolve(el);
        }
      }, 250);
    });
  }

  function openJobDropdown() {
    const wrap = getJobWrap();
    if (!wrap) return false;
    const label = wrap.querySelector(JOB_SELECTORS.label) || wrap.querySelector('.ui-dropmenu-label');
    if (label) {
      label.click();
      return true;
    }
    wrap.click();
    return true;
  }

  /** 点击后等待下拉展开（wrap 出现 ui-dropmenu-visible 或 expanding） */
  function waitForDropdownVisible(wrap, timeoutMs) {
    if (!wrap) return Promise.resolve(false);
    if (wrap.classList.contains('ui-dropmenu-visible') || wrap.classList.contains('expanding')) return Promise.resolve(true);
    const deadline = Date.now() + (timeoutMs || 2000);
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (Date.now() > deadline) {
          clearInterval(timer);
          resolve(false);
          return;
        }
        if (wrap.classList.contains('ui-dropmenu-visible') || wrap.classList.contains('expanding')) {
          clearInterval(timer);
          resolve(true);
        }
      }, 50);
    });
  }

  /** 获取职位列表的可滚动容器（ul 或其父级）；可传入已取到的 list 以支持 Shadow DOM */
  function getJobListScrollContainer(listOrNull) {
    const wrap = getJobWrap();
    const list = listOrNull || (wrap && wrap.querySelector('.job-list')) || getJobDoc().querySelector(JOB_SELECTORS.list);
    if (!list) return null;
    const win = (list.ownerDocument && list.ownerDocument.defaultView) || window;
    let el = list.parentElement;
    while (el) {
      const style = win.getComputedStyle(el);
      const overflow = style.overflow + style.overflowY;
      if (/(auto|scroll|overlay)/.test(overflow) && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return list;
  }

  /** 展开下拉并滚动加载全部职位，返回 { id, labelText }[]，按下拉顺序。 */
  async function getAllJobItems() {
    const wrap = await waitForJobDropdown(6000);
    if (!wrap) {
      logAction('未找到职位下拉，请确保在推荐牛人页');
      return [];
    }
    if (!openJobDropdown()) {
      logAction('未找到职位下拉，请确保在推荐牛人页');
      return [];
    }
    await waitForDropdownVisible(wrap, 2000);
    await delaySeconds(0.3);
    const list = wrap.querySelector('.job-list') || getJobDoc().querySelector(JOB_SELECTORS.list);
    if (!list) {
      logAction('未找到职位列表 .job-list');
      return [];
    }
    const container = getJobListScrollContainer(list) || list;
    const seen = new Set();
    let lastCount = 0;
    let stable = 0;
    while (stable < 3) {
      const items = list.querySelectorAll('li.job-item');
      items.forEach((li) => {
        const id = li.getAttribute('value') || (li.textContent || '').trim();
        if (id && !seen.has(id)) seen.add(id);
      });
      if (items.length === lastCount) stable++; else stable = 0;
      lastCount = items.length;
      container.scrollTop = container.scrollHeight;
      await delaySeconds(0.3);
    }
    const order = [];
    const idOrder = [];
    list.querySelectorAll('li.job-item').forEach((li) => {
      const id = li.getAttribute('value');
      const labelText = (li.querySelector('.label')?.textContent || li.textContent || '').trim().replace(/\s+/g, ' ');
      if (id && !idOrder.includes(id)) {
        idOrder.push(id);
        order.push({ id, labelText, element: li });
      }
    });
    return order;
  }

  /** 按索引切换职位：展开下拉并点击第 index 个职位项，等待 iframe 刷新。 */
  async function selectJobByIndex(index, jobItems) {
    if (!jobItems || !jobItems[index]) return false;
    const item = jobItems[index];
    if (!openJobDropdown()) return false;
    const wrap = getJobWrap();
    await waitForDropdownVisible(wrap, 2000);
    await delaySeconds(0.2);
    const list = (wrap && wrap.querySelector('.job-list')) || getJobDoc().querySelector(JOB_SELECTORS.list);
    const items = list ? list.querySelectorAll('li.job-item') : [];
    let target = null;
    for (const li of items) {
      if (li.getAttribute('value') === item.id) {
        target = li;
        break;
      }
    }
    if (!target) {
      target = items[index];
    }
    if (!target) return false;
    target.scrollIntoView({ block: 'center', behavior: 'auto' });
    await delaySeconds(0.2);
    target.click();
    await delaySeconds(1);
    const iframe = document.querySelector(SELECTORS.iframe);
    if (iframe) {
      await new Promise((resolve) => {
        const onLoad = () => {
          iframe.removeEventListener('load', onLoad);
          setTimeout(resolve, 800);
        };
        iframe.addEventListener('load', onLoad);
        setTimeout(resolve, 2500);
      });
    }
    return true;
  }

  /** 关闭职位下拉（点击空白或再次点击 label） */
  function closeJobDropdown() {
    const wrap = getJobWrap();
    if (!wrap) return;
    const list = wrap.querySelector('.ui-dropmenu-list');
    if (list && list.style.display !== 'none') {
      wrap.querySelector('.ui-dropmenu-label')?.click();
    }
  }

  // ---------- 岗位（兼容旧配置，实际使用上面的职位列表） ----------
  async function openJobList() {
    return openJobDropdown();
  }

  async function selectJob(job) {
    return false;
  }

  // ---------- 筛选（打招呼前执行：打开面板 → 按文案点筛选项 → 确定） ----------
  /** 常规筛选项的 name 文案特征（用于兜底查找学历等） */
  const CONVENTIONAL_FILTER_NAME_KEYWORDS = ['学历', '学历要求', '经验要求'];

  /** 只取常规选项区的 .filter-wrap，排除被 .vip-mask 遮罩的院校等；若无则按「学历」等文案兜底 */
  function getConventionalFilterWraps(doc) {
    const inWrap = doc.querySelectorAll('.filters-wrap .filter-wrap');
    if (inWrap.length) return Array.from(inWrap);
    const notVipMask = Array.from(doc.querySelectorAll('.filter-wrap')).filter((w) => !w.closest('.vip-mask'));
    if (notVipMask.length) return notVipMask;
    // 兜底：站点可能改了结构，按「学历」「经验要求」等文案在全部 .filter-wrap 里找
    const allWraps = Array.from(doc.querySelectorAll('.filter-wrap'));
    return allWraps.filter((w) => {
      const nameEl = w.querySelector('.name');
      const nameText = (nameEl?.textContent || '').trim();
      return CONVENTIONAL_FILTER_NAME_KEYWORDS.some((kw) => nameText.includes(kw));
    });
  }

  /** VIP 筛选项的 name 文案特征（用于在 .vip-filters-wrap 缺失时按文案兜底） */
  const VIP_FILTER_NAME_KEYWORDS = ['院校', '是否与同事交换简历', '交换简历', '专业', '近期没有看过'];

  /** 只取 VIP 区可点击的 .filter-wrap（在 .vip-filters-wrap 内且不在 .vip-mask 下）；若无该容器则按 name 文案兜底 */
  function getVipFilterWraps(doc) {
    const vipWrap = doc.querySelector('.vip-filters-wrap');
    if (vipWrap) {
      const all = vipWrap.querySelectorAll('.filter-wrap');
      const list = Array.from(all).filter((w) => !w.closest('.vip-mask'));
      if (list.length > 0) return list;
    }
    // 兜底：站点可能改了容器 class，按「院校」「交换简历」等文案在全部 .filter-wrap 里找
    const allWraps = Array.from(doc.querySelectorAll('.filter-wrap')).filter((w) => !w.closest('.vip-mask'));
    return allWraps.filter((w) => {
      const nameEl = w.querySelector('.name');
      const nameText = (nameEl?.textContent || '').trim();
      return VIP_FILTER_NAME_KEYWORDS.some((kw) => nameText.includes(kw));
    });
  }

  /** 是否具备 VIP 筛选能力：页面上存在可操作的 VIP 筛选项 */
  function isVip(doc) {
    return getVipFilterWraps(doc).length > 0;
  }

  /** 若出现「是否应用上次的筛选条件？」则点击该提示区域内的「取消」，避免点到关闭面板的取消 */
  function dismissRecoverLastParams(doc) {
    const text = (doc.body?.textContent || '');
    if (!text.includes('是否应用上次的筛选条件')) return false;
    const walk = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const t = (node.textContent || '').trim();
      if (t.includes('是否应用上次的筛选条件')) return node;
      for (const child of node.children) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    const promptRoot = walk(doc.body);
    if (!promptRoot) return false;
    const cancelBtn = clickByText(doc, ['取消'], promptRoot);
    if (cancelBtn) {
      cancelBtn.click();
      logAction('已点击「取消」关闭「是否应用上次」提示');
      return true;
    }
    return false;
  }

  function clickByText(doc, textList, within) {
    const root = within || doc;
    const walk = (node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const t = (node.textContent || '').trim();
      if (textList.some((txt) => t === txt || t.includes(txt))) return node;
      for (const child of node.children) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(root);
  }

  async function openFilterPanel(doc) {
    logAction('当前动作: 打开筛选面板');
    const el = doc.querySelector(SELECTORS.filterPanel);
    if (el) {
      el.click();
      logAction('已点击筛选入口 (.filter-label)');
      return true;
    }
    const fallback = clickByText(doc, ['筛选', '筛选条件']);
    if (fallback) {
      fallback.click();
      logAction('已点击筛选入口（文案兜底）');
      return true;
    }
    logAction('未找到筛选入口');
    return false;
  }

  /** 常规选项：仅支持「学历要求」。选项在 .check-box .default.option（不限）与 .check-box .options .option */
  const DEGREE_OPTIONS = ['不限', '初中及以下', '中专/中技', '高中', '大专', '本科', '硕士', '博士'];

  /**
   * 判断页面上某个筛选项是否已选中（避免重复点击导致取消勾选）
   * 若站点使用的 class 不同，可在此补充，例如 .custom-selected
   */
  function isFilterOptionSelected(optionEl) {
    if (!optionEl || !optionEl.classList) return false;
    const c = optionEl.classList;
    return c.contains('selected') || c.contains('active') || c.contains('checked') || c.contains('on') || c.contains('current')
      || optionEl.getAttribute('aria-selected') === 'true';
  }

  /** 获取某个 filter-wrap 内当前已选中的选项文案列表 */
  function getSelectedFilterOptionTexts(wrap) {
    const optionEls = wrap.querySelectorAll('.check-box .option');
    const selected = [];
    for (const el of optionEls) {
      const text = (el.textContent || '').trim();
      if (text && isFilterOptionSelected(el)) selected.push(text);
    }
    return selected;
  }

  async function applyFilterOptions(doc, options) {
    if (!options || typeof options !== 'object') return;
    logAction('当前动作: 应用筛选项（仅常规选项，排除 VIP 遮罩区）');
    const wraps = getConventionalFilterWraps(doc);
    if (wraps.length === 0 && Object.keys(options).length > 0) {
      logAction('未找到常规筛选项 DOM，请确认页面结构或筛选面板是否已打开');
    }
    for (const [label, value] of Object.entries(options)) {
      const labelStr = String(label).trim();
      const targetValues = Array.isArray(value)
        ? value.map((v) => String(v).trim()).filter(Boolean)
        : value != null
          ? String(value)
              .split(/[,，、]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      if (targetValues.length === 0) continue;
      for (const wrap of wraps) {
        const nameEl = wrap.querySelector('.name');
        const nameText = (nameEl?.textContent || '').trim();
        if (!nameText || (nameText !== labelStr && !nameText.includes(labelStr) && !labelStr.includes(nameText))) continue;
        const optionEls = wrap.querySelectorAll('.check-box .option');
        const currentSelected = getSelectedFilterOptionTexts(wrap);
        const targetSet = new Set(targetValues);
        const currentSet = new Set(currentSelected);
        for (const el of optionEls) {
          const text = (el.textContent || '').trim();
          if (!text) continue;
          const wantSelected = targetSet.has(text);
          const isSelected = isFilterOptionSelected(el);
          if (wantSelected === isSelected) continue;
          logAction(`筛选项 [${nameText}] -> ${wantSelected ? '勾选' : '取消'}「${text}」`);
          el.click();
          await delaySeconds(0.2);
        }
        break;
      }
    }
  }

  /**
   * 应用 VIP 筛选：院校（多选）、是否与同事交换简历（单选）、近期没有看过（单选）、专业（多选）
   * @param {Document} doc
   * @param {string[]} schoolArr - 院校选项，如 ['双一流院校','985','211']
   * @param {string} exchangeResumeValue - '不限' 或 '近一个月没有'
   * @param {string} recentNotView - '不限' 或 '近14天没有'
   * @param {string[]} majorArr - 专业选项，空数组=不限
   */
  async function applyVipFilters(doc, schoolArr, exchangeResumeValue, recentNotView, majorArr) {
    const wraps = getVipFilterWraps(doc);
    if (wraps.length === 0) {
      logAction('未检测到可用的 VIP 筛选项，跳过 VIP 筛选');
      return;
    }
    logAction('当前动作: 应用 VIP 筛选项（院校、交换简历、近期没有看过、专业）');

    for (const wrap of wraps) {
      const nameEl = wrap.querySelector('.name');
      const nameText = (nameEl?.textContent || '').trim();
      if (!nameText) continue;

      if (nameText.includes('院校')) {
        const targetSet = new Set(Array.isArray(schoolArr) ? schoolArr.map((s) => String(s).trim()).filter(Boolean) : []);
        if (targetSet.size === 0) continue;
        const optionEls = wrap.querySelectorAll('.check-box .option');
        const currentSelected = getSelectedFilterOptionTexts(wrap);
        const currentSet = new Set(currentSelected);
        for (const el of optionEls) {
          const text = (el.textContent || '').trim();
          if (!text) continue;
          const wantSelected = targetSet.has(text);
          const isSelected = isFilterOptionSelected(el);
          if (wantSelected === isSelected) continue;
          logAction(`VIP 筛选项 [${nameText}] -> ${wantSelected ? '勾选' : '取消'}「${text}」`);
          el.click();
          await delaySeconds(0.2);
        }
        continue;
      }

      if (nameText.includes('是否与同事交换简历') || nameText.includes('交换简历')) {
        const want = String(exchangeResumeValue || '近一个月没有').trim();
        const optionEls = wrap.querySelectorAll('.check-box .option');
        for (const el of optionEls) {
          const text = (el.textContent || '').trim();
          if (text !== want) continue;
          if (isFilterOptionSelected(el)) {
            logAction(`VIP 筛选项 [${nameText}] -> 「${text}」已选中，跳过`);
            break;
          }
          logAction(`VIP 筛选项 [${nameText}] -> 点击「${text}」`);
          el.click();
          await delaySeconds(0.2);
          break;
        }
        continue;
      }

      if (nameText.includes('近期没有看过')) {
        const want = String(recentNotView || '不限').trim();
        if (want === '不限') continue; // 不限则跳过，保持默认
        const optionEls = wrap.querySelectorAll('.check-box .option');
        for (const el of optionEls) {
          const text = (el.textContent || '').trim();
          if (text !== want) continue;
          if (isFilterOptionSelected(el)) {
            logAction(`VIP 筛选项 [${nameText}] -> 「${text}」已选中，跳过`);
            break;
          }
          logAction(`VIP 筛选项 [${nameText}] -> 点击「${text}」`);
          el.click();
          await delaySeconds(0.2);
          break;
        }
        continue;
      }

      if (nameText.includes('专业')) {
        const targetSet = new Set(Array.isArray(majorArr) ? majorArr.map((s) => String(s).trim()).filter(Boolean) : []);
        if (targetSet.size === 0) continue; // 空=不限，跳过
        const optionEls = wrap.querySelectorAll('.check-box .option');
        for (const el of optionEls) {
          const text = (el.textContent || '').trim();
          if (!text) continue;
          const wantSelected = targetSet.has(text);
          const isSelected = isFilterOptionSelected(el);
          if (wantSelected === isSelected) continue;
          logAction(`VIP 筛选项 [${nameText}] -> ${wantSelected ? '勾选' : '取消'}「${text}」`);
          el.click();
          await delaySeconds(0.2);
        }
        continue;
      }
    }
  }

  async function confirmFilter(doc) {
    logAction('当前动作: 点击确定应用筛选');

    // 确定按钮在主文档的 .filter-panel 内，优先从主文档查找
    const docsToSearch = [document, doc].filter(Boolean);
    const seen = new Set();
    const uniqueDocs = docsToSearch.filter(d => { if (seen.has(d)) return false; seen.add(d); return true; });

    for (const d of uniqueDocs) {
      if (!d) continue;
      // 优先在 .filter-panel 容器内找，精准匹配避免误触其他 div.btn
      const panelRoots = [
        d.querySelector('.filter-panel'),
        d.querySelector('.filters-wrap'),
        d.body,
      ].filter(Boolean);

      for (const root of panelRoots) {
        const candidates = root.querySelectorAll('div.btn, button, [class*="confirm"], [class*="submit"], .btn-primary');
        for (const btn of candidates) {
          const text = (btn.textContent || '').trim();
          if (text === '确定' || text === '确认' || text === '应用') {
            btn.click();
            logAction(`已点击「${text}」（在 ${d === document ? '主文档' : '子文档'} .${root.className || root.tagName} 内）`);
            return true;
          }
        }
      }
    }

    logAction('未找到确定/应用按钮');
    return false;
  }

  async function runFilter(enabled, options, filterVipEnabled, filterVipManual, filterVipSchool, filterVipExchangeResume, filterVipRecentNotView, filterVipMajor) {
    if (!enabled) {
      logAction('筛选未启用，跳过');
      return;
    }
    logAction('---------- 1. 先执行筛选（再执行打招呼） ----------');
    const docs = getFilterDocs();
    let doc = null;
    for (const d of docs) {
      if (await openFilterPanel(d)) {
        doc = d;
        break;
      }
    }
    if (!doc) {
      logAction('筛选面板未打开，继续后续流程');
      return;
    }
    await delaySeconds(0.5);
    // 筛选面板（.filter-panel / .filters-wrap）在主文档，优先用主文档
    const panelDoc = getFilterPanelDoc([document, ...docs]) || getFilterPanelDoc(docs) || doc;
    if (panelDoc !== doc) logAction('筛选面板在另一文档，已切换至面板所在文档执行');
    const workDoc = panelDoc;
    await delaySeconds(0.2);
    const conventionalWraps = getConventionalFilterWraps(workDoc);
    const vipWraps = getVipFilterWraps(workDoc);
    logAction(`筛选项: 常规 ${conventionalWraps.length} 项, VIP ${vipWraps.length} 项`);
    await applyFilterOptions(workDoc, options);
    await delaySeconds(0.2);
    const useVip = filterVipEnabled && (filterVipManual || vipWraps.length > 0);
    if (useVip) {
      if (filterVipManual) logAction('已勾选「我是 VIP」，执行 VIP 筛选项');
      if (vipWraps.length > 0) {
        await applyVipFilters(workDoc, filterVipSchool || [], filterVipExchangeResume || '近一个月没有', filterVipRecentNotView || '不限', filterVipMajor || []);
        await delaySeconds(0.2);
      } else {
        logAction('未检测到可用的 VIP 筛选项，跳过 VIP 筛选');
      }
    }
    // 等待筛选项点击后 DOM 稳定，再查找确定按钮
    await delaySeconds(0.5);
    let confirmed = await confirmFilter(workDoc);
    if (!confirmed) {
      for (const d of docs) {
        if (d !== workDoc && (await confirmFilter(d))) {
          confirmed = true;
          break;
        }
      }
    }
    if (!confirmed) logAction('未找到确定按钮，筛选可能未提交');
    logAction('---------- 筛选结束 ----------');
  }

  // ---------- 推荐页选择器（与 selectors.yaml recommend_page 一致） ----------
  const SELECTORS = {
    // 推荐牛人列表所在 iframe，例: <iframe name="recommendFrame" src="/web/frame/recommend/?jobid=null&..."></iframe>
    iframe: "iframe[name='recommendFrame']",
    // 筛选（recommend_page.filter）
    filterPanel: '.filter-label',
    filterOption: 'div.option',
    filterConfirm: 'div.btn',
    cardList: '.card-list .card-item',
    greetButton: ".//button[contains(text(), '打招呼')]",
    template: [
      "//div[contains(@class,'greet')]//div[contains(@class,'item') or contains(@class,'template')]",
      "//li[contains(@class,'template') or contains(@class,'greet')]",
      "//*[contains(., '使用') and contains(., '招呼')]",
      "//*[contains(., '选择') and contains(., '语')]",
    ],
    sendButton: [
      "//button[contains(text(), '发送')]",
      "//button[contains(@class,'send')]",
      "//*[contains(@class,'btn-send')]",
    ],
    closeButton: [
      "//*[contains(@class,'close')]",
      "//*[@aria-label='关闭']",
      "//button[contains(text(), '关闭')]",
    ],
    paymentPopup: { container: '.payment-layout-v2', close: 'i.icon-close' },
    // 卡片内「合适」气泡的关闭区，避免点击打招呼时误触（Vue 类名顺序可能不同）
    tooltipWrapSuitable: '[class*="tooltip-wrap"][class*="suitable"]',
    // 卡片内「选择不喜欢的原因」区块，误触会弹出，点击前也屏蔽
    cardReasonF1: '.card-reason-f1',
  };

  function getRecommendDoc() {
    const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : (window.top || window);
    const doc = root.document;
    if (!doc) return document;
    const iframe = doc.querySelector(SELECTORS.iframe);
    if (iframe && iframe.contentDocument) return iframe.contentDocument;
    return doc;
  }

  /** 筛选面板可能出现在推荐 iframe 或主文档，返回待尝试的文档列表 */
  function getFilterDocs() {
    const iframeDoc = getRecommendDoc();
    const mainDoc = getJobDoc();
    const topDoc = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window.top || window).document;
    const all = [iframeDoc, mainDoc, topDoc, document].filter(Boolean);
    // 去重
    const seen = new Set();
    return all.filter(d => {
      if (seen.has(d)) return false;
      seen.add(d);
      return true;
    });
  }

  /** 在哪个文档里真正出现了筛选面板 DOM（打开面板后调用，用于解决「点击在 A、面板在 B」导致的未生效） */
  function getFilterPanelDoc(docs) {
    if (!docs || !docs.length) return null;
    // 优先找有筛选项 + 确定按钮的文档
    for (const d of docs) {
      const hasWrap = d.querySelector('.filters-wrap') || d.querySelector('.filter-wrap');
      const hasName = d.querySelector('.filter-wrap .name') || d.querySelector('.filters-wrap .name');
      const hasConfirm = [...(d.querySelectorAll('div.btn') || [])].some(el => (el.textContent || '').trim() === '确定');
      if ((hasWrap || hasName) && hasConfirm) return d;
    }
    // 退而求其次：有筛选项 DOM 的文档
    for (const d of docs) {
      const hasWrap = d.querySelector('.filters-wrap') || d.querySelector('.filter-wrap');
      const hasName = d.querySelector('.filter-wrap .name') || d.querySelector('.filters-wrap .name');
      if (hasWrap || hasName) return d;
    }
    // 最后兜底：哪个文档有「确定」div.btn 就用哪个
    for (const d of docs) {
      const hasConfirm = [...(d.querySelectorAll('div.btn') || [])].some(el => (el.textContent || '').trim() === '确定');
      if (hasConfirm) return d;
    }
    return null;
  }

  /** 判断列表是否在 iframe 里：有 recommendFrame 且其内部能拿到卡片则视为在 iframe */
  function isListInIframe() {
    const iframe = document.querySelector(SELECTORS.iframe);
    if (!iframe || !iframe.contentDocument) return false;
    const doc = iframe.contentDocument;
    const hasCards = doc.querySelector('.card-list .card-item') || doc.querySelector('.card-item');
    return !!hasCards;
  }

  function getCandidateCards() {
    const doc = getRecommendDoc();
    // 优先使用「精选/列表」的卡片容器（只对这类打招呼，不对「推荐相似牛人」geek-card 打招呼）
    const candidateWraps = doc.querySelectorAll('.candidate-card-wrap');
    if (candidateWraps.length > 0) {
      return Array.from(candidateWraps);
    }
    const list = doc.querySelector('.card-list');
    const items = list ? list.querySelectorAll('.card-item') : doc.querySelectorAll(SELECTORS.cardList);
    let cards = Array.from(items || doc.querySelectorAll('.card-item') || []);
    cards = cards.filter((card) => !card.closest('.geek-card'));
    return cards;
  }

  function isAlreadyGreeted(card) {
    const t = (card.textContent || '').trim();
    return /继续沟通|已沟通|已打招呼/.test(t);
  }

  /** 显示「待」状态的卡片不打招呼（如待沟通、待处理等） */
  function hasPendingStatus(card) {
    const t = (card.textContent || '').trim();
    return /待/.test(t);
  }

  function getGreetButton(card) {
    try {
      const snap = card.ownerDocument.evaluate(SELECTORS.greetButton, card, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return snap.singleNodeValue;
    } catch (_) {}
    return null;
  }

  /** 仅检测支付弹窗是否出现（限额/需付费），不关闭。弹窗可能在主文档或 iframe 内 */
  function isPaymentPopupVisible() {
    const inRecommend = getRecommendDoc().querySelector(SELECTORS.paymentPopup.container);
    if (inRecommend) return true;
    const inMain = document.querySelector(SELECTORS.paymentPopup.container);
    return !!inMain;
  }

  function checkAndClosePaymentPopup() {
    const docs = [document, getRecommendDoc()];
    let container = null;
    let ownerDoc = null;
    for (const doc of docs) {
      container = doc.querySelector(SELECTORS.paymentPopup.container);
      if (container) {
        ownerDoc = doc;
        break;
      }
    }
    if (!container || !ownerDoc) return false;

    const tryClose = (btn) => {
      if (btn && typeof btn.click === 'function') {
        btn.click();
        logAction('已关闭支付弹窗');
        return true;
      }
      return false;
    };

    // 1) 容器内：i.icon-close 或 class 含 close
    let closeBtn = container.querySelector(SELECTORS.paymentPopup.close) || container.querySelector('[class*="close"]');
    if (tryClose(closeBtn)) return true;

    // 2) 容器内 SVG 关闭图标（与「不喜欢原因」弹窗一致）
    const useEl = container.querySelector('use[href="#icon-icon-close"]') || container.querySelector('use[href*="icon-close"]');
    if (useEl) {
      closeBtn = useEl.closest('svg');
      if (tryClose(closeBtn)) return true;
    }
    if (ownerDoc) {
      const useAll = ownerDoc.querySelectorAll('use');
      for (const u of useAll) {
        const href = u.getAttribute('href') || u.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        if (href && href.includes('icon-close')) {
          closeBtn = u.closest('svg');
          if (closeBtn && (container.contains(closeBtn) || closeBtn.closest('.payment-layout-v2'))) {
            if (tryClose(closeBtn)) return true;
          }
        }
      }
    }

    // 3) 容器或父级上的 aria-label 关闭
    let el = container;
    while (el && el !== ownerDoc.body) {
      closeBtn = el.querySelector('[aria-label="关闭"]') || el.querySelector('[aria-label="Close"]');
      if (tryClose(closeBtn)) return true;
      el = el.parentElement;
    }

    // 4) 从容器向上找模态层，在模态层内找关闭按钮（弹窗 X 常在蒙层头部）
    el = container.parentElement;
    while (el && el !== ownerDoc.body) {
      closeBtn = el.querySelector('i[class*="close"]') || el.querySelector('[class*="close"]') || el.querySelector('svg use[href*="close"]')?.closest('svg');
      if (tryClose(closeBtn)) return true;
      el = el.parentElement;
    }

    logAction('未找到支付弹窗关闭按钮，请手动关闭');
    return false;
  }

  /** 查找包含指定文案的节点（用于定位弹窗标题） */
  function findElementByText(doc, text) {
    const walk = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
      const t = (node.textContent || '').trim();
      if (t.includes(text)) return node;
      for (const child of node.children) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return doc.body ? walk(doc.body) : null;
  }

  /** 关闭「选择不喜欢的原因」弹窗：优先点击右上角 SVG 关闭图标 */
  function checkAndCloseDislikeReasonPopup(doc) {
    if (!doc || !doc.body) return false;
    const titleEl = findElementByText(doc, '选择不喜欢的原因') || findElementByText(doc, '为您优化推荐');
    if (!titleEl) return false;
    let modal = titleEl;
    while (modal && modal !== doc.body) {
      // 优先点击右上角关闭图标：<svg class="svg-icon"><use xlink:href="#icon-icon-close"></use></svg>
      let closeBtn = null;
      const useEl = modal.querySelector('use[href="#icon-icon-close"]');
      if (useEl) {
        closeBtn = useEl.closest('svg');
      }
      if (!closeBtn) {
        const uses = modal.querySelectorAll('use');
        for (const u of uses) {
          const href = u.getAttribute('href') || u.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
          if (href === '#icon-icon-close') {
            closeBtn = u.closest('svg');
            break;
          }
        }
      }
      if (!closeBtn) {
        closeBtn =
          modal.querySelector('svg.svg-icon') ||
          modal.querySelector('i[class*="close"]') ||
          modal.querySelector('[aria-label="关闭"]') ||
          modal.querySelector('button[class*="close"]');
      }
      if (closeBtn) {
        closeBtn.click();
        logAction('已关闭「不喜欢原因」弹窗');
        return true;
      }
      modal = modal.parentElement;
    }
    return false;
  }

  async function handleGreetPopup() {
    const doc = getRecommendDoc();
    const xpathFind = (xpathList, context) => {
      const ctx = context || doc;
      for (const xpath of xpathList) {
        try {
          const snap = doc.evaluate(xpath, ctx, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          if (snap.singleNodeValue) return snap.singleNodeValue;
        } catch (_) {}
      }
      return null;
    };
    await delaySeconds(0.5);
    const template = xpathFind(SELECTORS.template);
    if (template) template.click();
    await delaySeconds(0.3);
    const sendBtn = xpathFind(SELECTORS.sendButton);
    if (sendBtn) sendBtn.click();
    await delaySeconds(0.5);
    const closeBtn = xpathFind(SELECTORS.closeButton);
    if (closeBtn) closeBtn.click();
  }

  async function greetOne(cards) {
    if (isPaymentPopupVisible()) return 'limit';
    checkAndCloseDislikeReasonPopup(getRecommendDoc());
    const card = cards.find(c => !isAlreadyGreeted(c) && !hasPendingStatus(c));
    if (!card) return 'no_more';
    const btn = getGreetButton(card);
    if (!btn) return 'skip';
    btn.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await delaySeconds(0.3);
    // 避免误触：点击前暂时让卡片内「合适」气泡和「不喜欢原因」区不响应点击（防止同时弹出支付+不感兴趣）
    const tooltipWrap = card.querySelector(SELECTORS.tooltipWrapSuitable);
    const cardReason = card.querySelector(SELECTORS.cardReasonF1);
    const toRestore = [];
    if (tooltipWrap) {
      toRestore.push([tooltipWrap, tooltipWrap.style.pointerEvents]);
      tooltipWrap.style.pointerEvents = 'none';
    }
    if (cardReason) {
      toRestore.push([cardReason, cardReason.style.pointerEvents]);
      cardReason.style.pointerEvents = 'none';
    }
    try {
      btn.click();
    } finally {
      toRestore.forEach(([el, prev]) => { el.style.pointerEvents = prev || ''; });
    }
    await handleGreetPopup();
    // 每次打招呼后顺手关掉可能误触带出的「不喜欢原因」和支付弹窗（尤其今日上限时两者会一起出现）
    const doc = getRecommendDoc();
    checkAndCloseDislikeReasonPopup(doc);
    checkAndCloseDislikeReasonPopup(document);
    if (isPaymentPopupVisible()) checkAndClosePaymentPopup();
    return 'ok';
  }

  function scrollToLoadMore() {
    const doc = getRecommendDoc();
    const root = doc.scrollingElement || doc.documentElement;
    if (root) root.scrollTop = root.scrollHeight;
    const iframe = document.querySelector(SELECTORS.iframe);
    if (iframe?.contentWindow) iframe.contentWindow.scrollTo(0, iframe.contentDocument?.body?.scrollHeight ?? 0);
    window.scrollTo(0, document.body.scrollHeight);
  }

  function delaySeconds(range) {
    const [min, max] = Array.isArray(range) ? range : [range, range];
    const s = min + Math.random() * (max - min);
    return new Promise(r => setTimeout(r, s * 1000));
  }

  let shouldStop = false;

  /**
   * 打招呼循环。
   * @param {object} config - greetInterval 等
   * @param {function} onUpdate - 每次尝试后的回调 { count, result }
   * @param {object} opts - { runLimit: 本次最多打几次（0/不传=不限制，单职位打到支付弹窗）; onGreetSuccess: (count) => {} 每次成功或触达限额时调用，用于持久化每日进度 }
   */
  async function runGreetingLoop(config, onUpdate, opts) {
    const { greetInterval } = config;
    const runLimit = opts?.runLimit != null ? opts.runLimit : (config.runLimit || 0);
    const onGreetSuccess = opts?.onGreetSuccess;
    let count = 0;
    shouldStop = false;
    let noMoreRetries = 0;
    const maxNoMoreRetries = 5;

    updatePanelState({ isRunning: true, greetedCount: opts?.initialCount ?? 0 });

    while (true) {
      if (shouldStop) break;
      if (runLimit > 0 && count >= runLimit) break;

      const cards = getCandidateCards();
      const result = await greetOne(cards);
      onUpdate?.({ count, result });

      if (result === 'ok') {
        count++;
        noMoreRetries = 0;
        updatePanelState({ greetedCount: (opts?.initialCount ?? 0) + count });
        onGreetSuccess?.((opts?.initialCount ?? 0) + count);
      }
      if (result === 'limit') {
        logAction(`今日主动沟通数已达上限，已暂停。已打招呼 ${(opts?.initialCount ?? 0) + count} 次。`);
        onGreetSuccess?.((opts?.initialCount ?? 0) + count);
        checkAndCloseDislikeReasonPopup(getRecommendDoc());
        checkAndCloseDislikeReasonPopup(document);
        checkAndClosePaymentPopup();
        break;
      }
      if (result === 'no_more') {
        noMoreRetries++;
        if (noMoreRetries >= maxNoMoreRetries) break;
        scrollToLoadMore();
        await delaySeconds(1.5);
        continue;
      }

      await delaySeconds(greetInterval);
    }

    updatePanelState({ isRunning: false });
    return count;
  }

  // ---------- 主流程（按职位平均分配每日 100 次，自然日 0 点重置） ----------
  async function runRecommendPage() {
    if (!isLoggedIn()) {
      return { ok: false, message: '未登录，请扫码登录' };
    }

    const config = getConfig();
    let dailyState = getDailyState();
    if (dailyState.total >= DAILY_GREET_LIMIT) {
      logAction(`今日已打 ${dailyState.total} 次招呼，已达上限 ${DAILY_GREET_LIMIT}，明日 0 点重置`);
      return { ok: true, greeted: 0 };
    }

    logAction('获取职位列表（展开下拉并滚动加载全部）…');
    const jobItems = await getAllJobItems();
    closeJobDropdown();
    await delaySeconds(0.3);

    if (!jobItems || jobItems.length === 0) {
      return { ok: false, message: '未找到职位，请确保在推荐牛人页且下拉中有职位' };
    }

    logAction(`共 ${jobItems.length} 个职位，今日已打 ${dailyState.total}/${DAILY_GREET_LIMIT}`);

    if (jobItems.length === 1) {
      // 单职位：打到出现支付弹窗；先切换职位 → 执行筛选 → 再打招呼
      const job = jobItems[0];
      logAction(`单职位模式：${job.labelText}，打到出现支付弹窗`);
      await selectJobByIndex(0, jobItems);
      await delaySeconds(1);
      logAction('当前职位执行筛选，等待筛选结束后再打招呼');
      const filterConfig = getConfig();
      await runFilter(
        filterConfig.filterEnabled,
        filterConfig.filterOptions,
        filterConfig.filterVipEnabled,
        filterConfig.filterVipManual,
        filterConfig.filterVipSchool,
        filterConfig.filterVipExchangeResume,
        filterConfig.filterVipRecentNotView,
        filterConfig.filterVipMajor
      );
      await runGreetingLoop(config, (e) => logAction(e), {
        runLimit: 0,
        initialCount: dailyState.total,
        onGreetSuccess: (newTotal) => {
          const s = getDailyState();
          s.total = newTotal;
          s.byJob[job.id] = (s.byJob[job.id] || 0) + 1;
          saveDailyState(s);
        },
      });
      dailyState = getDailyState();
      updatePanelState({ greetedCount: dailyState.total });
      return { ok: true, greeted: dailyState.total };
    }

    // 多职位：平均分配，前 (100%N) 个多 1 次，按下拉顺序依次切换
    const allocation = computeAllocation(jobItems.length);
    logAction(`分配: ${allocation.join(', ')}`);

    for (let i = 0; i < jobItems.length; i++) {
      if (shouldStop) break;
      dailyState = getDailyState();
      if (dailyState.total >= DAILY_GREET_LIMIT) {
        logAction(`今日已达 ${DAILY_GREET_LIMIT} 次，结束`);
        break;
      }

      const job = jobItems[i];
      const cap = allocation[i];
      const already = dailyState.byJob[job.id] || 0;
      const toDo = Math.min(cap - already, DAILY_GREET_LIMIT - dailyState.total);
      if (toDo <= 0) {
        logAction(`职位 ${i + 1}/${jobItems.length} ${job.labelText} 已满额，跳过`);
        continue;
      }

      logAction(`---------- 职位 ${i + 1}/${jobItems.length}: ${job.labelText}，本职位还可打 ${toDo} 次 ----------`);
      const ok = await selectJobByIndex(i, jobItems);
      if (!ok) {
        logAction('切换职位失败，跳过');
        continue;
      }
      await delaySeconds(1);

      logAction('当前职位执行筛选，等待筛选结束后再打招呼');
      const filterConfig = getConfig();
      await runFilter(
        filterConfig.filterEnabled,
        filterConfig.filterOptions,
        filterConfig.filterVipEnabled,
        filterConfig.filterVipManual,
        filterConfig.filterVipSchool,
        filterConfig.filterVipExchangeResume,
        filterConfig.filterVipRecentNotView,
        filterConfig.filterVipMajor
      );

      await runGreetingLoop(config, (e) => logAction(e), {
        runLimit: toDo,
        initialCount: dailyState.total,
        onGreetSuccess: (newTotal) => {
          const s = getDailyState();
          s.total = newTotal;
          s.byJob[job.id] = (s.byJob[job.id] || 0) + 1;
          saveDailyState(s);
        },
      });

      dailyState = getDailyState();
      updatePanelState({ greetedCount: dailyState.total, jobProgress: `${i + 1}/${jobItems.length}` });
    }

    const finalState = getDailyState();
    updatePanelState({ greetedCount: finalState.total, jobProgress: null });
    return { ok: true, greeted: finalState.total };
  }

  function stopGreeting() {
    shouldStop = true;
  }

  // 是否在「推荐牛人」页（SPA 下通过侧栏点进去时 pathname 会变，但脚本不会重新执行）
  function isRecommendPage() {
    return /\/web\/chat\/recommend/.test(location.pathname) || location.href.includes('recommend');
  }

  function getRecommendPageUrl() {
    return new URL('/web/chat/recommend', location.origin).href;
  }

  // 定时检测并关闭「选择不喜欢的原因」弹窗（误触不感兴趣时出现）
  _bp.intervalId = setInterval(() => {
    if (!isRecommendPage()) return;
    const doc = getRecommendDoc();
    if (doc) checkAndCloseDislikeReasonPopup(doc);
    checkAndCloseDislikeReasonPopup(document);
  }, 800);

  // ---------- 初始化控制面板 ----------
  // 仅在顶层窗口创建面板，避免主页面 + iframe 各创建一个导致出现两个面板
  function initPanel() {
    if (window.self !== window.top) return;
    if (!isRecommendPage()) return;

    // 等待页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createControlPanel);
    } else {
      createControlPanel();
    }
  }

  // 页面加载时初始化面板
  initPanel();

  // SPA 路由变化时重新创建面板（只补丁一次，避免重复执行时嵌套）
  function syncPanelOnRoute() {
    if (window.self !== window.top) return;
    setTimeout(() => {
      const hasPanel = !!document.getElementById('bp-control-panel');
      if (isRecommendPage() && !hasPanel) {
        createControlPanel();
      } else if (!isRecommendPage() && hasPanel) {
        const p = document.getElementById('bp-control-panel');
        if (p) p.remove();
        panelEl = null;
      }
    }, 500);
  }

  const _hist = _g.history || history;
  if (!_bp.historyPatched) {
    _bp.originalPushState = _hist.pushState;
    _bp.originalReplaceState = _hist.replaceState;
    _hist.pushState = function (...args) {
      _bp.originalPushState.apply(this, args);
      syncPanelOnRoute();
    };
    _hist.replaceState = function (...args) {
      _bp.originalReplaceState.apply(this, args);
      syncPanelOnRoute();
    };
    _bp.historyPatched = true;
  }

  _bp.popstateHandler = function () {
    syncPanelOnRoute();
  };
  window.addEventListener('popstate', _bp.popstateHandler);
})();
