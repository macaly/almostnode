import React, { useState } from 'react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { Editor } from './components/Editor';
import { TodoList } from './components/TodoList';
import { DeployButton } from './components/DeployButton';
import { useConvexRuntime } from './hooks/useConvexRuntime';

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    background: '#0f0f0f',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid #2a2a2a',
    background: '#151515',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    width: '28px',
    height: '28px',
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    borderRadius: '6px',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  leftPanel: {
    width: '50%',
    borderRight: '1px solid #2a2a2a',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  rightPanel: {
    width: '50%',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  panelHeader: {
    padding: '12px 16px',
    borderBottom: '1px solid #2a2a2a',
    background: '#1a1a1a',
    fontSize: '13px',
    fontWeight: 500,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  panelContent: {
    flex: 1,
    overflow: 'auto',
  },
  status: {
    padding: '8px 16px',
    background: '#1a1a1a',
    borderTop: '1px solid #2a2a2a',
    fontSize: '12px',
    color: '#666',
  },
};

export default function App() {
  const {
    isDeploying,
    deployStatus,
    convexUrl,
    deploy,
    files,
    updateFile,
  } = useConvexRuntime();

  const [convexClient, setConvexClient] = useState<ConvexReactClient | null>(null);

  // Create Convex client when we have a URL
  React.useEffect(() => {
    if (convexUrl && !convexClient) {
      const client = new ConvexReactClient(convexUrl);
      setConvexClient(client);
    }
  }, [convexUrl, convexClient]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.title}>
          <div style={styles.logo} />
          Convex Todo - Browser Runtime Demo
        </div>
        <DeployButton
          isDeploying={isDeploying}
          status={deployStatus}
          onDeploy={deploy}
        />
      </header>

      <main style={styles.main}>
        <div style={styles.leftPanel}>
          <div style={styles.panelHeader}>Convex Functions</div>
          <div style={styles.panelContent}>
            <Editor
              files={files}
              onUpdateFile={updateFile}
            />
          </div>
        </div>

        <div style={styles.rightPanel}>
          <div style={styles.panelHeader}>Todo App Preview</div>
          <div style={styles.panelContent}>
            {convexClient ? (
              <ConvexProvider client={convexClient}>
                <TodoList />
              </ConvexProvider>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                Click "Deploy to Convex" to start
              </div>
            )}
          </div>
        </div>
      </main>

      <div style={styles.status} data-testid="deploy-status">
        {deployStatus || 'Ready'}
      </div>
    </div>
  );
}
