import { ArrowLeft, ArrowUpRight, ChevronRight } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

interface Props {
  immersive?: boolean;
  path: string;
  inRoom: boolean;
  galaxyHref: string;
  actions: ReactNode;
  navigate: (path: string) => void;
  onPlatformLink: (event: MouseEvent<HTMLAnchorElement>, href: string) => void;
}

export function VersusHeader({ path, inRoom, galaxyHref, actions, navigate, onPlatformLink, immersive }: Props) {
  const tabs = [
    { path: "/arena", label: "Play", active: path === "/arena" || inRoom },
    { path: "/history", label: "Match history", active: path === "/history" },
    { path: "/leaderboard", label: "Leaderboard", active: path === "/leaderboard" },
  ];
  if (immersive) return <header className="cabin-nav">
    <a href={galaxyHref} onClick={e => onPlatformLink(e, galaxyHref)} aria-label="Return to Galaxy"><ArrowLeft size={14} aria-hidden="true" />Galaxy</a>
    <details className="cabin-menu" key={path} onKeyDown={event => {
      if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
    }}>
      <summary>VisCon <span> / Versus</span></summary>
      <nav aria-label="Versus navigation" onClick={event => { if ((event.target as HTMLElement).closest("button, a")) event.currentTarget.closest("details")?.removeAttribute("open"); }}>
        {tabs.map(tab => <button key={tab.path} onClick={() => navigate(tab.path)}>{tab.label}</button>)}
        <button onClick={() => navigate('/java')}>Java workspace</button>
        <a href="/learn" onClick={e => onPlatformLink(e, '/learn')}>Lectures</a>
        <a href="/world" onClick={e => onPlatformLink(e, '/world')}>Study world</a>
        {actions}
      </nav>
    </details>
  </header>;
  return <header className="versus-header">
    <div className="versus-header-top">
      <nav className="versus-trail" aria-label="Platform breadcrumb">
        <a className="versus-brand" href={galaxyHref} onClick={e => onPlatformLink(e, galaxyHref)} aria-label="VisCon home">VisCon<span>.</span></a>
        <a href={galaxyHref} onClick={e => onPlatformLink(e, galaxyHref)}>Galaxy</a>
        <ChevronRight size={12} aria-hidden="true" />
        <span aria-current="page">Versus</span>
      </nav>
      <nav className="versus-platform-nav" aria-label="Other platform areas">
        <a href="/learn" onClick={e => onPlatformLink(e, "/learn")}>Lectures <ArrowUpRight size={12} /></a>
        <a href="/world" onClick={e => onPlatformLink(e, "/world")}>Study world <ArrowUpRight size={12} /></a>
      </nav>
    </div>
    <div className="versus-header-bottom">
      <nav className="versus-tabs" aria-label="Versus navigation">
        {tabs.map(tab => <button key={tab.path} type="button" className={tab.active ? "active" : ""} aria-current={tab.active ? "page" : undefined} onClick={() => navigate(tab.path)}>{tab.label}</button>)}
      </nav>
      {actions}
    </div>
  </header>;
}
