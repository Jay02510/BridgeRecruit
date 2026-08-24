'use client';

import { useCallback, useEffect, useState } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import Link from 'next/link';
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core';
import { useApiToken } from '@/lib/hooks/useApiToken';
import { DashboardNav } from '@/components/dashboard-nav';

interface Institution {
  id: string;
  name: string;
  tier: string;
  city: string;
  country: string;
  pipeline_stage: string;
}

const STAGES: { key: string; label: string; badge: string; dot: string }[] = [
  { key: 'initial_outreach', label: 'Initial Outreach', badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', dot: 'bg-slate-400' },
  { key: 'in_discussion', label: 'In Discussion', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', dot: 'bg-blue-500' },
  { key: 'visit_scheduled', label: 'Visit Scheduled', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300', dot: 'bg-purple-500' },
  { key: 'agreement_feeder_active', label: 'Agreement / Feeder Active', badge: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', dot: 'bg-green-500' },
  { key: 'dormant', label: 'Dormant', badge: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500', dot: 'bg-gray-400' },
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

function Column({
  stage,
  label,
  badge,
  dot,
  institutions,
}: {
  stage: string;
  label: string;
  badge: string;
  dot: string;
  institutions: Institution[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-w-[200px] rounded border border-gray-200 dark:border-gray-700 p-2 ${isOver ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
    >
      <div className={`rounded px-2 py-1 mb-2 flex items-center gap-1.5 text-sm font-semibold ${badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {label} <span className="font-normal opacity-70">({institutions.length})</span>
      </div>
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

  async function handleExport() {
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/v1/institutions/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pipeline-snapshot.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
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
      <DashboardNav />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Recruitment Pipeline</h1>
        <button
          onClick={handleExport}
          className="rounded bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-1.5 text-sm hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          Export Snapshot (CSV)
        </button>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2">
        Every institution in the system, grouped by how far along the partnership process it is. New
        institutions start in Initial Outreach — drag a card right as the relationship progresses
        (visit scheduled, agreement signed) or into Dormant if it&apos;s no longer active.
      </p>

      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}

      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto">
          {STAGES.map((s) => (
            <Column
              key={s.key}
              stage={s.key}
              label={s.label}
              badge={s.badge}
              dot={s.dot}
              institutions={institutions.filter((i) => i.pipeline_stage === s.key)}
            />
          ))}
        </div>
      </DndContext>
    </main>
  );
}
