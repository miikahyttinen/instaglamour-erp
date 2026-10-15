import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PublicOffer } from '../../api/types';
import { setLanguage } from '../../i18n';
import { OfferPreview } from './OfferPreview';

const offer: PublicOffer = {
  eventName: 'Summer Party X',
  clientName: 'Client A',
  eventDate: '2026-05-01',
  venue: 'Venue X',
  city: 'City Y',
  lineup: ['Vocals – Person 1', 'Drums – Person 2'],
  includesText: 'Two sets\nSound system',
  spotifyUrl: 'https://example.com/listen',
  references: [
    {
      id: 'ref-1',
      quote: { fi: 'Lainaus yksi FI\nToinen rivi', en: 'Quote one EN\nSecond line' },
      author: 'Person 5, Client A',
      imageUrl: '/api/public/offers/token-1/references/ref-1/image?v=1',
    },
    { id: 'ref-2', quote: { fi: 'Lainaus kaksi FI', en: null }, author: 'Client B', imageUrl: null },
  ],
  seller: { name: 'Partner A', email: 'partner.a@example.com', phone: '+358 40 000 0001' },
};

describe('OfferPreview', () => {
  it('shows every customer field with the weekday date (FI)', () => {
    render(<OfferPreview offer={offer} />);

    const article = screen.getByRole('article', { name: 'Summer Party X' });
    expect(screen.getByRole('heading', { level: 1, name: 'Summer Party X' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Instaglamour' })).toBeInTheDocument();
    expect(article).toHaveAttribute('lang', 'fi');

    expect(screen.getByText('Client A')).toBeInTheDocument();
    expect(screen.getByText('Perjantai 1.5.2026')).toHaveAttribute('datetime', '2026-05-01');
    expect(screen.getByText('Venue X, City Y')).toBeInTheDocument();

    const lineup = screen.getByRole('region', { name: 'Kokoonpano' });
    expect(within(lineup).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Vocals – Person 1',
      'Drums – Person 2',
    ]);
    const spotify = within(lineup).getByRole('link', { name: /Kuuntele settilistaa Spotifyssä/ });
    expect(spotify).toHaveAttribute('href', 'https://example.com/listen');
    expect(spotify).toHaveAttribute('target', '_blank');
    expect(spotify).toHaveAttribute('rel', 'noopener noreferrer');

    const includes = screen.getByRole('region', { name: 'Tarjoukseen sisältyy' });
    expect(includes).toHaveTextContent('Two sets');
    expect(includes).toHaveTextContent('Sound system');

    const references = screen.getByRole('region', { name: 'Referenssit' });
    expect(references).toHaveTextContent('Lainaus yksi FI');
    expect(screen.queryByText(/Quote one EN/)).not.toBeInTheDocument();

    const contact = screen.getByRole('region', { name: 'Yhteystiedot' });
    expect(within(contact).getByText('Partner A')).toBeInTheDocument();
    expect(within(contact).getByRole('link', { name: 'partner.a@example.com' })).toHaveAttribute(
      'href',
      'mailto:partner.a@example.com',
    );
    expect(within(contact).getByRole('link', { name: '+358 40 000 0001' })).toHaveAttribute(
      'href',
      'tel:+358400000001',
    );
  });

  it('never renders a price or internal fields, even when the data has them', () => {
    const leaky = {
      ...offer,
      id: 'offer-id-1',
      priceCents: 123456,
      disposition: 'LOST_PRICE',
      source: 'INSTAGRAM',
      eventType: 'CORPORATE',
      notes: 'Internal note Q',
      gigId: 'gig-id-1',
    };
    const { container } = render(<OfferPreview offer={leaky} />);
    const text = container.textContent ?? '';
    for (const forbidden of ['1234', '1 234', '1,234', '€', 'LOST_PRICE', 'INSTAGRAM', 'CORPORATE', 'Internal note Q', 'offer-id-1', 'gig-id-1']) {
      expect(text).not.toContain(forbidden);
    }
    expect(container.innerHTML).not.toContain('123456');
    expect(container.innerHTML).not.toContain('offer-id-1');
  });

  it('follows the lang prop (labels, date, references) regardless of the UI language', () => {
    setLanguage('fi');
    render(<OfferPreview offer={offer} lang="en" />);
    expect(screen.getByRole('article')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Friday 1 May 2026')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'References' })).toHaveTextContent('Quote one EN');
    expect(screen.getByRole('link', { name: /Listen to the setlist on Spotify/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Contact' })).toBeInTheDocument();
  });

  it('hides the optional parts when empty and refuses non-web Spotify links', () => {
    render(
      <OfferPreview
        offer={{
          ...offer,
          city: null,
          includesText: '  ',
          spotifyUrl: 'javascript:alert(1)',
          references: null,
          seller: { ...offer.seller, phone: null },
        }}
      />,
    );
    expect(screen.getByText('Venue X')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Tarjoukseen sisältyy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Referenssit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Spotify/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Puhelin')).not.toBeInTheDocument();
  });

  it('shows each reference with photo or placeholder, quote (line breaks kept) and author (BR-108)', () => {
    const { container } = render(<OfferPreview offer={offer} />);
    const region = screen.getByRole('region', { name: 'Referenssit' });
    const items = within(region).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    const [first, second] = items as [HTMLElement, HTMLElement];
    const photo = first.querySelector('img');
    expect(photo).toHaveAttribute('src', '/api/public/offers/token-1/references/ref-1/image?v=1');
    expect(photo).toHaveAttribute('alt', '');
    expect(first.querySelector('blockquote')!.textContent).toBe('Lainaus yksi FI\nToinen rivi');
    expect(within(first).getByText('Person 5, Client A').tagName).toBe('FIGCAPTION');

    expect(second.querySelector('img')).toBeNull();
    const placeholder = within(second).getByTestId('reference-placeholder');
    expect(placeholder).toHaveAttribute('aria-hidden', 'true');
    expect(placeholder).toHaveTextContent('CB');
    expect(within(second).getByText('Client B')).toBeInTheDocument();
    // No external images anywhere: every img is the logo or an /api photo.
    for (const img of container.querySelectorAll('img')) {
      expect(img.getAttribute('src')).not.toMatch(/^https?:/);
    }
  });

  it('falls back to the Finnish quote on the English page and marks its language', () => {
    render(<OfferPreview offer={offer} lang="en" />);
    const region = screen.getByRole('region', { name: 'References' });
    const quotes = region.querySelectorAll('blockquote');
    expect(quotes[0]).toHaveTextContent('Quote one EN');
    expect(quotes[0]).not.toHaveAttribute('lang');
    expect(quotes[1]).toHaveTextContent('Lainaus kaksi FI');
    expect(quotes[1]).toHaveAttribute('lang', 'fi');
  });

  it('replaces a photo that fails to load with the placeholder', () => {
    render(<OfferPreview offer={offer} />);
    const region = screen.getByRole('region', { name: 'Referenssit' });
    const first = within(region).getAllByRole('listitem')[0]!;
    fireEvent.error(first.querySelector('img')!);
    expect(first.querySelector('img')).toBeNull();
    expect(within(first).getByTestId('reference-placeholder')).toHaveTextContent('P5');
  });

  it('hides the references section for an empty list', () => {
    render(<OfferPreview offer={{ ...offer, references: [] }} />);
    expect(screen.queryByRole('region', { name: 'Referenssit' })).not.toBeInTheDocument();
  });

  it('uses h2 for the title and h3 for sections inside an app page (titleLevel 2)', () => {
    render(<OfferPreview offer={offer} titleLevel={2} />);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Summer Party X' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Kokoonpano' })).toBeInTheDocument();
  });
});
