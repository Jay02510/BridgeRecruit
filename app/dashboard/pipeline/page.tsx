'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import Link from 'next/link';
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { useApiToken } from '@/lib/hooks/useApiToken';

interface Institution {
  id: string;
  name: string;
  tier: string;
  city: string;
  country: string;
  pipeline_stage: string;
}

const STAGES: { key: string; label: string }[] = [
  { key: 'initial_outreach', label: 'Initial Outreach' },
  { key: 'in_discussion', label: 'In Discussion' },
  { key: 'visit_scheduled', label: 'Visit Scheduled' },
  { key: 'agreement_feeder_active', label: 'Agreement / Feeder Active' },
  { key: 'dormant', label: 'Dormant' },
];

function Card({ inst }: { inst: Institution }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: inst.id });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-xs cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-50' : ''}`}
    >
      <p className="font-medium">{inst.name}</p>
      <p className="text-gray-500 dark:text-gray-400">
        {inst.city}, {inst.country} · {inst.tier.replace(/_/g, ' ')}
      </p>
    </div>
  );
}

function Column({ stage, label, institutions }: { stage: string; label: string; institutions: Institution[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[200px] rounded border border-gray-200 dark:border-gray-700 p-2 ${isOver ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
    >
      <h2 className="text-sm font-semibold mb-2">
        {label} <span className="text-gray-400 font-normal">({institutions.length})</span>
      </h2>
      <div className="flex flex-col gap-2 min-h-[60px]">
        {institutions.map((inst) => (
          <Card key={inst.id} inst={inst} />
        ))}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const isAuthenticated = useIsAuthenticated();
  const getToken = useApiToken();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/institutions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`API error (${res.status})`);
      setInstitutions(await res.json());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (isAuthenticated) load();
  }, [isAuthenticated, load]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const institutionId = active.id as string;
    const newStage = over.id as string;
    const current = institutions.find((i) => i.id === institutionId);
    if (!current || current.pipeline_stage === newStage) return;

    // Optimistic update, rolled back on failure.
    setInstitutions((prev) =>
      prev.map((i) => (i.id === institutionId ? { ...i, pipeline_stage: newStage } : i))
    );
    try {
      const token = await getToken();
      const res = await fetch(`/api/v1/institutions/${institutionId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage: newStage }),
      });
      if (!res.ok) throw new Error(`Update failed (${res.status})`);
    } catch (err) {
      setError((err as Error).message);
      setInstitutions((prev) =>
        prev.map((i) => (i.id === institutionId ? { ...i, pipeline_stage: current.pipeline_stage } : i))
      );
    }
  }

  if (!isAuthenticated) {
    return (
      <main className="p-8">
        <p>
          Please <Link href="/" className="text-blue-600 underline">sign in</Link> first.
        </p>
      </main>
    );
  }

  return (
    <main className="p-8 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recruitment Pipeline</h1>
        <Link href="/dashboard/institutions" className="text-blue-600 underline text-sm">
          ← All Institutions
        </Link>
      </div>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}

      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto">
          {STAGES.map((s) => (
            <Column
              key={s.key}
              stage={s.key}
              label={s.label}
              institutions={institutions.filter((i) => i.pipeline_stage === s.key)}
            />
          ))}
        </div>
      </DndContext>
    </main>
  );
}
