import { useState, useEffect } from 'react'
import Library from './components/Library'
import Reader from './components/Reader'
import WIPLayer from './components/WIPLayer'
import './App.css'

function App() {
  const [currentView, setCurrentView] = useState('library') // 'library' | 'reader'
  const [currentDocId, setCurrentDocId] = useState(null)

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

  return (
    <>
      <WIPLayer status="WIP" />
      <div className="app-container" style={{ paddingTop: '28px' }}>
        {currentView === 'library' && (
          <Library onOpenDocument={openDocument} />
        )}
        {currentView === 'reader' && currentDocId && (
          <Reader documentId={currentDocId} onBack={goToLibrary} />
        )}
      </div>
    </>
  )
}

export default App
