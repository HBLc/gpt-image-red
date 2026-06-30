# Red Image Studio

用 `gpt-image-2` 生成小红书图文套图的本地工作台。

它结合了两个参考项目的方向：

- RedInk 的小红书图文链路：选题、标题、正文、标签、封面、内容页、总结页。
- gpt_image_playground 的图片生成工作流：参数控制、页面预览、本地历史、单图下载和 ZIP 导出。

没有直接复制 RedInk 的代码或 prompt。原因见 [NOTICE.md](./NOTICE.md)。

## 功能

- 生成小红书图文方案：标题、正文、标签、页面结构。
- 调用 OpenAI Image API，用 `gpt-image-2` 生成 3:4 竖版图文。
- 后续页面可用封面图作为参考，保持整套视觉一致。
- 无 `OPENAI_API_KEY` 时自动进入 mock 模式，方便先调界面。
- 支持单页重生成、图片下载、提示词复制、ZIP 导出。

## 运行

需要 Node.js 20 或以上。

```bash
npm install
copy .env.example .env
npm run dev
```

在 `.env` 里配置：

```bash
OPENAI_API_KEY=你的 key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_TEXT_MODEL=gpt-5.5
OPENAI_IMAGE_MODEL=gpt-image-2
PORT=8787
```

`OPENAI_BASE_URL` 用完整的 OpenAI 兼容 API 地址。官方默认值是 `https://api.openai.com/v1`。

前端地址：

```bash
http://localhost:5173
```

API 地址：

```bash
http://localhost:8787
```

## 验证

```bash
npm run build
```

当前实现已验证：

- TypeScript 编译通过。
- Vite 生产构建通过。
- `/api/health` 正常。
- mock 模式下 `/api/compose` 和 `/api/image` 正常返回。
