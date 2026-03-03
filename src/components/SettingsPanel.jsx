import { useState, useEffect } from 'react'
import { Settings, Trash2, Key, Moon, Sun, Database, Info } from 'lucide-react'
import { getSettings, saveSettings, clearAllData, getCacheSize } from '../stores'
import { initGemini } from '../utils/gemini'

const SettingsPanel = ({ onClose, onDarkModeChange, darkMode }) => {
  const [settings, setSettingsState] = useState({
    geminiApiKey: '',
    ttsMode: 'local',
    darkMode: false,
  })
  const [cacheCount, setCacheCount] = useState(0)
  const [saved, setSaved] = useState(false)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)

  useEffect(() => {
    loadSettings()
    loadCacheSize()
  }, [])

  const loadSettings = async () => {
    const s = await getSettings()
    setSettingsState(s)
    if (s.geminiApiKey) {
      initGemini(s.geminiApiKey)
    }
  }

  const loadCacheSize = async () => {
    const count = await getCacheSize()
    setCacheCount(count)
  }

  const handleSave = async () => {
    await saveSettings(settings)
    if (settings.geminiApiKey) {
      initGemini(settings.geminiApiKey)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleClearCache = async () => {
    if (!confirm('Supprimer toutes les données ? Cette action est irréversible.')) return
    await clearAllData()
    setCacheCount(0)
    window.location.hash = '/'
    window.location.reload()
  }

  const handleDarkModeToggle = () => {
    const newSettings = { ...settings, darkMode: !settings.darkMode }
    setSettingsState(newSettings)
    saveSettings(newSettings)
    onDarkModeChange(!settings.darkMode)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="serif" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={22} />
            Réglages
          </h2>
          <button onClick={onClose} style={{ padding: '4px 8px' }}>Fermer</button>
        </div>

        {/* Dark mode */}
        <div className="settings-section">
          <div className="settings-row" onClick={handleDarkModeToggle} style={{ cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {settings.darkMode ? <Moon size={18} /> : <Sun size={18} />}
              <span>Mode sombre</span>
            </div>
            <div className={`toggle ${settings.darkMode ? 'active' : ''}`}>
              <div className="toggle-thumb" />
            </div>
          </div>
        </div>

        {/* Clé API Gemini */}
        <div className="settings-section">
          <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Key size={16} />
            API Gemini (Résumés & Chat IA)
          </h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type={apiKeyVisible ? 'text' : 'password'}
              value={settings.geminiApiKey}
              onChange={(e) => setSettingsState({ ...settings, geminiApiKey: e.target.value })}
              placeholder="AIza..."
              className="settings-input"
              style={{ flex: 1 }}
            />
            <button
              onClick={() => setApiKeyVisible(!apiKeyVisible)}
              style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
            >
              {apiKeyVisible ? 'Masquer' : 'Voir'}
            </button>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>
            Clé API Google AI Studio pour Gemini 1.5 Flash
          </p>
        </div>

        {/* Mode TTS */}
        <div className="settings-section">
          <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.75rem' }}>Mode vocal</h3>
          <div className="settings-radio-group">
            {[
              { value: 'local', label: 'Local uniquement', desc: 'Web Speech API — Privé, fonctionne hors-ligne' },
              { value: 'hybrid', label: 'Hybride', desc: 'Edge TTS Neural avec fallback local (bientôt)' },
              { value: 'cloud', label: 'Cloud', desc: 'API Cloud pour la meilleure qualité (bientôt)' },
            ].map(mode => (
              <label key={mode.value} className={`settings-radio ${settings.ttsMode === mode.value ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="ttsMode"
                  value={mode.value}
                  checked={settings.ttsMode === mode.value}
                  onChange={(e) => setSettingsState({ ...settings, ttsMode: e.target.value })}
                  disabled={mode.value !== 'local'}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>{mode.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{mode.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Cache */}
        <div className="settings-section">
          <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Database size={16} />
            Données & Cache
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 0.75rem' }}>
            {cacheCount} éléments en cache (documents, progression, marque-pages, etc.)
          </p>
          <button
            onClick={handleClearCache}
            style={{ color: '#dc2626', borderColor: '#dc2626', width: '100%' }}
          >
            <Trash2 size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Supprimer toutes les données
          </button>
        </div>

        {/* Sauvegarder */}
        <button className="primary" onClick={handleSave} style={{ width: '100%', marginTop: '1rem' }}>
          {saved ? 'Sauvegardé !' : 'Sauvegarder les réglages'}
        </button>

        {/* Version */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem', padding: '1rem 0 0', borderTop: '1px solid var(--border-color)' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <Info size={12} />
            EarFood v0.2.0
          </p>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
