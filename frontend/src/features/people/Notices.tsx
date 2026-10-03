import { useTranslation } from 'react-i18next';

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
  const kind = notice.error ? 'notice-error' : notice.warnings.length > 0 ? 'notice-warn' : '';
  return (
    <div role="status" className={`notice ${kind} people-notice`}>
      <div>
        <p>{notice.text}</p>
        {notice.warnings.map((w) => (
          <p key={w}>{w}</p>
        ))}
      </div>
      <button type="button" className="btn btn-small" onClick={onDismiss}>
        {t('common.dismiss')}
      </button>
    </div>
  );
}
