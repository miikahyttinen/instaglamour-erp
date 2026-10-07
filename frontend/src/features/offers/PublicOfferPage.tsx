import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { isApiError } from '../../api/client';
import { publicOffersApi } from '../../api/endpoints';
import { Button } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { detectBrowserLanguage, setLanguage } from '../../i18n';
import { useLang } from '../../i18n/useLang';
import { LanguageButtons } from '../../layout/LanguageButtons';
import { OfferPreview } from './OfferPreview';
import './publicOffer.css';

const publicOfferKey = (token: string) => ['public-offer', token] as const;

/**
 * True while the browser prints. The page then renders in the light theme (black logo, dark text
 * on white) whatever the screen theme is. `flushSync` so the change is in the DOM before the
 * print layout is taken.
 */
function usePrinting(): boolean {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return printing;
}

/** Sets the tab title while mounted and restores the previous one afterwards. */
function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/**
 * Public offer page `/o/:token` (UC-030, BR-104). Rendered outside the auth provider and the
 * app shell: no sidebar, top bar or year, and its only request is
 * `GET /api/public/offers/{token}`. Language: the browser's (FI/EN switch, not saved anywhere);
 * theme: the OS preference. Not indexed (`<meta name="robots">`).
 */
export function PublicOfferPage() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const printing = usePrinting();
  const theme = printing ? 'light' : undefined;

  // The customer's browser language, not whatever the app last used in this tab.
  useEffect(() => {
    setLanguage(detectBrowserLanguage());
  }, []);

  const query = useQuery({
    queryKey: publicOfferKey(token),
    queryFn: ({ signal }) => publicOffersApi.get(token, signal),
    staleTime: Infinity,
  });

  const notFound = isApiError(query.error) && query.error.status === 404;
  const brand = t('publicOffer.brand');
  let title = brand;
  if (query.data) title = `${query.data.eventName} – ${brand}`;
  else if (notFound) title = `${t('publicOffer.notFoundTitle')} – ${brand}`;
  useDocumentTitle(title);

  let content;
  if (query.data) {
    content = <OfferPreview offer={query.data} logoTheme={theme} />;
  } else if (query.isPending) {
    content = (
      <p className="public-offer-state muted" role="status">
        {t('publicOffer.loading')}
      </p>
    );
  } else {
    content = (
      <div className="public-offer-state">
        <Logo size="large" theme={theme} alt={brand} className="public-offer-logo" />
        <h1 className="public-offer-state-title">
          {notFound ? t('publicOffer.notFoundTitle') : t('publicOffer.errorTitle')}
        </h1>
        {notFound ? (
          <p className="muted">{t('publicOffer.notFoundText')}</p>
        ) : (
          <>
            <p className="muted" role="alert">
              {t('publicOffer.errorText')}
            </p>
            <div>
              <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
                {t('app.retry')}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <main className="public-offer" data-theme={theme}>
      {/* React hoists these into <head> (React 19 document metadata). */}
      <meta name="robots" content="noindex, nofollow" />
      <div className="public-offer-inner">
        <div className="public-offer-top">
          <LanguageButtons value={lang} onChange={setLanguage} />
        </div>
        {content}
      </div>
    </main>
  );
}
