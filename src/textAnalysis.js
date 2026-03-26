/**
 * 基于关键词的轻量主题归类与摘要（纯前端，无外部 API）
 */

const TOPIC_PALETTE = [
  '#4CAF50',
  '#2196F3',
  '#FFEB3B',
  '#FF5722',
  '#9C27B0',
  '#E91E63',
  '#00BCD4',
  '#CDDC39',
  '#FF9800',
  '#795548',
  '#607D8B',
  '#F44336',
]

/** 预设主题：名称 + 触发词 */
export const TOPIC_DEFINITIONS = [
  { name: '学习', keys: ['学习', '课', '考试', '读书', '作业', '复习', '考研', '英语', '数学', '学校', '老师', '笔记'] },
  { name: '工作', keys: ['工作', '项目', '会议', '加班', '汇报', '同事', '老板', '职场', '客户', '方案', 'deadline', 'kpi'] },
  { name: '生活', keys: ['生活', '购物', '吃饭', '睡眠', '家务', '租房', '日常', '周末', '旅行'] },
  { name: '运动', keys: ['运动', '跑步', '健身', '游泳', '球', '瑜伽', '锻炼', '马拉松'] },
  { name: '健康', keys: ['健康', '医院', '药', '体检', '养生', '病'] },
  { name: '娱乐', keys: ['游戏', '电影', '音乐', '追剧', '综艺', '娱乐', '放松'] },
  { name: '社交', keys: ['朋友', '聚会', '聊天', '社交', '恋爱', '家人', '约会'] },
  { name: '财务', keys: ['钱', '工资', '投资', '理财', '预算', '消费', '贷款'] },
]

const OTHER_KEY = 'other'

function normalize(s) {
  return String(s || '').trim()
}

/** 按换行、中文句号、分号等切分片段 */
export function splitIntoFragments(text) {
  const t = normalize(text)
  if (!t) return []
  const parts = t.split(/[\n\r]+|[。；;]+|\.(?=\s|$)/).map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0 && t) return [t]
  return parts
}

function scoreTopic(fragment, def) {
  let score = 0
  for (const k of def.keys) {
    if (fragment.includes(k)) score += 2
  }
  return score
}

/** @returns {{ key: string, name: string, defIndex: number }} */
function classifyFragment(fragment) {
  let best = { defIndex: -1, score: 0 }
  TOPIC_DEFINITIONS.forEach((def, i) => {
    const s = scoreTopic(fragment, def)
    if (s > best.score) best = { defIndex: i, score: s }
  })
  if (best.score === 0) {
    return { key: OTHER_KEY, name: '其他', defIndex: -1 }
  }
  const def = TOPIC_DEFINITIONS[best.defIndex]
  return { key: `topic_${best.defIndex}`, name: def.name, defIndex: best.defIndex }
}

/**
 * @returns {{
 *   categories: { name: string, hex: string, count: number }[],
 *   fragments: { text: string, topicName: string, categoryIndex: number }[],
 *   summaryLines: string[]
 * }}
 */
export function analyzeText(raw) {
  const text = normalize(raw)
  const fragmentsRaw = splitIntoFragments(text)

  /** @type {Map<string, { name: string, texts: string[] }>} */
  const buckets = new Map()

  fragmentsRaw.forEach((piece) => {
    const frag = piece.length > 200 ? piece.slice(0, 197) + '…' : piece
    const c = classifyFragment(frag)
    if (!buckets.has(c.key)) {
      buckets.set(c.key, { name: c.name, texts: [] })
    }
    buckets.get(c.key).texts.push(frag)
  })

  const bucketEntries = [...buckets.entries()].sort((a, b) => b[1].texts.length - a[1].texts.length)

  const categories = bucketEntries.map(([key, b], i) => ({
    name: b.name,
    hex: TOPIC_PALETTE[i % TOPIC_PALETTE.length],
    count: b.texts.length,
    key,
  }))

  const keyToCategoryIndex = new Map()
  categories.forEach((c, i) => keyToCategoryIndex.set(c.key, i))

  const fragments = []
  fragmentsRaw.forEach((piece) => {
    const frag = piece.length > 200 ? piece.slice(0, 197) + '…' : piece
    const c = classifyFragment(frag)
    const catIdx = keyToCategoryIndex.get(c.key) ?? 0
    fragments.push({
      text: frag,
      topicName: c.name,
      categoryIndex: catIdx,
    })
  })

  const summaryLines = buildSummary(text, categories, fragments)

  return { categories, fragments, summaryLines }
}

function buildSummary(fullText, categories, fragments) {
  const lines = []
  if (!fullText) {
    lines.push('暂无内容，请在左侧输入或导入文件后点击「提交分析」。')
    return lines
  }

  lines.push(`根据当前文本，共切分 ${fragments.length} 条片段用于主题归类。`)

  if (categories.length === 0) {
    lines.push('未识别出主题分组。')
    return lines
  }

  const top = categories.map((c) => `${c.name}（${c.count}条）`).join('、')
  lines.push(`识别到的主题维度：${top}`)

  const charCount = fullText.length
  lines.push(`原文总长度约 ${charCount} 字。`)

  const dominant = categories[0]
  if (dominant) {
    lines.push(`占比最高的主题为「${dominant.name}」，可结合右侧同色小球查看对应原文句段。`)
  }

  const preview = fullText.length > 160 ? fullText.slice(0, 160) + '…' : fullText
  lines.push(`对话/记录摘要：${preview}`)

  return lines
}

export function hexToThreeColor(hex) {
  return parseInt(String(hex).replace('#', ''), 16)
}
