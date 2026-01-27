import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';

const styles = {
  container: {
    padding: '24px',
    maxWidth: '500px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
  },
  form: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '14px',
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#e0e0e0',
    outline: 'none',
  },
  addButton: {
    padding: '12px 20px',
    fontSize: '14px',
    fontWeight: 500,
    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    border: 'none',
    borderRadius: '8px',
    color: '#fff',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  task: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 16px',
    background: '#1a1a1a',
    borderRadius: '8px',
    border: '1px solid #2a2a2a',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  },
  taskText: {
    flex: 1,
    fontSize: '14px',
    color: '#e0e0e0',
  },
  completedText: {
    textDecoration: 'line-through',
    color: '#666',
  },
  deleteButton: {
    padding: '6px 12px',
    fontSize: '12px',
    background: 'transparent',
    border: '1px solid #333',
    borderRadius: '4px',
    color: '#888',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '40px',
    color: '#666',
  },
  loading: {
    textAlign: 'center' as const,
    padding: '40px',
    color: '#666',
  },
  error: {
    textAlign: 'center' as const,
    padding: '40px',
    color: '#f87171',
  },
};

// Task type matches our schema
interface Task {
  _id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

// Use "any" for the function reference since we don't have generated types
// In a real app, you'd use the generated API types
const tasksApi = {
  list: 'tasks:list' as any,
  add: 'tasks:add' as any,
  toggle: 'tasks:toggle' as any,
  remove: 'tasks:remove' as any,
};

export function TodoList() {
  const [newTask, setNewTask] = useState('');
  const tasks = useQuery(tasksApi.list) as Task[] | undefined;
  const addTask = useMutation(tasksApi.add);
  const toggleTask = useMutation(tasksApi.toggle);
  const removeTask = useMutation(tasksApi.remove);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    await addTask({ text: newTask.trim() });
    setNewTask('');
  };

  if (tasks === undefined) {
    return <div style={styles.loading}>Loading tasks...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>My Tasks</h2>
        <p style={styles.subtitle}>
          Connected to Convex - changes sync in real-time
        </p>
      </div>

      <form style={styles.form} onSubmit={handleSubmit}>
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="What needs to be done?"
          style={styles.input}
        />
        <button type="submit" style={styles.addButton}>
          Add
        </button>
      </form>

      <div style={styles.list}>
        {tasks.length === 0 ? (
          <div style={styles.empty}>
            No tasks yet. Add one above!
          </div>
        ) : (
          tasks.map((task: Task) => (
            <div key={task._id} style={styles.task}>
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => toggleTask({ id: task._id })}
                style={styles.checkbox}
              />
              <span
                style={{
                  ...styles.taskText,
                  ...(task.completed ? styles.completedText : {}),
                }}
              >
                {task.text}
              </span>
              <button
                onClick={() => removeTask({ id: task._id })}
                style={styles.deleteButton}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
