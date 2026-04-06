import { useMemoizedFn } from 'ahooks';
import { useChatSession } from '../stores/chat-session';
import styles from './WelcomePanel.module.scss';

interface QuickStartItem {
  label: string;
  prompt: string;
}

const QUICK_START_ITEMS: QuickStartItem[] = [
  {
    label: 'Generate a Project Tracker',
    prompt:
      'Build me a project tracker app as a DeskTalk LiveApp.\n\nRequirements:\n\n- Let me create projects with name, description, status (Not Started / In Progress / Done), and deadline.\n- Support adding tasks under each project with assignee, priority, and completion status.\n- Include a dashboard view showing project progress at a glance.\n- Persist all data locally with the DeskTalk storage bridge so data survives reloads.\n- Include a clean responsive layout that works well in a DeskTalk window.\n- Follow the DeskTalk manual for styling, components, and platform conventions.\n\nPlease create the LiveApp directly.',
  },
  {
    label: 'Generate a System Monitor',
    prompt:
      'Build me a system monitor dashboard as a DeskTalk LiveApp.\n\nRequirements:\n\n- Display simulated real-time metrics: CPU usage, memory usage, disk space, and network activity.\n- Use animated gauges or progress bars that update periodically.\n- Include a process list table with sortable columns (name, CPU %, memory).\n- Add a simple line chart showing usage history over time.\n- Include a clean responsive layout that works well in a DeskTalk window.\n- Follow the DeskTalk manual for styling, components, and platform conventions.\n\nPlease create the LiveApp directly.',
  },
];

export function WelcomePanel({ socket }: { socket: WebSocket | null }) {
  const submitPrompt = useChatSession((s) => s.submitPrompt);

  const handleQuickStart = useMemoizedFn((item: QuickStartItem) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const didSend = submitPrompt(item.prompt, 'text', socket);
    if (didSend) {
      useChatSession.getState().clearDraftInput();
    }
  });

  return (
    <div className={styles.welcome}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome to DeskTalk</h1>
        <p className={styles.subtitle}>
          Your AI-powered desktop. Ask the AI assistant anything, or get started instantly with one
          of these templates.
        </p>

        <div className={styles.quickStart}>
          {QUICK_START_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={styles.quickStartButton}
              onClick={() => handleQuickStart(item)}
            >
              <span className={styles.quickStartLabel}>{item.label}</span>
              <span className={styles.quickStartArrow}>&rarr;</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
