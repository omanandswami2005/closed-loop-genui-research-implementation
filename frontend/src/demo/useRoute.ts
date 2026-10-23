import { useEffect, useState } from "react";

export type Route =
  | { name: "landing" }
  | { name: "start" }
  | { name: "library" }
  | { name: "pack"; id: string; cached: boolean }
  | { name: "learn"; sid: string }
  | { name: "report" }
  | { name: "gallery"; type?: string };

function parse(hash: string): Route {
  const [, name, arg, flag] = hash.replace(/^#/, "").split("/");
  if (name === "start" || name === "welcome") return { name: "start" };
  if (name === "library") return { name: "library" };
  if (name === "pack" && arg) return { name: "pack", id: arg, cached: flag === "cached" };
  if (name === "learn" && arg) return { name: "learn", sid: arg };
  if (name === "report") return { name: "report" };
  if (name === "gallery") return { name: "gallery", type: arg };
  return { name: "landing" };
}

export function go(path: string) {
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
