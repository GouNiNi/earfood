import { Download, Copy, FileText, Check } from 'lucide-react'
import { useState } from 'react'
import { formatTime } from '../utils/formatTime'

const ExportPanel = ({ documentTitle, highlights }) => {
  const [copied, setCopied] = useState(false)

  const generateMarkdown = () => {
    if (highlights.length === 0) return ''

    let md = `# Document : ${documentTitle}\n## Passages surlignés\n\n`

    highlights.forEach((hl, i) => {
      // Estimer la position temporelle à partir de la position en caractères
      // (approximation grossière basée sur ~15 caractères/seconde)
      const estimatedSeconds = Math.floor(hl.startPos / 15)
      const title = hl.title ? ` — ${hl.title}` : ''
      md += `**Passage ${i + 1}${title}** (position: ${formatTime(estimatedSeconds)})\n`
      md += `> ${hl.text}\n\n`
    })

    return md.trim()
  }

  const handleCopy = async () => {
    const md = generateMarkdown()
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback pour les navigateurs sans clipboard API
      const textarea = document.createElement('textarea')
      textarea.value = md
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleDownload = () => {
    const md = generateMarkdown()
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${documentTitle} - Passages surlignés.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3 className="serif" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={18} />
          Export Markdown
        </h3>
      </div>

      {highlights.length === 0 ? (
        <div className="panel-empty">
          <FileText size={24} style={{ opacity: 0.3 }} />
          <p>Aucun passage à exporter</p>
          <p style={{ fontSize: '0.8rem' }}>Surlignez du texte pour pouvoir l'exporter.</p>
        </div>
      ) : (
        <>
          <div className="export-preview">
            <div className="export-preview-header">
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {highlights.length} passage{highlights.length > 1 ? 's' : ''} surligné{highlights.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="export-preview-content">
              {highlights.map((hl, i) => (
                <div key={hl.id} className="export-preview-item">
                  <div className="export-preview-number" style={{ borderLeft: `3px solid ${hl.color}` }}>
                    Passage {i + 1}{hl.title ? ` — ${hl.title}` : ''}
                  </div>
                  <blockquote className="export-preview-text">
                    {hl.text}
                  </blockquote>
                </div>
              ))}
            </div>
          </div>

          <div className="export-actions">
            <button onClick={handleCopy} style={{ flex: 1 }}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span style={{ marginLeft: '8px' }}>{copied ? 'Copié !' : 'Copier'}</span>
            </button>
            <button onClick={handleDownload} className="primary" style={{ flex: 1 }}>
              <Download size={16} />
              <span style={{ marginLeft: '8px' }}>Télécharger .md</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default ExportPanel
