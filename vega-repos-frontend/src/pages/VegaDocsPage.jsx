import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import styles from './VegaDocsPage.module.css'

const API_BASE = '/api'
const DEFAULT_LANG = 'en'

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

export default function VegaDocsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [languages, setLanguages] = useState([])
  const [lang, setLang] = useState(searchParams.get('lang') || DEFAULT_LANG)
  const [docs, setDocs] = useState([])
  const [activeSlug, setActiveSlug] = useState(null)
  const [content, setContent] = useState('')
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [docLoading, setDocLoading] = useState(false)
  const [error, setError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const contentRef = useRef(null)
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
        if (contentRef.current) contentRef.current.scrollTop = 0
      })
      .catch((err) => setContent(`<p style="color:#f85149">Error: ${err.message}</p>`))
      .finally(() => setDocLoading(false))
  }, [activeSlug, lang, initAsciidoctor])

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

  if (error) {
    return (
      <div className={styles.fullPage}>
        <div className={styles.errorState}>{error}</div>
      </div>
    )
  }

  return (
    <div className={styles.fullPage}>
      <header className={styles.navbar}>
        <div className={styles.navLeft}>
          <Link to="/" className={styles.backLink}>
            <span className={styles.backArrow}>←</span>
            <span className={styles.backLabel}>Vega</span>
          </Link>
          <div className={styles.navDivider} />
          <div className={styles.navBrand}>
            <span className={styles.brandName}>VegaDocs</span>
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
            {sidebarOpen ? '◧' : '☰'}
          </button>
        </div>
      </header>

      <div className={styles.body}>
        {sidebarOpen && (
          <aside className={styles.sidebar}>
            <nav className={styles.sidebarNav}>
              {loading ? (
                <div className={styles.sidebarLoading}>Loading...</div>
              ) : (
                <>
                  <div className={styles.docList}>
                    {docs.map((doc) => (
                      <button
                        key={doc.slug}
                        type="button"
                        className={`${styles.docLink} ${activeSlug === doc.slug ? styles.docLinkActive : ''}`}
                        onClick={() => handleDocClick(doc.slug)}
                      >
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
                          className={styles.sectionLink}
                          style={{ paddingLeft: s.level === 3 ? 20 : 8 }}
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

        <main className={styles.content} ref={contentRef}>
          {loading || docLoading ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <span>{loading ? 'Loading VegaDocs...' : 'Rendering document...'}</span>
            </div>
          ) : (
            <article
              className={styles.asciidocBody}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          )}
        </main>
      </div>
    </div>
  )
}
