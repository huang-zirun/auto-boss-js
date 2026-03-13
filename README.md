# BOSS 直聘招聘端 - 自动打招呼（框架与示例）

按最佳实践拆分的**框架 + 示例代码**，不包含具体 DOM 选择器实现，需后续根据 F12 获取的元素补全。

---

## 项目结构

```
auto-boss/
├── config.example.js          # 配置项与默认值、路由常量
├── src/
│   ├── constants.js           # 选择器占位与文案常量（实现时填入）
│   ├── auth.js                # Cookie 读取/注入、登录态判断
│   ├── job.js                 # 岗位列表展开、选择岗位
│   ├── filter.js              # 筛选面板（VIP/非VIP）、应用条件
│   ├── greeting.js            # 候选人列表、打招呼循环、上限检测
│   └── main.js                # 主流程编排：登录 → 岗位 → 筛选 → 打招呼
├── userscript.boss.recommend.user.js   # 油猴单文件入口（可直接安装）
└── README.md
```

- **`src/`**：模块化骨架，便于扩展多页面（如 index、job/list）和单元测试。
- **`userscript.*.user.js`**：自包含油猴脚本，复制到 Tampermonkey 即可使用；逻辑与 `src/` 对应，但为单文件无构建版本。

---

## 开发时更新脚本（免手动复制）

- **方式一（推荐）**：在项目目录执行 `npm run dev`，用浏览器打开 Tampermonkey → 从 URL 安装：`http://localhost:61077/userscript.boss.recommend.user.js`。之后每次在 IDE 保存后，到扩展里对该脚本点「更新」即可。
- **方式二**：保存后执行 `npm run copy`，脚本内容会进剪贴板，到 Tampermonkey 编辑器里 Ctrl+V 覆盖保存。

## 使用方式

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 新建脚本，将 `userscript.boss.recommend.user.js` 内容粘贴保存。
3. 打开 Boss 直聘并扫码登录一次，在脚本里点击「配置 Cookie」粘贴 Cookie（含 `wt2`）。
4. 打开推荐牛人页，点击「开始」运行（具体选择器补全后才会真正点击）。

---

## 配置项（含默认值）

| 键 | 说明 | 默认值 |
|----|------|--------|
| greetInterval | 打招呼间隔 [min, max] 秒 | [3, 6] |
| runLimit | 单次运行最多打招呼数，0 不限制 | 20 |
| filterEnabled | 是否启用筛选 | false |
| filterType | 筛选类型 | 'nonVip' |
| filterOptions | 筛选条件键值 | {} |
| stopOnDailyLimit | 检测到每日上限弹窗是否停止 | true |

---

## 扩展点

- **多页面**：在 `main.js` 的 `runPage(page, userConfig)` 中增加 `index`、`jobList` 分支，复用 `auth`/`job`/`filter`，仅替换列表与按钮选择器。
- **按岗位分配次数**：在 `job.js` 中实现获取岗位数量，在 `main.js` 中按岗位数将 `runLimit`（或每日 100）平均分配后多次调用 `selectJob` + `runGreetingLoop`。
- **选择器实现**：在 `src/constants.js` 的 `SELECTORS` 中填入 F12 获取的 class/id/data 属性，在 `job.js`、`filter.js`、`greeting.js` 中取消注释并接上对应 DOM 操作。

---

## 说明

- 当前代码为**框架与示例**，未包含真实选择器与完整实现。
- Cookie 中若 `wt2` 为 HttpOnly，仅通过 `document.cookie` 无法注入，需依赖油猴的 `@run-at document-start` + 请求头注入或用户保持登录态后由脚本读取。
