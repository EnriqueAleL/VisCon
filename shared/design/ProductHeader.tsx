import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";

interface ProductHeaderProps {
  module: "Arena" | "Lectures" | "Campus" | "World";
  children: ReactNode;
  actions?: ReactNode;
  onHome?: () => void;
}

export function ProductHeader({
  module,
  children,
  actions,
  onHome,
}: ProductHeaderProps) {
  const brand = (
    <>
      <BookOpen size={23} strokeWidth={1.8} />
      <span>VisCon</span>
      <span className="product-module">{module}</span>
    </>
  );
  return (
    <header className="product-header">
      <div className="product-header-inner">
        {onHome ? (
          <button
            className="product-brand"
            onClick={onHome}
            aria-label="VisCon home"
          >
            {brand}
          </button>
        ) : (
          <a className="product-brand" href="/" aria-label="VisCon home">
            {brand}
          </a>
        )}
        <nav className="product-nav" aria-label="Main navigation">
          {children}
        </nav>
        <div className="product-header-actions">{actions}</div>
      </div>
    </header>
  );
}
