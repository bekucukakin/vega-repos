import { useState } from 'react'
import styles from './FileTree.module.css'

const FolderIcon = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={styles.svgIcon}>
    {open ? (
      <path fillRule="evenodd" d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1L5.95 1.275A1.75 1.75 0 004.58 1H1.75z" />
    ) : (
      <path fillRule="evenodd" d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1L5.95 1.275A1.75 1.75 0 004.58 1H1.75zM1.5 2.75a.25.25 0 01.25-.25h2.83a.25.25 0 01.2.1l1.35 1.625a.25.25 0 00.2.1h6.77a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V2.75z" />
    )}
  </svg>
)

const FileIcon = ({ ext }) => {
  const extColors = {
    js: '#f7df1e', jsx: '#61dafb', ts: '#3178c6', tsx: '#3178c6',
    json: '#cbcb41', py: '#3776ab', java: '#ed8b00', md: '#083fa1',
    css: '#264de4', html: '#e34f26', yml: '#cb171e', yaml: '#cb171e',
  }
  const c = extColors[ext] || 'var(--text-tertiary)'
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={styles.svgIcon} style={{ color: c }}>
      <path fillRule="evenodd" d="M3.75 1.5a.25.25 0 00-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 2.75C2 1.784 2.784 1 3.75 1h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.586A1.75 1.75 0 0112.25 16h-8.5A1.75 1.75 0 012 14.25V2.75z" />
    </svg>
  )
}

export default function FileTree({ nodes, onSelectFile, selectedPath }) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No files in this branch</p>
        <span className={styles.emptyHint}>No files in this branch</span>
      </div>
    )
  }

  return (
    <nav className={styles.tree} aria-label="File explorer">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          onSelectFile={onSelectFile}
          selectedPath={selectedPath}
        />
      ))}
    </nav>
  )
}

function TreeNode({ node, onSelectFile, selectedPath }) {
  const [expanded, setExpanded] = useState(true)
  const isFolder = node.type === 'folder'
  const isSelected = selectedPath === node.path
  const ext = !isFolder && node.name ? node.name.split('.').pop()?.toLowerCase() : ''

  const handleClick = () => {
    if (isFolder) {
      setExpanded((e) => !e)
    } else {
      onSelectFile?.(node.path)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div className={styles.node}>
      <button
        type="button"
        className={`${styles.item} ${isSelected ? styles.selected : ''}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-expanded={isFolder ? expanded : undefined}
        aria-selected={isSelected}
      >
        <span className={styles.icon}>
          {isFolder ? <FolderIcon open={expanded} /> : <FileIcon ext={ext} />}
        </span>
        <span className={styles.name} title={node.path}>{node.name}</span>
      </button>
      {isFolder && expanded && node.children && node.children.length > 0 && (
        <div className={styles.children}>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              onSelectFile={onSelectFile}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}
