# Red Image Studio

中文 | [English](#english)

Red Image Studio 是一个本地运行的 AI 图片工作台，用 `gpt-image-2` 生成小红书图文套图和淘宝商品宣传图。

项目参考了两个方向：

- [HisMax/RedInk](https://github.com/HisMax/RedInk)：小红书选题、标题、正文、标签、图文大纲和整套风格一致性流程。
- [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground)：OpenAI 图片接口调用、图片预览、编辑和导出工作流。

本项目是重新实现，没有复制参考项目源码或提示词。说明见 [NOTICE.md](./NOTICE.md)。

## 功能

- 小红书图文模式：根据选题生成标题、正文、标签、封面页、内容页和总结页。
- 淘宝宣传图模式：根据商品或活动生成主图、卖点图、场景图和收口图。
- 自动填写定位：可由文本模型自动补全领域、视觉风格和目标读者/买家。
- 页面内容编辑：每一页的标题、要点、画面说明和图片提示词都可修改后保存。
- 图片生成：使用 `images/generations` 生成单页图片。
- 图片调整：已有图片可输入调整需求，使用 `images/edits` 基于原图修改。
- 参考图：淘宝模式支持上传参考图，生成时保留商品外观、材质、颜色和结构。
- 生成队列：最多 2 个图片请求并发，每次启动请求至少间隔 5 秒。
- 状态展示：页面卡片区分未生成、排队中、生成中、已完成和失败。
- 停止生成：可中途停止方案生成或图片队列。
- 历史记录：方案和图片保存在浏览器 IndexedDB 中，最多保留 3 条。
- 图片预览：点击图片可放大查看，并左右切换。
- 导出 ZIP：导出项目 JSON、发布文案、全部提示词和已生成图片。
- 页面配置 API：可在界面里配置 API Key、API URL、文本模型、图片模型和图片超时时间。
- Mock 模式：没有配置 `OPENAI_API_KEY` 时会返回模拟方案和 SVG 图片，方便先调界面。

## 技术栈

- React 19
- Vite 7
- TypeScript
- Express 5
- OpenAI SDK
- IndexedDB
- fflate
- lucide-react

## 环境要求

- Node.js 20 或以上
- npm
- OpenAI API Key，或兼容 OpenAI API 的服务地址

## 快速开始

```bash
npm install
```

创建 `.env`：

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_TIMEOUT_SECONDS=180
PORT=8787
```

启动开发服务：

```bash
npm run dev
```

打开前端：

```text
http://localhost:5173
```

API 默认地址：

```text
http://localhost:8787
```

## Docker 运行

构建镜像：

```bash
docker build -t gpt-image-red:local .
```

使用 `.env` 启动：

```bash
docker run -d --name gpt-image-red -p 8787:8787 --env-file .env gpt-image-red:local
```

如果本机 8787 已被占用，可以映射到其他端口：

```bash
docker run -d --name gpt-image-red -p 8788:8787 --env-file .env gpt-image-red:local
```

访问：

```text
http://localhost:8787
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 空 | OpenAI API Key。为空时进入 Mock 模式。 |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 或兼容服务的 API URL。 |
| `OPENAI_API_URL` | 空 | 兼容旧配置。优先级低于 `OPENAI_BASE_URL`。 |
| `OPENAI_TEXT_MODEL` | `gpt-5.5` | 用于自动定位和生成方案的文本模型。 |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | 用于生成和调整图片的图片模型。 |
| `OPENAI_IMAGE_TIMEOUT_SECONDS` | `180` | 单次图片请求超时时间，最小 30 秒。 |
| `PORT` | `8787` | Express API 服务端口。 |

也可以在页面右上角的配置面板里直接保存这些配置。服务端会写入 `.env` 并更新当前进程环境变量。

## 可用脚本

```bash
npm run dev
```

同时启动 API 和前端开发服务。

```bash
npm run dev:api
```

只启动 Express API。

```bash
npm run dev:web
```

只启动 Vite 前端。

```bash
npm run build
```

执行 TypeScript 检查并构建前端。

```bash
npm run start
```

启动 API 服务。

```bash
npm run preview
```

预览生产构建。

## 图片生成行为

- “生成图片”只生成当前选中的页面。
- “调整图片”只在当前页已有图片时显示，会调用图片编辑接口。
- “生成整套图片”会把全部页面加入队列。
- 队列最多同时运行 2 个图片请求。
- 两个请求的启动时间至少间隔 5 秒。
- 完成顺序不保证和页面顺序一致，因为不同图片请求耗时不同。
- 编辑图片接口会传 `moderation=low`。
- 文生图接口使用项目配置中的 `moderation`。

## 安全和失败处理

图片生成可能被安全系统拦截。项目会识别 `moderation_blocked`，并给出中文处理建议和请求 ID。

提示词中已加入安全画面约束。涉及婴幼儿、儿童、身体护理、洗澡、皮肤、减脂、医美、疾病、药品或功效时，会优先引导模型使用静物、用品清单、步骤卡、流程图、信息卡、商品细节或包装画面。

## 数据存储

- 历史方案和图片存储在浏览器 IndexedDB。
- 旧版本 localStorage 历史会自动迁移。
- 最多保留 3 条历史记录。
- `.env` 只保存在本机项目目录，不会提交到 git。

## 导出内容

ZIP 包包含：

- `project.json`
- `caption.txt`
- `prompts/*.txt`
- `images/*`

即使某些页面还没有生成图片，也会导出对应页面的提示词。

## API

本地服务提供以下接口：

- `GET /api/health`
- `GET /api/env-config`
- `POST /api/env-config`
- `POST /api/suggest-settings`
- `POST /api/compose`
- `POST /api/image`

## 验证

```bash
npm run build
```

当前构建会执行：

- TypeScript 类型检查
- Vite 生产构建

## 许可证

MIT。见 [LICENSE](./LICENSE)。

## English

Red Image Studio is a local AI image workspace for creating Xiaohongshu carousel posts and Taobao product promotion images with `gpt-image-2`.

It is inspired by two projects:

- [HisMax/RedInk](https://github.com/HisMax/RedInk): topic planning, titles, captions, tags, carousel outlines, and style consistency for Xiaohongshu content.
- [CookSleep/gpt_image_playground](https://github.com/CookSleep/gpt_image_playground): OpenAI image API calls, preview, image editing, and export workflows.

This project is a fresh implementation. It does not copy source code or prompt files from the reference projects. See [NOTICE.md](./NOTICE.md).

## Features

- Xiaohongshu mode: generate titles, captions, tags, cover pages, content pages, and summary pages from a topic.
- Taobao mode: generate product hero images, selling-point images, scenario images, and closing promotion images.
- Auto positioning: use a text model to suggest field, visual style, and target reader/buyer.
- Editable pages: update headline, bullets, visual brief, and image prompt before generation.
- Image generation: generate one selected page through `images/generations`.
- Image editing: adjust an existing image through `images/edits` with a custom instruction.
- Reference images: Taobao mode supports uploaded reference images to preserve product shape, material, color, and structure.
- Image queue: at most 2 concurrent image requests, with at least 5 seconds between request starts.
- Clear states: page cards show idle, queued, generating, done, and error states.
- Stop generation: stop plan generation or the image queue midway.
- History: projects and images are stored in browser IndexedDB, capped at 3 records.
- Preview: click an image to view it larger and navigate left/right.
- ZIP export: export project JSON, caption, prompts, and generated images.
- In-page API configuration: configure API Key, API URL, text model, image model, and image timeout from the UI.
- Mock mode: when `OPENAI_API_KEY` is not configured, the app returns mock plans and SVG images for UI testing.

## Stack

- React 19
- Vite 7
- TypeScript
- Express 5
- OpenAI SDK
- IndexedDB
- fflate
- lucide-react

## Requirements

- Node.js 20 or newer
- npm
- An OpenAI API key, or an OpenAI-compatible API endpoint

## Quick Start

```bash
npm install
```

Create `.env`:

```bash
OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_TIMEOUT_SECONDS=180
PORT=8787
```

Start the development server:

```bash
npm run dev
```

Open the web app:

```text
http://localhost:5173
```

Default API server:

```text
http://localhost:8787
```

## Docker

Build the image:

```bash
docker build -t gpt-image-red:local .
```

Run with `.env`:

```bash
docker run -d --name gpt-image-red -p 8787:8787 --env-file .env gpt-image-red:local
```

If port 8787 is already in use, map it to another local port:

```bash
docker run -d --name gpt-image-red -p 8788:8787 --env-file .env gpt-image-red:local
```

Open:

```text
http://localhost:8787
```

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | Empty | OpenAI API key. Empty value enables mock mode. |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI or OpenAI-compatible API URL. |
| `OPENAI_API_URL` | Empty | Backward-compatible API URL. Lower priority than `OPENAI_BASE_URL`. |
| `OPENAI_TEXT_MODEL` | `gpt-5.5` | Text model used for positioning and plan generation. |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | Image model used for generation and editing. |
| `OPENAI_IMAGE_TIMEOUT_SECONDS` | `180` | Timeout for each image request. Minimum is 30 seconds. |
| `PORT` | `8787` | Express API server port. |

You can also save these settings directly from the configuration panel in the app. The server writes them to `.env` and updates the current process environment.

## Scripts

```bash
npm run dev
```

Start the API and web dev servers together.

```bash
npm run dev:api
```

Start only the Express API.

```bash
npm run dev:web
```

Start only the Vite web app.

```bash
npm run build
```

Run TypeScript checks and build the web app.

```bash
npm run start
```

Start the API server.

```bash
npm run preview
```

Preview the production build.

## Image Generation Behavior

- "Generate Image" only generates the selected page.
- "Adjust Image" appears only when the selected page already has an image, and it calls the image edit API.
- "Generate Full Set" queues all pages.
- The queue runs at most 2 image requests at the same time.
- Request starts are spaced by at least 5 seconds.
- Completion order is not guaranteed, because image requests can take different amounts of time.
- The image edit API sends `moderation=low`.
- Text-to-image generation uses the project's `moderation` setting.

## Safety And Errors

Image generation can be blocked by the safety system. The app detects `moderation_blocked` responses and returns a Chinese recovery message with the request ID.

The prompts include safety-oriented visual guidance. For topics involving babies, children, body care, bathing, skin, weight loss, medical aesthetics, disease, medicine, or efficacy claims, the app steers image prompts toward still life, checklists, step cards, flowcharts, information cards, product details, or packaging shots.

## Storage

- History projects and images are stored in browser IndexedDB.
- Legacy localStorage history is migrated automatically.
- The app keeps up to 3 history records.
- `.env` stays in the local project folder and is excluded from git.

## Export

The exported ZIP contains:

- `project.json`
- `caption.txt`
- `prompts/*.txt`
- `images/*`

Prompts are exported for every page even if some pages do not have images yet.

## API

The local API server exposes:

- `GET /api/health`
- `GET /api/env-config`
- `POST /api/env-config`
- `POST /api/suggest-settings`
- `POST /api/compose`
- `POST /api/image`

## Verification

```bash
npm run build
```

This runs:

- TypeScript type checking
- Vite production build

## License

MIT. See [LICENSE](./LICENSE).
