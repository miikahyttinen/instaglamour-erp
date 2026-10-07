import { ExternalLink } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../../api/enums';
import type { PublicOffer } from '../../api/types';
import { buttonClass } from '../../components/buttonClass';
import { Logo } from '../../components/Logo';
import { SectionLabel } from '../../components/SectionLabel';
import { isLanguage } from '../../i18n';
import { formatDateWithWeekday } from '../../lib/format';
import type { Theme } from '../../theme/theme';
import './offerPreview.css';

/**
 * Props of `OfferPreview` (stable API, documented in frontend/README.md → "Offer preview").
 * Used by the public page `/o/:token` (UC-030) and by the offer page preview (TASK-138).
 */
export interface OfferPreviewProps {
  /**
   * What the customer sees — exactly the shape of `GET /api/public/offers/{token}`. Only these
   * fields are read; anything else on the object (price, disposition, ids, …) is never rendered.
   * Internal callers map `OfferDetail` + seller + references text to this shape.
   */
  offer: PublicOffer;
  /** Language of labels, the date and the references text. Default: the current UI language. */
  lang?: Language;
  /** Heading level of the event name: 1 on the public page (default), 2 inside an app page. */
  titleLevel?: 1 | 2;
  /** Logo colour override (e.g. `'light'` while printing). Default: the current theme. */
  logoTheme?: Theme;
  className?: string;
}

/** Only web links become the Spotify button (never `javascript:` etc.). */
function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Customer view of an offer (UC-030, BR-104): logo, event name, client, date with weekday,
 * venue / city, lineup, what's included, Spotify button, references, seller contact.
 * Never shows a price. Presentational only: no data fetching, no app shell.
 */
export function OfferPreview({ offer, lang, titleLevel = 1, logoTheme, className }: OfferPreviewProps) {
  const { t: uiT, i18n } = useTranslation();
  const language: Language = lang ?? (isLanguage(i18n.language) ? i18n.language : 'fi');
  const t = lang ? i18n.getFixedT(lang) : uiT;
  const ids = useId();
  const titleId = `${ids}-title`;
  const Title = titleLevel === 1 ? 'h1' : 'h2';
  const sectionTag = titleLevel === 1 ? 'h2' : 'h3';

  const place = [nonEmpty(offer.venue), nonEmpty(offer.city)].filter(Boolean).join(', ');
  const lineup = offer.lineup.map((line) => line.trim()).filter(Boolean);
  const includes = nonEmpty(offer.includesText);
  const spotifyUrl = safeHttpUrl(nonEmpty(offer.spotifyUrl));
  const references = nonEmpty(offer.references?.[language]);
  const phone = nonEmpty(offer.seller.phone);

  return (
    <article
      className={['offer-preview', className].filter(Boolean).join(' ')}
      lang={language}
      aria-labelledby={titleId}
    >
      <header className="offer-preview-head">
        <Logo size="large" theme={logoTheme} alt={t('publicOffer.brand')} className="offer-preview-logo" />
        <p className="label offer-preview-eyebrow">{t('offerPreview.eyebrow')}</p>
        <Title id={titleId} className="offer-preview-title">
          {offer.eventName}
        </Title>
      </header>

      <section className="offer-preview-facts-section" aria-labelledby={`${ids}-details`}>
        <SectionLabel as={sectionTag} id={`${ids}-details`} className="visually-hidden">
          {t('offerPreview.details')}
        </SectionLabel>
        <dl className="offer-preview-facts">
          <div>
            <dt className="label">{t('offerPreview.client')}</dt>
            <dd>{offer.clientName}</dd>
          </div>
          <div>
            <dt className="label">{t('offerPreview.date')}</dt>
            <dd>
              <time dateTime={offer.eventDate}>{formatDateWithWeekday(offer.eventDate, language)}</time>
            </dd>
          </div>
          <div>
            <dt className="label">{t('offerPreview.venue')}</dt>
            <dd>{place || '–'}</dd>
          </div>
        </dl>
      </section>

      {(lineup.length > 0 || spotifyUrl || includes) && (
        <div className="offer-preview-body">
          {(lineup.length > 0 || spotifyUrl) && (
            <section aria-labelledby={`${ids}-lineup`}>
              <SectionLabel as={sectionTag} id={`${ids}-lineup`}>
                {t('offerPreview.lineup')}
              </SectionLabel>
              {lineup.length > 0 && (
                <ul className="offer-preview-lineup">
                  {lineup.map((line, index) => (
                    <li key={`${index}-${line}`}>{line}</li>
                  ))}
                </ul>
              )}
              {spotifyUrl && (
                <a
                  className={buttonClass({ className: 'offer-preview-spotify' })}
                  href={spotifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('offerPreview.spotify')}
                  <ExternalLink aria-hidden="true" />
                  <span className="visually-hidden"> {t('offerPreview.newTab')}</span>
                </a>
              )}
            </section>
          )}
          {includes && (
            <section aria-labelledby={`${ids}-includes`}>
              <SectionLabel as={sectionTag} id={`${ids}-includes`}>
                {t('offerPreview.includes')}
              </SectionLabel>
              <p className="offer-preview-text">{includes}</p>
            </section>
          )}
        </div>
      )}

      {references && (
        <section className="offer-preview-references" aria-labelledby={`${ids}-references`}>
          <SectionLabel as={sectionTag} id={`${ids}-references`}>
            {t('offerPreview.references')}
          </SectionLabel>
          <p className="offer-preview-text">{references}</p>
        </section>
      )}

      <section className="offer-preview-contact" aria-labelledby={`${ids}-contact`}>
        <SectionLabel as={sectionTag} id={`${ids}-contact`}>
          {t('offerPreview.contact')}
        </SectionLabel>
        <p className="offer-preview-seller">{offer.seller.name}</p>
        <dl className="offer-preview-contact-list">
          <div>
            <dt className="label">{t('offerPreview.email')}</dt>
            <dd>
              <a href={`mailto:${offer.seller.email}`}>{offer.seller.email}</a>
            </dd>
          </div>
          {phone && (
            <div>
              <dt className="label">{t('offerPreview.phone')}</dt>
              <dd>
                <a href={telHref(phone)}>{phone}</a>
              </dd>
            </div>
          )}
        </dl>
      </section>
    </article>
  );
}
