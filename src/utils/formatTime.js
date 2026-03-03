/**
 * Formate des secondes en HH:MM:SS ou MM:SS
 */
export function formatTime(seconds) {
  if (!seconds || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Formate une durée en format lisible (ex: "4h 32m")
 */
export function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * Formate un timestamp relatif (ex: "il y a 2h")
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes}min`
  if (hours < 24) return `il y a ${hours}h`
  if (days < 7) return `il y a ${days}j`
  return new Date(timestamp).toLocaleDateString('fr-FR')
}

/**
 * Estime la durée de lecture TTS d'un texte en secondes
 * Basé sur ~150 mots/minute en moyenne pour la synthèse vocale
 */
export function estimateDuration(text) {
  if (!text) return 0
  const words = text.split(/\s+/).length
  return Math.ceil((words / 150) * 60)
}
