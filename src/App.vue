<template>
  <div id="app" class="app-container">
    <div class="left-panel">
      <div class="panel-section input-section">
        <h3 class="section-title">数据记录 & 文件导入</h3>
        <div class="file-upload">
          <label for="file-input" class="file-btn">选择文件导入</label>
          <input
            id="file-input"
            type="file"
            class="file-input"
            accept=".txt,.json,.csv"
            @change="handleFileUpload"
          />
        </div>
        <textarea
          v-model="inputRecord"
          class="record-input"
          placeholder="输入任意文字，或导入 txt/json/csv。提交后将按主题（学习、工作、生活等）归类并在右侧以主题色小球展示。"
          @input="handleInputChange"
        ></textarea>
        <div class="btn-group">
          <button type="button" class="submit-btn" @click="submitRecord">提交分析</button>
          <button type="button" class="clear-btn" @click="clearInput">清空内容</button>
        </div>
      </div>

      <!-- 对话/记录总结 -->
      <div class="panel-section summary-section">
        <h3 class="section-title">内容总结</h3>
        <div v-if="summaryLines.length" class="summary-box">
          <p v-for="(line, idx) in summaryLines" :key="idx" class="summary-line">{{ line }}</p>
        </div>
        <div v-else class="empty-tip">提交分析后，这里会概括文本涉及的主题与大意</div>
      </div>

      <div class="panel-section analysis-section">
        <h3 class="section-title">分析结果</h3>
        <div v-if="analysisTips.length > 0" class="analysis-tips">
          <div v-for="(tip, idx) in analysisTips" :key="idx" class="tip-item">{{ tip }}</div>
        </div>
        <div v-else class="empty-tip">输入或导入后点击「提交分析」</div>
      </div>

      <div class="panel-section recommend-section">
        <h3 class="section-title">智能推荐</h3>
        <div v-if="recommendList.length === 0" class="empty-tip small">暂无推荐，请先提交分析</div>
        <div v-for="(item, idx) in recommendList" :key="idx" class="recommend-card">
          <div class="recommend-color" :style="{ backgroundColor: item.color }"></div>
          <div class="recommend-content">
            <div class="recommend-title">{{ item.title }}</div>
            <div class="recommend-desc">{{ item.desc }}</div>
          </div>
          <button type="button" class="recommend-btn" @click="selectRecommend(item)">选中</button>
        </div>
      </div>
    </div>

    <div class="right-3d-container">
      <div class="color-tag-bar">
        <div class="tag-item all-tag" @click="showAllColors">全部显示</div>
        <div
          v-for="(tag, index) in topicTagList"
          :key="tag.key + index"
          class="tag-item"
          :style="{
            backgroundColor: tag.hex,
            borderColor: activeColorIndex === index ? '#fff' : 'transparent',
          }"
          @click="highlightColor(index)"
        >
          {{ tag.name }}
        </div>
      </div>

      <div id="three-container"></div>

      <div
        id="ball-info-panel"
        class="info-panel"
        :style="{ display: panelVisible ? 'block' : 'none', left: panelX + 'px', top: panelY + 'px' }"
      >
        <div class="panel-header">
          <div class="color-dot" :style="{ backgroundColor: panelColor }"></div>
          <span>片段信息</span>
        </div>
        <div class="panel-body">
          <p><strong>主题：</strong>{{ panelGroup }}</p>
          <p class="snippet-text"><strong>识别文本：</strong>{{ panelSnippet }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { analyzeText, hexToThreeColor } from './textAnalysis.js'

let scene, camera, renderer, controls, raycaster, mouse
let ballGroup = null
let ballMeshes = []
let dotsData = []

const inputRecord = ref('')
const analysisTips = ref([])
const summaryLines = ref([])
const recommendList = ref([])

const topicTagList = ref([])

const panelVisible = ref(false)
const panelX = ref(0)
const panelY = ref(0)
const panelColor = ref('')
const panelGroup = ref('')
const panelSnippet = ref('')

const activeColorIndex = ref(-1)

function disposeGroupContents(group) {
  if (!group) return
  while (group.children.length) {
    const obj = group.children[0]
    group.remove(obj)
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
      else obj.material.dispose()
    }
  }
}

function buildRecommendFromCategories(categories) {
  return categories.slice(0, 6).map((c, idx) => ({
    color: c.hex,
    title: `${c.name}`,
    desc: `本主题下共 ${c.count} 条文本片段`,
    categoryIndex: idx,
  }))
}

function createDotsFromAnalysis(fragments, categories) {
  const dots = []
  const groupCount = Math.max(categories.length, 1)

  fragments.forEach((f, globalIndex) => {
    const gi = Math.min(f.categoryIndex, categories.length - 1)
    const sector = (gi / groupCount) * Math.PI * 2
    const r = THREE.MathUtils.randFloat(7, 15)
    const theta = sector + THREE.MathUtils.randFloat(-0.45, 0.45)
    const phi = THREE.MathUtils.randFloat(0.35, Math.PI - 0.35)
    const p = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    )
    const hex = categories[gi]?.hex ?? '#888888'
    const color = hexToThreeColor(hex)
    dots.push({
      pos: p,
      color,
      groupIndex: gi,
      globalIndex,
      colorName: categories[gi]?.name ?? '未分类',
      snippet: f.text,
      topicName: f.topicName,
    })
  })
  return dots
}

function addLinesToGroup(group, dots, categories) {
  const byGroup = categories.map((_, i) => dots.filter((d) => d.groupIndex === i))
  byGroup.forEach((g, i) => {
    const col = hexToThreeColor(categories[i].hex)
    for (let a = 0; a < g.length; a++) {
      for (let b = a + 1; b < Math.min(g.length, 12); b++) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([g[a].pos, g[b].pos])
        const lineMat = new THREE.LineDashedMaterial({
          color: col,
          dashSize: 0.3,
          gapSize: 0.15,
          transparent: true,
          opacity: 0.32,
        })
        const line = new THREE.Line(lineGeo, lineMat)
        line.computeLineDistances()
        group.add(line)
      }
    }
  })
  for (let i = 0; i < byGroup.length - 1; i++) {
    const g1 = byGroup[i]
    const g2 = byGroup[i + 1]
    if (!g1?.length || !g2?.length) continue
    for (let a = 0; a < Math.min(g1.length, 2); a++) {
      for (let b = 0; b < Math.min(g2.length, 2); b++) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([g1[a].pos, g2[b].pos])
        const lineMat = new THREE.LineDashedMaterial({
          color: 0x666666,
          dashSize: 0.3,
          gapSize: 0.15,
          transparent: true,
          opacity: 0.12,
        })
        const line = new THREE.Line(lineGeo, lineMat)
        line.computeLineDistances()
        group.add(line)
      }
    }
  }
}

function rebuildSceneFromAnalysis(text) {
  const { categories, fragments, summaryLines: sums } = analyzeText(text)
  summaryLines.value = sums

  if (!fragments.length) {
    analysisTips.value = ['未从文本中切分出有效片段，请换行或句号分隔多句后再试。']
    topicTagList.value = []
    recommendList.value = []
    disposeGroupContents(ballGroup)
    ballMeshes = []
    dotsData = []
    return
  }

  topicTagList.value = categories.map((c) => ({
    name: c.name,
    hex: c.hex,
    key: c.key,
  }))

  recommendList.value = buildRecommendFromCategories(categories)

  const dots = createDotsFromAnalysis(fragments, categories)
  dotsData = dots

  disposeGroupContents(ballGroup)
  ballMeshes = []

  dots.forEach((d) => {
    const g = new THREE.SphereGeometry(0.25, 14, 14)
    const m = new THREE.MeshBasicMaterial({
      color: d.color,
      transparent: true,
      opacity: 1,
    })
    const mesh = new THREE.Mesh(g, m)
    mesh.position.copy(d.pos)
    mesh.userData = { ...d }
    ballGroup.add(mesh)
    ballMeshes.push(mesh)
  })

  addLinesToGroup(ballGroup, dots, categories)
  showAllColors()
}

function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target.result
    if (file.name.endsWith('.txt')) {
      inputRecord.value = content
      analysisTips.value = [`已导入 TXT：${file.name}`, '可点击「提交分析」生成主题与 3D 视图']
    } else if (file.name.endsWith('.json')) {
      try {
        const json = JSON.parse(content)
        inputRecord.value = json.desc || json.text || JSON.stringify(json, null, 2)
        analysisTips.value = [
          `已导入 JSON：${file.name}`,
          json.highlight ? `字段 highlight：${json.highlight}` : '未包含 highlight 字段',
        ]
      } catch {
        analysisTips.value = [`JSON 解析失败：${file.name}`]
      }
    } else if (file.name.endsWith('.csv')) {
      inputRecord.value = content
      analysisTips.value = [`已导入 CSV：${file.name}`, '提交后将按内容做主题归类']
    } else {
      analysisTips.value = [`不支持的类型：${file.name}`]
    }
    event.target.value = ''
  }
  reader.readAsText(file)
}

function clearInput() {
  inputRecord.value = ''
  analysisTips.value = []
  summaryLines.value = []
  recommendList.value = []
  topicTagList.value = []
  disposeGroupContents(ballGroup)
  ballMeshes = []
  dotsData = []
  panelVisible.value = false
  showAllColors()
}

function handleInputChange() {
  const t = inputRecord.value
  if (!t.trim()) {
    analysisTips.value = []
    return
  }
  analysisTips.value = ['输入已更新，点击「提交分析」后刷新主题标签与 3D 小球']
}

function submitRecord() {
  if (!inputRecord.value.trim()) {
    analysisTips.value = ['请输入有效内容或导入文件']
    return
  }
  rebuildSceneFromAnalysis(inputRecord.value)
  analysisTips.value.unshift('分析完成：已根据文本生成主题维度与片段小球')
}

function selectRecommend(item) {
  const idx = item.categoryIndex
  if (idx >= 0) highlightColor(idx)
  inputRecord.value = `${inputRecord.value}\n【关注主题】${item.title}`
  handleInputChange()
}

function highlightColor(index) {
  activeColorIndex.value = index
  ballMeshes.forEach((mesh) => {
    const dotGroupIndex = mesh.userData.groupIndex
    if (dotGroupIndex === index) {
      mesh.scale.set(1.75, 1.75, 1.75)
      mesh.material.opacity = 1
      mesh.material.needsUpdate = true
    } else {
      mesh.scale.set(1, 1, 1)
      mesh.material.opacity = 0.22
      mesh.material.needsUpdate = true
    }
  })
}

function showAllColors() {
  activeColorIndex.value = -1
  ballMeshes.forEach((mesh) => {
    mesh.scale.set(1, 1, 1)
    mesh.material.opacity = 1
    mesh.material.needsUpdate = true
  })
}

let canvasEl = null
function onCanvasMouseMove(event) {
  if (!renderer || !ballMeshes.length) {
    panelVisible.value = false
    return
  }
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  const intersects = raycaster.intersectObjects(ballMeshes)

  if (intersects.length > 0) {
    const hitBall = intersects[0].object
    const ballData = hitBall.userData
    panelX.value = event.clientX + 12
    panelY.value = event.clientY + 12
    panelColor.value =
      topicTagList.value[ballData.groupIndex]?.hex ?? `#${ballData.color.toString(16).padStart(6, '0')}`
    panelGroup.value = ballData.colorName || ballData.topicName || '未知主题'
    panelSnippet.value = ballData.snippet || ''

    panelVisible.value = true

    if (activeColorIndex.value === -1) {
      hitBall.scale.set(1.45, 1.45, 1.45)
      ballMeshes.forEach((mesh) => {
        if (mesh !== hitBall) mesh.scale.set(1, 1, 1)
      })
    }
  } else {
    panelVisible.value = false
    if (activeColorIndex.value === -1) {
      ballMeshes.forEach((mesh) => mesh.scale.set(1, 1, 1))
    }
  }
}

function onMouseLeaveCanvas() {
  panelVisible.value = false
  if (activeColorIndex.value === -1) {
    ballMeshes.forEach((mesh) => mesh.scale.set(1, 1, 1))
  }
}

function onResize() {
  if (!camera || !renderer) return
  camera.aspect = (window.innerWidth * 0.7) / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth * 0.7, window.innerHeight)
  controls?.update()
}

function animate() {
  requestAnimationFrame(animate)
  controls?.update()
  if (renderer && scene && camera) renderer.render(scene, camera)
}

onMounted(() => {
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x080808)

  camera = new THREE.PerspectiveCamera(60, (window.innerWidth * 0.7) / window.innerHeight, 0.1, 200)
  camera.position.set(22, 22, 30)
  camera.lookAt(new THREE.Vector3(0, 0, 0))

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth * 0.7, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const container = document.getElementById('three-container')
  container.appendChild(renderer.domElement)
  canvasEl = renderer.domElement

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = 12
  controls.maxDistance = 50
  controls.target = new THREE.Vector3(0, 0, 0)
  controls.update()

  ballGroup = new THREE.Group()
  scene.add(ballGroup)

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  canvasEl.addEventListener('mousemove', onCanvasMouseMove)
  canvasEl.addEventListener('mouseleave', onMouseLeaveCanvas)

  window.addEventListener('resize', onResize)
  animate()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (canvasEl) {
    canvasEl.removeEventListener('mousemove', onCanvasMouseMove)
    canvasEl.removeEventListener('mouseleave', onMouseLeaveCanvas)
  }
  disposeGroupContents(ballGroup)
  renderer?.dispose()
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}
body {
  overflow: hidden;
  background: #080808;
  font-family: 'Microsoft Yahei', sans-serif;
}

.app-container {
  display: flex;
  width: 100vw;
  height: 100vh;
}

.left-panel {
  width: 30%;
  height: 100vh;
  background: #121212;
  padding: 20px;
  overflow-y: auto;
  border-right: 1px solid #222;
}
.panel-section {
  margin-bottom: 24px;
}
.section-title {
  color: #fff;
  font-size: 18px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.file-upload {
  margin-bottom: 10px;
}
.file-btn {
  display: inline-block;
  width: 100%;
  height: 40px;
  line-height: 40px;
  text-align: center;
  background: #1e1e1e;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 10px;
}
.file-input {
  display: none;
}
.record-input {
  width: 100%;
  height: 160px;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 10px;
  color: #fff;
  font-size: 14px;
  resize: none;
  margin-bottom: 10px;
  line-height: 1.6;
}
.btn-group {
  display: flex;
  gap: 10px;
}
.submit-btn {
  flex: 2;
  height: 40px;
  background: #2196f3;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}
.submit-btn:hover {
  background: #1976d2;
}
.clear-btn {
  flex: 1;
  height: 40px;
  background: #666;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.3s;
}
.clear-btn:hover {
  background: #444;
}

.summary-box {
  background: #1a2332;
  border: 1px solid #2a3f5f;
  border-radius: 6px;
  padding: 12px;
  max-height: 220px;
  overflow-y: auto;
}
.summary-line {
  color: #b0c4de;
  font-size: 13px;
  line-height: 1.65;
  margin-bottom: 8px;
}
.summary-line:last-child {
  margin-bottom: 0;
}

.analysis-tips {
  background: #1e1e1e;
  border-radius: 6px;
  padding: 10px;
  max-height: 160px;
  overflow-y: auto;
}
.tip-item {
  color: #e0e0e0;
  font-size: 14px;
  line-height: 1.6;
  margin-bottom: 5px;
}
.tip-item:first-child {
  color: #4caf50;
  font-weight: bold;
}
.empty-tip {
  color: #666;
  font-size: 14px;
  text-align: center;
  padding: 10px;
}
.empty-tip.small {
  padding: 6px;
  font-size: 13px;
}

.recommend-card {
  display: flex;
  align-items: center;
  background: #1e1e1e;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 10px;
}
.recommend-color {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  margin-right: 10px;
  flex-shrink: 0;
}
.recommend-content {
  flex: 1;
  min-width: 0;
}
.recommend-title {
  color: #fff;
  font-size: 14px;
  margin-bottom: 3px;
}
.recommend-desc {
  color: #999;
  font-size: 12px;
}
.recommend-btn {
  background: #4caf50;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}
.recommend-btn:hover {
  background: #388e3c;
}

.right-3d-container {
  width: 70%;
  height: 100vh;
  position: relative;
}
#three-container {
  width: 100%;
  height: 100%;
  cursor: crosshair;
}

.color-tag-bar {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 998;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}
.tag-item {
  min-width: 100px;
  max-width: 140px;
  min-height: 36px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 2px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  word-break: break-all;
}
.tag-item.all-tag {
  background: #333;
}
.tag-item:hover {
  transform: translateX(3px);
}

.info-panel {
  position: fixed;
  z-index: 999;
  max-width: min(360px, 42vw);
  background: rgba(16, 16, 16, 0.96);
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
  pointer-events: none;
}
.info-panel .panel-header {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.info-panel .color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 8px;
  flex-shrink: 0;
}
.info-panel .panel-body p {
  margin: 6px 0;
  color: #e0e0e0;
}
.info-panel .panel-body strong {
  color: #fff;
}
.snippet-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}
</style>
