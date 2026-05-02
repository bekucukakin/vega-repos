import { useMemo } from 'react'
import styles from './ReadmeViewer.module.css'

/**
 * Renders README.md (simple markdown) or README.adoc (via asciidoctor).
 * We keep the md parser minimal and dependency-free.
 */

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const html = []
  let inCode = false
  let codeLang = ''
  let codeLines = []
  let inList = false

  const flush = () => {
    if (inList) { html.push('</ul>'); inList = false }
  }

  const escape = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const inline = (s) =>
    escape(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')

  for (const raw of lines) {
    const line = raw

    if (line.startsWith('```')) {
      if (inCode) {
        html.push(`<pre><code class="lang-${codeLang}">${codeLines.join('\n')}</code></pre>`)
        codeLines = []
        inCode = false
        codeLang = ''
      } else {
        flush()
        inCode = true
        codeLang = line.slice(3).trim()
      }
      continue
    }

    if (inCode) {
      codeLines.push(escape(line))
      continue
    }

    if (!line.trim()) { flush(); html.push('<br/>'); continue }

    const hm = line.match(/^(#{1,6})\s+(.*)/)
    if (hm) {
      flush()
      const lvl = hm[1].length
      html.push(`<h${lvl}>${inline(hm[2])}</h${lvl}>`)
      continue
    }

    if (/^(\-|\*|\+)\s/.test(line)) {
      if (!inList) { html.push('<ul>'); inList = true }
      html.push(`<li>${inline(line.replace(/^(\-|\*|\+)\s/, ''))}</li>`)
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      if (!inList) { html.push('<ol>'); inList = true }
      html.push(`<li>${inline(line.replace(/^\d+\.\s/, ''))}</li>`)
      continue
    }

    if (/^>/.test(line)) {
      flush()
      html.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`)
      continue
    }

    if (/^---+$/.test(line.trim()) || /^===+$/.test(line.trim())) {
      flush()
      html.push('<hr/>')
      continue
    }

    flush()
    html.push(`<p>${inline(line)}</p>`)
  }

  flush()
  return html.join('\n')
}

function renderAsciidoc(adoc) {
  try {
    // @asciidoctor/core is already in the bundle (used by VegaDocsPage)
    const Asciidoctor = window.__asciidoctor
    if (Asciidoctor) {
      return Asciidoctor().convert(adoc, { safe: 'safe' })
    }
  } catch { /* fall through */ }
  // Fallback: show as preformatted text
  return `<pre>${adoc.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`
}

export default function ReadmeViewer({ path, content }) {
  const html = useMemo(() => {
    if (!content) return ''
    const ext = (path || '').split('.').pop().toLowerCase()
    if (ext === 'adoc' || ext === 'asciidoc') return renderAsciidoc(content)
    return renderMarkdown(content)
  }, [path, content])

  if (!html) return null

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" opacity="0.6">
          <path d="M14 1H2a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
          <path d="M4 6.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm0 3a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5z"/>
        </svg>
        <span>{path}</span>
      </div>
      {/* eslint-disable-next-line react/no-danger */}
      <div className={styles.body} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
