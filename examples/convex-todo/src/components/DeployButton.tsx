import React from 'react';

interface DeployButtonProps {
  isDeploying: boolean;
  status: string;
  onDeploy: () => void;
}

const styles = {
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  buttonDisabled: {
    opacity: 0.7,
    cursor: 'not-allowed',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  icon: {
    width: '16px',
    height: '16px',
  },
};

export function DeployButton({ isDeploying, status, onDeploy }: DeployButtonProps) {
  return (
    <>
      <style>
        {`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>
      <button
        onClick={onDeploy}
        disabled={isDeploying}
        style={{
          ...styles.button,
          ...(isDeploying ? styles.buttonDisabled : {}),
        }}
      >
        {isDeploying ? (
          <>
            <div style={styles.spinner} />
            Deploying...
          </>
        ) : (
          <>
            <svg
              style={styles.icon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            Deploy to Convex
          </>
        )}
      </button>
    </>
  );
}
