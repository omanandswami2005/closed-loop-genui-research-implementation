import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class-name merge used by the Magic UI components. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
