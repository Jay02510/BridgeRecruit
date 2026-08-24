'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMsal } from '@azure/msal-react';

const LINKS = [
  { href: '/dashboard/institutions', label: 'Institutions' },
  { href: '/dashboard/pipeline', label: 'Pipeline' },
  { href: '/dashboard/calendar', label: 'Calendar' },
  { href: '/dashboard/needs-attention', label: 'Needs Attention' },
  { href: '/dashboard/reports', label: 'Reports' },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { instance } = useMsal();

  return (
    <nav className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 pb-3 mb-2">
      <span className="font-semibold text-sm mr-4">BridgeRecruit</span>
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded px-3 py-1.5 text-sm ${
              active
                ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <button
        onClick={() => instance.logoutRedirect()}
        className="ml-auto rounded px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        Sign out
      </button>
    </nav>
  );
}
