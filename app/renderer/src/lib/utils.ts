import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并条件类名并消解 Tailwind 冲突（shadcn 约定入口）。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
