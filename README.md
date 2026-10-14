# 我的齐民要术（安卓极简 PWA）

把《高性价比人生指南》的官方离线单文件 HTML 包装成可安装到安卓桌面、可离线阅读并能自动更新的 PWA。

项目不包含账号、云同步、收藏、笔记、提醒、AI、后台服务或原生安卓安装包。原书已有的浏览、搜索、筛选、明暗模式和打印功能保持不变。

## 内容与许可

唯一内容源是 [eternity4719/HowToLiveBetter](https://github.com/eternity4719/HowToLiveBetter)。正文使用 CC BY 4.0，上游程序代码使用 MIT；本项目仅增加 PWA 外壳和自动发布工具。完整说明见 [ATTRIBUTION.md](ATTRIBUTION.md)。

## 环境

- Git
- Node.js 22 或更高版本
- 不需要安装 npm 依赖

## 本地构建

```bash
npm run icons
npm run build
npm test
```

`npm run build` 会浅克隆原作者仓库、运行官方 `tools/offline/build.mjs`，再把 PWA 外壳注入生成结果。产物写入 `dist/`。`npm test` 会验证产物、更新差异和 Service Worker 的安装、离线导航、受控更新、旧缓存清理及下载失败回退。

如果已经有上游仓库，可避免重复下载：

```bash
node scripts/build.mjs --upstream /path/to/HowToLiveBetter
node scripts/verify.mjs --upstream /path/to/HowToLiveBetter
```

如果 Windows 已安装 Edge，还可运行安卓尺寸浏览器测试：

```bash
npm run test:browser
```

## 本地预览

```bash
npm run serve
```

然后打开 `http://127.0.0.1:4173/`。Service Worker 在 localhost 可用。不要直接双击 `dist/index.html`测试安装或缓存。

## GitHub Pages

1. 把本项目放入你自己的 GitHub 仓库。
2. 打开仓库 `Settings → Pages`。
3. 在 `Build and deployment` 中选择 `GitHub Actions`。
4. 打开 `Actions`，手动运行“更新并发布安卓 PWA”。
5. 首次发布完成后访问 Pages 地址。

工作流每周一检查一次原作者仓库，也支持在 Actions 页面用 `Run workflow` 手动运行。它先读取线上 `version.json` 和 `update-history.json`，上游内容和本项目代码都没有变化时正常结束；有变化时才获取必要历史、生成差异、构建、验证和发布。构建失败不会覆盖最后一个可用版本。

自动更新是普通 GitHub Actions 和 Node.js 脚本，不调用 Codex、OpenAI API 或其他 AI 服务，正常更新消耗 **0 个 OpenAI token**。

如果工作流失败，在仓库 `Actions` 页面打开失败任务，查看第一个红色步骤。旧的 Pages 版本仍然可用；修复后可以点击 `Run workflow` 重试。

## 安卓安装

1. 用安卓 Chrome 打开 GitHub Pages 地址。
2. 等页面完整加载一次。
3. 点页面中的“安装到手机桌面”；若 Chrome 暂时没有提供安装事件，按页面提示打开 Chrome 菜单，选择“安装应用”或“添加到主屏幕”。
4. 此后可以从桌面图标启动。

第一次使用必须联网完成缓存。检测到新版后，页面底部会显示“发现新版本”，由你选择“更新到新版本”或“稍后再说”，不会在阅读过程中擅自刷新。

“安装到手机桌面”是安装 PWA，不是把 HTML 或 ZIP 下载到下载目录。Chrome 提供安装能力时会直接打开系统安装框；已从桌面独立窗口打开时不再显示安装按钮。本项目目前只验证安卓 Chrome，不适配 QQ 浏览器或 iPhone。

## 阅读与更新

- 点“从第一章开始”进入上游实际第一章；章节数变化后无需改代码。
- 顶部“目录”或开始区“查看目录”可打开独立章节目录，当前章节会高亮。
- 阅读位置只保存在当前手机的 `localStorage`；滚动阅读后，“继续上次阅读”会回到最近的条目锚点，不上传数据。
- “搜索内容”直接聚焦原书搜索框，筛选、明暗模式和打印仍使用原书功能。
- 出现新版时，“稍后再说”继续使用完整旧版；“更新到新版本”会在新缓存完整下载后切换并刷新。
- 刷新后会显示新增、修改、删除和提交信息。点“我已知晓”后当前版本不再重复显示；不确认则下次仍显示，多次未确认会合并展示。
- 差异由 Git 与 Markdown 标题结构生成，不使用 AI。旧提交不可获取时会明确写“完整差异暂时无法生成”，不会猜测。

如果浏览器或安卓系统清除了该网站的站点数据，离线缓存、阅读位置和“我已知晓”记录都会消失，需要重新联网打开一次。作为额外备份，可以从原作者仓库下载最新的官方离线 HTML。

## 构建产物

- `dist/index.html`：官方离线阅读器及PWA注册代码
- `dist/sw.js`：同时包含上游与应用提交编号的版本化缓存
- `dist/manifest.webmanifest`：安卓安装信息
- `dist/version.json`：同步版本、章节数和条目数
- `dist/update-history.json`：最近约 52 次的结构化更新说明，不含完整正文
- `dist/qimin-runtime.js`：目录、阅读记录、安装和更新确认逻辑
- `dist/icons/`：原创书卷图标
