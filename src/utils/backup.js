// 数据备份/恢复工具
// 导出为 JSON 文件下载;导入支持「合并」(保留现有,补充新条目)与「覆盖」(清空后写入)两种模式
//
// 注意:衣物图片以 dataURL 内嵌在 JSON 里,大容量衣橱的备份文件会比较大,属正常现象。

export const BACKUP_FORMAT = 'wardrobe-backup'
export const BACKUP_VERSION = 1

const MAX_BACKUP_MB = 200

/**
 * 导出快照为 JSON 文件并触发下载
 * @param {object} snapshot {items, categories, outfits, settings}
 * @returns {Promise<{filename, sizeMB, count}>}
 */
export async function exportBackup(snapshot) {
  const payload = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ...snapshot
  }
  const json = JSON.stringify(payload)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const filename = `衣橱备份_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.json`
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return {
    filename,
    sizeMB: +(blob.size / 1024 / 1024).toFixed(2),
    count: (snapshot.items?.length || 0) + (snapshot.outfits?.length || 0)
  }
}

/**
 * 读取并校验备份文件
 * @param {File} file
 * @returns {Promise<object>} 解析后的数据
 * @throws 文件不合法时抛出带中文提示的 Error
 */
export function parseBackupFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('未选择文件'))
    if (!/\.json$/i.test(file.name || '')) return reject(new Error('请选择 .json 备份文件'))
    if (file.size > MAX_BACKUP_MB * 1024 * 1024) {
      return reject(new Error(`文件过大(>${MAX_BACKUP_MB}MB),请检查是否选错文件`))
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result))
        if (!data || typeof data !== 'object') throw new Error('empty')
        if (data.format !== BACKUP_FORMAT) {
          throw new Error('不是本应用导出的备份文件(格式标识不匹配)')
        }
        if (!Array.isArray(data.items) && !Array.isArray(data.outfits) && !Array.isArray(data.categories)) {
          throw new Error('备份文件里没有衣物/搭配/分类数据')
        }
        // wearLogs 为 v3 新增,旧备份可能没有,兼容处理
        if (!Array.isArray(data.wearLogs)) data.wearLogs = []
        resolve(data)
      } catch (e) {
        reject(new Error(e && e.message && !/empty|JSON/i.test(e.message) ? e.message : '文件解析失败,内容不是合法 JSON'))
      }
    }
    reader.readAsText(file)
  })
}
