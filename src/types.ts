export type PageType = 'cover' | 'content' | 'summary'
export type ProjectMode = 'xhs' | 'taobao'

export type Field =
  | '生活方式'
  | '美妆护肤'
  | '职场效率'
  | '学习成长'
  | '旅行探店'
  | '美食烘焙'
  | '运动健康'
  | '母婴家庭'
  | '家居收纳'
  | '数码工具'

export type VisualStyle =
  | '清爽实用'
  | '杂志质感'
  | '手账拼贴'
  | '专业干货'
  | '温暖日常'
  | '科技极简'

export type ImageQuality = 'low' | 'medium' | 'high' | 'auto'
export type ImageFormat = 'png' | 'jpeg' | 'webp'
export type ModerationLevel = 'auto' | 'low'

export interface StudioConfig {
  mode: ProjectMode
  field: Field
  audience: string
  visualStyle: VisualStyle
  pageCount: number
  size: string
  quality: ImageQuality
  outputFormat: ImageFormat
  moderation: ModerationLevel
  useCoverReference: boolean
}

export interface XhsPage {
  id: string
  index: number
  type: PageType
  headline: string
  subhead?: string
  bullets: string[]
  visualBrief: string
  imagePrompt: string
}

export interface XhsProject {
  id: string
  topic: string
  titleOptions: string[]
  caption: string
  tags: string[]
  pages: XhsPage[]
  createdAt: string
  config: StudioConfig
  mock?: boolean
}

export interface ComposeRequest {
  topic: string
  config: StudioConfig
}

export interface ComposeResponse {
  project: XhsProject
}

export interface SuggestSettingsRequest {
  topic: string
  mode?: ProjectMode
}

export interface SuggestSettingsResponse {
  field: Field
  visualStyle: VisualStyle
  audience: string
  mock?: boolean
}

export interface CompetitionSeriesRequest {
  requirement: string
  count: number
}

export interface CompetitionSeriesImage {
  index: number
  title: string
  role: string
  visualBrief: string
  onImageText?: string
}

export interface CompetitionSeriesResponse {
  title: string
  styleGuide: string
  images: CompetitionSeriesImage[]
  mock?: boolean
}

export interface GenerateImageRequest {
  project: XhsProject
  page: XhsPage
  referenceImage?: string
  editInstruction?: string
}

export interface GenerateImageResponse {
  image: string
  mime: string
  model: string
  mock?: boolean
}

export interface HealthResponse {
  ok: boolean
  hasApiKey: boolean
  textModel: string
  imageModel: string
  apiBaseUrl: string
}

export interface EnvConfig {
  openaiApiKey: string
  openaiBaseUrl: string
  openaiTextModel: string
  openaiImageModel: string
  openaiImageTimeoutSeconds: string
}

export type EnvConfigResponse = EnvConfig

export type SaveEnvConfigRequest = EnvConfig

export interface SavedProject extends XhsProject {
  images: Record<string, string>
}

export interface SavedSingleImage {
  id: string
  image: string
  prompt: string
  editInstruction?: string
  referenceName?: string
  createdAt: string
  size: string
  quality: ImageQuality
  outputFormat: ImageFormat
  mode: 'generate' | 'competition' | 'edit'
  seriesTitle?: string
  seriesIndex?: number
  seriesTotal?: number
}
