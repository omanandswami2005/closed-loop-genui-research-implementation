import { createContext, useContext } from "react";
import type { Equation } from "../types";

export interface ItemContextValue {
  equation: Equation;
  sessionId: string;
  busy: boolean;
  /** Final answer for this item, e.g. "x = 5". */
  submit: (answer: string, steps?: string[]) => void;
  /** Prefill the answer bar from a manipulative's state. */
  propose: (answer: string) => void;
}

export const ItemContext = createContext<ItemContextValue | null>(null);

export function useItem(): ItemContextValue {
  const ctx = useContext(ItemContext);
  if (!ctx) throw new Error("CLT-UI component rendered outside an item");
  return ctx;
}
