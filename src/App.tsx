import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Archive,
  Check,
  Copy,
  Download,
  History,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { composeProject, generateImage, getHealth } from './api'
import { exportProjectZip, toSavedProject } from './exportProject'
import { clearHistory, loadHistory, rememberProject, saveHistory } from './storage'
import type { Field, HealthResponse, ImageFormat, ImageQuality, ModerationLevel, SavedProject, StudioConfig, VisualStyle, XhsPage, XhsProject } from './types'

const fields: Field[] = ['生活方式', '美妆护肤', '职场效率', '学习成长', '旅行探店', '美食烘焙', '运动健康', '母婴家庭', '家居收纳', '数码工具']
const styles: VisualStyle[] = ['清爽实用', '杂志质感', '手账拼贴', '专业干货', '温暖日常', '科技极简']
const sizes = ['1024x1536', '1080x1440', '1536x2048', '1024x1024']

const defaultConfig: StudioConfig = {
  field: '生活方式',
  audience: '想提升内容质感的新手创作者',
  visualStyle: '清爽实用',
  pageCount: 5,
  size: '1024x1536',
  quality: 'medium',
  outputFormat: 'png',
  moderation: 'auto',
  useCoverReference: true,
}

type PageStatus = 'idle' | 'loading' | 'done' | 'error'

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

function StatusIcon({ status }: { status: PageStatus }) {
  if (status === 'loading') return <Loader2 className="spin" size={16} aria-hidden="true" />
  if (status === 'done') return <Check size={16} aria-hidden="true" />
  if (status === 'error') return <AlertCircle size={16} aria-hidden="true" />
  return <ImageIcon size={16} aria-hidden="true" />
}

export default function App() {
  const [topic, setTopic] = useState('给自由职业者做一套高效工作流图文')
  const [config, setConfig] = useState<StudioConfig>(defaultConfig)
  const [project, setProject] = useState<XhsProject | null>(null)
  const [images, setImages] = useState<Record<string, string>>({})
  const [pageStatus, setPageStatus] = useState<Record<string, PageStatus>>({})
  const [pageErrors, setPageErrors] = useState<Record<string, string>>({})
  const [selectedPageId, setSelectedPageId] = useState<string>('')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [history, setHistory] = useState<SavedProject[]>([])
  const [busy, setBusy] = useState<'compose' | 'images' | 'all' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void getHealth().then(setHealth).catch(() => {
      setHealth({
        ok: false,
        hasApiKey: false,
        textModel: 'unknown',
        imageModel: 'gpt-image-2',
        apiBaseUrl: 'https://api.openai.com/v1',
      } as HealthResponse)
    })
    setHistory(loadHistory())
  }, [])

  useEffect(() => {
    if (!selectedPageId && project?.pages[0]) setSelectedPageId(project.pages[0].id)
  }, [project, selectedPageId])

  const selectedPage = useMemo(() => {
    return project?.pages.find((page) => page.id === selectedPageId) ?? project?.pages[0] ?? null
  }, [project, selectedPageId])

  const generatedCount = useMemo(() => Object.values(images).filter(Boolean).length, [images])

  async function createProject(): Promise<XhsProject | null> {
    const cleanTopic = topic.trim()
    if (!cleanTopic) {
      setError('请输入选题')
      return null
    }

    setBusy('compose')
    setError('')
    try {
      const response = await composeProject({ topic: cleanTopic, config })
      setProject(response.project)
      setImages({})
      setPageStatus(Object.fromEntries(response.project.pages.map((page) => [page.id, 'idle'])))
      setPageErrors({})
      setSelectedPageId(response.project.pages[0]?.id ?? '')
      return response.project
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      setBusy(null)
    }
  }

  async function generatePageImage(targetProject: XhsProject, page: XhsPage, referenceImage?: string): Promise<string | null> {
    setPageStatus((current) => ({ ...current, [page.id]: 'loading' }))
    setPageErrors((current) => ({ ...current, [page.id]: '' }))
    try {
      const response = await generateImage({ project: targetProject, page, referenceImage })
      setImages((current) => ({ ...current, [page.id]: response.image }))
      setPageStatus((current) => ({ ...current, [page.id]: 'done' }))
      return response.image
    } catch (err) {
      setPageStatus((current) => ({ ...current, [page.id]: 'error' }))
      setPageErrors((current) => ({ ...current, [page.id]: err instanceof Error ? err.message : String(err) }))
      return null
    }
  }

  async function generateAllImages(targetProject = project) {
    if (!targetProject) return
    setBusy('images')
    setError('')

    const nextImages: Record<string, string> = {}
    try {
      const cover = targetProject.pages[0]
      let coverImage = ''
      if (cover) {
        const result = await generatePageImage(targetProject, cover)
        if (result) {
          coverImage = result
          nextImages[cover.id] = result
        }
      }

      for (const page of targetProject.pages.slice(1)) {
        const reference = targetProject.config.useCoverReference ? coverImage : undefined
        const result = await generatePageImage(targetProject, page, reference)
        if (result) nextImages[page.id] = result
      }

      const merged = { ...images, ...nextImages }
      setImages(merged)
      const saved = rememberProject(toSavedProject(targetProject, merged))
      setHistory(saved)
    } finally {
      setBusy(null)
    }
  }

  async function generateEverything() {
    setBusy('all')
    const created = await createProject()
    if (created) await generateAllImages(created)
    setBusy(null)
  }

  function loadSaved(item: SavedProject) {
    setProject(item)
    setConfig(item.config)
    setTopic(item.topic)
    setImages(item.images ?? {})
    setPageStatus(Object.fromEntries(item.pages.map((page) => [page.id, item.images?.[page.id] ? 'done' : 'idle'])))
    setPageErrors({})
    setSelectedPageId(item.pages[0]?.id ?? '')
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
    if (!project) return
    const blob = exportProjectZip(project, images)
    downloadBlob(blob, `${project.topic.slice(0, 18) || 'red-image-studio'}.zip`)
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
            <p>小红书图文工作台</p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className={classNames('status-pill', health?.hasApiKey ? 'ok' : 'warn')}>
            {health?.hasApiKey ? 'OpenAI 已配置' : '模拟模式'}
          </span>
          <span className="status-pill">{health?.imageModel ?? 'gpt-image-2'}</span>
          <span className="status-pill api-url">{health?.apiBaseUrl ?? 'https://api.openai.com/v1'}</span>
        </div>
      </header>

      <main className="workspace">
        <section className="panel composer" aria-label="生成设置">
          <div className="panel-title">
            <WandSparkles size={20} aria-hidden="true" />
            <h2>生成</h2>
          </div>

          <label className="field-block">
            <span>选题</span>
            <textarea value={topic} onChange={(event) => setTopic(event.target.value)} rows={5} />
          </label>

          <div className="field-grid">
            <label className="field-block">
              <span>领域</span>
              <select value={config.field} onChange={(event) => setConfig({ ...config, field: event.target.value as Field })}>
                {fields.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field-block">
              <span>风格</span>
              <select value={config.visualStyle} onChange={(event) => setConfig({ ...config, visualStyle: event.target.value as VisualStyle })}>
                {styles.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <label className="field-block">
            <span>目标读者</span>
            <input value={config.audience} onChange={(event) => setConfig({ ...config, audience: event.target.value })} />
          </label>

          <div className="range-row">
            <label htmlFor="page-count">页数</label>
            <strong>{config.pageCount}</strong>
            <input
              id="page-count"
              type="range"
              min={3}
              max={8}
              value={config.pageCount}
              onChange={(event) => setConfig({ ...config, pageCount: Number(event.target.value) })}
            />
          </div>

          <div className="field-grid three">
            <label className="field-block">
              <span>尺寸</span>
              <select value={config.size} onChange={(event) => setConfig({ ...config, size: event.target.value })}>
                {sizes.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field-block">
              <span>质量</span>
              <select value={config.quality} onChange={(event) => setConfig({ ...config, quality: event.target.value as ImageQuality })}>
                {['low', 'medium', 'high', 'auto'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field-block">
              <span>格式</span>
              <select value={config.outputFormat} onChange={(event) => setConfig({ ...config, outputFormat: event.target.value as ImageFormat })}>
                {['png', 'jpeg', 'webp'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="toggle-row">
            <label>
              <input
                type="checkbox"
                checked={config.useCoverReference}
                onChange={(event) => setConfig({ ...config, useCoverReference: event.target.checked })}
              />
              <span>用封面统一后续页面</span>
            </label>
            <select
              aria-label="内容审核强度"
              value={config.moderation}
              onChange={(event) => setConfig({ ...config, moderation: event.target.value as ModerationLevel })}
            >
              <option value="auto">moderation auto</option>
              <option value="low">moderation low</option>
            </select>
          </div>

          {error && <div className="error-box" role="alert">{error}</div>}

          <div className="button-row">
            <button className="secondary-button" type="button" onClick={createProject} disabled={Boolean(busy)}>
              {busy === 'compose' ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
              生成方案
            </button>
            <button className="primary-button" type="button" onClick={generateEverything} disabled={Boolean(busy)}>
              {busy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}
              生成整套
            </button>
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
                      onClick={() => setSelectedPageId(page.id)}
                    >
                      <div className="page-image">
                        {image ? <img src={image} alt={page.headline} /> : <span>{page.index + 1}</span>}
                      </div>
                      <div className="page-meta">
                        <StatusIcon status={status} />
                        <span>{page.headline}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {selectedPage && (
                <div className="detail-band">
                  <div>
                    <p className="eyebrow">{selectedPage.type} / {selectedPage.index + 1}</p>
                    <h3>{selectedPage.headline}</h3>
                    {selectedPage.subhead && <p>{selectedPage.subhead}</p>}
                    <ul>
                      {selectedPage.bullets.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                    {pageErrors[selectedPage.id] && <div className="error-box">{pageErrors[selectedPage.id]}</div>}
                  </div>
                  <div className="detail-actions">
                    <button type="button" onClick={() => generatePageImage(project, selectedPage, selectedPage.index > 0 ? images[project.pages[0]?.id] : undefined)}>
                      <RefreshCw size={17} />
                      重生成
                    </button>
                    <button type="button" onClick={() => copyText(selectedPage.imagePrompt)}>
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

              <button className="primary-button full" type="button" onClick={() => generateAllImages()} disabled={!project || Boolean(busy)}>
                {busy === 'images' ? <Loader2 className="spin" size={18} /> : <ImageIcon size={18} />}
                生成图片
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
