export function DocumentViewer() {
  return (
    <iframe
      className="document-viewer"
      src={`${import.meta.env.BASE_URL}translation/index.html`}
      title="PDF-Dokument · Theoretische Informatik"
    />
  );
}
