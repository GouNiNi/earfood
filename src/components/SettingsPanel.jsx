import { useState, useEffect } from 'react'
import { Settings, Trash2, Key, Moon, Sun, Database, Info, Volume2 } from 'lucide-react'
import { getSettings, saveSettings, clearAllData, getCacheSize } from '../stores'
import { initGemini } from '../utils/gemini'
import { EDGE_VOICES, DEFAULT_VOICE, synthesize } from '../utils/edgeTts'

const SHERPA_VOICES = {
  'fr-FR-siwis': 'Siwis (Féminin)',
  'fr-FR-tom': 'Tom (Masculin)',
}

const SettingsPanel = ({ onClose, onDarkModeChange, darkMode }) => {
  const [settings, setSettingsState] = useState({
    geminiApiKey: '',
    ttsMode: 'hybrid',
    edgeVoice: 'fr-FR-HenriNeural',
    sherpaVoice: 'fr-FR-siwis',
    trimEndMs: 200,
    darkMode: false,
  })
  const [cacheCount, setCacheCount] = useState(0)
  const [saved, setSaved] = useState(false)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [testingVoice, setTestingVoice] = useState(false)

  useEffect(() => {
    loadSettings()
    loadCacheSize()
  }, [])

  const loadSettings = async () => {
    const s = await getSettings()
    setSettingsState({ edgeVoice: DEFAULT_VOICE, ...s })
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
    setTimeout(() => onClose(), 500)
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

  const handleTestVoice = async () => {
    if (settings.ttsMode === 'local') {
      // Test Web Speech API
      const utterance = new SpeechSynthesisUtterance('Bonjour, je suis EarFood.')
      utterance.lang = 'fr-FR'
      const voices = window.speechSynthesis.getVoices()
      const frVoice = voices.find(v => v.lang.startsWith('fr'))
      if (frVoice) utterance.voice = frVoice
      window.speechSynthesis.speak(utterance)
    } else if (settings.ttsMode === 'sherpa') {
      // Test Sherpa-ONNX
      setTestingVoice(true)
      try {
        const { sherpaAPI } = await import('../utils/sherpa.js')
        await sherpaAPI.init()
        await sherpaAPI.loadVoice(settings.sherpaVoice || 'fr-FR-siwis')
        const audioData = await sherpaAPI.generate('Bonjour, je suis EarFood, votre assistant de lecture.', 1.0)
        if (audioData) {
          const { promise } = sherpaAPI.playBuffer(audioData.samples, audioData.sampleRate)
          await promise
        }
      } catch (e) {
        alert('Erreur Sherpa : ' + e.message + '\nLe mode local sera utilisé en fallback.')
      } finally {
        setTestingVoice(false)
      }
    } else {
      // Test Edge TTS
      setTestingVoice(true)
      try {
        const audio = await synthesize('Bonjour, je suis EarFood, votre assistant de lecture.', {
          voice: settings.edgeVoice,
          rate: 1.0,
        })
        const blob = new Blob([audio], { type: 'audio/mpeg' })
        const url = URL.createObjectURL(blob)
        const el = new Audio(url)
        el.onended = () => URL.revokeObjectURL(url)
        el.play()
      } catch (e) {
        alert('Erreur Edge TTS : ' + e.message + '\nLe mode local sera utilisé en fallback.')
      } finally {
        setTestingVoice(false)
      }
    }
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
            Clé API Google AI Studio pour Gemini 2.5 Flash Lite
          </p>
        </div>

        {/* Mode TTS */}
        <div className="settings-section">
          <h3 style={{ fontSize: '0.9rem', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Volume2 size={16} />
            Mode vocal
          </h3>
          <div className="settings-radio-group">
            {[
              { value: 'local', label: 'Local uniquement', desc: 'Web Speech API — Privé, fonctionne hors-ligne' },
              { value: 'hybrid', label: 'Hybride (recommandé)', desc: 'Edge TTS Neural — Voix haute qualité, fallback local automatique' },
              { value: 'sherpa', label: 'IA locale (Sherpa)', desc: 'Voix neurale offline — ~100 Mo à télécharger, fonctionne sans réseau' },
            ].map(mode => (
              <label key={mode.value} className={`settings-radio ${settings.ttsMode === mode.value ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="ttsMode"
                  value={mode.value}
                  checked={settings.ttsMode === mode.value}
                  onChange={(e) => setSettingsState({ ...settings, ttsMode: e.target.value })}
                />
                <div>
                  <div style={{ fontWeight: 500 }}>{mode.label}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{mode.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Sélection voix Edge TTS */}
          {settings.ttsMode === 'hybrid' && (
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                Voix Edge TTS :
              </label>
              <select
                value={settings.edgeVoice || DEFAULT_VOICE}
                onChange={(e) => setSettingsState({ ...settings, edgeVoice: e.target.value })}
                className="settings-input"
                style={{ width: '100%' }}
              >
                {Object.entries(EDGE_VOICES).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sélection voix Sherpa */}
          {settings.ttsMode === 'sherpa' && (
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                Voix Sherpa :
              </label>
              <select
                value={settings.sherpaVoice || 'fr-FR-siwis'}
                onChange={(e) => setSettingsState({ ...settings, sherpaVoice: e.target.value })}
                className="settings-input"
                style={{ width: '100%' }}
              >
                {Object.entries(SHERPA_VOICES).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tester la voix */}
          <button
            onClick={handleTestVoice}
            disabled={testingVoice}
            style={{ marginTop: '0.75rem', width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}
          >
            <Volume2 size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            {testingVoice ? 'Test en cours...' : 'Tester la voix'}
          </button>

          {/* Trim silence de fin */}
          {(settings.ttsMode === 'hybrid' || settings.ttsMode === 'sherpa') && (
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span>Couper le silence de fin :</span>
                <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{settings.trimEndMs ?? 200} ms</span>
              </label>
              <input
                type="range"
                min="0"
                max="1000"
                step="25"
                value={settings.trimEndMs ?? 200}
                onChange={(e) => setSettingsState({ ...settings, trimEndMs: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span>0 ms (pas de trim)</span>
                <span>1000 ms</span>
              </div>
            </div>
          )}
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
            EarFood v0.3.0
          </p>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
