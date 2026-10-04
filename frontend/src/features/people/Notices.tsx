import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Notice as NoticeMessage } from '../../components/Notice';

export interface Notice {
  text: string;
  /** Translated non-blocking warnings (e.g. DUPLICATE_NAME); saving still succeeded. */
  warnings: string[];
  error?: boolean;
}

/** Result of the last save: success text plus any warnings, or an error. */
export function NoticeBox({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  const { t } = useTranslation();
  if (!notice) return <div role="status" />;
  const tone = notice.error ? 'danger' : notice.warnings.length > 0 ? 'warn' : 'ok';
  return (
    <NoticeMessage tone={tone} role="status" className="people-notice">
      <div>
        <p>{notice.text}</p>
        {notice.warnings.map((w) => (
          <p key={w}>{w}</p>
        ))}
      </div>
      <Button size="sm" onClick={onDismiss}>
        {t('common.dismiss')}
      </Button>
    </NoticeMessage>
  );
}
