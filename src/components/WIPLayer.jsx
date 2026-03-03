const WIPLayer = ({ status = 'WIP' }) => {
  const isWIP = status === 'WIP'

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: isWIP
        ? 'linear-gradient(90deg, #f59e0b, #d97706, #f59e0b)'
        : 'linear-gradient(90deg, #10b981, #059669, #10b981)',
      color: 'white',
      textAlign: 'center',
      padding: '4px 0',
      fontSize: '0.75rem',
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      fontFamily: 'var(--font-sans)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    }}>
      {isWIP ? 'Work in Progress' : 'Done — Ready for Production'}
    </div>
  )
}

export default WIPLayer
