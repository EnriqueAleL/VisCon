import { useState } from "react";
import { Code2, Play, LoaderCircle, Info } from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import type { Question } from "../shared/types";
import { api } from "./api";
function Button({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button className="button secondary" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
function Notice({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : undefined}
    >
      <Info size={18} />
      <div>{children}</div>
    </div>
  );
}
export default function JavaEditor({
  question,
  source,
  onChange,
  disabled,
  available,
  roomId,
}: {
  question: Question;
  source: string;
  onChange: (s: string) => void;
  disabled?: boolean;
  available: boolean;
  roomId?: string;
}) {
  const [running, setRunning] = useState(false),
    [result, setResult] = useState<{
      passed: number;
      total: number;
      details: string[];
    } | null>(null),
    [error, setError] = useState("");
  async function run() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await api("/java/test", { source, questionId: question.id, roomId }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }
  return (
    <>
      <div className="editor-shell">
        <div className="editor-tab">
          <Code2 size={15} />
          Main.java<span>Java</span>
        </div>
        <CodeMirror
          theme="dark"
          value={source}
          extensions={[java()]}
          onChange={onChange}
          editable={!disabled}
          height="310px"
          basicSetup={{ foldGutter: false, highlightActiveLine: !disabled }}
          aria-label="Java code editor"
        />
      </div>
      <div className="editor-actions">
        <Button
          secondary
          disabled={!available || running || disabled || !source.trim()}
          onClick={run}
        >
          {running ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Play size={15} />
          )}
          Run examples
        </Button>
        <span>Tests run in an isolated service</span>
      </div>
      {!available && (
        <Notice>
          Java runner not connected. You can edit your solution here; execution
          will be available when the runner is configured.
        </Notice>
      )}
      {error && <Notice error>{error}</Notice>}
      {result && (
        <div className="test-output" role="status">
          <strong>
            {result.passed} / {result.total} examples passed
          </strong>
          {result.details.map((d, i) => (
            <pre key={i}>
              Example {i + 1}: {d}
            </pre>
          ))}
        </div>
      )}
    </>
  );
}
