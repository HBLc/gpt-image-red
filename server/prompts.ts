import type { ComposeRequest, PageType, XhsPage } from '../src/types'

function pageTypeLabel(type: PageType): string {
  if (type === 'cover') return '封面'
  if (type === 'summary') return '总结'
  return '内容'
}

function formatPageContent(page: XhsPage): string {
  return [
    `[${pageTypeLabel(page.type)}]`,
    page.headline ? `标题：${page.headline}` : '',
    page.subhead ? `副标题：${page.subhead}` : '',
    page.bullets.length ? page.bullets.map((item) => `- ${item}`).join('\n') : '',
    page.visualBrief ? `配图建议：${page.visualBrief}` : '',
  ].filter(Boolean).join('\n')
}

function formatFullOutline(pages: XhsPage[]): string {
  return pages.map(formatPageContent).join('\n\n<page>\n\n')
}

export function buildSettingsPrompt(topic: string): string {
  return [
    '你是小红书内容定位助手。',
    '根据选题判断最适合的领域、视觉风格和目标读者。',
    '输出必须是严格 JSON，不要 Markdown，不要解释。',
    '',
    `选题：${topic}`,
    '',
    '可选领域只能是：生活方式、美妆护肤、职场效率、学习成长、旅行探店、美食烘焙、运动健康、母婴家庭、家居收纳、数码工具。',
    '可选视觉风格只能是：清爽实用、杂志质感、手账拼贴、专业干货、温暖日常、科技极简。',
    '',
    'JSON 结构：',
    '{',
    '  "field": "领域",',
    '  "visualStyle": "视觉风格",',
    '  "audience": "目标读者，12到24个中文字符"',
    '}',
  ].join('\n')
}

export function buildContentPrompt({ topic, config }: ComposeRequest): string {
  return [
    '你是一个小红书内容创作专家。',
    '用户会给你一个要求以及说明，你需要生成一个适合小红书的图文内容大纲，并补充发布标题、文案和标签。',
    '输出必须是严格 JSON，不要 Markdown，不要解释。',
    '',
    '用户的要求以及说明：',
    topic,
    '',
    `内容领域：${config.field}`,
    `目标读者：${config.audience || '泛小红书用户'}`,
    `视觉风格：${config.visualStyle}`,
    `生成页数：${config.pageCount}`,
    '',
    'JSON 结构：',
    '{',
    '  "titleOptions": ["标题1", "标题2", "标题3"],',
    '  "caption": "发布正文，使用\\n分段",',
    '  "tags": ["标签1", "标签2"],',
    '  "pages": [',
    '    {',
    '      "type": "cover|content|summary",',
    '      "headline": "页面主标题",',
    '      "subhead": "页面副标题，可为空",',
    '      "bullets": ["页面短句1", "页面短句2"],',
    '      "visualBrief": "画面说明"',
    '    }',
    '  ]',
    '}',
    '',
    '要求：',
    '1. 第一页必须是吸引人的封面/标题页，type 为 cover，包含标题和副标题。',
    '2. 最后一页必须是总结或行动呼吁，type 为 summary。',
    '3. pages 数组必须正好等于生成页数，每个对象代表一页。',
    '4. 每页内容简洁有力，适合配图展示。',
    '5. 使用小红书风格的语言，亲切、有趣、实用。',
    '6. 可以适当使用 emoji 增加趣味性。',
    '7. 内容要具体、详细、专业、有价值，方便后续生成图片。',
    '8. visualBrief 写成配图建议，要能指导图片生成。',
    '9. 避免使用 | 竖线符号。',
    '10. 不写夸张医疗、暴富、绝对化承诺。',
    '11. 不出现小红书 logo、水印、账号 ID。',
  ].join('\n')
}

export function buildImagePrompt(args: {
  topic: string
  page: XhsPage
  pageType: PageType
  config: ComposeRequest['config']
  fullPageList: XhsPage[]
  hasReference: boolean
}): string {
  const { topic, page, pageType, config, fullPageList, hasReference } = args
  const pageText = formatPageContent(page)
  const outline = formatFullOutline(fullPageList)

  return [
    '请生成一张小红书风格的图文内容图片。',
    '【合规特别注意的】注意不要带有任何小红书的 logo，不要有右下角的用户 id 以及 logo。',
    '【合规特别注意的】如果参考图片里有水印和 logo，请一定要去掉。',
    '',
    '页面内容：',
    pageText,
    '',
    `页面类型：${pageTypeLabel(pageType)}`,
    '',
    hasReference
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
    `- 符合「${config.visualStyle}」视觉风格`,
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
    topic,
    '',
    `内容领域：${config.field}`,
    `目标读者：${config.audience || '泛小红书用户'}`,
    '',
    '完整内容大纲参考：',
    '---',
    outline,
    '---',
    '',
    '请根据以上要求，生成一张精美的小红书风格图片。请直接给出图片。',
  ].join('\n')
}
