# Moark 多模型工具（Cloudflare Pages / Workers 直接部署）

这是把你原来的 Python tkinter 桌面工具改成 **纯 HTML + JS** 的网页版本：
- **z-image 文生图**
- **Edit-2511 图像编辑（两张图 + prompt + task_types）**
- **Wan2.2 图生视频（按 Duration 分段生成）**
- 生成的 **图片/视频直接在网页展示**，并提供 **下载按钮（下载后可直接查看/播放）**。

> 说明：桌面版 Wan2.2 会用 ffmpeg 合并/裁剪成一个最终 mp4。  
> Cloudflare Pages/Workers 环境无法运行原生 ffmpeg，因此网页版会 **分段分别提供可播放/可下载 mp4**（可选一键 zip 打包下载）。

---

## 一、Cloudflare Pages 一键部署（推荐）

本项目已经包含 Pages Functions 代理：
- `/api/*` -> 代理到 `https://ai.gitee.com/v1/*`（解决 CORS）
- `/dl?url=...` -> 代理下载 `file_url`/图片 url（解决跨域下载）

### 目录结构
- `index.html` / `app.js` / `styles.css`：前端页面
- `functions/api/[...path].js`：代理 v1 API
- `functions/dl.js`：代理下载

### 部署方式
1. 把整个目录上传到你的 Git 仓库（或直接用 Cloudflare Pages 上传）
2. Cloudflare Pages 创建项目
3. **Build command 留空**（或 `""`）
4. **Output directory** 选择仓库根目录（`/`）
5. 部署完成后，访问你的 Pages 域名即可使用

本地调试（可选）：  
- 安装 wrangler
- 在项目根目录运行：`wrangler pages dev .`

---

## 二、只用 Cloudflare Worker 作为代理（可选）

如果你不想用 Pages Functions，也可以部署独立 Worker 作为代理：
- `worker-proxy.js` 是一个可直接部署的 Worker
- 代理规则：
  - `/v1/*` -> `https://ai.gitee.com/v1/*`
  - `/dl?url=...` -> 代理下载任意 https/http 资源

你需要把前端里的代理路径改成 Worker 地址（高级玩法，先用 Pages 推荐方案就行）。

---

## 三、使用说明

1. 打开网页，输入 **API Key**
2. 选择模型
3. 填参数并点击执行
4. 结果会出现在 **Output** 区域：
   - 图片直接显示 + 下载按钮（png）
   - 视频直接播放 + 下载按钮（mp4）
   - 任务 JSON 会显示并可下载（方便排障）

---

## 常见问题

### 1) 下载按钮点了没反应？
网页版会先把文件通过 `/dl` 拉到浏览器，再用 Blob 触发下载。  
如果你生成的视频特别大，可能需要等待一点点加载完成（浏览器网络面板能看到下载进度）。

### 2) z-image 报 404 或接口不通？
网页版默认按 OpenAI Images Generations 路径调用：`POST /v1/images/generations`  
如果你这家服务端路径不同，我可以按你的实际返回错误 JSON 改一下映射。

---

祝你部署顺利。
