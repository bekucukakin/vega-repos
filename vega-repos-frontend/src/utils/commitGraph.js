export const BRANCH_COLORS = [
  '#0ea5e9',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#06b6d4',
  '#ef4444',
  '#8b5cf6',
  '#10b981',
  '#f97316',
]

export function buildGraphLayout(commits) {
  if (!commits || commits.length === 0) return []

  const branchColorMap = new Map()
  let colorIdx = 0
  commits.forEach((c) => {
    ;(c.branches || []).forEach((b) => {
      if (!branchColorMap.has(b)) {
        branchColorMap.set(b, BRANCH_COLORS[colorIdx++ % BRANCH_COLORS.length])
      }
    })
  })

  const lanes = []
  const hashToLane = new Map()
  const laneColorArr = []

  const result = commits.map((c) => {
    const activeLanesBefore = [...lanes]
    const laneColorsBefore = [...laneColorArr]

    const wasPreAssigned = hashToLane.has(c.fullHash)
    let col
    if (wasPreAssigned) {
      col = hashToLane.get(c.fullHash)
    } else {
      col = lanes.indexOf(null)
      if (col === -1) { col = lanes.length; lanes.push(null); laneColorArr.push(null) }
    }

    let color
    if (c.branches?.length > 0) {
      color = branchColorMap.get(c.branches[0]) || BRANCH_COLORS[col % BRANCH_COLORS.length]
    } else {
      color = laneColorArr[col] || BRANCH_COLORS[col % BRANCH_COLORS.length]
    }
    laneColorArr[col] = color

    lanes[col] = null
    hashToLane.delete(c.fullHash)

    const p1 = c.parentHash || null
    const p2 = c.secondParentHash || c.mergeParentHash ||
      (Array.isArray(c.parentHashes) && c.parentHashes.length > 1 ? c.parentHashes[1] : null)

    let parentCol = null
    if (p1) {
      if (hashToLane.has(p1)) {
        parentCol = hashToLane.get(p1)
      } else {
        lanes[col] = p1
        hashToLane.set(p1, col)
        parentCol = col
      }
    }

    let secondParentCol = null
    if (p2) {
      if (hashToLane.has(p2)) {
        secondParentCol = hashToLane.get(p2)
      } else {
        let newCol = lanes.indexOf(null)
        if (newCol === -1) { newCol = lanes.length; lanes.push(null); laneColorArr.push(null) }
        lanes[newCol] = p2
        hashToLane.set(p2, newCol)
        laneColorArr[newCol] = color
        secondParentCol = newCol
      }
    }

    if (lanes[col] === null) {
      laneColorArr[col] = null
    }

    return {
      ...c,
      col,
      parentCol,
      secondParentCol,
      color,
      isMerge: !!p2,
      hasLineAbove: wasPreAssigned,
      activeLanesBefore,
      laneColorsBefore,
    }
  })

  let maxLanes = 1
  result.forEach((r) => { if (r.activeLanesBefore.length > maxLanes) maxLanes = r.activeLanesBefore.length })
  maxLanes = Math.max(maxLanes, lanes.length, 1)
  return result.map((r) => ({ ...r, totalLanes: maxLanes }))
}
