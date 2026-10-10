import { useEffect, useRef, useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';

/* The galaxy shows a course's documents inside the course panel, not behind a
 * global button — documents belong to a course. This is the same section for
 * the list view: the same catalogue, the same reader, the same close message. */

interface DocumentEntry {
  id: string;
  courseId: string;
  title: string;
  filename: string;
  kind: string;
  indexed?: boolean;
}

type Catalogue = { state: 'loading' | 'ready' | 'failed'; documents: DocumentEntry[] };

export function CourseDocuments({ courseId }: { courseId: string }) {
  const [catalogue, setCatalogue] = useState<Catalogue>({ state: 'loading', documents: [] });
  const [openId, setOpenId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${import.meta.env.BASE_URL}translation/documents.json`)
      .then((response) => {
        if (!response.ok) throw new Error('Document catalogue unavailable');
        return response.json();
      })
      .then((data: { documents?: DocumentEntry[] }) => {
        if (!live) return;
        if (!Array.isArray(data.documents)) throw new Error('Invalid document catalogue');
        setCatalogue({ state: 'ready', documents: data.documents });
      })
      .catch(() => live && setCatalogue({ state: 'failed', documents: [] }));
    return () => { live = false; };
  }, []);

  // The reader asks to be closed from inside the frame (its own Galaxie button).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin) return;
      if (event.data?.type === 'viscon:close-document') setOpenId(null);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (openId && !node.open) node.showModal();
    if (!openId && node.open) { node.close(); trigger.current?.focus(); }
  }, [openId]);

  const available = catalogue.documents.filter((entry) => entry.courseId === courseId);
  const open = available.find((entry) => entry.id === openId) ?? null;

  return (
    <section className="course-docs" aria-label="Kursdokumente">
      <h2 className="course-docs-head">
        Dokumente <span>{catalogue.state === 'loading' ? '…' : available.length}</span>
      </h2>

      {available.length === 0 ? (
        <p className="course-docs-empty">
          {catalogue.state === 'failed'
            ? 'Dokumentliste konnte nicht geladen werden. Bitte lade die Seite neu.'
            : catalogue.state === 'loading'
              ? 'Dokumente werden geladen …'
              : 'Noch keine Dokumente für diesen Kurs.'}
        </p>
      ) : (
        <div className="course-docs-list">
          {available.map((entry) => (
            <button
              key={entry.id}
              className="course-doc"
              onClick={(event) => { trigger.current = event.currentTarget; setOpenId(entry.id); }}
            >
              <span className="course-doc-symbol" aria-hidden="true"><FileText size={16} /></span>
              <span className="course-doc-identity">
                <small>{entry.kind} / PDF</small>
                <strong>{entry.title}</strong>
              </span>
              <ExternalLink size={14} className="course-doc-arrow" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <dialog
        className="course-doc-reader"
        ref={dialog}
        aria-label="Dokument lesen"
        onCancel={(event) => { event.preventDefault(); setOpenId(null); }}
      >
        {open && (
          <iframe
            title={`Dokument lesen · ${open.title}`}
            src={`${import.meta.env.BASE_URL}translation/index.html?embedded=galaxy&document=${encodeURIComponent(open.id)}`}
          />
        )}
      </dialog>
    </section>
  );
}
