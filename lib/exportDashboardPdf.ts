'use client'

import { flushSync } from 'react-dom'

export interface ExportDashboardPdfArgs {
  element: HTMLElement
  /** Absolute row indices into `data` (one PDF page per index). */
  indices: number[]
  /** Update the captured view: data row index and 1-based PDF page / total pages. */
  renderFrame: (dataRowIndex: number, pdfPage: number, pdfTotal: number) => void
  baseFileName: string
  onProgress: (current: number, total: number) => void
}

const PX_TO_MM = 25.4 / 96

function waitFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let i = 0
    const step = () => {
      i += 1
      if (i >= n) resolve()
      else requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}

type PdfDoc = import('jspdf').jsPDF

/**
 * Prefer embedding chart SVGs as vectors (no full-DOM raster). Falls back to html2canvas @ scale 1.
 */
async function addSnapshotPage(
  pdf: PdfDoc,
  element: HTMLElement,
  pageW: number,
  pageH: number,
  margin: number,
): Promise<void> {
  const maxW = pageW - 2 * margin
  const maxH = pageH - 2 * margin
  const headerEl = element.querySelector('.pdf-export-header') as HTMLElement | null
  const chartsRoot = (element.querySelector('.pdf-export-charts') as HTMLElement) ?? element

  const vectorOk = await trySvg2PdfPage(pdf, headerEl, chartsRoot, margin, maxW, maxH)
  if (vectorOk) return

  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(element, {
    scale: 1,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
  })
  const img = canvas.toDataURL('image/jpeg', 0.9)
  let drawW = maxW
  let drawH = (canvas.height * drawW) / canvas.width
  if (drawH > maxH) {
    drawH = maxH
    drawW = (canvas.width * drawH) / canvas.height
  }
  // Top-left align so extra slack is only on bottom/right (feels closer to “fill the page” in landscape).
  const x = margin
  const y = margin
  pdf.addImage(img, 'JPEG', x, y, drawW, drawH)
}

const SVG_STYLE_PROPS = [
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit',
  'opacity', 'display', 'visibility',
  'font-size', 'font-family', 'font-weight', 'font-style',
  'text-anchor', 'dominant-baseline', 'letter-spacing',
] as const

/** Stamp computed CSS values as SVG presentation attributes so svg2pdf sees them. */
function inlineSvgStyles(orig: Element, clone: Element): void {
  const cs = window.getComputedStyle(orig)
  for (const prop of SVG_STYLE_PROPS) {
    const v = cs.getPropertyValue(prop)
    if (v) clone.setAttribute(prop, v)
  }
  const oc = orig.children
  const cc = clone.children
  for (let i = 0; i < oc.length && i < cc.length; i++) {
    inlineSvgStyles(oc[i], cc[i])
  }
}

async function trySvg2PdfPage(
  pdf: PdfDoc,
  headerEl: HTMLElement | null,
  chartsRoot: HTMLElement,
  margin: number,
  maxW: number,
  maxH: number,
): Promise<boolean> {
  try {
    const mod = await import('svg2pdf.js')
    type Svg2PdfFn = (s: SVGSVGElement, p: unknown, o: object) => Promise<unknown> | void
    const anyMod = mod as unknown as Record<string, unknown>
    const svg2pdf = (anyMod['svg2pdf'] ?? anyMod['default']) as Svg2PdfFn | undefined
    if (typeof svg2pdf !== 'function') return false

    const rawSvgs = [...chartsRoot.querySelectorAll('svg')] as SVGSVGElement[]
    const svgs = rawSvgs.filter((svg) => {
      const r = svg.getBoundingClientRect()
      if (r.width < 40 || r.height < 28) return false
      const st = window.getComputedStyle(svg)
      if (st.display === 'none' || st.visibility === 'hidden') return false
      const op = parseFloat(st.opacity)
      if (Number.isFinite(op) && op < 0.05) return false
      return true
    })

    svgs.sort((a, b) => {
      const ra = a.getBoundingClientRect()
      const rb = b.getBoundingClientRect()
      if (Math.abs(ra.top - rb.top) > 1) return ra.top - rb.top
      return ra.left - rb.left
    })

    if (svgs.length === 0) return false

    /** Union of all chart SVG boxes — parent .pdf-export-charts excludes overflow, so sky-plot labels were clipped in PDF. */
    let minL = Infinity
    let minT = Infinity
    let maxR = -Infinity
    let maxB = -Infinity
    for (const svg of svgs) {
      const b = svg.getBoundingClientRect()
      minL = Math.min(minL, b.left)
      minT = Math.min(minT, b.top)
      maxR = Math.max(maxR, b.right)
      maxB = Math.max(maxB, b.bottom)
    }
    const unionW = Math.max(1, maxR - minL)
    const unionH = Math.max(1, maxB - minT)

    let headerMm = 0
    pdf.setFontSize(7.5)
    pdf.setTextColor(35, 35, 40)
    if (headerEl) {
      const text = headerEl.innerText.replace(/\s+/g, ' ').trim()
      if (text) {
        const lines = pdf.splitTextToSize(text, maxW)
        pdf.text(lines, margin, margin + 3)
        headerMm = lines.length * 3.2 + 3.5
      }
    }

    const yContent = margin + headerMm
    const availH = maxH - headerMm
    if (availH < 16) return false

    const wMm = unionW * PX_TO_MM
    const hMm = unionH * PX_TO_MM
    const scale = Math.min(maxW / wMm, availH / hMm)
    if (scale <= 0 || !Number.isFinite(scale)) return false

    const contentWmm = unionW * PX_TO_MM * scale
    const xCenterSlackMm = Math.max(0, (maxW - contentWmm) / 2)

    for (const svg of svgs) {
      const r = svg.getBoundingClientRect()
      const xMm = margin + xCenterSlackMm + (r.left - minL) * PX_TO_MM * scale
      const yMm = yContent + (r.top - minT) * PX_TO_MM * scale
      const sw = r.width * PX_TO_MM * scale
      const sh = r.height * PX_TO_MM * scale
      const clone = svg.cloneNode(true) as SVGSVGElement
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
      if (!clone.getAttribute('width')) clone.setAttribute('width', String(r.width))
      if (!clone.getAttribute('height')) clone.setAttribute('height', String(r.height))
      inlineSvgStyles(svg, clone)
      const out = svg2pdf(clone, pdf, { x: xMm, y: yMm, width: sw, height: sh })
      if (out && typeof (out as Promise<unknown>).then === 'function') await out
    }
    return true
  } catch (e) {
    console.warn('svg2pdf path failed', e)
    return false
  }
}

/**
 * Renders each snapshot index, then adds a PDF page (vector SVGs when possible).
 */
export async function exportDashboardPdf({
  element,
  indices,
  renderFrame,
  baseFileName,
  onProgress,
}: ExportDashboardPdfArgs): Promise<void> {
  if (indices.length === 0) return

  const { jsPDF } = await import('jspdf')

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  pdf.setDisplayMode('fullpage', 'single', null)
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 2.5

  const safeBase = baseFileName.replace(/[^\w\-./()[\] ]+/g, '_').slice(0, 80) || 'export'
  const pageCount = indices.length

  for (let p = 0; p < pageCount; p++) {
    onProgress(p + 1, pageCount)
    const rowIndex = indices[p]
    flushSync(() => {
      renderFrame(rowIndex, p + 1, pageCount)
    })
    await waitFrames(1)
    await new Promise((r) => setTimeout(r, 48))

    if (p > 0) pdf.addPage()
    await addSnapshotPage(pdf, element, pageW, pageH, margin)
  }

  pdf.save(`${safeBase}-dashboard-snapshots.pdf`)
}
