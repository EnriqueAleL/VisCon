import { useI18n } from '../i18n';

export function DocumentViewer() {
  const { t } = useI18n();
  return (
    <iframe
      className="document-viewer"
      src={`${import.meta.env.BASE_URL}translation/index.html`}
      title={t('documents.title')}
    />
  );
}
