import type { ComposeRequest, PageType, ProjectMode, XhsPage } from '../src/types'

function getMode(config: ComposeRequest['config']): ProjectMode {
  return config.mode ?? 'xhs'
}

function pageTypeLabel(type: PageType, mode: ProjectMode): string {
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

function outlineSafetyRules(mode: ProjectMode): string[] {
  const visualName = mode === 'taobao' ? '画面说明' : 'visualBrief'
  return [
    '安全约束：',
    `- ${visualName} 不要设计裸露、半裸、洗澡过程、身体清洁动作、身体接触、隐私部位、病变部位特写、治疗前后对比。`,
    '- 涉及婴幼儿、儿童、身体护理、皮肤、减脂、医美、疾病、药品或功效时，优先设计静物、用品清单、步骤卡、流程图、图标、信息卡、家居场景、商品细节或包装画面。',
    '- 不要写治疗、治愈、绝对安全、保证有效、永久、无副作用等无法证明或医疗化表述。',
  ]
}

function imageSafetyRules(): string[] {
  return [
    '【安全画面规则】如果主题涉及婴幼儿、儿童、身体护理、洗澡、皮肤、减脂、医美、疾病、药品或功效，请改用静物、用品清单、步骤卡、流程图、图标、信息卡、家居场景、商品细节或包装画面表达。',
    '【安全画面规则】不要生成裸露、半裸、洗澡过程、身体清洁动作、身体接触、隐私部位、病变部位特写、治疗前后对比、真实儿童身体或正在洗澡的人像。',
    '【安全画面规则】不要生成治疗、治愈、绝对安全、保证有效、永久、无副作用等无法证明或医疗化承诺。',
  ]
}

export function buildSettingsPrompt(topic: string, mode: ProjectMode = 'xhs'): string {
  if (mode === 'taobao') {
    return [
      '你是淘宝电商商品定位助手。',
      '根据商品或活动描述判断最适合的商品领域、视觉风格和目标买家。',
      '输出必须是严格 JSON，不要 Markdown，不要解释。',
      '',
      `商品或活动：${topic}`,
      '',
      '可选领域只能是：生活方式、美妆护肤、职场效率、学习成长、旅行探店、美食烘焙、运动健康、母婴家庭、家居收纳、数码工具。',
      '可选视觉风格只能是：清爽实用、杂志质感、手账拼贴、专业干货、温暖日常、科技极简。',
      '',
      'JSON 结构：',
      '{',
      '  "field": "领域",',
      '  "visualStyle": "视觉风格",',
      '  "audience": "目标买家，12到24个中文字符"',
      '}',
    ].join('\n')
  }

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

export function buildCompetitionSeriesPrompt(requirement: string, count: number): string {
  return [
    '你是参赛视觉系列策划。用户会给你比赛要求，你需要把它拆成一套风格统一、内容有关联、每张任务不同的参赛系列图方案。',
    '输出必须是严格 JSON，不要 Markdown，不要解释。',
    '',
    '比赛要求：',
    requirement,
    '',
    `生成张数：${count}`,
    '',
    'JSON 结构：',
    '{',
    '  "title": "系列标题，12到28个中文字符",',
    '  "styleGuide": "统一视觉规范，写清主色、辅色、字体气质、构图规则、光影、材质、装饰元素、留白和整体情绪，80到160个中文字符",',
    '  "images": [',
    '    {',
    '      "index": 1,',
    '      "title": "当前图标题，6到18个中文字符",',
    '      "role": "当前图在整套参赛系列中的作用",',
    '      "visualBrief": "当前图画面任务，必须和比赛要求相关，同时和其他图有差异",',
    '      "onImageText": "建议出现在图上的短文案，可为空"',
    '    }',
    '  ]',
    '}',
    '',
    '要求：',
    '- images 数组必须正好等于生成张数。',
    '- 每张图都必须服务同一个比赛主题，不要做成互不相关的候选图。',
    '- 每张图的主体、视角、场景或信息层级要不同。',
    '- 所有图片必须共享同一套主色、字体气质、材质、光影、构图秩序和装饰元素。',
    '- 第一张适合作为系列主视觉或总引入。',
    '- 最后一张适合作为总结、成果展示或评审记忆点。',
    '- 不要出现水印、二维码、平台 UI、版权标识。',
    '- 避免裸露、暴力、医疗治疗、真实儿童身体、隐私部位、绝对化功效等高风险画面。',
  ].join('\n')
}

export function buildContentPrompt({ topic, config }: ComposeRequest): string {
  if (getMode(config) === 'taobao') {
    return [
      '你是淘宝电商视觉策划和商品卖点编辑。',
      '用户会给你商品或活动描述，你需要生成一套可直接出淘宝宣传图的图片方案，并补充商品标题、详情文案和卖点标签。',
      '输出必须是严格 JSON，不要 Markdown，不要解释。',
      '',
      '商品或活动：',
      topic,
      '',
      `商品领域：${config.field}`,
      `目标买家：${config.audience || '淘宝潜在买家'}`,
      `视觉风格：${config.visualStyle}`,
      `生成张数：${config.pageCount}`,
      '',
      'JSON 结构：',
      '{',
      '  "titleOptions": ["商品标题1", "商品标题2", "商品标题3"],',
      '  "caption": "详情页或投放文案，使用\\n分段",',
      '  "tags": ["卖点1", "卖点2"],',
      '  "pages": [',
      '    {',
      '      "type": "cover|content|summary",',
      '      "headline": "图片主标题",',
      '      "subhead": "辅助利益点，可为空",',
      '      "bullets": ["商品卖点1", "商品卖点2"],',
      '      "visualBrief": "画面说明"',
      '    }',
      '  ]',
      '}',
      '',
      '要求：',
      ...outlineSafetyRules('taobao'),
      '1. 第一张必须是商品主图，type 为 cover，突出商品主体和核心利益点。',
      '2. 中间页为卖点图、场景图、细节图或对比图，type 为 content。',
      '3. 最后一张为促销收口或购买理由总结，type 为 summary。',
      '4. pages 数组必须正好等于生成张数。',
      '5. 文案要清楚、短促、有转化力，但不要虚假承诺。',
      '6. 每张图都要说明商品主体、背景、卖点文字和视觉重点。',
      '7. 如果用户上传参考图，后续出图要保留商品外观、材质、颜色和主要结构。',
      '8. 不出现淘宝 logo、平台水印、二维码、店铺 ID。',
      '9. 不写医疗、功效、价格、销量等无法从输入证明的绝对化表述。',
    ].join('\n')
  }

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
    ...outlineSafetyRules('xhs'),
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
  const mode = getMode(config)
  const pageText = formatPageContent(page, mode)
  const outline = formatFullOutline(fullPageList, mode)

  if (mode === 'taobao') {
    return [
      '请生成一张淘宝电商风格的商品宣传图。',
      '【合规特别注意】不要带有淘宝 logo、平台水印、二维码、店铺 ID 或手机边框。',
      '【合规特别注意】如果参考图片里有水印、logo、人物隐私信息，请去掉。',
      ...imageSafetyRules(),
      '',
      '当前图片内容：',
      pageText,
      '',
      `图片类型：${pageTypeLabel(pageType, mode)}`,
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
      `- 符合「${config.visualStyle}」视觉风格`,
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
      topic,
      '',
      `商品领域：${config.field}`,
      `目标买家：${config.audience || '淘宝潜在买家'}`,
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
    ...imageSafetyRules(),
    '',
    '页面内容：',
    pageText,
    '',
    `页面类型：${pageTypeLabel(pageType, mode)}`,
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
