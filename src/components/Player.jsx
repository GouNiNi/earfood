import { Play, Pause, SkipBack, SkipForward, Radio } from 'lucide-react'
import { formatTime } from '../utils/formatTime'

const Player = ({
  isPlaying,
  currentTime,
  totalDuration,
  percentage,
  rate,
  ttsMode,
  autoPlay,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onRateChange,
  onSeek,
  onToggleAutoPlay,
}) => {
  const handleProgressClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
    onSeek(pct)
  }

  return (
    <div className="player-container">
      {/* Barre de progression */}
      <div className="player-progress-wrapper" onClick={handleProgressClick}>
        <div className="player-progress-track">
          <div
            className="player-progress-fill"
            style={{ transform: `scaleX(${percentage / 100})` }}
          />
          <div
            className="player-progress-thumb"
            style={{ left: `${percentage}%` }}
          />
        </div>
        <div className="player-time">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Contrôles de lecture */}
      <div className="player-controls">
        <button
          className={`player-btn ${autoPlay ? 'player-btn-autoplay-active' : ''}`}
          onClick={onToggleAutoPlay}
          title={autoPlay ? 'Auto-play actif' : 'Auto-play inactif'}
          style={{ fontSize: '0.6rem', minWidth: '36px' }}
        >
          <Play size={14} fill={autoPlay ? 'var(--accent-gold)' : 'none'} color={autoPlay ? 'var(--accent-gold)' : 'currentColor'} />
          <span className="player-btn-label" style={{ color: autoPlay ? 'var(--accent-gold)' : undefined }}>Auto</span>
        </button>

        <button
          className="player-btn"
          onClick={onSkipBack}
          title="Reculer 15 secondes"
        >
          <SkipBack size={20} />
          <span className="player-btn-label">-15s</span>
        </button>

        <button
          className="player-btn player-btn-main"
          onClick={onPlayPause}
        >
          {isPlaying ? <Pause size={28} /> : <Play size={28} fill="white" />}
        </button>

        <button
          className="player-btn"
          onClick={onSkipForward}
          title="Avancer 15 secondes"
        >
          <SkipForward size={20} />
          <span className="player-btn-label">+15s</span>
        </button>
      </div>

      {/* Vitesse + indicateur mode */}
      <div className="player-speed">
        <span className="player-speed-label">0.5x</span>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.25"
          value={rate}
          onChange={(e) => onRateChange(parseFloat(e.target.value))}
          className="player-speed-slider"
        />
        <span className="player-speed-label">2x</span>
        <span className="player-speed-current">{rate}x</span>
        {ttsMode && (
          <span className="player-mode-badge" title="Mode vocal actif">
            <Radio size={10} />
            {ttsMode}
          </span>
        )}
      </div>
    </div>
  )
}

export default Player
