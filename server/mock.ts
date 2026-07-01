import type { ComposeRequest, GenerateImageRequest, XhsPage, XhsProject } from '../src/types'
import { buildImagePrompt } from './prompts'

function page(id: string, index: number, type: XhsPage['type'], headline: string, subhead: string, bullets: string[], visualBrief: string): XhsPage {
  return {
    id,
    index,
    type,
    headline,
    subhead,
    bullets,
    visualBrief,
    imagePrompt: '',
  }
}

export function createMockProject({ topic, config }: ComposeRequest): XhsProject {
  const mode = config.mode ?? 'xhs'
  if (mode === 'taobao') {
    const taobaoPages = [
      page('cover', 0, 'cover', `${topic || '商品'}高转化主图`, '核心卖点一眼看懂', ['商品主体清楚', '核心利益点突出', '适合列表首屏'], '干净摄影棚背景，商品居中，强光影质感和电商促销角标'),
      page('p1', 1, 'content', '主卖点放大展示', '让买家知道为什么选它', ['功能利益清楚', '材质细节可见', '一句话说明场景'], '商品局部特写、卖点标签和浅色几何背景'),
      page('p2', 2, 'content', '真实使用场景', '把商品放进生活里', ['场景明确', '人物不抢主体', '氛围干净'], '家居或办公场景中使用商品，背景简洁'),
      page('p3', 3, 'content', '细节对比更有说服力', '把优势讲具体', ['细节放大', '对比清楚', '避免夸大承诺'], '左右对比版式，商品细节被高亮'),
      page('summary', 4, 'summary', '下单理由总结', '适合活动页收口', ['核心卖点复盘', '组合利益明确', '行动感强'], '商品套装陈列、优惠标签和清晰购买理由'),
    ]

    const targetCount = Math.max(3, config.pageCount)
    const middle = taobaoPages.filter((item) => item.type === 'content').slice(0, Math.max(1, targetCount - 2))
    const summary = taobaoPages[taobaoPages.length - 1]
    const pages = [taobaoPages[0], ...middle, summary].map((item, index) => ({
      ...item,
      index,
      id: `${item.id}-${index}`,
    }))

    const project: XhsProject = {
      id: `mock-${Date.now()}`,
      topic: topic || '淘宝商品宣传图',
      titleOptions: [
        `${topic || '商品'} 高转化主图文案`,
        `${topic || '商品'} 卖点清晰版宣传图`,
        `${topic || '商品'} 活动页视觉方案`,
      ],
      caption: `这套淘宝宣传图按主图、卖点图、场景图和收口图拆开。\n\n主图负责第一眼点击，卖点图负责解释价值，场景图负责代入，最后一张负责促成下单。`,
      tags: ['主图设计', '商品卖点', '电商宣传图', '活动页', '转化文案'],
      pages: [],
      createdAt: new Date().toISOString(),
      config: {
        ...config,
        mode,
      },
      mock: true,
    }

    project.pages = pages.map((item) => ({
      ...item,
      imagePrompt: buildImagePrompt({
        topic: project.topic,
        page: item,
        pageType: item.type,
        config: project.config,
        fullPageList: pages,
        hasReference: true,
      }),
    }))

    return project
  }

  const basePages = [
    page('cover', 0, 'cover', `${topic || '选题'}这样做更出片`, '一套能直接发布的爆款图文', ['痛点明确', '步骤清楚', '封面先抓眼'], '干净桌面、便签、手机预览和柔和自然光'),
    page('p1', 1, 'content', '先抓一个真实痛点', '别急着堆信息', ['把读者现在的卡点写出来', '第一屏只保留一个主信息'], '人物正在整理灵感卡片，旁边有清晰的信息层级'),
    page('p2', 2, 'content', '内容要像清单一样好收藏', '每页只解决一个问题', ['短句优先', '数字优先', '能照做优先'], '三列清单、重点标记、轻量装饰图标'),
    page('p3', 3, 'content', '视觉统一比花哨重要', '封面决定后续节奏', ['同一套字体层级', '同一组配色', '同一种留白'], '连续卡片预览，颜色和排版保持一致'),
    page('p4', 4, 'content', '标题要给出明确收益', '让读者知道值不值得点开', ['少写空泛形容词', '多写对象、场景、结果'], '标题拆解板，关键词被高亮标记'),
    page('p5', 5, 'content', '标签负责把内容送到对的人面前', '大词和小词一起用', ['一个主标签', '两个场景标签', '两个长尾标签'], '标签分组、内容主题和用户画像连线'),
    page('p6', 6, 'content', '发布后看收藏和完读', '不要只盯点赞', ['收藏说明有价值', '完读说明结构顺', '评论说明有共鸣'], '数据看板、收藏图标、评论气泡和复盘卡片'),
    page('summary', 4, 'summary', '发布前检查这 3 点', '标题、封面、收藏理由', ['第一眼知道讲什么', '第二眼知道能得到什么', '最后有行动引导'], '完成清单、勾选状态、整套图文缩略预览'),
  ]

  const targetCount = Math.max(3, config.pageCount)
  const middle = basePages.filter((item) => item.type === 'content').slice(0, Math.max(1, targetCount - 2))
  const summary = basePages[basePages.length - 1]
  const selected = [basePages[0], ...middle, summary]

  const pages = selected.map((item, index) => ({
    ...item,
    index,
    id: `${item.id}-${index}`,
  }))

  const project: XhsProject = {
    id: `mock-${Date.now()}`,
    topic: topic || '小红书图文选题',
    titleOptions: [
      `${topic || '图文'}这样做，封面点击率更高`,
      `新手也能套用的 ${topic || '爆款图文'} 模板`,
      `别再乱做图文了，先看这套流程`,
    ],
    caption: `这套流程适合先把选题拆成封面、内容页和总结页。\n\n重点不是堆很多信息，而是让每一页都有明确任务：封面负责点击，内容页负责价值，总结页负责收藏。\n\n发布前再检查标题、封面和标签，整套内容会稳很多。`,
    tags: ['小红书运营', '图文排版', '爆款封面', '内容创作', 'AI出图'],
    pages: [],
    createdAt: new Date().toISOString(),
    config: {
      ...config,
      mode,
    },
    mock: true,
  }

  project.pages = pages.map((item) => ({
    ...item,
    imagePrompt: buildImagePrompt({
      topic: project.topic,
      page: item,
      pageType: item.type,
      config: project.config,
      fullPageList: pages,
      hasReference: item.index > 0,
    }),
  }))

  return project
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function createMockImage({ page, project }: GenerateImageRequest): string {
  const isTaobao = project.config.mode === 'taobao'
  const bg = page.type === 'cover' ? '#f8e8df' : page.type === 'summary' ? '#e9f2ed' : '#f6f1e8'
  const accent = page.type === 'cover' ? '#c9382b' : page.type === 'summary' ? '#1f7a5b' : '#2d5f7d'
  const bullets = page.bullets.slice(0, 4)
  const width = isTaobao ? 1024 : 1024
  const height = isTaobao ? 1024 : 1536
  const panelHeight = isTaobao ? 880 : 1392
  const brand = isTaobao ? 'Taobao Promo' : 'Red Image Studio'
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bg}"/>
  <rect x="72" y="72" width="880" height="${panelHeight}" rx="36" fill="#fffdfa" stroke="#241b18" stroke-opacity="0.12" stroke-width="3"/>
  <rect x="112" y="118" width="220" height="54" rx="27" fill="${accent}"/>
  <text x="222" y="154" text-anchor="middle" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="25" font-weight="700" fill="#fff">${brand}</text>
  <text x="112" y="308" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="74" font-weight="800" fill="#241b18">
    ${escapeXml(page.headline)}
  </text>
  <text x="112" y="386" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="34" font-weight="600" fill="${accent}">
    ${escapeXml(page.subhead || project.topic)}
  </text>
  ${bullets.map((item, index) => `
  <g transform="translate(112 ${isTaobao ? 470 + index * 92 : 520 + index * 130})">
    <rect width="800" height="92" rx="24" fill="#ffffff" stroke="${accent}" stroke-opacity="0.26" stroke-width="3"/>
    <circle cx="48" cy="46" r="18" fill="${accent}"/>
    <text x="88" y="56" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="34" font-weight="700" fill="#241b18">${escapeXml(item)}</text>
  </g>`).join('')}
  <rect x="112" y="${isTaobao ? 805 : 1170}" width="800" height="130" rx="30" fill="${accent}" fill-opacity="0.1"/>
  <text x="150" y="${isTaobao ? 860 : 1240}" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="30" font-weight="700" fill="#241b18">${escapeXml(page.visualBrief.slice(0, 28))}</text>
  <text x="150" y="${isTaobao ? 910 : 1298}" font-family="Arial, 'Microsoft YaHei', sans-serif" font-size="24" fill="#6f625c">Mock image. Configure OPENAI_API_KEY for gpt-image-2.</text>
</svg>`.trim()

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}
