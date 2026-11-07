import { useLayoutEffect } from 'react';

/**
 * Every page opens scrolled to the top (TASK-191): when the path changes, the window scroll
 * position of the previous page is not carried over. Query-string / hash changes on the same
 * page (filters, tabs) keep the position.
 */
export function useScrollTopOnNavigate(pathname: string) {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
}
