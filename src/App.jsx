import { useState, useEffect } from 'react'
import Library from './components/Library'
import Reader from './components/Reader'
import WIPLayer from './components/WIPLayer'
import SettingsPanel from './components/SettingsPanel'
import { getSettings } from './stores'
import { initGemini } from './utils/gemini'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('library')
  const [currentDocId, setCurrentDocId] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [darkMode, setDarkMode] = useState(false)

  // Initialize settings on mount
  useEffect(() => {
    const loadAppSettings = async () => {
      const settings = await getSettings()
      if (settings.geminiApiKey) {
        initGemini(settings.geminiApiKey)
      }
      if (settings.darkMode) {
        setDarkMode(true)
        document.documentElement.classList.add('dark')
      }
    }
    loadAppSettings()
  }, [])

  // Simple hash-based routing
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash
      if (hash.startsWith('#/reader/')) {
        const docId = hash.replace('#/reader/', '')
        setCurrentDocId(docId)
        setCurrentView('reader')
      } else {
        setCurrentView('library')
        setCurrentDocId(null)
      }
    }

    handleHash()
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  const openDocument = (docId) => {
    window.location.hash = `/reader/${docId}`
  }

  const goToLibrary = () => {
    window.location.hash = '/'
  }

  const handleDarkModeChange = (isDark) => {
    setDarkMode(isDark)
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  return (
    <>
      <WIPLayer status="DONE" />
      <div className="app-container" style={{ paddingTop: '28px' }}>
        {currentView === 'library' && (
          <Library
            onOpenDocument={openDocument}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
        {currentView === 'reader' && currentDocId && (
          <Reader
            documentId={currentDocId}
            onBack={goToLibrary}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
      </div>

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          darkMode={darkMode}
          onDarkModeChange={handleDarkModeChange}
        />
      )}
    </>
  )
}

export default App
