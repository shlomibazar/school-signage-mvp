// Readable fallback for a table too wide for its TV region: split it into column groups stacked
// vertically. Every group keeps all rows (so the header row repeats) and, when it is safe, repeats the
// identifying first column. Merged cells are respected: a group boundary never cuts through a cell
// that spans columns; a row that spans the whole table (a title) appears once, in the first group.
// Browser only (works on the rendered table). Returns null when the table cannot be split safely.

type Slot = { cell: HTMLTableCellElement; row: number; col: number }

/** The table as a grid: grid[r][c] is the cell covering that slot (with its origin row/column). */
function buildGrid(table: HTMLTableElement): Slot[][] | null {
  const grid: Slot[][] = []
  const rows = [...table.rows]
  rows.forEach((tr, r) => {
    grid[r] ??= []
    let c = 0
    for (const cell of tr.cells) {
      while (grid[r][c]) c++
      const cs = Math.max(1, cell.colSpan || 1), rs = Math.max(1, Math.min(cell.rowSpan || 1, rows.length - r))
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) {
        grid[r + dr] ??= []
        if (grid[r + dr][c + dc]) return // overlapping cells: malformed
        grid[r + dr][c + dc] = { cell, row: r, col: c }
      }
      c += cs
    }
  })
  const width = Math.max(0, ...grid.map(r => r.length))
  // Every slot must be filled for a safe split (ragged tables are left as they are).
  if (!width || grid.some(r => r.length !== width || r.some(s => !s))) return null
  return grid
}

/** A cell that spans the whole width (e.g. a title row). */
const fullWidth = (s: Slot, width: number) => s.col === 0 && (s.cell.colSpan || 1) >= width

/** Whether a group boundary between column k-1 and k cuts no cell (full-width rows excepted). */
function safeBoundary(grid: Slot[][], k: number, width: number): boolean {
  return grid.every(row => {
    const s = row[k]
    return !s || fullWidth(s, width) || s.col === k
  })
}

/** Measured width of each column (from cells spanning one column), in px. */
function columnWidths(grid: Slot[][], width: number): number[] {
  const w = new Array(width).fill(0)
  for (const row of grid) for (const s of row) {
    if ((s.cell.colSpan || 1) === 1 && s.row === grid.indexOf(row)) w[s.col] = Math.max(w[s.col], s.cell.offsetWidth) // layout px (unaffected by a scaled preview)
  }
  const known = w.filter(x => x > 0)
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 80
  return w.map(x => x || avg)
}

/**
 * Splits `table` into stacked tables that each fit `room` px. Returns the wrapper element that
 * replaced it, or null (table left unchanged) when it cannot be split safely.
 */
export function splitTableIntoColumnGroups(table: HTMLTableElement, room: number): HTMLElement | null {
  const grid = buildGrid(table)
  if (!grid || !grid.length) return null
  const width = grid[0].length
  if (width < 3) return null
  const widths = columnWidths(grid, width)
  // Repeat the first column when it is its own column in every row (not merged into the next).
  const repeatKey = safeBoundary(grid, 1, width)
  const keyW = repeatKey ? widths[0] : 0

  // Greedy groups: as many columns as fit next to the key column; boundaries only where safe.
  const groups: [number, number][] = []
  let start = 0
  while (start < width) {
    const extra = start > 0 && repeatKey ? keyW : 0
    let end = start, used = extra, lastSafe = -1
    while (end < width && (end === start || used + widths[end] <= room)) {
      used += widths[end]; end++
      if (end === width || safeBoundary(grid, end, width)) lastSafe = end
    }
    if (lastSafe <= start) {
      // No safe boundary within the room: extend to the next safe boundary (may need squeezing).
      let k = end
      while (k < width && !safeBoundary(grid, k, width)) k++
      lastSafe = k
    }
    groups.push([start, lastSafe])
    start = lastSafe
  }
  if (groups.length < 2) return null

  const wrapper = document.createElement('div')
  wrapper.className = 'tv-ann-groups'
  groups.forEach(([a, b], gi) => {
    const cols = new Set<number>()
    if (gi > 0 && repeatKey) cols.add(0)
    for (let c = a; c < b; c++) cols.add(c)
    const groupWidth = cols.size
    const t = document.createElement('table')
    for (const attr of ['dir', 'style', 'align']) { const v = table.getAttribute(attr); if (v) t.setAttribute(attr, v) }
    t.style.fontSize = ''; t.style.width = ''; t.style.maxWidth = '' // measuring styles are not kept
    const body = document.createElement('tbody')
    grid.forEach((row, r) => {
      const tr = document.createElement('tr')
      const src = table.rows[r]
      for (const attr of ['style', 'dir', 'align']) { const v = src.getAttribute(attr); if (v) tr.setAttribute(attr, v) }
      for (const c of [...cols].sort((x, y) => x - y)) {
        const s = row[c]
        if (s.row !== r || s.col !== c) continue // covered by a merged cell placed elsewhere
        if (fullWidth(s, width)) {
          if (gi > 0) continue // title row: once, in the first group
          const clone = s.cell.cloneNode(true) as HTMLTableCellElement
          clone.colSpan = groupWidth
          tr.appendChild(clone)
          continue
        }
        const clone = s.cell.cloneNode(true) as HTMLTableCellElement
        if (gi > 0 && c === 0 && repeatKey) clone.classList.add('tv-ann-key')
        tr.appendChild(clone)
      }
      body.appendChild(tr)
    })
    t.appendChild(body)
    wrapper.appendChild(t)
  })
  table.replaceWith(wrapper)
  ;(wrapper as HTMLElement & { tvOriginal?: HTMLTableElement }).tvOriginal = table
  return wrapper
}

/** Puts back the original tables replaced by splitTableIntoColumnGroups (before measuring again). */
export function restoreColumnGroups(root: HTMLElement) {
  for (const w of root.querySelectorAll<HTMLElement & { tvOriginal?: HTMLTableElement }>('.tv-ann-groups')) {
    if (w.tvOriginal) w.replaceWith(w.tvOriginal)
  }
}
