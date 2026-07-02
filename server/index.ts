import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import OpenAI from 'openai'
import type { ComposeRequest, EnvConfigResponse, Field, GenerateImageRequest, HealthResponse, ProjectMode, SaveEnvConfigRequest, SuggestSettingsRequest, SuggestSettingsResponse, VisualStyle, XhsPage, XhsProject } from '../src/types'
import { createMockImage, createMockProject } from './mock'
import { buildContentPrompt, buildImagePrompt, buildSettingsPrompt } from './prompts'

dotenv.config()

const app = express()
const envPath = path.resolve(process.cwd(), '.env')
const port = Number(process.env.PORT || 8787)
const fields: Field[] = ['生活方式', '美妆护肤', '职场效率', '学习成长', '旅行探店', '美食烘焙', '运动健康', '母婴家庭', '家居收纳', '数码工具']
const visualStyles: VisualStyle[] = ['清爽实用', '杂志质感', '手账拼贴', '专业干货', '温暖日常', '科技极简']

app.use(cors())
app.use(express.json({ limit: '32mb' }))

function hasApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

function getTextModel(): string {
  return process.env.OPENAI_TEXT_MODEL?.trim() || 'gpt-5.5'
}

function getImageModel(): string {
  return process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-2'
}

function getApiBaseUrl(): string {
  return (process.env.OPENAI_BASE_URL || process.env.OPENAI_API_URL || 'https://api.openai.com/v1')
    .trim()
    .replace(/\/+$/, '')
}

function getClient(): OpenAI {
  if (!hasApiKey()) {
    throw new Error('OPENAI_API_KEY is not configured')
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: getApiBaseUrl(),
  })
}

function getEnvConfig(): EnvConfigResponse {
  return {
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() ?? '',
    openaiBaseUrl: getApiBaseUrl(),
    openaiTextModel: getTextModel(),
    openaiImageModel: getImageModel(),
    openaiImageTimeoutSeconds: process.env.OPENAI_IMAGE_TIMEOUT_SECONDS?.trim() || '180',
  }
}

function cleanEnvValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value
  return JSON.stringify(value)
}

async function readEnvText(): Promise<string> {
  try {
    return await readFile(envPath, 'utf8')
  } catch (error) {
    const err = error as { code?: string }
    if (err.code === 'ENOENT') return ''
    throw error
  }
}

async function writeEnvValues(values: Record<string, string>): Promise<void> {
  const current = await readEnvText()
  const keys = new Set(Object.keys(values))
  const seen = new Set<string>()
  const nextLines: string[] = []

  for (const line of current.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    const key = match?.[1]
    if (key && keys.has(key)) {
      seen.add(key)
      if (values[key]) nextLines.push(`${key}=${quoteEnvValue(values[key])}`)
      continue
    }
    if (line.trim() || nextLines.length) nextLines.push(line)
  }

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key) && value) nextLines.push(`${key}=${quoteEnvValue(value)}`)
  }

  const output = `${nextLines.join('\n').replace(/\n+$/, '')}\n`
  await writeFile(envPath, output, 'utf8')

  for (const [key, value] of Object.entries(values)) {
    if (value) process.env[key] = value
    else delete process.env[key]
  }
}

function normalizeEnvConfig(request: SaveEnvConfigRequest): Record<string, string> {
  const openaiApiKey = cleanEnvValue(request.openaiApiKey)
  const openaiBaseUrl = cleanEnvValue(request.openaiBaseUrl).replace(/\/+$/, '')
  const openaiTextModel = cleanEnvValue(request.openaiTextModel) || 'gpt-5.5'
  const openaiImageModel = cleanEnvValue(request.openaiImageModel) || 'gpt-image-2'
  const openaiImageTimeoutSeconds = cleanEnvValue(request.openaiImageTimeoutSeconds) || '180'

  if (openaiBaseUrl && !/^https?:\/\/\S+$/i.test(openaiBaseUrl)) {
    throw new Error('API URL 必须以 http:// 或 https:// 开头')
  }
  if (!/^\d+$/.test(openaiImageTimeoutSeconds) || Number(openaiImageTimeoutSeconds) < 30) {
    throw new Error('图片超时时间不能小于 30 秒')
  }

  return {
    OPENAI_API_KEY: openaiApiKey,
    OPENAI_BASE_URL: openaiBaseUrl,
    OPENAI_API_URL: '',
    OPENAI_TEXT_MODEL: openaiTextModel,
    OPENAI_IMAGE_MODEL: openaiImageModel,
    OPENAI_IMAGE_TIMEOUT_SECONDS: openaiImageTimeoutSeconds,
  }
}

function readOutputText(response: unknown): string {
  const payload = response as { output_text?: string; output?: Array<{ content?: Array<{ text?: string; type?: string }> }> }
  if (payload.output_text) return payload.output_text
  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((item) => item.text ?? '')
    .join('\n')
    .trim() ?? ''
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) return JSON.parse(fence[1].trim())
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1))
    throw new Error('The text model did not return valid JSON')
  }
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split(/[,\n，]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function pickField(value: unknown, topic = ''): Field {
  if (fields.includes(value as Field)) return value as Field
  if (/职场|效率|副业|自由职业|工作|办公/i.test(topic)) return '职场效率'
  if (/学习|考试|读书|课程|笔记/i.test(topic)) return '学习成长'
  if (/护肤|美妆|化妆|穿搭|变美/i.test(topic)) return '美妆护肤'
  if (/旅行|探店|城市|攻略|露营/i.test(topic)) return '旅行探店'
  if (/饭|菜|早餐|烘焙|咖啡|甜品/i.test(topic)) return '美食烘焙'
  if (/运动|健身|减脂|瑜伽|健康/i.test(topic)) return '运动健康'
  if (/收纳|家居|装修|整理/i.test(topic)) return '家居收纳'
  if (/数码|软件|工具|AI|电脑|手机/i.test(topic)) return '数码工具'
  if (/孩子|母婴|育儿|亲子/i.test(topic)) return '母婴家庭'
  return '生活方式'
}

function pickVisualStyle(value: unknown, topic = ''): VisualStyle {
  if (visualStyles.includes(value as VisualStyle)) return value as VisualStyle
  if (/职场|效率|学习|工具|AI|数码/i.test(topic)) return '专业干货'
  if (/旅行|穿搭|咖啡|家居|生活/i.test(topic)) return '杂志质感'
  if (/亲子|早餐|家庭|日常/i.test(topic)) return '温暖日常'
  return '清爽实用'
}

function mockSettings(topic: string): SuggestSettingsResponse {
  return {
    field: pickField(undefined, topic),
    visualStyle: pickVisualStyle(undefined, topic),
    audience: /自由职业|副业/i.test(topic)
      ? '想提升效率的自由职业者'
      : /早餐|备餐/i.test(topic)
        ? '想省时间的上班族'
        : '想快速做出图文的新手创作者',
    mock: true,
  }
}

function normalizeSettings(raw: unknown, topic: string): SuggestSettingsResponse {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const audience = typeof data.audience === 'string' && data.audience.trim()
    ? data.audience.trim()
    : mockSettings(topic).audience
  return {
    field: pickField(data.field, topic),
    visualStyle: pickVisualStyle(data.visualStyle, topic),
    audience,
  }
}

function getMode(config: ComposeRequest['config']): ProjectMode {
  return config.mode ?? 'xhs'
}

function clampPageCount(value: number, mode: ProjectMode): number {
  const max = mode === 'taobao' ? 8 : 10
  return Math.min(max, Math.max(3, value))
}

function normalizePage(raw: unknown, index: number): XhsPage {
  const item = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const type = item.type === 'cover' || item.type === 'summary' || item.type === 'content'
    ? item.type
    : index === 0
      ? 'cover'
      : 'content'

  return {
    id: `page-${index}-${Date.now()}`,
    index,
    type,
    headline: String(item.headline || `第 ${index + 1} 页`).trim(),
    subhead: typeof item.subhead === 'string' ? item.subhead.trim() : '',
    bullets: asStringArray(item.bullets).slice(0, 6),
    visualBrief: String(item.visualBrief || '清晰的小红书图文排版').trim(),
    imagePrompt: '',
  }
}

function normalizeProject(raw: unknown, request: ComposeRequest): XhsProject {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const rawPages = Array.isArray(data.pages) ? data.pages : []
  let pages = rawPages.map((item, index) => normalizePage(item, index))
  if (!pages.length) {
    return createMockProject(request)
  }

  pages = pages.slice(0, clampPageCount(request.config.pageCount, getMode(request.config)))
  pages[0] = { ...pages[0], type: 'cover' }
  pages[pages.length - 1] = { ...pages[pages.length - 1], type: 'summary' }
  pages = pages.map((item, index) => ({ ...item, index, id: `page-${index}-${Date.now()}` }))

  const project: XhsProject = {
    id: `project-${Date.now()}`,
    topic: request.topic,
    titleOptions: asStringArray(data.titleOptions).slice(0, 5),
    caption: String(data.caption || '').trim(),
    tags: asStringArray(data.tags).slice(0, 10),
    pages: [],
    createdAt: new Date().toISOString(),
    config: {
      ...request.config,
      mode: getMode(request.config),
    },
  }

  project.pages = pages.map((item) => ({
    ...item,
    imagePrompt: buildImagePrompt({
      topic: project.topic,
      page: item,
      pageType: item.type,
      config: project.config,
      fullPageList: pages,
      hasReference: getMode(project.config) === 'taobao' || project.config.useCoverReference && item.index > 0,
    }),
  }))

  if (!project.titleOptions.length) project.titleOptions = [`${request.topic}，这样做更容易被收藏`]
  if (!project.caption) project.caption = `${request.topic}\n\n把重点拆成封面、内容页和总结页，发布前检查标题、封面和标签。`
  if (!project.tags.length) project.tags = ['小红书运营', 'AI出图', '图文排版']

  return project
}

function dataUrlToFile(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid reference image data URL')
  const mime = match[1]
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  const buffer = Buffer.from(match[2], 'base64')
  return {
    blob: new Blob([buffer], { type: mime }),
    filename: `reference.${ext}`,
  }
}

function getImageMime(format: string): string {
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  return 'image/png'
}

function buildApiUrl(path: string): string {
  return `${getApiBaseUrl()}/${path.replace(/^\/+/, '')}`
}

async function getApiErrorMessage(response: Response): Promise<string> {
  const cloned = response.clone()
  try {
    const payload = await response.json() as {
      error?: { message?: string } | string
      detail?: unknown
      message?: string
    }
    if (typeof payload.error === 'object' && payload.error?.message) return payload.error.message
    if (typeof payload.error === 'string') return payload.error
    if (typeof payload.message === 'string') return payload.message
    if (typeof payload.detail === 'string') return payload.detail
    if (Array.isArray(payload.detail)) return payload.detail.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join('\n')
  } catch {
    try {
      const text = await cloned.text()
      if (text.trim()) return text
    } catch {
      // ignore
    }
  }
  return `HTTP ${response.status}`
}

function normalizeBase64Image(value: string, fallbackMime: string): string {
  return value.startsWith('data:') ? value : `data:${fallbackMime};base64,${value}`
}

async function fetchImageAsDataUrl(url: string, fallbackMime: string, signal?: AbortSignal): Promise<string> {
  if (url.startsWith('data:')) return url
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) throw new Error(`图片 URL 下载失败：HTTP ${response.status}`)
  const contentType = response.headers.get('content-type') || fallbackMime
  const bytes = Buffer.from(await response.arrayBuffer())
  return `data:${contentType};base64,${bytes.toString('base64')}`
}

async function parseImageApiResponse(response: Response, mime: string, signal?: AbortSignal): Promise<string> {
  if (!response.ok) throw new Error(await getApiErrorMessage(response))

  const payload = await response.json() as {
    data?: Array<{ b64_json?: string; url?: string }>
    b64_json?: string
    url?: string
  } | Array<{ b64_json?: string; url?: string }>

  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : [payload]

  for (const item of items) {
    if (item?.b64_json) return normalizeBase64Image(item.b64_json, mime)
    if (item?.url) return fetchImageAsDataUrl(item.url, mime, signal)
  }

  throw new Error(`Image API did not return recognizable image data: ${JSON.stringify(payload).slice(0, 1000)}`)
}

function combineAbortSignals(signals: Array<AbortSignal | undefined>): AbortSignal {
  const activeSignals = signals.filter(Boolean) as AbortSignal[]
  const controller = new AbortController()

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return controller.signal
}

async function callImageApi(args: {
  prompt: string
  config: XhsProject['config']
  referenceImage?: string
  signal?: AbortSignal
}): Promise<{ image: string; mime: string }> {
  const { prompt, config, referenceImage, signal } = args
  const mime = getImageMime(config.outputFormat)
  const imageModel = getImageModel()
  const headers = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  }

  const timeoutController = new AbortController()
  const requestSignal = combineAbortSignals([timeoutController.signal, signal])
  const timeout = setTimeout(() => timeoutController.abort(), Number(process.env.OPENAI_IMAGE_TIMEOUT_SECONDS || 180) * 1000)

  try {
    if (referenceImage) {
      const formData = new FormData()
      formData.append('model', imageModel)
      formData.append('prompt', prompt)
      formData.append('size', config.size)
      formData.append('quality', config.quality)
      formData.append('output_format', config.outputFormat)
      formData.append('moderation', 'low')

      const file = dataUrlToFile(referenceImage)
      formData.append('image[]', file.blob, file.filename)

      const response = await fetch(buildApiUrl('images/edits'), {
        method: 'POST',
        headers,
        body: formData,
        cache: 'no-store',
        signal: requestSignal,
      })
      return { image: await parseImageApiResponse(response, mime, requestSignal), mime }
    }

    const body = {
      model: imageModel,
      prompt,
      size: config.size,
      quality: config.quality,
      output_format: config.outputFormat,
      moderation: config.moderation,
    }

    const response = await fetch(buildApiUrl('images/generations'), {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: requestSignal,
    })
    return { image: await parseImageApiResponse(response, mime, requestSignal), mime }
  } finally {
    clearTimeout(timeout)
  }
}

function requestAbortSignal(req: express.Request, res: express.Response): AbortSignal {
  const controller = new AbortController()
  req.on('aborted', () => controller.abort())
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  return controller.signal
}

app.get('/api/health', (_req, res) => {
  const body: HealthResponse = {
    ok: true,
    hasApiKey: hasApiKey(),
    textModel: getTextModel(),
    imageModel: getImageModel(),
    apiBaseUrl: getApiBaseUrl(),
  }
  res.json(body)
})

app.get('/api/env-config', (_req, res) => {
  res.json(getEnvConfig())
})

app.post('/api/env-config', async (req, res, next) => {
  try {
    await writeEnvValues(normalizeEnvConfig(req.body as SaveEnvConfigRequest))
    res.json(getEnvConfig())
  } catch (error) {
    next(error)
  }
})

app.post('/api/suggest-settings', async (req, res, next) => {
  try {
    const request = req.body as SuggestSettingsRequest
    const topic = request.topic?.trim()
    if (!topic) {
      res.status(400).json({ error: '请输入选题' })
      return
    }

    if (!hasApiKey()) {
      res.json(mockSettings(topic))
      return
    }

    const client = getClient()
    const response = await client.responses.create({
      model: getTextModel(),
      input: [
        {
          role: 'system',
          content: '你只输出严格 JSON。不要解释。不要 Markdown。',
        },
        {
          role: 'user',
          content: buildSettingsPrompt(topic, request.mode ?? 'xhs'),
        },
      ],
    } as never)

    res.json(normalizeSettings(parseJsonObject(readOutputText(response)), topic))
  } catch (error) {
    next(error)
  }
})

app.post('/api/compose', async (req, res, next) => {
  try {
    const request = req.body as ComposeRequest
    if (!request.topic?.trim()) {
      res.status(400).json({ error: '请输入选题' })
      return
    }

    if (!hasApiKey()) {
      res.json({ project: createMockProject(request) })
      return
    }

    const client = getClient()
    const prompt = buildContentPrompt(request)
    const response = await client.responses.create({
      model: getTextModel(),
      input: [
        {
          role: 'system',
          content: '你只输出严格 JSON。不要解释。不要 Markdown。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    } as never, { signal: requestAbortSignal(req, res) } as never)

    const text = readOutputText(response)
    const parsed = parseJsonObject(text)
    res.json({ project: normalizeProject(parsed, request) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/image', async (req, res, next) => {
  try {
    const request = req.body as GenerateImageRequest
    if (!request.project || !request.page) {
      res.status(400).json({ error: '缺少项目或页面数据' })
      return
    }

    if (!hasApiKey()) {
      res.json({
        image: createMockImage(request),
        mime: 'image/svg+xml',
        model: getImageModel(),
        mock: true,
      })
      return
    }

    const { page, project } = request
    const config = project.config
    const prompt = page.imagePrompt || buildImagePrompt({
      topic: project.topic,
      page,
      pageType: page.type,
      config,
      fullPageList: project.pages,
      hasReference: Boolean(request.referenceImage),
    })

    const result = await callImageApi({
      prompt,
      config,
      referenceImage: request.referenceImage,
      signal: requestAbortSignal(req, res),
    })

    res.json({
      image: result.image,
      mime: result.mime,
      model: getImageModel(),
    })
  } catch (error) {
    next(error)
  }
})

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const err = error as { message?: string; status?: number; code?: string; request_id?: string }
  res.status(err.status || 500).json({
    error: err.message || 'Request failed',
    code: err.code,
    requestId: err.request_id,
  })
})

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
