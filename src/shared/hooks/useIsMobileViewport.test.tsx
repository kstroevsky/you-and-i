import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetViewportQueryStoresForTests, useIsMobileViewport } from './useIsMobileViewport';

function ViewportProbe() {
  useIsMobileViewport(720);

  return null;
}

describe('useIsMobileViewport', () => {
  afterEach(() => {
    resetViewportQueryStoresForTests();
  });

  it('shares one media-query subscription per breakpoint', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const matchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener,
      removeEventListener,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    }));

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: matchMedia,
    });

    const { unmount } = render(
      <>
        <ViewportProbe />
        <ViewportProbe />
      </>,
    );

    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledTimes(1);

    unmount();

    expect(removeEventListener).toHaveBeenCalledTimes(1);
  });
});
