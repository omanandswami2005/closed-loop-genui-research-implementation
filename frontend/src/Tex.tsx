import katex from "katex";
import { useMemo } from "react";

export function Tex({ math, display = false, className = "" }: { math: string; display?: boolean; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(math, { displayMode: display, throwOnError: false, strict: "ignore", trust: false }),
    [math, display],
  );
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
