'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Home() {
  useEffect(() => {
    // Check for stored auth token
    const token = localStorage.getItem('accessToken');
    if (token) {
      window.location.href = '/chat';
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            🔒 Secure Messenger
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            End-to-end encrypted messaging
          </p>
        </div>

        <div className="space-y-4 mt-8">
          <Link
            href="/auth/signup"
            className="block w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors text-center"
          >
            Créer un compte
          </Link>
          <Link
            href="/auth/login"
            className="block w-full py-3 px-4 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold rounded-lg transition-colors text-center"
          >
            Se connecter
          </Link>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Sécurité de pointe
          </h3>
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              Chiffrement E2E (Signal Protocol)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              Forward & Future Secrecy
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              Multi-devices (iOS, Android, Web)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              Messages éphémères
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
