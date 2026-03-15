import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import styles from './CodeViewer.module.css'

const LANG_MAP = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  java: 'java',
  kt: 'kotlin',
  sh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  json: 'json',
  xml: 'xml',
  html: 'html',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  gradle: 'groovy',
  properties: 'properties',
}

function getLanguage(path) {
  const ext = path?.split('.').pop()?.toLowerCase()
  return LANG_MAP[ext] || ext || 'text'
}

function Breadcrumb({ path, onCopy }) {
  if (!path) return null
  const parts = path.split('/')
  return (
    <div className={styles.breadcrumb}>
      <span className={styles.breadcrumbPath}>{path}</span>
      <button
        type="button"
        className={styles.copyBtn}
        onClick={() => {
          navigator.clipboard?.writeText(path)
          onCopy?.()
        }}
        title="Copy path"
      >
        Copy path
      </button>
    </div>
  )
}

export default function CodeViewer({ path, content, binary }) {
  const [copied, setCopied] = useState(false)

  const handleCopyPath = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!path) {
    return (
      <div className={styles.placeholder}>
        <div className={styles.placeholderIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M16 13H8" />
            <path d="M16 17H8" />
            <path d="M10 9H8" />
          </svg>
        </div>
        <p>Select a file to view its contents</p>
        <span className={styles.placeholderHint}>Click a file in the explorer</span>
      </div>
    )
  }

  if (binary) {
    return (
      <div className={styles.placeholder}>
        <p className={styles.binary}>Binary file — content not displayed</p>
      </div>
    )
  }

  const lang = getLanguage(path)

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <Breadcrumb path={path} onCopy={handleCopyPath} />
        {copied && <span className={styles.copied}>Copied</span>}
      </div>
      <div className={styles.code}>
        <SyntaxHighlighter
          language={lang}
          style={oneDark}
          showLineNumbers
          wrapLongLines
          customStyle={{
            margin: 0,
            padding: '16px 20px',
            fontSize: '13px',
            lineHeight: 1.6,
            background: '#0d1117',
            minHeight: '100%',
          }}
          codeTagProps={{ style: { fontFamily: 'var(--font-mono), monospace' } }}
          lineNumberStyle={{ minWidth: '2.5em', opacity: 0.5, paddingRight: '1em' }}
        >
          {content || ''}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}
