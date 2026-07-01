import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Copy,
  Download,
  Eye,
  EyeOff,
  History,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Save,
  Settings,
  ShoppingBag,
  Sparkles,
  Trash2,
  UploadCloud,
  WandSparkles,
  X,
} from 'lucide-react'
import { composeProject, generateImage, getEnvConfig, getHealth, saveEnvConfig, suggestSettings } from './api'
import { exportProjectZip, toSavedProject } from './exportProject'
import { clearHistory, loadHistory, rememberProject, saveHistory } from './storage'
import type { EnvConfig, Field, HealthResponse, ProjectMode, SavedProject, StudioConfig, VisualStyle, XhsPage, XhsProject } from './types'

const fields: Field[] = ['生活方式', '美妆护肤', '职场效率', '学习成长', '旅行探店', '美食烘焙', '运动健康', '母婴家庭', '家居收纳', '数码工具']
const styles: VisualStyle[] = ['清爽实用', '杂志质感', '手账拼贴', '专业干货', '温暖日常', '科技极简']
const XHS_IMAGE_SIZE = '1200x1600'
const TAOBAO_IMAGE_SIZE = '1024x1024'
const XHS_IMAGE_QUALITY = 'medium'
const XHS_IMAGE_FORMAT = 'png'
const XHS_DEFAULT_TOPIC = '给自由职业者做一套高效工作流图文'
const TAOBAO_DEFAULT_TOPIC = '便携式咖啡杯，主打不漏水、通勤好看、送礼体面'
const emptyEnvConfig: EnvConfig = {
  openaiApiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiTextModel: 'gpt-5.5',
  openaiImageModel: 'gpt-image-2',
  openaiImageTimeoutSeconds: '180',
}

const defaultConfig: StudioConfig = {
  mode: 'xhs',
  field: '生活方式',
  audience: '想提升内容质感的新手创作者',
  visualStyle: '清爽实用',
  pageCount: 8,
  size: XHS_IMAGE_SIZE,
  quality: XHS_IMAGE_QUALITY,
  outputFormat: XHS_IMAGE_FORMAT,
  moderation: 'auto',
  useCoverReference: true,
}

type PageStatus = 'idle' | 'loading' | 'done' | 'error'
type BusyState = 'settings' | 'compose' | 'page' | 'images' | 'all' | null
type PendingSettingsAction = 'compose' | 'all'

interface PageDraft {
  headline: string
  subhead: string
  bulletsText: string
  visualBrief: string
  imagePrompt: string
}

interface ModeWorkspace {
  topic: string
  config: StudioConfig
  project: XhsProject | null
  images: Record<string, string>
  pageStatus: Record<string, PageStatus>
  pageErrors: Record<string, string>
  selectedPageId: string
  referenceImage: string
  referenceImageName: string
  settingsReady: boolean
}

function classNames(...items: Array<string | false | undefined>): string {
  return items.filter(Boolean).join(' ')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = dataUrl
  anchor.download = filename
  anchor.click()
}

function copyText(value: string) {
  void navigator.clipboard.writeText(value)
}

function pageBounds(mode: ProjectMode): { min: number; max: number; defaultValue: number } {
  return mode === 'taobao'
    ? { min: 3, max: 8, defaultValue: 5 }
    : { min: 3, max: 10, defaultValue: 8 }
}

function clampPageCount(value: number, mode: ProjectMode): number {
  const bounds = pageBounds(mode)
  return Math.min(bounds.max, Math.max(bounds.min, value))
}

function normalizeConfig(value: StudioConfig): StudioConfig {
  const mode = value.mode ?? 'xhs'
  return {
    ...value,
    mode,
    pageCount: clampPageCount(value.pageCount, mode),
    size: mode === 'taobao' ? TAOBAO_IMAGE_SIZE : XHS_IMAGE_SIZE,
    quality: XHS_IMAGE_QUALITY,
    outputFormat: XHS_IMAGE_FORMAT,
    moderation: 'auto',
  }
}

function modeDefaults(mode: ProjectMode, current: StudioConfig): StudioConfig {
  const bounds = pageBounds(mode)
  return normalizeConfig({
    ...current,
    mode,
    pageCount: bounds.defaultValue,
    audience: mode === 'taobao' ? '有明确购买需求的淘宝用户' : '想提升内容质感的新手创作者',
    visualStyle: mode === 'taobao' ? '杂志质感' : '清爽实用',
    useCoverReference: true,
  })
}

function createModeWorkspace(mode: ProjectMode): ModeWorkspace {
  return {
    topic: mode === 'taobao' ? TAOBAO_DEFAULT_TOPIC : XHS_DEFAULT_TOPIC,
    config: mode === 'taobao' ? modeDefaults('taobao', defaultConfig) : defaultConfig,
    project: null,
    images: {},
    pageStatus: {},
    pageErrors: {},
    selectedPageId: '',
    referenceImage: '',
    referenceImageName: '',
    settingsReady: false,
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('参考图读取失败'))
    reader.readAsDataURL(file)
  })
}

function pageToDraft(page: XhsPage): PageDraft {
  return {
    headline: page.headline,
    subhead: page.subhead ?? '',
    bulletsText: page.bullets.join('\n'),
    visualBrief: page.visualBrief,
    imagePrompt: page.imagePrompt,
  }
}

function draftToPage(page: XhsPage, draft: PageDraft): XhsPage {
  return {
    ...page,
    headline: draft.headline.trim() || page.headline,
    subhead: draft.subhead.trim(),
    bullets: draft.bulletsText
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean),
    visualBrief: draft.visualBrief.trim(),
    imagePrompt: draft.imagePrompt.trim(),
  }
}

function textareaRows(value: string, minRows: number): number {
  const rows = value.split(/\r?\n/).reduce((total, line) => {
    const weightedLength = Array.from(line).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0)
    return total + Math.max(1, Math.ceil(weightedLength / 72))
  }, 0)
  return Math.max(minRows, rows)
}

function pageTypeLabel(type: XhsPage['type'], mode: ProjectMode): string {
  if (mode === 'taobao') {
    if (type === 'cover') return '主图'
    if (type === 'summary') return '收口'
    return '卖点'
  }
  if (type === 'cover') return '封面'
  if (type === 'summary') return '总结'
  return '内容'
}

function formatPageContent(page: XhsPage, mode: ProjectMode): string {
  return [
    `[${pageTypeLabel(page.type, mode)}]`,
    page.headline ? `标题：${page.headline}` : '',
    page.subhead ? `副标题：${page.subhead}` : '',
    page.bullets.length ? page.bullets.map((item) => `- ${item}`).join('\n') : '',
    page.visualBrief ? `${mode === 'taobao' ? '画面建议' : '配图建议'}：${page.visualBrief}` : '',
  ].filter(Boolean).join('\n')
}

function formatFullOutline(pages: XhsPage[], mode: ProjectMode): string {
  return pages.map((page) => formatPageContent(page, mode)).join('\n\n<page>\n\n')
}

function buildDraftImagePrompt(project: XhsProject, page: XhsPage): string {
  const mode = project.config.mode ?? 'xhs'
  const nextPages = project.pages.map((item) => item.id === page.id ? page : item)
  const pageText = formatPageContent(page, mode)
  const outline = formatFullOutline(nextPages, mode)

  if (mode === 'taobao') {
    return [
      '请生成一张淘宝电商风格的商品宣传图。',
      '【合规特别注意】不要带有淘宝 logo、平台水印、二维码、店铺 ID 或手机边框。',
      '【合规特别注意】如果参考图片里有水印、logo、人物隐私信息，请去掉。',
      '',
      '当前图片内容：',
      pageText,
      '',
      `图片类型：${pageTypeLabel(page.type, mode)}`,
      '',
      '如果上传了参考图，必须保持商品外观、材质、颜色、比例和关键结构一致，只优化背景、灯光、构图和促销排版。没有参考图时，根据用户原始需求生成合理商品主体，避免编造品牌标识。',
      '',
      '设计要求：',
      '',
      '1. 整体风格',
      '- 淘宝/天猫商品宣传图质感',
      '- 商品主体清楚，第一眼知道卖什么',
      '- 画面干净，有明确转化焦点',
      '- 配色和谐，符合商品品类',
      `- 符合「${project.config.visualStyle}」视觉风格`,
      '',
      '2. 文案排版',
      '- 文字清晰可读，核心卖点最大',
      '- 卖点短句不超过三层层级',
      '- 促销信息要像电商活动页，不要像社交笔记',
      '- 所有文字必须完整呈现，不能旋转或倒置',
      '',
      '3. 视觉元素',
      '- 商品占画面主要位置',
      '- 可以加入卖点标签、价格位占位、优惠角标或质感背景',
      '- 背景不能抢商品主体',
      '- 不生成平台 UI、聊天截图、订单页或手机壳画面',
      '',
      '4. 图片类型特殊要求',
      '[主图] 类型：商品最大、利益点最直接，适合商品列表和详情页首屏。',
      '[卖点] 类型：突出一个功能、材质、场景或对比，信息层级清楚。',
      '[收口] 类型：总结购买理由、活动利益或套装信息，形成下单动机。',
      '',
      '5. 技术规格',
      '- 方图 1:1 比例，适合淘宝主图和商品宣传图',
      '- 高清画质',
      '- 不要白色留边',
      '- 不要生成真实品牌商标，除非用户输入里明确提供',
      '',
      '商品或活动原始需求：',
      project.topic,
      '',
      `商品领域：${project.config.field}`,
      `目标买家：${project.config.audience || '淘宝潜在买家'}`,
      '',
      '完整宣传图结构参考：',
      '---',
      outline,
      '---',
      '',
      '请根据以上要求，生成一张可直接用于淘宝商品宣传的图片。请直接给出图片。',
    ].join('\n')
  }

  return [
    '请生成一张小红书风格的图文内容图片。',
    '【合规特别注意的】注意不要带有任何小红书的 logo，不要有右下角的用户 id 以及 logo。',
    '【合规特别注意的】如果参考图片里有水印和 logo，请一定要去掉。',
    '',
    '页面内容：',
    pageText,
    '',
    `页面类型：${pageTypeLabel(page.type, mode)}`,
    '',
    project.config.useCoverReference && page.index > 0
      ? '如果当前页面类型不是封面页的话，你要参考输入图片作为封面的样式。后续生成风格要严格参考封面的风格，保持风格统一。'
      : '如果当前页面类型不是封面页，也要依据完整大纲和用户原始需求保持整套风格统一。',
    '',
    '设计要求：',
    '',
    '1. 整体风格',
    '- 小红书爆款图文风格',
    '- 清新、精致、有设计感',
    '- 适合年轻人审美',
    '- 配色和谐，视觉吸引力强',
    `- 符合「${project.config.visualStyle}」视觉风格`,
    '',
    '2. 文字排版',
    '- 文字清晰可读，字号适中',
    '- 重要信息突出显示',
    '- 排版美观，留白合理',
    '- 支持 emoji 和符号',
    '- 如果是封面，标题要大而醒目',
    '- 所有文字内容必须完整呈现',
    '',
    '3. 视觉元素',
    '- 背景简洁但不单调',
    '- 可以有装饰性元素，如图标、插画',
    '- 配色温暖或清新',
    '- 保持专业感',
    '',
    '4. 页面类型特殊要求',
    '[封面] 类型：标题占据主要位置，字号最大；副标题在标题下方；整体设计要有吸引力和冲击力；背景可以更丰富，有视觉焦点。',
    '[内容] 类型：信息层次分明；列表项清晰展示；重点内容用颜色或粗体强调；可以有小图标辅助说明。',
    '[总结] 类型：总结性文字突出；可以有勾选框或完成标志；给人完成感和满足感；有鼓励性的视觉元素。',
    '',
    '5. 技术规格',
    '- 竖版 3:4 比例，小红书标准',
    '- 高清画质',
    '- 适合手机屏幕查看',
    '- 正确竖屏观看排版，不能左右旋转或者倒置',
    '- 不要有任何手机边框，或者白色留边',
    '',
    '6. 整体风格一致性',
    '为确保所有页面风格统一，请参考完整的内容大纲和用户原始需求来确定：',
    '- 整体色调和配色方案',
    '- 设计风格',
    '- 视觉元素的一致性',
    '- 排版布局的统一风格',
    '',
    '用户原始需求：',
    project.topic,
    '',
    `内容领域：${project.config.field}`,
    `目标读者：${project.config.audience || '泛小红书用户'}`,
    '',
    '完整内容大纲参考：',
    '---',
    outline,
    '---',
    '',
    '请根据以上要求，生成一张精美的小红书风格图片。请直接给出图片。',
  ].join('\n')
}

function StatusIcon({ status }: { status: PageStatus }) {
  if (status === 'loading') return <Loader2 className="spin" size={16} aria-hidden="true" />
  if (status === 'done') return <Check size={16} aria-hidden="true" />
  if (status === 'error') return <AlertCircle size={16} aria-hidden="true" />
  return <ImageIcon size={16} aria-hidden="true" />
}

export default function App() {
  const [topic, setTopic] = useState(XHS_DEFAULT_TOPIC)
  const [config, setConfig] = useState<StudioConfig>(defaultConfig)
  const [project, setProject] = useState<XhsProject | null>(null)
  const [images, setImages] = useState<Record<string, string>>({})
  const [pageStatus, setPageStatus] = useState<Record<string, PageStatus>>({})
  const [pageErrors, setPageErrors] = useState<Record<string, string>>({})
  const [selectedPageId, setSelectedPageId] = useState<string>('')
  const [previewPageId, setPreviewPageId] = useState<string>('')
  const [isPreviewActualSize, setIsPreviewActualSize] = useState(false)
  const [pageDraft, setPageDraft] = useState<PageDraft | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [history, setHistory] = useState<SavedProject[]>([])
  const [busy, setBusy] = useState<BusyState>(null)
  const [error, setError] = useState('')
  const [settingsReady, setSettingsReady] = useState(false)
  const [settingsPromptAction, setSettingsPromptAction] = useState<PendingSettingsAction | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [envConfig, setEnvConfig] = useState<EnvConfig>(emptyEnvConfig)
  const [envBusy, setEnvBusy] = useState(false)
  const [envError, setEnvError] = useState('')
  const [envMessage, setEnvMessage] = useState('')
  const [referenceImage, setReferenceImage] = useState('')
  const [referenceImageName, setReferenceImageName] = useState('')
  const workspaceRef = useRef<Record<ProjectMode, ModeWorkspace>>({
    xhs: createModeWorkspace('xhs'),
    taobao: createModeWorkspace('taobao'),
  })
  const activeModeRef = useRef<ProjectMode>('xhs')
  const activeGenerationRef = useRef<{ controller: AbortController; mode: ProjectMode; kind: BusyState } | null>(null)

  useEffect(() => {
    void refreshHealth()
    void loadEnvConfig()
    setHistory(loadHistory())
  }, [])

  async function refreshHealth() {
    try {
      setHealth(await getHealth())
    } catch {
      setHealth({
        ok: false,
        hasApiKey: false,
        textModel: 'unknown',
        imageModel: 'gpt-image-2',
        apiBaseUrl: 'https://api.openai.com/v1',
      } as HealthResponse)
    }
  }

  async function loadEnvConfig() {
    try {
      setEnvConfig(await getEnvConfig())
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : String(err))
    }
  }

  const mode = config.mode ?? 'xhs'
  const generatedCount = useMemo(() => Object.values(images).filter(Boolean).length, [images])
  const bounds = pageBounds(mode)

  function currentWorkspaceSnapshot(): ModeWorkspace {
    return {
      topic,
      config: normalizeConfig(config),
      project,
      images,
      pageStatus,
      pageErrors,
      selectedPageId,
      referenceImage,
      referenceImageName,
      settingsReady,
    }
  }

  function patchWorkspace(targetMode: ProjectMode, patch: Partial<ModeWorkspace>) {
    const next = {
      ...workspaceRef.current[targetMode],
      ...patch,
    }
    workspaceRef.current[targetMode] = next

    if (activeModeRef.current !== targetMode) return
    if ('topic' in patch) setTopic(next.topic)
    if ('config' in patch) setConfig(next.config)
    if ('project' in patch) setProject(next.project)
    if ('images' in patch) setImages(next.images)
    if ('pageStatus' in patch) setPageStatus(next.pageStatus)
    if ('pageErrors' in patch) setPageErrors(next.pageErrors)
    if ('selectedPageId' in patch) setSelectedPageId(next.selectedPageId)
    if ('referenceImage' in patch) setReferenceImage(next.referenceImage)
    if ('referenceImageName' in patch) setReferenceImageName(next.referenceImageName)
    if ('settingsReady' in patch) setSettingsReady(next.settingsReady)
  }

  function applyWorkspace(targetMode: ProjectMode, snapshot: ModeWorkspace) {
    const next = {
      ...snapshot,
      config: normalizeConfig(snapshot.config),
    }
    activeModeRef.current = targetMode
    workspaceRef.current[targetMode] = next
    setTopic(next.topic)
    setConfig(next.config)
    setProject(next.project)
    setImages(next.images)
    setPageStatus(next.pageStatus)
    setPageErrors(next.pageErrors)
    setSelectedPageId(next.selectedPageId)
    setPreviewPageId('')
    setIsPreviewActualSize(false)
    setPageDraft(null)
    setReferenceImage(next.referenceImage)
    setReferenceImageName(next.referenceImageName)
    setSettingsReady(next.settingsReady)
    setSettingsPromptAction(null)
    setError('')
  }

  function updateTopic(value: string) {
    setTopic(value)
    setSettingsReady(false)
    setSettingsPromptAction(null)
    patchWorkspace(mode, {
      topic: value,
      settingsReady: false,
    })
  }

  function updateConfig(nextConfig: StudioConfig) {
    const normalized = normalizeConfig(nextConfig)
    setConfig(normalized)
    patchWorkspace(normalized.mode, { config: normalized })
  }

  function setImagesForMode(targetMode: ProjectMode, updater: (current: Record<string, string>) => Record<string, string>) {
    patchWorkspace(targetMode, { images: updater(workspaceRef.current[targetMode].images) })
  }

  function setPageStatusForMode(targetMode: ProjectMode, updater: (current: Record<string, PageStatus>) => Record<string, PageStatus>) {
    patchWorkspace(targetMode, { pageStatus: updater(workspaceRef.current[targetMode].pageStatus) })
  }

  function setPageErrorsForMode(targetMode: ProjectMode, updater: (current: Record<string, string>) => Record<string, string>) {
    patchWorkspace(targetMode, { pageErrors: updater(workspaceRef.current[targetMode].pageErrors) })
  }

  function resetLoadingStatuses(targetMode: ProjectMode) {
    setPageStatusForMode(targetMode, (current) => Object.fromEntries(
      Object.entries(current).map(([pageId, status]) => [pageId, status === 'loading' ? 'idle' : status]),
    ))
  }

  function beginGeneration(kind: Exclude<BusyState, null>, targetMode = mode): AbortController {
    activeGenerationRef.current?.controller.abort()
    const controller = new AbortController()
    activeGenerationRef.current = { controller, mode: targetMode, kind }
    setBusy(kind)
    setError('')
    return controller
  }

  function finishGeneration(controller: AbortController) {
    if (activeGenerationRef.current?.controller !== controller) return
    activeGenerationRef.current = null
    setBusy(null)
  }

  function stopGeneration() {
    const generation = activeGenerationRef.current
    if (!generation) return
    generation.controller.abort()
    activeGenerationRef.current = null
    resetLoadingStatuses(generation.mode)
    setBusy(null)
    setError('已停止生成')
  }

  function settingsLabel() {
    return mode === 'taobao' ? '买家定位' : '定位'
  }

  useEffect(() => {
    activeModeRef.current = mode
    workspaceRef.current[mode] = currentWorkspaceSnapshot()
  }, [mode, topic, config, project, images, pageStatus, pageErrors, selectedPageId, referenceImage, referenceImageName, settingsReady])

  useEffect(() => {
    if (!selectedPageId && project?.pages[0]) setSelectedPageId(project.pages[0].id)
  }, [project, selectedPageId])

  const selectedPage = useMemo(() => {
    return project?.pages.find((page) => page.id === selectedPageId) ?? project?.pages[0] ?? null
  }, [project, selectedPageId])

  const previewPage = useMemo(() => {
    return project?.pages.find((page) => page.id === previewPageId) ?? null
  }, [project, previewPageId])

  const previewablePages = useMemo(() => {
    return project?.pages.filter((page) => Boolean(images[page.id])) ?? []
  }, [images, project])

  const previewPosition = useMemo(() => {
    return previewablePages.findIndex((page) => page.id === previewPageId)
  }, [previewPageId, previewablePages])

  const canNavigatePreview = previewablePages.length > 1

  useEffect(() => {
    setPageDraft(selectedPage ? pageToDraft(selectedPage) : null)
  }, [selectedPage?.id])

  useEffect(() => {
    if (!previewPageId) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePreview()
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        navigatePreview(-1)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        navigatePreview(1)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [previewPageId, previewablePages])

  function openPreview(pageId: string) {
    setPreviewPageId(pageId)
    setIsPreviewActualSize(false)
  }

  function closePreview() {
    setPreviewPageId('')
    setIsPreviewActualSize(false)
  }

  function navigatePreview(direction: -1 | 1) {
    if (previewablePages.length <= 1) return
    const currentIndex = previewablePages.findIndex((page) => page.id === previewPageId)
    const nextIndex = ((currentIndex >= 0 ? currentIndex : 0) + direction + previewablePages.length) % previewablePages.length
    const nextPage = previewablePages[nextIndex]
    setPreviewPageId(nextPage.id)
    setSelectedPageId(nextPage.id)
    setIsPreviewActualSize(false)
  }

  async function fillSettings(): Promise<boolean> {
    const actionMode = mode
    const cleanTopic = topic.trim()
    if (!cleanTopic) {
      setError('请输入选题')
      return false
    }

    setBusy('settings')
    setError('')
    try {
      const next = await suggestSettings({ topic: cleanTopic, mode: actionMode })
      const currentConfig = workspaceRef.current[actionMode].config
      const nextConfig = normalizeConfig({
        ...currentConfig,
        field: fields.includes(next.field) ? next.field : currentConfig.field,
        visualStyle: styles.includes(next.visualStyle) ? next.visualStyle : currentConfig.visualStyle,
        audience: next.audience || currentConfig.audience,
      })
      patchWorkspace(actionMode, {
        topic: cleanTopic,
        config: nextConfig,
        settingsReady: true,
      })
      setSettingsPromptAction(null)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function saveRuntimeConfig() {
    setEnvBusy(true)
    setEnvError('')
    setEnvMessage('')
    try {
      const next = await saveEnvConfig(envConfig)
      setEnvConfig(next)
      setEnvMessage('已保存')
      await refreshHealth()
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : String(err))
    } finally {
      setEnvBusy(false)
    }
  }

  function switchMode(nextMode: ProjectMode) {
    if (nextMode === mode) return
    workspaceRef.current[mode] = currentWorkspaceSnapshot()
    applyWorkspace(nextMode, workspaceRef.current[nextMode] ?? createModeWorkspace(nextMode))
  }

  async function uploadReferenceImage(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('参考图不能超过 8MB')
      return
    }
    setError('')
    try {
      const nextImage = await readImageFile(file)
      patchWorkspace(mode, {
        referenceImage: nextImage,
        referenceImageName: file.name,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function clearReferenceImage() {
    patchWorkspace(mode, {
      referenceImage: '',
      referenceImageName: '',
    })
  }

  async function composeCurrentProject(signal: AbortSignal, operationMode = mode): Promise<XhsProject | null> {
    const workspace = workspaceRef.current[operationMode]
    const cleanTopic = workspace.topic.trim()
    if (!cleanTopic) {
      setError('请输入选题')
      return null
    }

    try {
      const cleanConfig = normalizeConfig(workspace.config)
      patchWorkspace(operationMode, {
        topic: cleanTopic,
        config: cleanConfig,
      })
      const response = await composeProject({ topic: cleanTopic, config: cleanConfig }, { signal })
      if (signal.aborted) return null
      patchWorkspace(operationMode, {
        project: response.project,
        images: {},
        pageStatus: Object.fromEntries(response.project.pages.map((page) => [page.id, 'idle'])),
        pageErrors: {},
        selectedPageId: response.project.pages[0]?.id ?? '',
      })
      if (activeModeRef.current === operationMode) {
        setPreviewPageId('')
        setIsPreviewActualSize(false)
      }
      return response.project
    } catch (err) {
      if (!signal.aborted && !isAbortError(err) && activeModeRef.current === operationMode) {
        setError(err instanceof Error ? err.message : String(err))
      }
      return null
    }
  }

  async function createProject(): Promise<XhsProject | null> {
    const operationMode = mode
    const controller = beginGeneration('compose', operationMode)
    try {
      return await composeCurrentProject(controller.signal, operationMode)
    } finally {
      finishGeneration(controller)
    }
  }

  async function generatePageImage(targetProject: XhsProject, page: XhsPage, referenceImage?: string, signal?: AbortSignal): Promise<string | null> {
    const cleanProject = {
      ...targetProject,
      config: normalizeConfig(targetProject.config),
    }
    const operationMode = cleanProject.config.mode
    setPageStatusForMode(operationMode, (current) => ({ ...current, [page.id]: 'loading' }))
    setPageErrorsForMode(operationMode, (current) => ({ ...current, [page.id]: '' }))
    try {
      const response = await generateImage({ project: cleanProject, page, referenceImage }, { signal })
      if (signal?.aborted) return null
      setImagesForMode(operationMode, (current) => ({ ...current, [page.id]: response.image }))
      setPageStatusForMode(operationMode, (current) => ({ ...current, [page.id]: 'done' }))
      return response.image
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) {
        setPageStatusForMode(operationMode, (current) => ({ ...current, [page.id]: 'idle' }))
        return null
      }
      setPageStatusForMode(operationMode, (current) => ({ ...current, [page.id]: 'error' }))
      setPageErrorsForMode(operationMode, (current) => ({ ...current, [page.id]: err instanceof Error ? err.message : String(err) }))
      return null
    }
  }

  async function generateAllImages(targetProject = project, options: { signal?: AbortSignal; manageBusy?: boolean } = {}) {
    if (!targetProject) return

    const cleanProject = {
      ...targetProject,
      config: normalizeConfig(targetProject.config),
    }
    const operationMode = cleanProject.config.mode
    const controller = options.manageBusy === false ? null : beginGeneration('images', operationMode)
    const signal = options.signal ?? controller?.signal
    setError('')

    const productReference = operationMode === 'taobao' ? workspaceRef.current[operationMode].referenceImage : ''
    const nextImages: Record<string, string> = {}
    try {
      const cover = cleanProject.pages[0]
      let coverImage = ''
      if (cover) {
        if (signal?.aborted) return
        const result = await generatePageImage(cleanProject, cover, productReference || undefined, signal)
        if (result) {
          coverImage = result
          nextImages[cover.id] = result
        }
      }

      for (const page of cleanProject.pages.slice(1)) {
        if (signal?.aborted) return
        const reference = operationMode === 'taobao'
          ? productReference || (cleanProject.config.useCoverReference ? coverImage : undefined)
          : cleanProject.config.useCoverReference ? coverImage : undefined
        const result = await generatePageImage(cleanProject, page, reference, signal)
        if (result) nextImages[page.id] = result
      }

      if (signal?.aborted) return
      const merged = workspaceRef.current[operationMode].images
      const saved = rememberProject(toSavedProject(cleanProject, merged))
      setHistory(saved)
    } finally {
      if (controller) finishGeneration(controller)
    }
  }

  async function generateEverything() {
    const operationMode = mode
    const controller = beginGeneration('all', operationMode)
    try {
      const created = await composeCurrentProject(controller.signal, operationMode)
      if (created && !controller.signal.aborted) await generateAllImages(created, { signal: controller.signal, manageBusy: false })
    } finally {
      finishGeneration(controller)
    }
  }

  async function runGenerationAction(action: PendingSettingsAction) {
    if (action === 'compose') {
      await createProject()
      return
    }
    await generateEverything()
  }

  async function requestGeneration(action: PendingSettingsAction) {
    if (busy) return
    if (!topic.trim()) {
      setError('请输入选题')
      return
    }
    if (!settingsReady) {
      setError('')
      setSettingsPromptAction(action)
      return
    }
    await runGenerationAction(action)
  }

  async function autoFillAndContinue() {
    const action = settingsPromptAction
    if (!action || busy) return
    const filled = await fillSettings()
    if (filled) await runGenerationAction(action)
  }

  async function continueWithoutSettings() {
    const action = settingsPromptAction
    if (!action || busy) return
    setSettingsPromptAction(null)
    patchWorkspace(mode, { settingsReady: true })
    await runGenerationAction(action)
  }

  function loadSaved(item: SavedProject) {
    workspaceRef.current[mode] = currentWorkspaceSnapshot()
    const itemConfig = normalizeConfig(item.config)
    applyWorkspace(itemConfig.mode, {
      topic: item.topic,
      config: itemConfig,
      project: item,
      images: item.images ?? {},
      pageStatus: Object.fromEntries(item.pages.map((page) => [page.id, item.images?.[page.id] ? 'done' : 'idle'])),
      pageErrors: {},
      selectedPageId: item.pages[0]?.id ?? '',
      referenceImage: '',
      referenceImageName: '',
      settingsReady: true,
    })
  }

  function deleteSaved(id: string) {
    const next = saveHistory(history.filter((item) => item.id !== id))
    setHistory(next)
  }

  function clearSaved() {
    clearHistory()
    setHistory([])
  }

  function exportCurrent() {
    const saved = saveSelectedDraft({ clearImage: false })
    const currentProject = saved?.project ?? project
    if (!currentProject) return
    const blob = exportProjectZip(currentProject, images)
    downloadBlob(blob, `${currentProject.topic.slice(0, 18) || 'red-image-studio'}.zip`)
  }

  function saveSelectedDraft(options: { clearImage?: boolean } = {}) {
    if (!project || !selectedPage || !pageDraft) return null

    const updatedBase = draftToPage(selectedPage, pageDraft)
    const nextProjectBase = {
      ...project,
      config: normalizeConfig(project.config),
      pages: project.pages.map((page) => page.id === selectedPage.id ? updatedBase : page),
    }
    const draftPrompt = pageDraft.imagePrompt.trim()
    const originalPrompt = selectedPage.imagePrompt.trim()
    const updatedPage = {
      ...updatedBase,
      imagePrompt: draftPrompt && draftPrompt !== originalPrompt
        ? draftPrompt
        : buildDraftImagePrompt(nextProjectBase, updatedBase),
    }
    const nextProject = {
      ...nextProjectBase,
      pages: nextProjectBase.pages.map((page) => page.id === selectedPage.id ? updatedPage : page),
    }

    patchWorkspace(mode, { project: nextProject })
    setPageDraft(pageToDraft(updatedPage))

    if (options.clearImage !== false) {
      setImagesForMode(mode, (current) => {
        const next = { ...current }
        delete next[updatedPage.id]
        return next
      })
      setPageStatusForMode(mode, (current) => ({ ...current, [updatedPage.id]: 'idle' }))
    }

    return { project: nextProject, page: updatedPage }
  }

  async function generateSelectedPage() {
    const saved = saveSelectedDraft({ clearImage: false })
    if (!saved) return
    const operationMode = saved.project.config.mode
    const workspace = workspaceRef.current[operationMode]
    const cover = saved.project.pages[0]
    const reference = operationMode === 'taobao'
      ? workspace.referenceImage || (saved.project.config.useCoverReference && saved.page.index > 0 && cover ? workspace.images[cover.id] : undefined)
      : saved.project.config.useCoverReference && saved.page.index > 0 && cover
        ? workspace.images[cover.id]
        : undefined
    const controller = beginGeneration('page', operationMode)
    try {
      await generatePageImage(saved.project, saved.page, reference, controller.signal)
    } finally {
      finishGeneration(controller)
    }
  }

  async function generateAllFromCurrentProject() {
    const saved = saveSelectedDraft({ clearImage: false })
    await generateAllImages(saved?.project ?? project)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={22} />
          </div>
          <div>
            <h1>Red Image Studio</h1>
            <p>小红书 / 淘宝图片工作台</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={classNames('status-pill', health?.hasApiKey ? 'ok' : 'warn')}>
            {health?.hasApiKey ? 'OpenAI 已配置' : '模拟模式'}
          </span>
          <span className="status-pill">{health?.imageModel ?? 'gpt-image-2'}</span>
          <span className="status-pill api-url">{health?.apiBaseUrl ?? 'https://api.openai.com/v1'}</span>
          <button className="config-button" type="button" onClick={() => setShowConfig(true)}>
            <Settings size={17} />
            配置
          </button>
        </div>
      </header>

      {showConfig && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowConfig(false)}>
          <section className="config-modal" aria-label=".env 配置" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-heading-row">
              <div className="panel-title">
                <Settings size={20} aria-hidden="true" />
                <h2>配置</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowConfig(false)} aria-label="关闭配置">
                <X size={18} />
              </button>
            </div>

            <div className="config-form">
              <label className="field-block">
                <span>API Key</span>
                <div className="secret-field">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={envConfig.openaiApiKey}
                    onChange={(event) => setEnvConfig({ ...envConfig, openaiApiKey: event.target.value })}
                    autoComplete="off"
                  />
                  <button type="button" onClick={() => setShowApiKey((value) => !value)} aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}>
                    {showApiKey ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>

              <label className="field-block">
                <span>API URL</span>
                <input
                  value={envConfig.openaiBaseUrl}
                  onChange={(event) => setEnvConfig({ ...envConfig, openaiBaseUrl: event.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </label>

              <div className="config-grid">
                <label className="field-block">
                  <span>文案模型</span>
                  <input
                    value={envConfig.openaiTextModel}
                    onChange={(event) => setEnvConfig({ ...envConfig, openaiTextModel: event.target.value })}
                  />
                </label>
                <label className="field-block">
                  <span>图片模型</span>
                  <input
                    value={envConfig.openaiImageModel}
                    onChange={(event) => setEnvConfig({ ...envConfig, openaiImageModel: event.target.value })}
                  />
                </label>
              </div>

              <label className="field-block">
                <span>图片超时秒数</span>
                <input
                  type="number"
                  min={30}
                  value={envConfig.openaiImageTimeoutSeconds}
                  onChange={(event) => setEnvConfig({ ...envConfig, openaiImageTimeoutSeconds: event.target.value })}
                />
              </label>

              {envError && <div className="error-box" role="alert">{envError}</div>}
              {envMessage && <div className="success-box" role="status">{envMessage}</div>}

              <div className="button-row">
                <button className="secondary-button" type="button" onClick={loadEnvConfig} disabled={envBusy}>
                  <RefreshCw size={18} />
                  重新读取
                </button>
                <button className="primary-button" type="button" onClick={saveRuntimeConfig} disabled={envBusy}>
                  {envBusy ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
                  保存配置
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {previewPage && images[previewPage.id] && (
        <div className="image-lightbox" role="dialog" aria-modal="true" aria-label="图片预览" onMouseDown={closePreview}>
          <section className="lightbox-panel" onMouseDown={(event) => event.stopPropagation()}>
            <div className="lightbox-header">
              <div>
                <p className="eyebrow">
                  {pageTypeLabel(previewPage.type, project?.config.mode ?? 'xhs')} / {previewPage.index + 1}
                  {previewPosition >= 0 && ` / ${previewPosition + 1}/${previewablePages.length}`}
                </p>
                <h2>{previewPage.headline}</h2>
              </div>
              <div className="lightbox-actions">
                <button type="button" aria-pressed={isPreviewActualSize} onClick={() => setIsPreviewActualSize((value) => !value)}>
                  {isPreviewActualSize ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                  {isPreviewActualSize ? '适应窗口' : '原图尺寸'}
                </button>
                <button type="button" onClick={() => downloadDataUrl(images[previewPage.id], `${previewPage.index + 1}-${previewPage.type}.${config.outputFormat}`)}>
                  <Download size={18} />
                  下载
                </button>
                <button className="icon-button" type="button" onClick={closePreview} aria-label="关闭大图">
                  <X size={18} />
                </button>
              </div>
            </div>
            {canNavigatePreview && (
              <>
                <button className="lightbox-nav previous" type="button" onClick={() => navigatePreview(-1)} aria-label="上一张图片">
                  <ChevronLeft size={28} />
                </button>
                <button className="lightbox-nav next" type="button" onClick={() => navigatePreview(1)} aria-label="下一张图片">
                  <ChevronRight size={28} />
                </button>
              </>
            )}
            <div className={classNames('lightbox-image-wrap', isPreviewActualSize && 'actual-size')}>
              <img src={images[previewPage.id]} alt={previewPage.headline} />
            </div>
          </section>
        </div>
      )}

      <main className="workspace">
        <section className="panel composer" aria-label="生成设置">
          <div className="panel-title">
            <WandSparkles size={20} aria-hidden="true" />
            <h2>生成</h2>
          </div>

          <div className="mode-switch" aria-label="生成类型">
            <button
              className={classNames(mode === 'xhs' && 'active')}
              type="button"
              onClick={() => switchMode('xhs')}
            >
              <Sparkles size={18} />
              小红书图文
            </button>
            <button
              className={classNames(mode === 'taobao' && 'active')}
              type="button"
              onClick={() => switchMode('taobao')}
            >
              <ShoppingBag size={18} />
              淘宝宣传图
            </button>
          </div>

          <label className="field-block">
            <span>{mode === 'taobao' ? '商品/活动' : '选题'}</span>
            <textarea
              value={topic}
              onChange={(event) => updateTopic(event.target.value)}
              rows={5}
              placeholder={mode === 'taobao' ? TAOBAO_DEFAULT_TOPIC : XHS_DEFAULT_TOPIC}
            />
          </label>

          {mode === 'taobao' && (
            <div className="reference-upload">
              <div className="mini-heading">
                <span>参考图</span>
                {referenceImage && <button type="button" onClick={clearReferenceImage}><X size={15} />移除</button>}
              </div>
              {referenceImage ? (
                <div className="reference-preview">
                  <img src={referenceImage} alt="淘宝商品参考图" />
                  <div>
                    <strong>{referenceImageName || '已上传参考图'}</strong>
                    <span>生成时保留商品外观、材质和颜色</span>
                  </div>
                </div>
              ) : (
                <label className="upload-drop">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      void uploadReferenceImage(event.target.files?.[0])
                      event.currentTarget.value = ''
                    }}
                  />
                  <UploadCloud size={22} />
                  <span>上传商品参考图</span>
                </label>
              )}
            </div>
          )}

          <div className="auto-settings">
            <button className="secondary-button full" type="button" onClick={() => void fillSettings()} disabled={Boolean(busy)}>
              {busy === 'settings' ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
              {mode === 'taobao' ? '自动填写买家定位' : '自动填写定位'}
            </button>
            <dl className="setting-summary">
              <div>
                <dt>领域</dt>
                <dd>{config.field}</dd>
              </div>
              <div>
                <dt>风格</dt>
                <dd>{config.visualStyle}</dd>
              </div>
              <div>
                <dt>{mode === 'taobao' ? '买家' : '读者'}</dt>
                <dd>{config.audience}</dd>
              </div>
            </dl>
          </div>

          <div className="range-row">
            <label htmlFor="page-count">{mode === 'taobao' ? '张数' : '页数'}</label>
            <strong>{config.pageCount}</strong>
            <input
              id="page-count"
              type="range"
              min={bounds.min}
              max={bounds.max}
              value={config.pageCount}
              onChange={(event) => updateConfig({ ...config, pageCount: Number(event.target.value) })}
            />
          </div>

          <div className="toggle-row">
            <label>
              <input
                type="checkbox"
                checked={config.useCoverReference}
                onChange={(event) => updateConfig({ ...config, useCoverReference: event.target.checked })}
              />
              <span>{mode === 'taobao' ? '整套保持商品一致' : '整套保持同一风格'}</span>
            </label>
          </div>

          {settingsPromptAction && (
            <div className="settings-reminder" role="alert">
              <p>还没有自动填写{settingsLabel()}。建议先自动填写，再生成。</p>
              <div>
                <button type="button" onClick={() => void autoFillAndContinue()} disabled={Boolean(busy)}>
                  {busy === 'settings' ? <Loader2 className="spin" size={16} /> : <WandSparkles size={16} />}
                  自动填写并继续
                </button>
                <button type="button" onClick={() => void continueWithoutSettings()} disabled={Boolean(busy)}>
                  继续生成
                </button>
              </div>
            </div>
          )}

          {error && <div className="error-box" role="alert">{error}</div>}

          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => void requestGeneration('compose')} disabled={Boolean(busy)}>
              {busy === 'compose' ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
              生成方案
            </button>
            <button className="primary-button" type="button" onClick={() => void requestGeneration('all')} disabled={Boolean(busy)}>
              {busy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              生成整套
            </button>
            {busy && busy !== 'settings' && (
              <button className="stop-button" type="button" onClick={stopGeneration}>
                <CircleStop size={18} />
                停止
              </button>
            )}
          </div>
        </section>

        <section className="panel canvas" aria-label="页面预览">
          <div className="panel-heading-row">
            <div className="panel-title">
              <ImageIcon size={20} aria-hidden="true" />
              <h2>页面</h2>
            </div>
            <div className="count-label">{generatedCount}/{project?.pages.length ?? 0}</div>
          </div>

          {!project ? (
            <div className="empty-state">
              <ImageIcon size={42} aria-hidden="true" />
              <p>输入选题后生成方案</p>
            </div>
          ) : (
            <>
              <div className="page-grid">
                {project.pages.map((page) => {
                  const image = images[page.id]
                  const status = pageStatus[page.id] ?? 'idle'
                  return (
                    <button
                      className={classNames('page-tile', selectedPageId === page.id && 'active')}
                      type="button"
                      key={page.id}
                      onClick={(event) => {
                        setSelectedPageId(page.id)
                        if (image && (event.target as HTMLElement).closest('.page-image')) openPreview(page.id)
                      }}
                      aria-label={`${page.headline}${image ? '，点击图片查看大图' : ''}`}
                    >
                      <div className={classNames('page-image', project.config.mode === 'taobao' && 'square')}>
                        {image ? (
                          <>
                            <img src={image} alt={page.headline} />
                            <span className="zoom-affordance"><Maximize2 size={17} /></span>
                          </>
                        ) : <span>{page.index + 1}</span>}
                      </div>
                      <div className="page-meta">
                        <StatusIcon status={status} />
                        <span>{page.headline}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedPage && pageDraft && (
                <div className="detail-band">
                  <div className="page-editor">
                    <p className="eyebrow">{pageTypeLabel(selectedPage.type, mode)} / {selectedPage.index + 1}</p>
                    <label className="field-block">
                      <span>主标题</span>
                      <input
                        value={pageDraft.headline}
                        onChange={(event) => setPageDraft({ ...pageDraft, headline: event.target.value })}
                      />
                    </label>
                    <label className="field-block">
                      <span>副标题</span>
                      <input
                        value={pageDraft.subhead}
                        onChange={(event) => setPageDraft({ ...pageDraft, subhead: event.target.value })}
                      />
                    </label>
                    <label className="field-block">
                      <span>要点内容</span>
                      <textarea
                        className="content-editor"
                        rows={textareaRows(pageDraft.bulletsText, 5)}
                        value={pageDraft.bulletsText}
                        onChange={(event) => setPageDraft({ ...pageDraft, bulletsText: event.target.value })}
                      />
                    </label>
                    <label className="field-block">
                      <span>画面说明</span>
                      <textarea
                        className="content-editor"
                        rows={textareaRows(pageDraft.visualBrief, 4)}
                        value={pageDraft.visualBrief}
                        onChange={(event) => setPageDraft({ ...pageDraft, visualBrief: event.target.value })}
                      />
                    </label>
                    <label className="field-block">
                      <span>图片提示词</span>
                      <textarea
                        className="prompt-editor"
                        rows={textareaRows(pageDraft.imagePrompt, 12)}
                        value={pageDraft.imagePrompt}
                        onChange={(event) => setPageDraft({ ...pageDraft, imagePrompt: event.target.value })}
                      />
                    </label>
                    {pageErrors[selectedPage.id] && <div className="error-box">{pageErrors[selectedPage.id]}</div>}
                  </div>
                  <div className="detail-actions">
                    <button type="button" onClick={() => saveSelectedDraft()}>
                      <Save size={17} />
                      保存
                    </button>
                    <button type="button" onClick={generateSelectedPage} disabled={Boolean(busy)}>
                      {busy === 'page' ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
                      生成当前页
                    </button>
                    <button type="button" onClick={() => copyText(pageDraft.imagePrompt)}>
                      <Copy size={17} />
                      复制提示词
                    </button>
                    {images[selectedPage.id] && (
                      <button type="button" onClick={() => downloadDataUrl(images[selectedPage.id], `${selectedPage.index + 1}-${selectedPage.type}.${config.outputFormat}`)}>
                        <Download size={17} />
                        下载
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <aside className="panel publish" aria-label="发布内容">
          <div className="panel-heading-row">
            <div className="panel-title">
              <Archive size={20} aria-hidden="true" />
              <h2>发布</h2>
            </div>
            <button className="icon-button" type="button" onClick={exportCurrent} disabled={!project} aria-label="导出 ZIP">
              <Download size={18} />
            </button>
          </div>

          {project ? (
            <div className="publish-stack">
              <div>
                <div className="mini-heading">
                  <span>标题</span>
                  <button type="button" onClick={() => copyText(project.titleOptions[0] ?? '')}><Copy size={15} />复制</button>
                </div>
                <div className="title-list">
                  {project.titleOptions.map((item) => <p key={item}>{item}</p>)}
                </div>
              </div>

              <div>
                <div className="mini-heading">
                  <span>正文</span>
                  <button type="button" onClick={() => copyText(project.caption)}><Copy size={15} />复制</button>
                </div>
                <pre className="caption-box">{project.caption}</pre>
              </div>

              <div>
                <div className="mini-heading">
                  <span>标签</span>
                  <button type="button" onClick={() => copyText(project.tags.map((tag) => `#${tag}`).join(' '))}><Copy size={15} />复制</button>
                </div>
                <div className="tag-list">
                  {project.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                </div>
              </div>

              <button className="primary-button full" type="button" onClick={generateAllFromCurrentProject} disabled={!project || Boolean(busy)}>
                {busy === 'images' ? <Loader2 className="spin" size={18} /> : <ImageIcon size={18} />}
                生成整套图片
              </button>
            </div>
          ) : (
            <div className="empty-small">暂无方案</div>
          )}

          <div className="history-block">
            <div className="mini-heading">
              <span><History size={16} />历史</span>
              <button type="button" onClick={clearSaved} disabled={!history.length}><Trash2 size={15} />清空</button>
            </div>
            <div className="history-list">
              {history.length === 0 && <p className="muted">暂无记录</p>}
              {history.map((item) => (
                <div className="history-item" key={item.id}>
                  <button type="button" onClick={() => loadSaved(item)}>
                    <strong>{item.topic}</strong>
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                  </button>
                  <button className="icon-button danger" type="button" aria-label="删除历史" onClick={() => deleteSaved(item.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
