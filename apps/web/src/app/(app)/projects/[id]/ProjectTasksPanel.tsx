"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  position: number;
  dueAt: string | null;
  completedAt: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  BLOCKED: "Blocked",
};

export default function ProjectTasksPanel({
  projectId,
}: {
  readonly projectId: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/tasks`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { tasks: Task[] };
        setTasks(data.tasks);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(task: Task) {
    const next = task.status === "DONE" ? "TODO" : "DONE";
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)),
    );
    const res = await fetch(`/api/v1/projects/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (!res.ok) {
      void load();
    } else {
      router.refresh();
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/v1/projects/${projectId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      if (res.ok) {
        setNewTitle("");
        await load();
      }
    } finally {
      setAdding(false);
    }
  }

  async function remove(taskId: string) {
    if (!confirm("Delete this task?")) return;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    const res = await fetch(`/api/v1/projects/tasks/${taskId}`, {
      method: "DELETE",
    });
    if (!res.ok) void load();
  }

  const done = tasks.filter((t) => t.status === "DONE").length;

  return (
    <section className="glass p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">
          Kickoff checklist
        </h2>
        <span className="text-xs text-ink-500">
          {done} / {tasks.length} done
        </span>
      </div>

      {loading && tasks.length === 0 && (
        <p className="mt-3 text-sm text-ink-500">Loading…</p>
      )}

      <ul className="mt-3 divide-y divide-white/60">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-3 py-2">
            <input
              type="checkbox"
              checked={task.status === "DONE"}
              onChange={() => void toggle(task)}
              className="h-4 w-4 rounded border-slate-300"
              aria-label={`Mark ${task.title} as ${task.status === "DONE" ? "incomplete" : "done"}`}
            />
            <div className="flex-1 min-w-0">
              <div
                className={
                  task.status === "DONE"
                    ? "text-sm text-ink-400 line-through"
                    : "text-sm text-ink-900"
                }
              >
                {task.title}
              </div>
              {task.description && (
                <div className="text-xs text-ink-500">{task.description}</div>
              )}
            </div>
            <span className="text-xs text-ink-500">
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
            <button
              type="button"
              onClick={() => void remove(task.id)}
              className="text-xs text-ink-400 hover:text-rose-600"
              aria-label={`Delete ${task.title}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={(e) => void add(e)} className="mt-3 flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a task…"
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm"
          disabled={adding}
        />
        <button
          type="submit"
          disabled={adding || !newTitle.trim()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </section>
  );
}
