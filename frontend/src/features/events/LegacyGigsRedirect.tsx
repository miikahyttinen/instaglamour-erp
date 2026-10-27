import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Old `/gigs…` URLs (bookmarks, links in e-mails) from before the Gig → Event rename
 * (SaaS phase 1): `/gigs`, `/gigs/new`, `/gigs/:id` go to the same `/events…` page. The query
 * string and hash are kept, and the old URL is replaced in the history.
 */
export function LegacyGigsRedirect() {
  const { '*': rest = '' } = useParams();
  const { search, hash } = useLocation();
  const pathname = rest ? `/events/${rest}` : '/events';
  return <Navigate to={{ pathname, search, hash }} replace />;
}
