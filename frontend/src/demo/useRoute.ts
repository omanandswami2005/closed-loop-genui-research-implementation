import { useEffect, useState } from "react";

export type Route =
  | { name: "welcome" }
  | { name: "library" }
  | { name: "pack"; id: string; cached: boolean }
  | { name: "learn"; sid: string }
  | { name: "report" };

function parse(hash: string): Route {
  const [, name, arg, flag] = hash.replace(/^#/, "").split("/");
  if (name === "library") return { name: "library" };
  if (name === "pack" && arg) return { name: "pack", id: arg, cached: flag === "cached" };
  if (name === "learn" && arg) return { name: "learn", sid: arg };
  if (name === "report") return { name: "report" };
  return { name: "welcome" };
}

export function go(path: string) {
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
