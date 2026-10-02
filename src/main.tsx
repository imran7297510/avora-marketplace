// Fail-safe storage polyfills for sandboxed iframes
try {
  const testKey = '__test_local_storage__';
  window.localStorage.setItem(testKey, testKey);
  window.localStorage.removeItem(testKey);
} catch (e) {
  const storage: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string): string | null => {
      return key in storage ? storage[key] : null;
    },
    setItem: (key: string, value: string): void => {
      storage[key] = String(value);
    },
    removeItem: (key: string): void => {
      delete storage[key];
    },
    clear: (): void => {
      for (const key in storage) {
        delete storage[key];
      }
    },
    key: (index: number): string | null => {
      const keys = Object.keys(storage);
      return keys[index] || null;
    },
    get length(): number {
      return Object.keys(storage).length;
    }
  };
  
  try {
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true
    });
  } catch (err) {
    console.warn("Failed to redefine localStorage:", err);
  }
}

try {
  const testKey = '__test_session_storage__';
  window.sessionStorage.setItem(testKey, testKey);
  window.sessionStorage.removeItem(testKey);
} catch (e) {
  const storage: Record<string, string> = {};
  const mockSessionStorage = {
    getItem: (key: string): string | null => {
      return key in storage ? storage[key] : null;
    },
    setItem: (key: string, value: string): void => {
      storage[key] = String(value);
    },
    removeItem: (key: string): void => {
      delete storage[key];
    },
    clear: (): void => {
      for (const key in storage) {
        delete storage[key];
      }
    },
    key: (index: number): string | null => {
      const keys = Object.keys(storage);
      return keys[index] || null;
    },
    get length(): number {
      return Object.keys(storage).length;
    }
  };
  
  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: mockSessionStorage,
      writable: true,
      configurable: true
    });
  } catch (err) {
    console.warn("Failed to redefine sessionStorage:", err);
  }
}

import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { GlobalErrorBoundary } from './components/GlobalErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <App />
    </GlobalErrorBoundary>
  </StrictMode>,
);
