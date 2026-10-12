import { useCallback, useEffect, useState } from "react";

export interface StoredEvidence {
  kind: "node" | "file" | "incident" | "metric";
  label: string;
}

export interface ChatTurn {
  q: string;
  a: string;
  evidence: StoredEvidence[];
}

export interface Conversation {
  id: string;
  title: string;
  /** node the conversation started on, for context */
  nodeLabel: string;
  updatedAt: number;
  turns: ChatTurn[];
}

const KEY = "nykst.chats";

function read(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: Conversation[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 40)));
}

function newId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Conversation memory that survives reloads, like a chat sidebar. */
export function useChatMemory(nodeLabel: string) {
  const [chats, setChats] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const list = read();
    setChats(list);
    setActiveId(list[0]?.id ?? null);
  }, []);

  const active = chats.find((c) => c.id === activeId) ?? null;

  const persist = useCallback((next: Conversation[]) => {
    setChats(next);
    write(next);
  }, []);

  const startNew = useCallback(() => {
    const c: Conversation = {
      id: newId(),
      title: `New chat · ${nodeLabel}`,
      nodeLabel,
      updatedAt: Date.now(),
      turns: [],
    };
    setChats((prev) => {
      const next = [c, ...prev];
      write(next);
      return next;
    });
    setActiveId(c.id);
    return c.id;
  }, [nodeLabel]);

  const addTurn = useCallback(
    (turn: ChatTurn) => {
      setChats((prev) => {
        let id = activeId;
        let list = prev;
        if (!id || !prev.some((c) => c.id === id)) {
          id = newId();
          list = [
            { id, title: turn.q.slice(0, 44), nodeLabel, updatedAt: Date.now(), turns: [] },
            ...prev,
          ];
          setActiveId(id);
        }
        const next = list.map((c) =>
          c.id === id
            ? {
                ...c,
                title: c.turns.length === 0 ? turn.q.slice(0, 44) : c.title,
                updatedAt: Date.now(),
                turns: [...c.turns, turn],
              }
            : c,
        );
        write(next);
        return next;
      });
    },
    [activeId, nodeLabel],
  );

  const remove = useCallback(
    (id: string) => {
      setChats((prev) => {
        const next = prev.filter((c) => c.id !== id);
        write(next);
        setActiveId((cur) => (cur === id ? (next[0]?.id ?? null) : cur));
        return next;
      });
    },
    [],
  );

  const rename = useCallback((id: string, title: string) => {
    setChats((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, title: title || c.title } : c));
      write(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    persist([]);
    setActiveId(null);
  }, [persist]);

  return { chats, active, activeId, setActiveId, startNew, addTurn, remove, rename, clearAll };
}
