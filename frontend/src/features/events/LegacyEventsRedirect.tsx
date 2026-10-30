import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Old `/events…` URLs (bookmarks, links in e-mails) from before the UI went back to "Gigs":
 * `/events`, `/events/new`, `/events/:id` go to the same `/gigs…` page. The query string and
 * hash are kept, and the old URL is replaced in the history. (API and code still say `event`.)
 */
export function LegacyEventsRedirect() {
  const { '*': rest = '' } = useParams();
  const { search, hash } = useLocation();
  const pathname = rest ? `/gigs/${rest}` : '/gigs';
  return <Navigate to={{ pathname, search, hash }} replace />;
}
