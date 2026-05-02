import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark-dimmed.min.css'
import styles from './VegaDocsPage.module.css'
import { API_BASE } from '../config/api'

const DEFAULT_LANG = 'en'

const DOC_ICONS = {
  'getting-started': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
    </svg>
  ),
  concepts: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  ),
  workflow: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  'commands-reference': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  ),
  'vega-vcs-core': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  ),
  'ai-features': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" /><path d="M8.24 4.47A4 4 0 0 1 12 2" />
      <rect x="3" y="14" width="18" height="8" rx="2" /><path d="M7 14v-2a5 5 0 0 1 10 0v2" />
      <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
    </svg>
  ),
  troubleshooting: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  ),
}

const DOC_TAGS = {
  'getting-started': { label: 'Start', className: '' },
  concepts: { label: 'Core', className: 'Purple' },
  workflow: { label: 'Guide', className: 'Green' },
  'commands-reference': { label: 'CLI', className: 'Orange' },
  'vega-vcs-core': { label: 'Core', className: 'Purple' },
  'ai-features': { label: 'AI', className: 'Purple' },
  troubleshooting: { label: 'Help', className: 'Orange' },
}

const QUICK_LINKS = [
  {
    slug: 'getting-started',
    title: 'Getting Started',
    desc: 'Install and set up Vega',
    color: '#58a6ff',
    bg: 'rgba(88,166,255,0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
      </svg>
    ),
  },
  {
    slug: 'commands-reference',
    title: 'Commands Reference',
    desc: 'All CLI commands at a glance',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    slug: 'ai-features',
    title: 'AI Features',
    desc: 'Smart merges & commit messages',
    color: '#818cf8',
    bg: 'rgba(129,140,248,0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="14" width="18" height="8" rx="2" />
        <circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" />
        <path d="M7 14v-2a5 5 0 0 1 10 0v2" />
      </svg>
    ),
  },
  {
    slug: 'workflow',
    title: 'Typical Workflow',
    desc: 'Day-to-day usage patterns',
    color: '#3fb950',
    bg: 'rgba(63,185,80,0.1)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
]

function parseSectionsFromHtml(html) {
  if (!html) return []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const headings = doc.querySelectorAll('h2[id], h3[id]')
  return Array.from(headings)
    .filter((h) => h.id)
    .map((h) => ({
      id: h.id,
      text: h.textContent.trim().replace(/^\d+(\.\d+)*\.\s*/, ''),
      level: h.tagName === 'H2' ? 2 : 3,
    }))
}

function CopyIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

export default function VegaDocsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [languages, setLanguages] = useState([])
  const [lang, setLang] = useState(searchParams.get('lang') || DEFAULT_LANG)
  const [docs, setDocs] = useState([])
  const [activeSlug, setActiveSlug] = useState(null)
  const [content, setContent] = useState('')
  const [sections, setSections] = useState([])
  const [activeSection, setActiveSection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [docLoading, setDocLoading] = useState(false)
  const [error, setError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [readProgress, setReadProgress] = useState(0)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)
  const contentRef = useRef(null)
  const searchRef = useRef(null)
  const asciidoctorRef = useRef(null)

  const initAsciidoctor = useCallback(async () => {
    if (asciidoctorRef.current) return asciidoctorRef.current
    const Asciidoctor = (await import('@asciidoctor/core')).default
    asciidoctorRef.current = Asciidoctor()
    return asciidoctorRef.current
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/docs/languages`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setLanguages)
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    fetch(`${API_BASE}/docs?lang=${lang}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load docs')
        return res.json()
      })
      .then((data) => {
        setDocs(data)
        const paramSlug = searchParams.get('page')
        if (paramSlug && data.find((d) => d.slug === paramSlug)) {
          setActiveSlug(paramSlug)
        } else if (data.length > 0) {
          setActiveSlug(data[0].slug)
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [lang])

  useEffect(() => {
    if (!activeSlug) return
    setDocLoading(true)
    setSearchParams({ page: activeSlug, lang }, { replace: true })

    fetch(`${API_BASE}/docs/${activeSlug}?lang=${lang}`)
      .then((res) => {
        if (!res.ok) throw new Error('Document not found')
        return res.text()
      })
      .then(async (adocContent) => {
        const processor = await initAsciidoctor()
        const html = processor.convert(adocContent, {
          safe: 'safe',
          attributes: {
            showtitle: true,
            'source-highlighter': 'highlight.js',
            icons: 'font',
            sectanchors: true,
            idprefix: '',
            idseparator: '-',
          },
        })
        setContent(html)
        setSections(parseSectionsFromHtml(html))
        setActiveSection(null)
        if (contentRef.current) contentRef.current.scrollTop = 0
        setReadProgress(0)
      })
      .catch((err) => setContent(`<p style="color:#f85149">Error: ${err.message}</p>`))
      .finally(() => setDocLoading(false))
  }, [activeSlug, lang, initAsciidoctor])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      const progress = scrollHeight <= clientHeight ? 100 : (scrollTop / (scrollHeight - clientHeight)) * 100
      setReadProgress(Math.min(100, Math.max(0, progress)))

      const headings = el.querySelectorAll('h2[id], h3[id]')
      let current = null
      for (const h of headings) {
        const rect = h.getBoundingClientRect()
        const containerRect = el.getBoundingClientRect()
        if (rect.top - containerRect.top < 120) {
          current = h.id
        }
      }
      if (current !== activeSection) setActiveSection(current)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [activeSection, content])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        if (searchFocused) {
          searchRef.current?.blur()
          setSearchQuery('')
        }
        if (showKeyboardHelp) setShowKeyboardHelp(false)
      }
      if (e.key === '?' && e.shiftKey && document.activeElement?.tagName !== 'INPUT') {
        setShowKeyboardHelp((v) => !v)
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.ctrlKey && document.activeElement?.tagName !== 'INPUT') {
        const idx = docs.findIndex((d) => d.slug === activeSlug)
        if (idx === -1) return
        if (e.key === 'ArrowLeft' && idx > 0) setActiveSlug(docs[idx - 1].slug)
        if (e.key === 'ArrowRight' && idx < docs.length - 1) setActiveSlug(docs[idx + 1].slug)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [searchFocused, showKeyboardHelp, docs, activeSlug])

  useEffect(() => {
    if (!content || !contentRef.current) return
    const el = contentRef.current

    el.querySelectorAll('pre code.hljs').forEach((code) => {
      if (code.dataset.hljsApplied) return
      code.dataset.hljsApplied = 'true'
      try {
        hljs.highlightElement(code)
      } catch {
        /* unknown or empty language */
      }
    })

    const preBlocks = el.querySelectorAll('.asciidoc-enhanced-done pre, pre')
    el.querySelectorAll('pre').forEach((pre) => {
      if (pre.closest(`.${styles.terminalWrap}`)) return
      if (pre.dataset.enhanced) return
      pre.dataset.enhanced = 'true'

      const text = pre.textContent || ''
      const isAsciiArt = /[┌┐└┘├┤│─═╔╗╚╝║▼▲►◄┬┴╦╩╠╣╬┼]/.test(text) || (/[|+\-]{5,}/.test(text) && /\|.*\|/.test(text))
      const isShellCmd = /^\s*(\$|#|❯|>)\s/m.test(text) || /^\s*(vega |cd |mkdir |echo |npm |mvn |curl |docker |ls |cat |rm |export |kill |lsof |sleep |chmod )/m.test(text)
      const isFileTree = /^\s*(├──|└──|│\s)/m.test(text)
      const isJson = text.trim().startsWith('{') && text.trim().endsWith('}')

      let label = 'Code'
      let dotColors = ['#ff5f57', '#febc2e', '#28c840']
      let borderColor = 'rgba(255,255,255,0.08)'
      let gradLine = 'linear-gradient(90deg, rgba(88,166,255,0.4), rgba(129,140,248,0.4), transparent)'

      if (isAsciiArt) {
        label = 'Architecture'
        borderColor = 'rgba(88,166,255,0.18)'
        gradLine = 'linear-gradient(90deg, rgba(88,166,255,0.6), rgba(129,140,248,0.5), rgba(249,115,22,0.3))'
      } else if (isShellCmd) {
        label = 'Terminal'
        borderColor = 'rgba(249,115,22,0.15)'
        gradLine = 'linear-gradient(90deg, rgba(249,115,22,0.5), rgba(88,166,255,0.3), transparent)'
      } else if (isFileTree) {
        label = 'File Structure'
        borderColor = 'rgba(63,185,80,0.15)'
        gradLine = 'linear-gradient(90deg, rgba(63,185,80,0.5), rgba(88,166,255,0.3), transparent)'
      } else if (isJson) {
        label = 'JSON'
        borderColor = 'rgba(129,140,248,0.15)'
        gradLine = 'linear-gradient(90deg, rgba(129,140,248,0.5), rgba(88,166,255,0.3), transparent)'
      }

      const wrapper = document.createElement('div')
      wrapper.className = styles.terminalWrap
      wrapper.style.setProperty('--tw-border', borderColor)

      const topBar = document.createElement('div')
      topBar.className = styles.terminalBar
      topBar.innerHTML = `
        <div class="${styles.terminalDots}">
          <span style="background:${dotColors[0]}"></span>
          <span style="background:${dotColors[1]}"></span>
          <span style="background:${dotColors[2]}"></span>
        </div>
        <div class="${styles.terminalLabel}">${label}</div>
        <div class="${styles.terminalActions}"></div>
      `

      const gradEl = document.createElement('div')
      gradEl.className = styles.terminalGradient
      gradEl.style.background = gradLine

      const copyBtn = document.createElement('button')
      copyBtn.className = styles.terminalCopy
      copyBtn.title = 'Copy'
      copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
      copyBtn.addEventListener('click', () => {
        const code = pre.querySelector('code')?.textContent || pre.textContent
        navigator.clipboard.writeText(code).then(() => {
          copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3fb950" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
          setTimeout(() => {
            copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`
          }, 2000)
        })
      })
      topBar.querySelector(`.${styles.terminalActions}`).appendChild(copyBtn)

      pre.parentNode.insertBefore(wrapper, pre)
      wrapper.appendChild(gradEl)
      wrapper.appendChild(topBar)
      wrapper.appendChild(pre)

      if (isShellCmd) {
        pre.classList.add(styles.terminalShellPre)
      }
      if (isAsciiArt) {
        pre.classList.add(styles.terminalDiagramPre)
      }
    })

    el.querySelectorAll('h2[id]').forEach((h2) => {
      if (h2.dataset.enhanced) return
      h2.dataset.enhanced = 'true'
      const anchor = document.createElement('span')
      anchor.className = styles.headingAnchor
      anchor.textContent = '#'
      anchor.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.origin + window.location.pathname + '#' + h2.id)
      })
      h2.style.position = 'relative'
      h2.appendChild(anchor)
    })

    el.querySelectorAll('.admonitionblock').forEach((block) => {
      if (block.dataset.enhanced) return
      block.dataset.enhanced = 'true'
      const iconCell = block.querySelector('td.icon')
      if (!iconCell) return
      const text = iconCell.textContent.trim().toLowerCase()
      let svg = ''
      if (text.includes('note')) {
        svg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`
      } else if (text.includes('tip')) {
        svg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3fb950" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 12 18.469V19"/></svg>`
      } else if (text.includes('warning') || text.includes('caution')) {
        svg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d29922" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
      } else if (text.includes('important')) {
        svg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f85149" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
      }
      if (svg) {
        iconCell.innerHTML = svg + `<span style="margin-left:6px;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">${iconCell.textContent.trim()}</span>`
        iconCell.style.display = 'flex'
        iconCell.style.alignItems = 'center'
      }
    })
  }, [content, docLoading])

  const handleDocClick = (slug) => {
    if (slug !== activeSlug) setActiveSlug(slug)
  }

  const handleSectionClick = (id) => {
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleLangChange = (newLang) => {
    if (newLang !== lang) setLang(newLang)
  }

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return docs
    const q = searchQuery.toLowerCase()
    return docs.filter((d) => d.title.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q))
  }, [docs, searchQuery])

  const activeDocIndex = docs.findIndex((d) => d.slug === activeSlug)
  const prevDoc = activeDocIndex > 0 ? docs[activeDocIndex - 1] : null
  const nextDoc = activeDocIndex < docs.length - 1 ? docs[activeDocIndex + 1] : null
  const activeDocTitle = docs.find((d) => d.slug === activeSlug)?.title || ''

  const getDocIcon = (slug) => {
    for (const [key, icon] of Object.entries(DOC_ICONS)) {
      if (slug.includes(key)) return icon
    }
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    )
  }

  const getDocTag = (slug) => {
    for (const [key, tag] of Object.entries(DOC_TAGS)) {
      if (slug.includes(key)) return tag
    }
    return { label: 'Doc', className: '' }
  }

  if (error) {
    return (
      <div className={styles.fullPage}>
        <div className={styles.errorState}>
          <div style={{ textAlign: 'center' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <div>{error}</div>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                padding: '8px 20px',
                background: 'rgba(248,81,73,0.1)',
                border: '1px solid rgba(248,81,73,0.2)',
                borderRadius: 8,
                color: '#f85149',
                cursor: 'pointer',
                fontSize: '0.84rem',
                fontFamily: 'inherit',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.fullPage}>
      {/* Reading progress */}
      <div className={styles.progressBar} style={{ width: `${readProgress}%` }} />

      {/* ── Navbar ── */}
      <header className={styles.navbar}>
        <div className={styles.navLeft}>
          <Link to="/" className={styles.backLink}>
            <span className={styles.backArrow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
            </span>
            <span className={styles.backLabel}>Vega</span>
          </Link>
          <div className={styles.navDivider} />
          <div className={styles.navBrand}>
            <span className={styles.brandIcon}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </span>
            <span className={styles.brandName}>VegaDocs</span>
            <span className={styles.versionBadge}>v1.0</span>
          </div>
        </div>

        {/* ── Search ── */}
        <div className={styles.navCenter}>
          <div className={styles.searchBar}>
            <svg className={styles.searchIcon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              className={styles.searchInput}
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              autoComplete="off"
            />
            {!searchFocused && !searchQuery && <span className={styles.searchKbd}>/</span>}
            {searchFocused && searchQuery && filteredDocs.length > 0 && (
              <div className={styles.searchResults}>
                {filteredDocs.map((doc) => (
                  <button
                    key={doc.slug}
                    type="button"
                    className={styles.searchResultItem}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      handleDocClick(doc.slug)
                      setSearchQuery('')
                      searchRef.current?.blur()
                    }}
                  >
                    <span className={styles.searchResultIcon}>{getDocIcon(doc.slug)}</span>
                    <span className={styles.searchResultTitle}>{doc.title}</span>
                    <span className={styles.searchResultSlug}>{doc.slug}</span>
                  </button>
                ))}
              </div>
            )}
            {searchFocused && searchQuery && filteredDocs.length === 0 && (
              <div className={styles.searchResults}>
                <div className={styles.searchNoResults}>No results for "{searchQuery}"</div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.navRight}>
          {languages.length > 1 && (
            <div className={styles.langSwitch}>
              {languages.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={`${styles.langBtn} ${lang === l.code ? styles.langBtnActive : ''}`}
                  onClick={() => handleLangChange(l.code)}
                  title={l.label}
                >
                  {l.code.toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className={styles.sidebarToggle}
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sidebarOpen ? (
                <>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {/* ── Sidebar ── */}
        {sidebarOpen && (
          <aside className={styles.sidebar}>
            <nav className={styles.sidebarNav}>
              {loading ? (
                <div className={styles.sidebarLoading}>
                  <div className={styles.spinner} style={{ width: 20, height: 20, margin: '0 auto 8px' }} />
                  Loading...
                </div>
              ) : (
                <>
                  <div className={styles.sidebarCategory}>Documentation</div>
                  <div className={styles.docList}>
                    {docs.map((doc) => (
                      <button
                        key={doc.slug}
                        type="button"
                        className={`${styles.docLink} ${activeSlug === doc.slug ? styles.docLinkActive : ''}`}
                        onClick={() => handleDocClick(doc.slug)}
                      >
                        <span className={styles.docLinkIcon}>{getDocIcon(doc.slug)}</span>
                        {doc.title}
                      </button>
                    ))}
                  </div>
                  {activeSlug && sections.length > 0 && (
                    <div className={styles.sectionList}>
                      <div className={styles.sectionListTitle}>On this page</div>
                      {sections.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`${styles.sectionLink} ${activeSection === s.id ? styles.sectionLinkActive : ''}`}
                          style={{ paddingLeft: s.level === 3 ? 24 : 12 }}
                          onClick={() => handleSectionClick(s.id)}
                        >
                          {s.text}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </nav>
          </aside>
        )}

        {/* ── Main content ── */}
        <main className={styles.content} ref={contentRef}>
          {loading || docLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <span>{loading ? 'Loading VegaDocs...' : 'Rendering document...'}</span>
            </div>
          ) : !activeSlug ? (
            <div className={styles.contentInner}>
              <div className={styles.welcomeHero}>
                <div className={styles.welcomeIcon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </div>
                <h1 className={styles.welcomeTitle}>VegaDocs</h1>
                <p className={styles.welcomeSub}>
                  Everything you need to get started with Vega — from installation to advanced AI features.
                </p>
                <div className={styles.quickLinks}>
                  {QUICK_LINKS.map((ql) => (
                    <button
                      key={ql.slug}
                      type="button"
                      className={styles.quickLink}
                      onClick={() => {
                        const match = docs.find((d) => d.slug === ql.slug)
                        if (match) handleDocClick(match.slug)
                      }}
                    >
                      <div className={styles.quickLinkIcon} style={{ background: ql.bg }}>
                        {ql.icon}
                      </div>
                      <div className={styles.quickLinkText}>
                        <div className={styles.quickLinkTitle}>{ql.title}</div>
                        <div className={styles.quickLinkDesc}>{ql.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.contentInner}>
              {/* Breadcrumbs */}
              <div className={styles.breadcrumbs}>
                <button type="button" className={styles.breadcrumbLink} onClick={() => setActiveSlug(null)}>
                  Docs
                </button>
                <span className={styles.breadcrumbSep}>/</span>
                <span className={styles.breadcrumbCurrent}>{activeDocTitle}</span>
              </div>

              {/* Document header tags */}
              <div className={styles.docHeader}>
                <div className={styles.docHeaderMeta}>
                  {(() => {
                    const tag = getDocTag(activeSlug)
                    return (
                      <span className={`${styles.docHeaderTag} ${tag.className ? styles[`docHeaderTag${tag.className}`] : ''}`}>
                        {tag.label}
                      </span>
                    )
                  })()}
                </div>
              </div>

              {/* AsciiDoc content */}
              <article
                className={styles.asciidocBody}
                dangerouslySetInnerHTML={{ __html: content }}
              />

              {/* Prev / Next navigation */}
              <div className={styles.docNav}>
                {prevDoc ? (
                  <button
                    type="button"
                    className={styles.docNavBtn}
                    onClick={() => handleDocClick(prevDoc.slug)}
                  >
                    <span className={styles.docNavLabel}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -1 }}>
                        <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                      </svg>
                      {' '}Previous
                    </span>
                    <span className={styles.docNavTitle}>{prevDoc.title}</span>
                  </button>
                ) : (
                  <div className={styles.docNavEmpty} />
                )}
                {nextDoc ? (
                  <button
                    type="button"
                    className={`${styles.docNavBtn} ${styles.docNavBtnNext}`}
                    onClick={() => handleDocClick(nextDoc.slug)}
                  >
                    <span className={styles.docNavLabel}>
                      Next{' '}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -1 }}>
                        <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                      </svg>
                    </span>
                    <span className={styles.docNavTitle}>{nextDoc.title}</span>
                  </button>
                ) : (
                  <div className={styles.docNavEmpty} />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── Keyboard shortcuts overlay ── */}
      {showKeyboardHelp && (
        <div className={styles.kbdOverlay} onClick={() => setShowKeyboardHelp(false)}>
          <div className={styles.kbdModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.kbdModalTitle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8" />
              </svg>
              Keyboard Shortcuts
            </div>
            <div className={styles.kbdRow}>
              <span className={styles.kbdAction}>Search docs</span>
              <span className={styles.kbd}>/</span>
            </div>
            <div className={styles.kbdRow}>
              <span className={styles.kbdAction}>Previous doc</span>
              <span className={styles.kbd}>←</span>
            </div>
            <div className={styles.kbdRow}>
              <span className={styles.kbdAction}>Next doc</span>
              <span className={styles.kbd}>→</span>
            </div>
            <div className={styles.kbdRow}>
              <span className={styles.kbdAction}>Close / dismiss</span>
              <span className={styles.kbd}>Esc</span>
            </div>
            <div className={styles.kbdRow}>
              <span className={styles.kbdAction}>Show shortcuts</span>
              <span className={styles.kbd}>?</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
