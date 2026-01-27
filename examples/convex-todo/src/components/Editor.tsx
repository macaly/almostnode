import React, { useState } from 'react';

interface EditorProps {
  files: Array<{ path: string; content: string }>;
  onUpdateFile: (path: string, content: string) => void;
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
  },
  tabs: {
    display: 'flex',
    background: '#1a1a1a',
    borderBottom: '1px solid #2a2a2a',
  },
  tab: {
    padding: '10px 16px',
    fontSize: '13px',
    color: '#888',
    cursor: 'pointer',
    borderRight: '1px solid #2a2a2a',
    background: 'transparent',
    border: 'none',
    transition: 'all 0.2s',
  },
  activeTab: {
    color: '#fff',
    background: '#252525',
  },
  editorContainer: {
    flex: 1,
    padding: '16px',
    overflow: 'auto',
  },
  textarea: {
    width: '100%',
    height: '100%',
    background: 'transparent',
    border: 'none',
    color: '#e0e0e0',
    fontFamily: "'Fira Code', 'Monaco', 'Consolas', monospace",
    fontSize: '13px',
    lineHeight: '1.6',
    resize: 'none' as const,
    outline: 'none',
  },
};

export function Editor({ files, onUpdateFile }: EditorProps) {
  const [activeFile, setActiveFile] = useState(files[0]?.path || '');

  const currentFile = files.find(f => f.path === activeFile);

  return (
    <div style={styles.container}>
      <div style={styles.tabs}>
        {files.map(file => (
          <button
            key={file.path}
            onClick={() => setActiveFile(file.path)}
            style={{
              ...styles.tab,
              ...(activeFile === file.path ? styles.activeTab : {}),
            }}
          >
            {file.path.split('/').pop()}
          </button>
        ))}
      </div>
      <div style={styles.editorContainer}>
        {currentFile && (
          <textarea
            style={styles.textarea}
            value={currentFile.content}
            onChange={(e) => onUpdateFile(currentFile.path, e.target.value)}
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
