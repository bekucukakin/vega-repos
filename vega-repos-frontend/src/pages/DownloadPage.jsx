import { useState, useEffect } from 'react'
import styles from './DownloadPage.module.css'

const VEGA_VERSION = '1.0.28'

const CopyBtn = ({ text }) => {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button className={styles.copyBtn} onClick={copy} title="Copy">
      {copied
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      }
    </button>
  )
}

const CodeBlock = ({ code, language = 'bash', highlight = false }) => (
  <div className={`${styles.codeBlock} ${highlight ? styles.codeBlockHighlight : ''}`}>
    <div className={styles.codeHeader}>
      <span className={styles.codeLang}>{language}</span>
      <CopyBtn text={code} />
    </div>
    <pre className={styles.codePre}><code>{code}</code></pre>
  </div>
)

const Tab = ({ id, label, icon, active, onClick }) => (
  <button
    className={`${styles.tab} ${active ? styles.tabActive : ''}`}
    onClick={() => onClick(id)}
  >
    {icon}
    {label}
  </button>
)

const LinuxIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="5"/><path d="M9 13v6m6-6v6M7 19h10"/>
  </svg>
)

const MacIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3C8 3 5 6 5 10c0 2.4 1.1 4.5 2.8 5.9L6 20h12l-1.8-4.1C18 14.5 19 12.4 19 10c0-4-3-7-7-7z"/>
  </svg>
)

const WinIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="8" height="8" rx="1"/>
    <rect x="13" y="3" width="8" height="8" rx="1"/>
    <rect x="3" y="13" width="8" height="8" rx="1"/>
    <rect x="13" y="13" width="8" height="8" rx="1"/>
  </svg>
)

export default function DownloadPage() {
  const [os, setOs] = useState('linux')
  const [version, setVersion] = useState(VEGA_VERSION)
  const [serverUrl, setServerUrl] = useState('')

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('win')) setOs('windows')
    else if (ua.includes('mac')) setOs('mac')
    else setOs('linux')

    const origin = window.location.origin
    setServerUrl(origin)

    fetch('/api/version').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.version) setVersion(d.version)
    }).catch(() => {})
  }, [])

  const installCmd  = `curl -fsSL ${serverUrl}/install.sh | bash`
  const updateCmd   = `curl -fsSL ${serverUrl}/update.sh | bash`
  const vegaUpdate  = `vega update`

  const windowsInstall = [
    '# PowerShell — Java 17+ required',
    '',
    `$url = "${serverUrl}/api/download/vega"`,
    `$lib = "$env:USERPROFILE\\.local\\lib\\vega"`,
    `$bin = "$env:USERPROFILE\\.local\\bin"`,
    `$jar = "$lib\\vega.jar"`,
    `New-Item -ItemType Directory -Force -Path $lib,$bin | Out-Null`,
    `Invoke-WebRequest -Uri $url -OutFile $jar`,
    '',
    '# Create vega.bat',
    `$bat = "@echo off\`nexec java -jar $jar %*"`,
    `Set-Content "$bin\\vega.bat" $bat`,
    '',
    '# Add to PATH',
    `$p = [Environment]::GetEnvironmentVariable('PATH','User')`,
    `if ($p -notlike "*$bin*") { [Environment]::SetEnvironmentVariable('PATH',"$p;$bin",'User') }`,
    '',
    '# Set server',
    `New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\\.vega" | Out-Null`,
    `Set-Content "$env:USERPROFILE\\.vega\\env" "VEGA_SERVER=${serverUrl}"`,
    '',
    '# Verify (new terminal)',
    'vega --version',
  ].join('\n')

  const quickStart = `vega --version                      # check version
vega login <username> <password>    # log in
vega init                           # initialize repo
vega add .                          # stage all files
vega commit -m "first commit"       # commit
vega push my-repo                   # push to server
vega pull my-repo                   # pull from server
vega merge feature/x --ai          # AI-powered merge
vega update                         # update VEGA CLI`

  return (
    <div className={styles.page}>

      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
            CLI Tool · v{version}
          </div>
          <h1 className={styles.heroTitle}>Install VEGA CLI</h1>
          <p className={styles.heroSub}>
            One command to install. Git-style version control with AI-powered merges and HDFS storage.
            Works on Linux, macOS, and Windows — requires Java 17+.
          </p>

          {/* ── THE one-liner ── */}
          <div className={styles.oneliner}>
            <div className={styles.onelinerLabel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              Install
            </div>
            <code className={styles.onelinerCode}>{installCmd}</code>
            <CopyBtn text={installCmd} />
          </div>

          <div className={styles.onelinerRow}>
            <div className={styles.oneliner} style={{ flex: 1 }}>
              <div className={styles.onelinerLabel}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Update
              </div>
              <code className={styles.onelinerCode}>{updateCmd}</code>
              <CopyBtn text={updateCmd} />
            </div>
            <div className={styles.oneliner} style={{ flex: 1 }}>
              <div className={styles.onelinerLabel}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Update (after install)
              </div>
              <code className={styles.onelinerCode}>{vegaUpdate}</code>
              <CopyBtn text={vegaUpdate} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.body}>

        {/* ── Prerequisite ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Prerequisite — Java 17+</h2>
          <div className={styles.prereqGrid}>
            <div className={styles.prereqCard}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              <div>
                <div className={styles.prereqName}>Java 17+</div>
                <div className={styles.prereqSub}>JDK or JRE — required to run VEGA</div>
              </div>
            </div>
            <div className={styles.prereqCard}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <div>
                <div className={styles.prereqName}>Linux · macOS · Windows</div>
                <div className={styles.prereqSub}>bash / zsh for the install script</div>
              </div>
            </div>
          </div>
          <div className={styles.javaCheck}>
            <span className={styles.javaCheckLabel}>Install Java on Ubuntu:</span>
            <div className={styles.javaCheckCode}>
              <code>sudo apt install openjdk-17-jre -y</code>
              <CopyBtn text="sudo apt install openjdk-17-jre -y" />
            </div>
          </div>
        </section>

        {/* ── Platform tabs ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Manual Installation</h2>
          <div className={styles.tabs}>
            <Tab id="linux"   label="Linux / macOS" icon={<LinuxIcon />} active={os === 'linux' || os === 'mac'} onClick={() => setOs('linux')} />
            <Tab id="windows" label="Windows"        icon={<WinIcon />}  active={os === 'windows'} onClick={setOs} />
          </div>
          <div className={styles.tabContent}>
            {(os === 'linux' || os === 'mac') && <CodeBlock code={installCmd} />}
            {os === 'windows' && <CodeBlock code={windowsInstall} language="powershell" />}
          </div>
        </section>

        {/* ── Quick Start ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Quick Start</h2>
          <CodeBlock code={quickStart} />
        </section>

        {/* ── Commands ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Command Reference</h2>
          <div className={styles.cmdGrid}>
            {[
              { cmd: 'vega init',               desc: 'Initialize a new repository' },
              { cmd: 'vega add <files>',         desc: 'Stage files for commit' },
              { cmd: 'vega commit -m "msg"',     desc: 'Commit staged changes' },
              { cmd: 'vega commit --ai',         desc: 'Commit with AI-generated message' },
              { cmd: 'vega status',              desc: 'Show working directory status' },
              { cmd: 'vega diff',                desc: 'Show unstaged changes' },
              { cmd: 'vega log',                 desc: 'Show commit history' },
              { cmd: 'vega branch <name>',       desc: 'Create a new branch' },
              { cmd: 'vega checkout <branch>',   desc: 'Switch branches' },
              { cmd: 'vega merge <branch> --ai', desc: 'AI-powered conflict resolution' },
              { cmd: 'vega push <repo>',         desc: 'Push to remote (HDFS)' },
              { cmd: 'vega pull <repo>',         desc: 'Pull from remote (HDFS)' },
              { cmd: 'vega pr create',           desc: 'Create a pull request' },
              { cmd: 'vega login <u> <p>',       desc: 'Authenticate with server' },
              { cmd: 'vega update',              desc: 'Update VEGA CLI to latest version' },
            ].map(({ cmd, desc }) => (
              <div key={cmd} className={styles.cmdRow}>
                <code className={styles.cmdCode}>{cmd}</code>
                <span className={styles.cmdDesc}>{desc}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Troubleshooting ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Troubleshooting</h2>
          <div className={styles.troubleList}>
            {[
              {
                q: <><code>vega</code> command not found</>,
                a: <>Make sure <code>~/.local/bin</code> is in your PATH:<CodeBlock code={'export PATH="$HOME/.local/bin:$PATH"\nsource ~/.bashrc'} /></>
              },
              {
                q: <>Connection refused / cannot reach server</>,
                a: <>Check <code>~/.vega/env</code> for the correct server URL:<CodeBlock code={'cat ~/.vega/env\n# VEGA_SERVER=https://your-server'} /></>
              },
              {
                q: <>Java version too old</>,
                a: <>VEGA requires Java 17+:<CodeBlock code={'sudo apt install openjdk-17-jre -y\njava -version'} /></>
              },
            ].map(({ q, a }, i) => (
              <details key={i} className={styles.troubleItem}>
                <summary className={styles.troubleSummary}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {q}
                </summary>
                <div className={styles.troubleBody}>{a}</div>
              </details>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
