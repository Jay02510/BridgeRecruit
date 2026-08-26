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
  { href: '/dashboard/settings', label: 'Settings' },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { instance } = useMsal();

  return (
    <nav className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800 pb-3 mb-2">
      <span className="font-semibold text-sm tracking-tight mr-5">BridgeRecruit</span>
      {LINKS.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-600 ${
              active
                ? 'bg-gray-900 text-white font-medium dark:bg-gray-100 dark:text-gray-900'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
      <button
        onClick={() => instance.logoutRedirect()}
        className="ml-auto rounded-md px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-600"
      >
        Sign out
      </button>
    </nav>
  );
}
