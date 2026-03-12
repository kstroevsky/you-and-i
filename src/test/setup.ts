import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

import { resetViewportQueryStoresForTests } from '@/shared/hooks/useIsMobileViewport';

function evaluateMediaQuery(query: string): boolean {
  const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/);

  if (maxWidthMatch) {
    return window.innerWidth <= Number(maxWidthMatch[1]);
  }

  const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/);

  if (minWidthMatch) {
    return window.innerWidth >= Number(minWidthMatch[1]);
  }

  return false;
}

type MockMediaQueryListener = ((event: MediaQueryListEvent) => void) | EventListenerObject;

type MockMediaQueryList = MediaQueryList & {
  _listeners: Set<MockMediaQueryListener>;
  _setMatches: (matches: boolean) => void;
};

const mediaQueryLists = new Set<MockMediaQueryList>();

function notifyMediaQueries() {
  for (const mediaQueryList of mediaQueryLists) {
    const nextMatches = evaluateMediaQuery(mediaQueryList.media);

    if (nextMatches === mediaQueryList.matches) {
      continue;
    }

    mediaQueryList._setMatches(nextMatches);
    const event = {
      matches: nextMatches,
      media: mediaQueryList.media,
    } as MediaQueryListEvent;

    mediaQueryList.onchange?.(event);

    for (const listener of mediaQueryList._listeners) {
      if (typeof listener === 'function') {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }
}

window.addEventListener('resize', notifyMediaQueries);

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => {
    let matches = evaluateMediaQuery(query);
    const listeners = new Set<MockMediaQueryListener>();
    const mediaQueryList: MockMediaQueryList = {
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: MockMediaQueryListener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: MockMediaQueryListener) => {
        listeners.delete(listener);
      },
      addListener: (listener) => {
        if (listener) {
          listeners.add(listener);
        }
      },
      removeListener: (listener) => {
        if (listener) {
          listeners.delete(listener);
        }
      },
      dispatchEvent: () => true,
      get matches() {
        return matches;
      },
      _listeners: listeners,
      _setMatches: (nextMatches) => {
        matches = nextMatches;
      },
    } as MockMediaQueryList;

    mediaQueryLists.add(mediaQueryList);

    return mediaQueryList;
  },
});

afterEach(() => {
  cleanup();
  mediaQueryLists.clear();
  resetViewportQueryStoresForTests();
  window.localStorage.clear();
});
