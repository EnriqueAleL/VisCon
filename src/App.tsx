import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  Check,
  Copy,
  Link,
  Plus,
  Clock,
  Users,
  ChevronRight,
  LogOut,
  Trophy,
  BookOpen,
  Code2,
  Hash,
  ListChecks,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  LoaderCircle,
  RotateCcw,
  Play,
  BarChart3,
  Settings2,
  Sigma,
  Braces,
  Sparkles,
  ExternalLink,
  X,
  Flag,
  Info,
  Target,
} from "lucide-react";
import katex from "katex";
import type {
  Bootstrap,
  Settings,
  RoomView,
  Player,
  Profile,
  HistoryEntry,
  Question,
  Format,
} from "../shared/types";
import { api } from "./api";
import { ProductHeader } from "../shared/design/ProductHeader";
import { GlobeArrival } from "./GlobeArrival";

const JavaEditorImpl = lazy(() => import("./JavaEditor"));
function JavaEditor(props: React.ComponentProps<typeof JavaEditorImpl>) {
  return (
    <Suspense
      fallback={
        <div className="loading">
          <LoaderCircle className="spin" />
          Loading editor…
        </div>
      }
    >
      <JavaEditorImpl {...props} />
    </Suspense>
  );
}
const formats: Record<
  Format,
  { name: string; description: string; icon: typeof Code2 }
> = {
  quiz: {
    name: "Quiz",
    description: "Choose the right answer",
    icon: ListChecks,
  },
  numeric: {
    name: "Numeric",
    description: "Calculate your answer",
    icon: Hash,
  },
  java: { name: "Java", description: "Write a short solution", icon: Code2 },
};
function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const fn = () => setPath(location.pathname);
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);
  return [
    path,
    (p: string) => {
      if (p === "/") p = "/arena";
      history.pushState({}, "", p);
      setPath(p);
      window.scrollTo(0, 0);
    },
  ] as const;
}
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
const number = (n: number) => n.toLocaleString("en-US");
const duration = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
function Avatar({
  player,
  opponent = false,
  large = false,
}: {
  player: Pick<Profile, "name">;
  opponent?: boolean;
  large?: boolean;
}) {
  return (
    <span
      className={`avatar ${opponent ? "opponent" : ""} ${large ? "large" : ""}`}
    >
      {initials(player.name)}
    </span>
  );
}
function Button({
  children,
  onClick,
  disabled = false,
  secondary = false,
  className = "",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`button ${secondary ? "secondary" : "primary"} ${className}`}
    >
      {children}
    </button>
  );
}
function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
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
function MathText({ value }: { value: string }) {
  return (
    <div
      className="formula"
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(value, {
          throwOnError: false,
          trust: false,
          displayMode: true,
        }),
      }}
    />
  );
}
function QuestionContent({ q }: { q: Question }) {
  return (
    <>
      <h2>{q.title}</h2>
      <div className="question-meta">
        <span>{q.topic}</span>
        <span className="difficulty">{q.difficulty}</span>
      </div>
      <div className="prompt">{q.prompt}</div>
      {q.formula && <MathText value={q.formula} />}
    </>
  );
}

export default function App() {
  const [leaveTo, setLeaveTo] = useState("/");
  const [path, navigate] = usePath();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [roomError, setRoomError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const socket = useRef<Socket | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const currentRoom = path.startsWith("/room/")
    ? path.split("/")[2]?.toUpperCase()
    : null;
  roomIdRef.current = currentRoom;
  const refresh = async () => {
    const d = await api<Bootstrap>("/bootstrap");
    setData(d);
    return d;
  };
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!data?.profile.id) return;
    const s = io({ autoConnect: true });
    socket.current = s;
    s.on("connect", () => {
      setConnected(true);
      if (roomIdRef.current)
        s.emit("watch", { id: roomIdRef.current }, () => {});
    });
    s.on("disconnect", () => setConnected(false));
    s.on("connect_error", () => setConnected(false));
    s.on("room", (r: RoomView) => {
      if (r.id === roomIdRef.current) setRoom(r);
    });
    return () => {
      s.disconnect();
      socket.current = null;
    };
  }, [data?.profile.id]);
  useEffect(() => {
    setError("");
    setRoomError("");
    if (!currentRoom || !data?.profile.id) {
      setRoom(null);
      return;
    }
    let alive = true;
    setRoom(null);
    api<RoomView>(`/rooms/${encodeURIComponent(currentRoom)}/join`, {})
      .then((r) => {
        if (!alive) return;
        setRoom(r);
        socket.current?.emit("watch", { id: r.id }, () => {});
        refresh().catch(() => {});
      })
      .catch((e) => alive && setRoomError(e.message));
    return () => {
      alive = false;
    };
  }, [currentRoom, data?.profile.id]);
  useEffect(() => {
    if (!confirmLeave) {
      setLeaveTo("/");
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector(".dialog");
    const buttons = dialog?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmLeave(false);
      if (event.key === "Tab" && buttons?.length) {
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [confirmLeave]);
  useEffect(() => {
    if (room?.state === "finished" || room?.state === "cancelled")
      refresh().catch(() => {});
  }, [room?.state]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  async function action(event: string, payload: Record<string, unknown> = {}) {
    if (!socket.current?.connected) {
      setError("Connection lost. Your match will resume when you reconnect.");
      return false;
    }
    setError("");
    setBusy(true);
    return new Promise<boolean>((resolve) => {
      socket
        .current!.timeout(20000)
        .emit(
          event,
          { id: currentRoom, ...payload },
          (timeout: Error | null, result: any) => {
            setBusy(false);
            if (timeout) {
              setError(
                "The request is taking longer than expected. Check the match state before trying again.",
              );
              resolve(false);
            } else if (!result?.ok) {
              setError(result?.error || "Please try again.");
              resolve(false);
            } else resolve(true);
          },
        );
    });
  }
  async function createRoom(subject?: string, practice = false) {
    setBusy(true);
    setError("");
    try {
      const r = await api<RoomView>("/rooms", {
        settings: { subject: subject || data?.subjects[0]?.id },
        practice,
      });
      navigate(`/room/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/room/${room!.id}`,
      );
      setToast("Invite link copied");
    } catch {
      setToast("Select and copy the invitation link below.");
    }
  }
  async function leave() {
    if (!room) return;
    try {
      await api(`/rooms/${room.id}/leave`, {});
      setConfirmLeave(false);
      if (leaveTo === "/learn") {
        location.assign("/learn");
        return;
      }
      navigate("/arena");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function rematch() {
    if (!room) return;
    setBusy(true);
    try {
      const r = await api<RoomView>(`/rooms/${room.id}/rematch`, {});
      navigate(`/room/${r.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="boot">
        <div className="wordmark">
          VisCon <span>Arena</span>
        </div>
        {error ? (
          <>
            <Notice error>{error}</Notice>
            <Button onClick={() => location.reload()}>Retry connection</Button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>Getting your study space ready…</p>
          </>
        )}
      </div>
    );
  const inMatch =
    room && ["playing", "review", "countdown"].includes(room.state);
  const safeNavigate = (p: string) => {
    if (inMatch) {
      setConfirmLeave(true);
      return;
    }
    navigate(p);
  };
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ProductHeader
        module={path === "/campus" ? "Campus" : "Arena"}
        onHome={() => safeNavigate("/")}
        actions={
          <button
            className={`profile-button ${path === "/profile" ? "active" : ""}`}
            onClick={() => safeNavigate("/profile")}
            aria-label="Your profile"
          >
            <span>
              <strong>{data.profile.name}</strong>
              <small>{number(data.profile.rating)} Elo</small>
            </span>
            <Avatar player={data.profile} />
          </button>
        }
      >
        <button
          className={path === "/" || path === "/arena" || currentRoom ? "active" : ""}
          onClick={() => safeNavigate("/")}
        >
          Play
        </button>
        <button
          className={path === "/history" ? "active" : ""}
          onClick={() => safeNavigate("/history")}
        >
          Match history
        </button>
        <button
          className={path === "/leaderboard" ? "active" : ""}
          onClick={() => safeNavigate("/leaderboard")}
        >
          Leaderboard
        </button>
        <a
          href="/learn"
          onClick={(event) => {
            if (room && !["finished", "cancelled"].includes(room.state)) {
              event.preventDefault();
              setLeaveTo("/learn");
              setConfirmLeave(true);
            }
          }}
        >
          Lectures
        </a>
        <button
          className={path === "/campus" ? "active" : ""}
          onClick={() => safeNavigate("/campus")}
        >
          Campus
        </button>
      </ProductHeader>
      <main
        id="main"
        className={`page ${inMatch ? "match-page" : ""} ${path === "/campus" ? "campus-page" : ""}`}
      >
        {error && (
          <div className="global-error">
            <Notice error>{error}</Notice>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={17} />
            </button>
          </div>
        )}
        {currentRoom ? (
          roomError ? (
            <div className="empty-page">
              <Link size={34} />
              <h1>That room is unavailable.</h1>
              <p>{roomError}</p>
              <Button onClick={() => navigate("/arena")}>Back to Play</Button>
            </div>
          ) : !room ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              Joining your room…
            </div>
          ) : (
            <>
              {!connected && (
                <Notice error>
                  <strong>Reconnecting…</strong> Your answers are saved. The
                  match clock keeps running; return within 60 seconds.
                </Notice>
              )}
              {room.state === "lobby" && (
                <Lobby
                  room={room}
                  me={data.profile}
                  data={data}
                  connected={connected}
                  busy={busy}
                  onSettings={(s) => action("settings", { settings: s })}
                  onReady={() =>
                    action("ready", {
                      ready: !room.players.find((p) => p.id === data.profile.id)
                        ?.ready,
                    })
                  }
                  onCopy={copyInvite}
                  onLeave={() => setConfirmLeave(true)}
                  onJava={() => navigate("/java")}
                />
              )}
              {inMatch && (
                <Match
                  key={room.id}
                  room={room}
                  me={data.profile}
                  connected={connected}
                  busy={busy}
                  onAnswer={(value) => action("answer", { value })}
                  onNext={() => action("next")}
                  onLeave={() => setConfirmLeave(true)}
                />
              )}
              {room.state === "finished" && (
                <Results
                  room={room}
                  me={data.profile}
                  busy={busy}
                  onRematch={rematch}
                  onHome={() => navigate("/arena")}
                />
              )}
              {room.state === "cancelled" && (
                <div className="empty-page">
                  <Info size={34} />
                  <h1>Match cancelled</h1>
                  <p>{room.error || "This match could not be completed."}</p>
                  <p>No Elo was changed.</p>
                  <Button onClick={rematch}>Create another room</Button>
                </div>
              )}
            </>
          )
        ) : path === "/campus" ? (
          <GlobeArrival />
        ) : path === "/history" ? (
          <History data={data} onPlay={() => navigate("/arena")} />
        ) : path === "/leaderboard" ? (
          <Leaderboard data={data} onPlay={() => navigate("/arena")} />
        ) : path === "/profile" ? (
          <ProfilePage data={data} refresh={refresh} notify={setToast} />
        ) : path === "/java" ? (
          <JavaPractice
            available={data.javaAvailable}
            onBack={() =>
              navigate(data.activeRoom ? `/room/${data.activeRoom}` : "/")
            }
          />
        ) : (
          <Home
            data={data}
            busy={busy}
            onCreate={createRoom}
            onJoin={(id) => navigate(`/room/${id}`)}
            onProfile={() => navigate("/profile")}
            onJava={() => navigate("/java")}
            onHistory={() => navigate("/history")}
          />
        )}
      </main>
      <footer className="site-footer">
        <span>
          VisCon <span className="footer-dot" /> Arena
        </span>
        <span>
          {room?.settings.subject === "ddca"
            ? "DDCA lecture-grounded practice · Independent of ETH Zürich"
            : data.demoContent
            ? "Demo and DDCA lecture practice · Independent of ETH Zürich"
            : "Lecture question bank"}
        </span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {confirmLeave && (
        <div className="modal-backdrop" onClick={() => setConfirmLeave(false)}>
          <section
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="leave-title">
              {inMatch ? "Leave this match?" : "Leave this room?"}
            </h2>
            <p>
              {inMatch
                ? "Leaving ends the match as a forfeit. In Ranked, your Elo will change."
                : "You can create or join another room afterwards."}
            </p>
            <div className="dialog-actions">
              <Button secondary onClick={() => setConfirmLeave(false)}>
                Stay here
              </Button>
              <Button onClick={leave}>
                Leave {inMatch ? "match" : "room"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Home({
  data,
  busy,
  onCreate,
  onJoin,
  onProfile,
  onJava,
  onHistory,
}: {
  data: Bootstrap;
  busy: boolean;
  onCreate: (s?: string, p?: boolean) => void;
  onJoin: (s: string) => void;
  onProfile: () => void;
  onJava: () => void;
  onHistory: () => void;
}) {
  const [subject, setSubject] = useState(data.subjects[0].id),
    [invite, setInvite] = useState(""),
    [invalid, setInvalid] = useState("");
  function join() {
    const value =
      invite.trim().split("/").filter(Boolean).pop()?.split("?")[0] || "";
    if (!/^[A-Fa-f0-9]{10}$/.test(value)) {
      setInvalid("Paste an invitation link or a 10-character room code.");
      return;
    }
    onJoin(value.toUpperCase());
  }
  const selectedSubject = data.subjects.find((item) => item.id === subject)!;
  return (
    <>
      <div id="arena-start" className="home-heading">
        <div>
          <p className="page-kicker">WORKSPACE / ARENA</p>
          <h1>
            Arena
            <span className="badge" aria-hidden="true">
              1v1
            </span>
          </h1>
          <p>
            {selectedSubject.name}
            <span className="footer-dot" />
            Private matches
          </p>
        </div>
        <button
          className="secondary button"
          onClick={onHistory}
          aria-label="Open match history"
        >
          <Clock size={15} />
          Match history
        </button>
      </div>
      {data.activeRoom && (
        <div className="resume">
          <div>
            <Play size={18} />
            <strong>You have an open room.</strong>
          </div>
          <Button secondary onClick={() => onJoin(data.activeRoom!)}>
            Return to room <ArrowRight size={16} />
          </Button>
        </div>
      )}
      <section className="match-preview" aria-label="Match preview">
        <div>
          <Avatar player={data.profile} />
          <span>
            <strong>{data.profile.name}</strong>
            <small>You · {number(data.profile.rating)} Elo</small>
          </span>
        </div>
        <span className="versus-mark">VS</span>
        <div>
          <span className="avatar vacant">
            <Users size={20} />
          </span>
          <span>
            <strong>Your opponent</strong>
            <small>Invite a friend or practise solo</small>
          </span>
        </div>
      </section>
      <div className="home-layout">
        <section className="course-panel">
          <div className="section-heading">
            <h2>Set up a match</h2>
            <span className="text-muted">Subject</span>
          </div>
          <div className="course-list">
            {data.subjects.map((s, i) => {
              const Icon = [Sigma, Hash, Braces][i % 3];
              return (
                <button
                  key={s.id}
                  className={`course-row ${subject === s.id ? "selected" : ""}`}
                  onClick={() => setSubject(s.id)}
                  aria-pressed={subject === s.id}
                >
                  <span className={`course-icon tone-${i}`}>
                    <Icon size={20} />
                  </span>
                  <span className="course-copy">
                    <strong>{s.name}</strong>
                    <span>{s.topics.join(" · ")}</span>
                    <small>
                      {s.formats.map((f) => formats[f].name).join(" / ")}
                    </small>
                  </span>
                  <span className="radio-marker">
                    {subject === s.id && <span />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="match-format-summary">
            <span className="text-muted">Available formats</span>
            <div>
              {selectedSubject.formats.map((format) => {
                const Icon = formats[format].icon;
                return (
                  <span key={format}>
                    <Icon size={14} />
                    {formats[format].name}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="create-actions">
            <Button
              disabled={busy || !!data.activeRoom}
              onClick={() => onCreate(subject)}
            >
              <Plus size={17} />
              Create a room
            </Button>
            <Button
              secondary
              disabled={busy || !!data.activeRoom}
              onClick={() => onCreate(subject, true)}
            >
              <Play size={15} />
              Practice solo
            </Button>
          </div>
        </section>
        <aside className="home-aside">
          <section className="join-panel">
            <div className="section-heading">
              <h2>Join a room</h2>
              <Link size={17} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                join();
              }}
            >
              <label htmlFor="invite">Invitation link or room code</label>
              <div className="join-input">
                <input
                  id="invite"
                  value={invite}
                  onChange={(e) => {
                    setInvite(e.target.value);
                    setInvalid("");
                  }}
                  placeholder="Paste link or room code"
                  autoComplete="off"
                />
                <button type="submit" aria-label="Join room">
                  <ArrowRight size={18} />
                </button>
              </div>
              {invalid && (
                <p className="field-error" role="alert">
                  {invalid}
                </p>
              )}
            </form>
          </section>
          <section className="personal-panel">
            <div className="section-heading">
              <h2>Your rating</h2>
              <button className="text-button" onClick={onProfile}>
                Profile <ChevronRight size={15} />
              </button>
            </div>
            <div className="rating-line">
              <Avatar player={data.profile} />
              <div>
                <strong>{data.profile.name}</strong>
                <p>{data.history.length} matches played</p>
              </div>
              <span className="rating-value">
                {number(data.profile.rating)}
                <small>Elo</small>
              </span>
            </div>
            <div className="personal-bottom">
              <span>
                <span className="status-dot" />
                Ranked rating
              </span>
            </div>
          </section>
          <button className="java-link" onClick={onJava}>
            <Code2 size={19} />
            <span>
              <strong>Java workspace</strong>
            </span>
            <ArrowUpRight size={16} />
          </button>
        </aside>
      </div>
      <section className="recent">
        <div className="section-heading">
          <h2>Recent matches</h2>
          {data.history.length > 0 && (
            <button className="text-button" onClick={onHistory}>
              View history <ArrowRight size={16} />
            </button>
          )}
        </div>
        {data.history.length ? (
          <HistoryTable
            entries={data.history.slice(0, 3)}
            subjects={data.subjects}
          />
        ) : (
          <div className="empty-inline">
            <span className="empty-symbol">
              <Trophy size={23} />
            </span>
            <div>
              <strong>Your next match is your first.</strong>
              <p>
                Create a room or try a practice round. Your results will show up
                here.
              </p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function Lobby({
  room,
  me,
  data,
  connected,
  busy,
  onSettings,
  onReady,
  onCopy,
  onLeave,
  onJava,
}: {
  room: RoomView;
  me: Profile;
  data: Bootstrap;
  connected: boolean;
  busy: boolean;
  onSettings: (s: Settings) => Promise<boolean>;
  onReady: () => void;
  onCopy: () => void;
  onLeave: () => void;
  onJava: () => void;
}) {
  const [settings, setSettings] = useState(room.settings),
    [available, setAvailable] = useState<number | null>(null);
  const host = room.hostId === me.id;
  const mine = room.players.find((p) => p.id === me.id)!;
  useEffect(() => setSettings(room.settings), [room.settings]);
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({
      subject: settings.subject,
      format: settings.format,
      difficulty: settings.difficulty,
      topic: settings.topic,
    });
    api<{ count: number }>(`/questions/availability?${q}`).then(
      (r) => live && setAvailable(r.count),
    );
    return () => {
      live = false;
    };
  }, [settings.subject, settings.format, settings.difficulty, settings.topic]);
  const dirty = JSON.stringify(settings) !== JSON.stringify(room.settings);
  const course = data.subjects.find((s) => s.id === settings.subject)!;
  const isPractice = room.players.some((p) => p.bot);
  function change(key: keyof Settings, value: string | number | boolean) {
    setSettings((s) => {
      const n = { ...s, [key]: value };
      if (key === "subject") {
        n.topic = "all";
        const formats = data.subjects.find((x) => x.id === value)!.formats;
        if (!formats.includes(n.format)) n.format = formats[0];
      }
      if (key === "format" || n.format !== s.format) {
        n.rounds = n.format === "java" ? 1 : 6;
        n.seconds = n.format === "java" ? 300 : 75;
        n.difficulty = "mixed";
      }
      return n;
    });
  }
  return (
    <>
      <div className="breadcrumb">
        <button onClick={onLeave}>Play</button>
        <ChevronRight size={13} />
        <span>{isPractice ? "Practice room" : "Private room"}</span>
        <span className="room-code">{room.id}</span>
      </div>
      <div className="title-row">
        <div>
          <h1>Your next challenge.</h1>
          <p className="subtitle">
            Set the rules, invite a friend, and put your knowledge to the test.
          </p>
        </div>
        <span className="badge">
          {isPractice ? "Practice bot" : "1v1 room"}
          {settings.subject === "ddca" ? " · DDCA lecture practice" : data.demoContent ? " · Demo questions" : ""}
        </span>
      </div>
      <div className="lobby-layout">
        <section className="settings-panel">
          <div className="section-heading">
            <h2>Match settings</h2>
            <span className="text-muted">
              {host ? "You are the host" : "Your host chooses the rules"}
            </span>
          </div>
          <fieldset disabled={!host || busy} className="settings-fields">
            <div className="two-fields">
              <Field label="Subject" id="subject">
                <select
                  id="subject"
                  value={settings.subject}
                  onChange={(e) => change("subject", e.target.value)}
                >
                  {data.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Topic" id="topic">
                <select
                  id="topic"
                  value={settings.topic}
                  onChange={(e) => change("topic", e.target.value)}
                >
                  <option value="all">All available topics</option>
                  {course.topics.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="field format-field">
              <span className="field-label" id="format-label">
                Question format
              </span>
              <div
                className="format-options"
                role="group"
                aria-labelledby="format-label"
              >
                {(Object.keys(formats) as Format[]).map((f) => {
                  const Icon = formats[f].icon;
                  return (
                    <button
                      key={f}
                      disabled={!course.formats.includes(f)}
                      className={`format-option ${settings.format === f ? "selected" : ""}`}
                      onClick={() => change("format", f)}
                      aria-pressed={settings.format === f}
                    >
                      <div>
                        <Icon size={19} />
                        {settings.format === f && <Check size={17} />}
                      </div>
                      <strong>{formats[f].name}</strong>
                      <small>{formats[f].description}</small>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="two-fields">
              <Field label="Difficulty" id="difficulty">
                <select
                  id="difficulty"
                  value={settings.difficulty}
                  onChange={(e) => change("difficulty", e.target.value)}
                >
                  <option value="mixed">Mixed difficulty</option>
                  <option value="foundation">Foundation</option>
                  <option value="standard">Standard</option>
                  <option value="challenge">Challenge</option>
                </select>
              </Field>
              <Field label="Match mode" id="ranked">
                <select
                  id="ranked"
                  value={settings.ranked ? "ranked" : "friendly"}
                  onChange={(e) =>
                    change("ranked", e.target.value === "ranked")
                  }
                >
                  <option value="friendly">Friendly · no Elo change</option>
                  <option value="ranked" disabled={isPractice}>
                    Ranked · affects Elo
                  </option>
                </select>
              </Field>
            </div>
            <div className="two-fields timing-fields">
              <Field label="Number of rounds" id="rounds">
                <input
                  id="rounds"
                  type="number"
                  min="1"
                  max={Math.min(20, available || 20)}
                  value={settings.rounds}
                  onChange={(e) => change("rounds", Number(e.target.value))}
                />
              </Field>
              <Field label="Time per question" id="seconds">
                <select
                  id="seconds"
                  value={settings.seconds}
                  onChange={(e) => change("seconds", Number(e.target.value))}
                >
                  {[10, 30, 45, 60, 75, 90, 120, 180, 300, 600, 900].map(
                    (v) => (
                      <option key={v} value={v}>
                        {v < 120 ? `${v} seconds` : `${v / 60} minutes`}
                      </option>
                    ),
                  )}
                </select>
              </Field>
            </div>
          </fieldset>
          <div className="estimate-band">
            <Clock size={23} />
            <strong>
              ≈ {Math.ceil((settings.rounds * settings.seconds) / 60)} min
            </strong>
            <span>
              Estimated answering time
              <br />
              <small>
                {available === null
                  ? "Checking questions…"
                  : `${available} questions available for these settings`}
              </small>
            </span>
          </div>
          {settings.format === "java" && !data.javaAvailable && (
            <Notice>
              Java execution is not connected yet.{" "}
              <button className="text-button" onClick={onJava}>
                Explore the editor <ExternalLink size={13} />
              </button>
            </Notice>
          )}
          {dirty ? (
            <div className="settings-save">
              <span>Both players will need to confirm again.</span>
              <Button
                disabled={
                  busy ||
                  available === null ||
                  settings.rounds > available ||
                  settings.rounds < 1
                }
                onClick={() => onSettings(settings)}
              >
                <Check size={16} />
                Save settings
              </Button>
            </div>
          ) : (
            <p className="small-note">
              Changing the rules asks both players to confirm they are ready
              again.
            </p>
          )}
        </section>
        <aside className="lobby-aside">
          <section className="players-panel">
            <div className="section-heading">
              <h2>The matchup</h2>
              <span className="text-muted">
                {room.players.length} / 2 players
              </span>
            </div>
            {room.players.map((p) => (
              <PlayerRow key={p.id} player={p} me={me.id} host={room.hostId} />
            ))}
            {room.players.length < 2 && (
              <div className="waiting-player">
                <span className="avatar vacant">
                  <Users size={22} />
                </span>
                <div>
                  <strong>A worthy opponent</strong>
                  <p>Waiting for your friend to join…</p>
                </div>
              </div>
            )}
            <div className="invite-panel">
              <label htmlFor="room-link">Invite link</label>
              <div className="copy-input">
                <input
                  id="room-link"
                  readOnly
                  value={`${location.origin}/room/${room.id}`}
                  onFocus={(e) => e.target.select()}
                />
                <button onClick={onCopy} aria-label="Copy invite link">
                  <Copy size={16} />
                  <span>Copy</span>
                </button>
              </div>
            </div>
          </section>
          <div className="ready-panel">
            <div className="ready-status">
              <span className={mine.ready ? "positive" : ""}>
                {mine.ready ? <CheckCircle2 size={15} /> : <Clock size={15} />}{" "}
                {mine.ready ? "You are ready" : "Waiting for you"}
              </span>
              <span>
                {room.players.filter((p) => p.ready).length} / 2 ready
              </span>
            </div>
            <Button
              disabled={
                !connected ||
                busy ||
                dirty ||
                (settings.format === "java" && !data.javaAvailable)
              }
              onClick={onReady}
            >
              {mine.ready ? (
                <>
                  <RotateCcw size={16} />
                  Not ready yet
                </>
              ) : (
                <>
                  Ready to play <ArrowRight size={18} />
                </>
              )}
            </Button>
            <p>
              {room.players.length < 2
                ? "Share the link to bring your opponent in."
                : "The match starts when both players are ready."}
            </p>
          </div>
          <div className="room-facts">
            <div>
              <Target size={17} />
              <span>Same questions for both players</span>
            </div>
            <div>
              <CheckCircle2 size={17} />
              <span>1,000 points per correct answer</span>
            </div>
            <div>
              <Trophy size={17} />
              <span>
                {settings.ranked
                  ? "Your Elo changes after the match"
                  : "Friendly matches keep your Elo safe"}
              </span>
            </div>
          </div>
          <div className={`connection ${connected ? "" : "offline"}`}>
            {connected ? <Wifi size={15} /> : <WifiOff size={15} />}{" "}
            {connected ? "Connection stable" : "Reconnecting"}
          </div>
        </aside>
      </div>
      <div className="lobby-footer">
        <span>{settings.rounds} rounds. One fair challenge.</span>
        <button className="text-button muted" onClick={onLeave}>
          <LogOut size={15} />
          Leave room
        </button>
      </div>
    </>
  );
}
function Field({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
function PlayerRow({
  player,
  me,
  host,
}: {
  player: Player;
  me: string;
  host: string;
}) {
  return (
    <div className={`player-row ${player.id !== me ? "opponent-row" : ""}`}>
      <Avatar player={player} opponent={player.id !== me} />
      <div className="player-name">
        <strong>
          {player.name}
          {player.id === me && <span className="tiny-tag">You</span>}
        </strong>
        <small>
          {player.bot
            ? "Practice bot"
            : player.id === host
              ? "Host"
              : player.online
                ? "Joined your room"
                : "Reconnecting…"}
          {player.ready && " · Ready"}
        </small>
      </div>
      <div className="elo-label">
        {number(player.rating)}
        <small>Elo rating</small>
      </div>
    </div>
  );
}

function useCountdown(deadline: number, serverTime: number) {
  const offset = useRef(serverTime - Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    offset.current = serverTime - Date.now();
  }, [serverTime]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, Math.ceil((deadline - now - offset.current) / 1000));
}
function Match({
  room,
  me,
  connected,
  busy,
  onAnswer,
  onNext,
  onLeave,
}: {
  room: RoomView;
  me: Profile;
  connected: boolean;
  busy: boolean;
  onAnswer: (v: string) => Promise<boolean>;
  onNext: () => Promise<boolean>;
  onLeave: () => void;
}) {
  const seconds = useCountdown(room.deadline, room.serverTime);
  const [value, setValue] = useState(""),
    [next, setNext] = useState(false);
  const q = room.question;
  const reviewing = room.state === "review";
  const mine = room.players.find((p) => p.id === me.id)!;
  const opponent = room.players.find((p) => p.id !== me.id)!;
  useEffect(() => {
    let saved = "";
    try {
      saved = sessionStorage.getItem(`draft:${room.id}:${q?.id}`) || "";
    } catch {}
    setValue(saved || q?.starter || "");
    setNext(false);
  }, [q?.id, room.id]);
  function update(v: string) {
    setValue(v);
    try {
      sessionStorage.setItem(`draft:${room.id}:${q?.id}`, v);
    } catch {}
  }
  const locked = room.submitted[me.id] || room.evaluating[me.id] || reviewing;
  const latest = room.completed[room.round];
  return (
    <>
      <div className="match-heading">
        <button className="text-button muted" onClick={onLeave}>
          <Flag size={16} />
          Leave match
        </button>
        <span>
          {room.settings.ranked ? "Ranked" : "Friendly"} match{" "}
          <span className="footer-dot" />
          {formats[room.settings.format].name}
        </span>
        <span className="badge">
          {room.state === "countdown"
            ? "Starting soon"
            : `Round ${room.round + 1} of ${room.settings.rounds}`}
        </span>
      </div>
      {room.state !== "countdown" && (
        <div
          className={`mobile-match-timer ${seconds < 10 && !reviewing ? "urgent" : ""}`}
          role="timer"
          aria-live="off"
        >
          <span>
            Round {room.round + 1} / {room.settings.rounds}
          </span>
          <span>
            <Clock size={15} />
            <strong>{duration(seconds)}</strong>
            {reviewing ? "Next round" : "Remaining"}
          </span>
        </div>
      )}
      <section className="scoreboard" aria-label="Live score">
        <div className="score-player">
          <Avatar player={mine} />
          <div>
            <strong>
              {mine.name}
              <span className="tiny-tag">You</span>
            </strong>
            <small>{number(mine.rating)} Elo</small>
          </div>
          <b>{number(mine.score)}</b>
        </div>
        <div
          className={`match-clock ${seconds < 10 && !reviewing ? "urgent" : ""}`}
        >
          <Clock size={17} />
          <strong>
            {room.state === "countdown" ? seconds : duration(seconds)}
          </strong>
          <small>{reviewing ? "Next round" : "Remaining"}</small>
        </div>
        <div className="score-player opponent">
          <b>{number(opponent.score)}</b>
          <div>
            <strong>{opponent.name}</strong>
            <small>
              {opponent.bot ? "Practice bot" : `${number(opponent.rating)} Elo`}
            </small>
          </div>
          <Avatar player={opponent} opponent />
        </div>
      </section>
      <div className="paired-progress">
        {[mine, opponent].map((p, i) => (
          <div className={`progress-row ${i ? "other" : ""}`} key={p.id}>
            <span>{p.id === me.id ? "You" : opponent.name}</span>
            <div>
              {Array.from({ length: room.settings.rounds }, (_, r) => {
                const result = room.completed[r]?.answers[p.id];
                return (
                  <span
                    key={r}
                    className={`round-mark ${result ? (result.correct ? "correct" : "incorrect") : r === room.round ? "current" : ""}`}
                    title={`Round ${r + 1}: ${result ? (result.correct ? "correct" : "incorrect") : "not completed"}`}
                  >
                    {result ? (
                      result.correct ? (
                        <Check size={12} />
                      ) : (
                        <X size={12} />
                      )
                    ) : (
                      r + 1
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {room.state === "countdown" ? (
        <div className="countdown-stage">
          <span className="countdown-number">{seconds || "Go"}</span>
          <h1>Meet you at the first question.</h1>
          <p>Same challenge. Two different minds.</p>
        </div>
      ) : (
        q && (
          <div
            className={`game-layout ${q.format === "java" ? "code-layout" : ""}`}
          >
            <section className="question-panel">
              <QuestionContent q={q} />
              {q.format === "java" &&
                q.examples?.map((e, i) => (
                  <div className="example" key={i}>
                    <strong>Example {i + 1}</strong>
                    <div>
                      <span>Input</span>
                      <code>{e.input}</code>
                      <span>Output</span>
                      <code>{e.output}</code>
                    </div>
                  </div>
                ))}
              <div className="question-source">
                <BookOpen size={14} />
                {q.source}
              </div>
            </section>
            <section className="answer-panel">
              {reviewing && latest ? (
                <div className="round-review">
                  <span
                    className={`review-icon ${latest.answers[me.id].correct ? "positive" : "negative"}`}
                  >
                    {latest.answers[me.id].correct ? (
                      <CheckCircle2 size={36} />
                    ) : (
                      <XCircle size={36} />
                    )}
                  </span>
                  <h2>
                    {latest.answers[me.id].correct
                      ? "Nicely solved."
                      : "One to learn from."}
                  </h2>
                  <p className="review-points">
                    {latest.answers[me.id].correct
                      ? "+1,000 points"
                      : "No points this round"}
                  </p>
                  <dl className="answer-summary">
                    <div>
                      <dt>Your answer</dt>
                      <dd>{latest.answers[me.id].value}</dd>
                    </div>
                    <div>
                      <dt>Correct answer</dt>
                      <dd>{latest.correctAnswer}</dd>
                    </div>
                    <div>
                      <dt>{opponent.name}</dt>
                      <dd>
                        {latest.answers[opponent.id].correct
                          ? "Correct"
                          : "Incorrect"}
                      </dd>
                    </div>
                  </dl>
                  <div className="explanation">
                    <h3>Why it works</h3>
                    <p>{latest.explanation}</p>
                  </div>
                  <Button
                    disabled={next || !connected}
                    onClick={async () => {
                      if (await onNext()) setNext(true);
                    }}
                  >
                    {next
                      ? "Waiting for your opponent…"
                      : room.round + 1 === room.settings.rounds
                        ? "See results"
                        : "Next question"}
                    <ArrowRight size={17} />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="section-heading">
                    <h2>
                      {q.format === "java" ? "Your solution" : "Your answer"}
                    </h2>
                    {q.format === "java" && <span className="badge">Java</span>}
                  </div>
                  {q.format === "quiz" ? (
                    <div className="answer-options">
                      {q.options?.map((o, i) => (
                        <button
                          key={o.id}
                          className={`answer-option ${value === o.id ? "selected" : ""}`}
                          disabled={locked || seconds === 0}
                          aria-pressed={value === o.id}
                          onClick={() => update(o.id)}
                        >
                          <span className="option-letter">
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span>{o.text}</span>
                          {value === o.id && <Check size={19} />}
                        </button>
                      ))}
                    </div>
                  ) : q.format === "numeric" ? (
                    <div className="numeric-answer">
                      <label htmlFor="numeric">
                        Enter your result{q.unit ? ` (${q.unit})` : ""}
                      </label>
                      <input
                        id="numeric"
                        value={value}
                        onChange={(e) => update(e.target.value)}
                        inputMode="decimal"
                        placeholder="Your answer"
                        disabled={locked || seconds === 0}
                      />
                      <p>
                        Use a number. Decimal points and decimal commas are
                        accepted.
                      </p>
                    </div>
                  ) : (
                    <JavaEditor
                      question={q}
                      source={value}
                      onChange={update}
                      disabled={locked || seconds === 0}
                      available
                      roomId={room.id}
                    />
                  )}
                  <div className="submit-area">
                    {locked ? (
                      <div className="locked-answer" role="status">
                        {room.evaluating[me.id] ? (
                          <LoaderCircle className="spin" size={19} />
                        ) : (
                          <CheckCircle2 size={19} />
                        )}
                        <div>
                          <strong>
                            {room.evaluating[me.id]
                              ? "Evaluating your Java solution…"
                              : "Your answer is locked."}
                          </strong>
                          <p>
                            {room.submitted[opponent.id]
                              ? "Waiting for the result."
                              : "Waiting for your opponent. Take a breath."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Button
                          disabled={
                            !value.trim() || busy || !connected || seconds === 0
                          }
                          onClick={() => onAnswer(value)}
                        >
                          {busy ? "Submitting…" : "Lock answer"}
                          <Check size={18} />
                        </Button>
                        <p>You can change your answer until you lock it.</p>
                      </>
                    )}
                  </div>
                  <div className="opponent-status">
                    <span
                      className={`status-dot ${room.submitted[opponent.id] ? "" : "neutral"}`}
                    />
                    {room.submitted[opponent.id]
                      ? `${opponent.name} has locked an answer`
                      : room.evaluating[opponent.id]
                        ? `${opponent.name} is evaluating a solution`
                        : !opponent.online
                          ? `${opponent.name} is reconnecting`
                          : `${opponent.name} is thinking`}
                  </div>
                </>
              )}
            </section>
          </div>
        )
      )}
    </>
  );
}

function JavaPractice({
  available,
  onBack,
}: {
  available: boolean;
  onBack: () => void;
}) {
  const [q, setQ] = useState<Question | null>(null),
    [source, setSource] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api<Question | null>("/java/preview")
      .then((q) => {
        setQ(q);
        setSource(q?.starter || "");
        if (!q)
          setError("No Java questions are available in this question bank.");
      })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <button className="text-button muted back-link" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to Play
      </button>
      <div className="title-row">
        <div>
          <h1>A little Java practice.</h1>
          <p className="subtitle">
            Explore the editor at your own pace. No timer, no Elo.
          </p>
        </div>
        <span className="badge">Practice workspace</span>
      </div>
      {error ? (
        <Notice error>{error}</Notice>
      ) : q ? (
        <div className="game-layout code-layout">
          <section className="question-panel">
            <QuestionContent q={q} />
            {q.examples?.map((e, i) => (
              <div className="example" key={i}>
                <strong>Example {i + 1}</strong>
                <div>
                  <span>Input</span>
                  <code>{e.input}</code>
                  <span>Output</span>
                  <code>{e.output}</code>
                </div>
              </div>
            ))}
          </section>
          <section className="answer-panel">
            <div className="section-heading">
              <h2>Your solution</h2>
              <button
                className="text-button"
                onClick={() => setSource(q.starter || "")}
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
            <JavaEditor
              question={q}
              source={source}
              onChange={setSource}
              available={available}
            />
          </section>
        </div>
      ) : (
        <div className="loading">
          <LoaderCircle className="spin" />
          Loading workspace…
        </div>
      )}
    </>
  );
}

function Results({
  room,
  me,
  busy,
  onRematch,
  onHome,
}: {
  room: RoomView;
  me: Profile;
  busy: boolean;
  onRematch: () => void;
  onHome: () => void;
}) {
  const outcome = room.outcome!;
  const win = outcome.winnerId === me.id,
    draw = outcome.winnerId === null,
    mine = room.players.find((p) => p.id === me.id)!,
    other = room.players.find((p) => p.id !== me.id)!,
    delta = outcome.delta[me.id];
  return (
    <>
      <div className="result-intro">
        <span className={`result-emblem ${win ? "win" : ""}`}>
          <Trophy size={34} />
        </span>
        <h1>
          {draw
            ? "A well-matched pair."
            : win
              ? "This round of learning is yours."
              : "A good challenge. A next time."}
        </h1>
        <p>
          {draw
            ? "Same score. Plenty learned."
            : win
              ? "Well played. Take a look at what made the difference."
              : "Every question leaves you a little better prepared."}
        </p>
        <span className="badge">
          {room.settings.ranked ? "Ranked" : "Friendly"} ·{" "}
          {room.completed.length} rounds completed
        </span>
      </div>
      <section className="result-score">
        <div>
          <Avatar player={mine} large />
          <strong>
            {mine.name}
            <span className="tiny-tag">You</span>
          </strong>
          <span className="big-score">{number(mine.score)}</span>
          <small>points</small>
        </div>
        <div className="result-divider">
          <span>{draw ? "Draw" : win ? "You won" : "You lost"}</span>
          <div className="elo-change">
            <Trophy size={16} />
            {number(outcome.before[me.id])}
            <ArrowRight size={14} />
            <strong>{number(mine.rating)}</strong>
          </div>
          <small>
            {room.settings.ranked ? (
              <span className={delta >= 0 ? "positive" : "negative"}>
                {delta > 0 ? "+" : ""}
                {delta} Elo
              </span>
            ) : (
              "Friendly match · Elo unchanged"
            )}
          </small>
        </div>
        <div>
          <Avatar player={other} opponent large />
          <strong>{other.name}</strong>
          <span className="big-score">{number(other.score)}</span>
          <small>points</small>
        </div>
      </section>
      {outcome.reason !== "Match complete" && <Notice>{outcome.reason}</Notice>}
      <div className="result-actions">
        <Button disabled={busy} onClick={onRematch}>
          <RotateCcw size={18} />
          {room.rematchId ? "Join the rematch" : "Play again"}
        </Button>
        <Button secondary onClick={onHome}>
          Back to Play
        </Button>
      </div>
      <section className="recap">
        <div className="section-heading">
          <h2>Take something from every round.</h2>
          <span className="text-muted">Your match recap</span>
        </div>
        {room.completed.map((r, i) => (
          <details key={i} className="recap-row">
            <summary>
              <span
                className={`recap-status ${r.answers[me.id].correct ? "positive" : "negative"}`}
              >
                {r.answers[me.id].correct ? (
                  <CheckCircle2 size={20} />
                ) : (
                  <XCircle size={20} />
                )}
              </span>
              <span>
                <strong>{r.question.title}</strong>
                <small>
                  Round {i + 1} · {r.question.topic}
                </small>
              </span>
              <span className="recap-points">
                {r.answers[me.id].points ? "+1,000" : "0"} pts
              </span>
              <ChevronRight size={18} />
            </summary>
            <div className="recap-content">
              <p>
                <strong>Your answer:</strong> {r.answers[me.id].value}
              </p>
              <p>
                <strong>Correct answer:</strong> {r.correctAnswer}
              </p>
              <p>{r.explanation}</p>
            </div>
          </details>
        ))}
      </section>
    </>
  );
}
function HistoryTable({
  entries,
  subjects,
}: {
  entries: HistoryEntry[];
  subjects: Bootstrap["subjects"];
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Match</th>
            <th>Opponent</th>
            <th>Score</th>
            <th>Result</th>
            <th>Elo</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>
                <strong>
                  {subjects.find((s) => s.id === e.subject)?.name || e.subject}
                </strong>
                <small>
                  {new Date(e.date).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}{" "}
                  · {formats[e.format].name} ·{" "}
                  {e.ranked ? "Ranked" : "Friendly"}
                </small>
              </td>
              <td>{e.opponent}</td>
              <td className="tabular">
                {number(e.score)} : {number(e.opponentScore)}
              </td>
              <td>
                <span className={`result-tag ${e.result}`}>
                  {e.result === "win"
                    ? "Won"
                    : e.result === "loss"
                      ? "Lost"
                      : "Draw"}
                </span>
              </td>
              <td
                className={
                  e.delta > 0
                    ? "positive"
                    : e.delta < 0
                      ? "negative"
                      : "text-muted"
                }
              >
                {e.delta > 0 ? "+" : ""}
                {e.delta || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function History({ data, onPlay }: { data: Bootstrap; onPlay: () => void }) {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Your story so far.</h1>
          <p className="subtitle">
            The close calls, the breakthroughs, and everything you learned.
          </p>
        </div>
        <Button onClick={onPlay}>
          <Plus size={17} />
          New match
        </Button>
      </div>
      {data.history.length ? (
        <HistoryTable entries={data.history} subjects={data.subjects} />
      ) : (
        <div className="empty-page">
          <BookOpen size={38} />
          <h2>Your match history starts here.</h2>
          <p>Finish your first challenge to see your results.</p>
          <Button onClick={onPlay}>Find your first challenge</Button>
        </div>
      )}
    </>
  );
}
function Leaderboard({
  data,
  onPlay,
}: {
  data: Bootstrap;
  onPlay: () => void;
}) {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>A little friendly rivalry.</h1>
          <p className="subtitle">Player ratings from this VisCon instance.</p>
        </div>
        <Button onClick={onPlay}>
          Start a challenge <ArrowRight size={17} />
        </Button>
      </div>
      <section className="leaderboard">
        <div className="leaderboard-head">
          <span>Rank</span>
          <span>Player</span>
          <span>Elo</span>
        </div>
        {data.leaderboard.map((p, i) => (
          <div
            key={p.id}
            className={`leaderboard-row ${p.id === data.profile.id ? "self" : ""}`}
          >
            <span className="rank-position">
              {i === 0 ? <Trophy size={20} /> : i + 1}
            </span>
            <div>
              <Avatar player={p} />
              <strong>{p.name}</strong>
              {p.id === data.profile.id && (
                <span className="tiny-tag">You</span>
              )}
            </div>
            <strong className="tabular">{number(p.rating)}</strong>
          </div>
        ))}
      </section>
      <p className="small-note">
        Everyone starts at 1,200 Elo. Ranked matches change your rating based on
        the result and your opponent’s rating.
      </p>
    </>
  );
}
function ProfilePage({
  data,
  refresh,
  notify,
}: {
  data: Bootstrap;
  refresh: () => Promise<Bootstrap>;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState(data.profile.name),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const wins = data.history.filter((h) => h.result === "win").length;
  async function save() {
    setSaving(true);
    setError("");
    try {
      await api("/profile", { name });
      await refresh();
      notify("Your name has been updated");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const ranked = data.history.filter((e) => e.ranked).reverse();
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Make your progress yours.</h1>
          <p className="subtitle">
            Your name, your matches, your next personal best.
          </p>
        </div>
      </div>
      <div className="profile-layout">
        <section className="profile-settings">
          <Avatar player={data.profile} large />
          <h2>{data.profile.name}</h2>
          <p className="text-muted">
            Player since{" "}
            {new Date(data.profile.createdAt).toLocaleDateString("en-GB", {
              month: "long",
              year: "numeric",
            })}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="Display name" id="display-name">
              <input
                id="display-name"
                minLength={2}
                maxLength={24}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Field>
            {error && <p className="field-error">{error}</p>}
            <Button
              type="submit"
              disabled={saving || name === data.profile.name}
            >
              {saving ? "Saving…" : "Save name"}
            </Button>
          </form>
          <p className="small-note">
            Your profile is saved for this browser. Keep its cookies to retain
            access on this device.
          </p>
        </section>
        <section className="profile-progress">
          <div className="section-heading">
            <h2>Elo history</h2>
            <span className="badge">Your progress</span>
          </div>
          <div className="stat-line">
            <div>
              <strong>{number(data.profile.rating)}</strong>
              <span>Current Elo</span>
            </div>
            <div>
              <strong>{data.history.length}</strong>
              <span>Matches</span>
            </div>
            <div>
              <strong>{wins}</strong>
              <span>Wins</span>
            </div>
          </div>
          <EloHistory entries={ranked} />
          <p className="small-note">
            Friendly and practice matches appear in your history but leave your
            Elo unchanged.
          </p>
        </section>
      </div>
    </>
  );
}

function EloHistory({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length)
    return (
      <div className="rating-chart">
        <div className="chart-empty">
          <BarChart3 size={32} />
          <strong>A fresh page for your progress.</strong>
          <p>Play a Ranked match to start your Elo history.</p>
        </div>
      </div>
    );
  const first = entries[0],
    last = entries[entries.length - 1];
  const ratings = [first.rating - first.delta, ...entries.map((e) => e.rating)];
  const low = Math.min(...ratings) - 8,
    high = Math.max(...ratings) + 8;
  const x = (i: number) => 52 + (i * 526) / (ratings.length - 1),
    y = (rating: number) => 162 - ((rating - low) * 136) / (high - low);
  const date = (value: string) =>
    new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return (
    <div className="rating-chart">
      <div className="chart-range">
        <div>
          <span>Start · {number(ratings[0])} Elo</span>
          <small>Before {date(first.date)}</small>
        </div>
        <div>
          <span>Latest · {number(last.rating)} Elo</span>
          <small>{date(last.date)}</small>
        </div>
      </div>
      <svg
        viewBox="0 0 600 190"
        role="img"
        aria-label={`Elo from ${ratings[0]} to ${last.rating} across ${entries.length} ranked matches shown`}
      >
        <title>Elo after each ranked match, in chronological order</title>
        {[low, Math.round((low + high) / 2), high].map((tick) => (
          <g key={tick}>
            <line
              x1="48"
              x2="585"
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--line)"
            />
            <text
              x="40"
              y={y(tick) + 4}
              textAnchor="end"
              fill="var(--muted)"
              fontSize="13"
            >
              {number(tick)}
            </text>
          </g>
        ))}
        <path
          d={`M ${ratings.map((r, i) => `${x(i)},${y(r)}`).join(" L ")}`}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
        />
        {ratings.map((r, i) => (
          <circle key={i} cx={x(i)} cy={y(r)} r="4" fill="var(--accent)">
            <title>
              {i === 0
                ? "Starting rating"
                : `Ranked match ${i} · ${date(entries[i - 1].date)}`}
              : {number(r)} Elo
            </title>
          </circle>
        ))}
      </svg>
      <p className="chart-caption">
        {entries.length} ranked {entries.length === 1 ? "match" : "matches"}{" "}
        shown, oldest to newest.
      </p>
    </div>
  );
}
