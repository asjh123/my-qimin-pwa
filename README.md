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

`npm run build` 会浅克隆原作者仓库、运行官方 `tools/offline/build.mjs`，再把 PWA 外壳注入生成结果。产物写入 `dist/`。`npm test` 会验证产物并模拟 Service Worker 的安装、离线导航、受控更新、旧缓存清理和下载失败回退。

如果已经有上游仓库，可避免重复下载：

```bash
node scripts/build.mjs --upstream /path/to/HowToLiveBetter
node scripts/verify.mjs --upstream /path/to/HowToLiveBetter
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

工作流每周一检查一次原作者仓库，也支持手动运行。上游没有变化时不会重复部署；有变化时会重新生成、验证并发布。构建失败时不会覆盖最后一个可用版本。

自动更新是普通 GitHub Actions 和 Node.js 脚本，不调用 Codex、OpenAI API 或其他 AI 服务，正常更新消耗 **0 个 OpenAI token**。

如果工作流失败，在仓库 `Actions` 页面打开失败任务，查看第一个红色步骤。旧的 Pages 版本仍然可用；修复后可以点击 `Run workflow` 重试。

## 安卓安装

1. 用安卓 Chrome 打开 GitHub Pages 地址。
2. 等页面完整加载一次。
3. 打开 Chrome 菜单，选择“安装应用”或“添加到主屏幕”。
4. 此后可以从桌面图标启动。

第一次使用必须联网完成缓存。检测到新版后，页面底部会显示“发现新版本，点击更新”。点击后才会切换，避免阅读过程中突然刷新。

页面右下角会为安卓设备显示“安装到手机”按钮。Chrome 提供安装能力时会直接打开系统安装框；若当前是微信、QQ等内置浏览器，则会提示改用安卓 Chrome 并从菜单添加到主屏幕。

如果浏览器或安卓系统清除了该网站的站点数据，需要重新联网打开一次。作为额外备份，可以从原作者仓库下载最新的官方离线 HTML。

## 构建产物

- `dist/index.html`：官方离线阅读器及PWA注册代码
- `dist/sw.js`：以原作者提交编号命名的版本化缓存
- `dist/manifest.webmanifest`：安卓安装信息
- `dist/version.json`：同步版本、章节数和条目数
- `dist/icons/`：原创书卷图标
