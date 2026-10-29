// Spausdinimas ir PDF eksportas to, kas rodoma #print-area (aktyvus skirtukas).
// PDF daromas iš ekrano vaizdo (html2canvas-pro palaiko Tailwind v4 oklch spalvas),
// puslapiai karpomi tarp lentelės eilučių / blokų, kad eilutė neperskiltų per pusę.

export const PRINT_AREA_ID = 'print-area'

export const printPage = () => window.print()

const A4 = { w: 210, h: 297 }
const MARGIN = 10 // mm

/** Galimos karpymo vietos (px nuo elemento viršaus) - eilučių ir blokų apačios. */
function breakPoints(root: HTMLElement): number[] {
  const top = root.getBoundingClientRect().top
  const points = new Set<number>()
  root.querySelectorAll('tr, li, section, p, h2, h3, .pdf-break').forEach((el) => {
    points.add(Math.round(el.getBoundingClientRect().bottom - top))
  })
  return [...points].sort((a, b) => a - b)
}

export async function exportPdf(fileName: string) {
  const root = document.getElementById(PRINT_AREA_ID)
  if (!root) return

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])

  root.classList.add('pdf-export')
  try {
    const breaks = breakPoints(root)
    const scale = 2
    const canvas = await html2canvas(root, { scale, backgroundColor: '#ffffff', windowWidth: root.scrollWidth })

    const landscape = root.scrollWidth > 1100
    const page = landscape ? { w: A4.h, h: A4.w } : A4
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })

    const contentW = page.w - 2 * MARGIN
    const contentH = page.h - 2 * MARGIN
    const pxPerMm = canvas.width / contentW          // canvas px į mm
    const pageCssPx = (contentH * pxPerMm) / scale    // vieno puslapio aukštis CSS px

    let from = 0
    const total = canvas.height / scale
    let first = true
    while (from < total - 1) {
      // toliausias karpymo taškas, kuris dar telpa į puslapį (jei nėra - kerpama per jėgą)
      const limit = from + pageCssPx
      const fit = breaks.filter((b) => b > from + 20 && b <= limit)
      const to = limit >= total ? total : fit.length ? fit[fit.length - 1] : limit

      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = Math.ceil((to - from) * scale)
      slice.getContext('2d')!.drawImage(canvas, 0, -from * scale)

      if (!first) pdf.addPage()
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN, contentW, slice.height / pxPerMm)
      first = false
      from = to
    }

    pdf.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`)
  } finally {
    root.classList.remove('pdf-export')
  }
}

/** Atspausdina vieną elementą (pvz. partijos kortelę) atskirame rėmelyje su tais pačiais stiliais. */
export function printElement(el: HTMLElement, title = document.title) {
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('')
  doc.open()
  // pavadinimas (partijos Nr. - vartotojo įvestas) nustatomas per doc.title, ne į HTML, kad nebūtų XSS
  doc.write(`<!doctype html><html lang="lt"><head><meta charset="utf-8">${styles}</head><body style="background:#fff;padding:12mm">${el.outerHTML}</body></html>`)
  doc.close()
  doc.title = title
  const go = () => {
    frame.contentWindow!.focus()
    frame.contentWindow!.print()
    setTimeout(() => frame.remove(), 1000)
  }
  // laukiam, kol užsikraus išoriniai stiliai (build režime - <link>)
  if (doc.readyState === 'complete') setTimeout(go, 150)
  else frame.onload = go
}
