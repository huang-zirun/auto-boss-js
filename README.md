# BOSS 直聘招聘端 - 推荐牛人自动打招呼

油猴脚本：在 BOSS 直聘推荐牛人页自动切换岗位、筛选、点击打招呼。

---

## 项目结构

```
auto-boss/
├── config.example.js              # 配置示例（含 Cookie 勿提交）
├── copy-to-clipboard.js           # npm run copy 时把脚本复制到剪贴板
├── src/                           # 模块化骨架（可选扩展）
│   ├── constants.js
│   ├── auth.js
│   ├── job.js
│   ├── filter.js
│   ├── greeting.js
│   └── main.js
├── userscript.boss.recommend.user.js   # 油猴单文件入口（安装此文件）
├── package.json
└── README.md
```

主入口为 **`userscript.boss.recommend.user.js`**，复制到 Tampermonkey 即可使用。

---

## 开发时更新脚本

- **方式一（推荐）**：在项目目录执行 `npm run dev`，浏览器打开 Tampermonkey → 从 URL 安装：`http://localhost:61077/userscript.boss.recommend.user.js`。之后保存脚本后，在扩展里对该脚本点「更新」即可。
- **方式二**：保存后执行 `npm run copy`，脚本会进剪贴板，到 Tampermonkey 编辑器里 Ctrl+V 覆盖保存。

---

## 使用方式

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 新建脚本，将 `userscript.boss.recommend.user.js` 内容粘贴保存。
3. 打开 BOSS 直聘并扫码登录，在脚本面板里点击「配置 Cookie」粘贴 Cookie（需含 `wt2`；若为 HttpOnly 需保持登录态由脚本读取）。
4. 打开推荐牛人页，点击「开始」运行。

---

## 配置项（脚本内默认值，可在面板中修改）

| 键 | 说明 | 默认值 |
|----|------|--------|
| greetInterval | 打招呼间隔 [min, max] 秒 | [3, 6] |
| runLimit | 单次运行最多打招呼数，0 不限制 | 20 |
| filterEnabled | 是否启用筛选 | false |
| filterDegree | 学历要求多选 | ['不限'] |
| filterVipEnabled | 是否启用 VIP 筛选（双一流/985/211 等） | true |
| filterVipManual | 手动勾选「我是 VIP」 | false |
| filterVipSchool | VIP 学校筛选 | ['双一流院校', '985', '211'] |
| filterVipExchangeResume | 交换简历筛选 | '近一个月没有' |
| filterVipMajor | 专业多选，空数组=不限 | [] |
| filterVipRecentNotView | 近期没有看过：'不限' 或 '近14天没有' | '不限' |
| stopOnDailyLimit | 检测到每日上限弹窗是否停止 | true |

每日打招呼上限 100 次（自然日 0 点重置），可在脚本内修改 `DAILY_GREET_LIMIT`。

---

## 说明

- 含 Cookie 的 `config.js` 不要提交，已列入 `.gitignore`。
- Cookie 中若 `wt2` 为 HttpOnly，仅通过 `document.cookie` 无法注入，需依赖油猴的 `@run-at document-start` 或用户保持登录态后由脚本读取。
