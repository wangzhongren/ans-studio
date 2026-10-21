/**
 * 工作转轮（Phase 5A）：Sidebar / loading / 尾行共用同一枚 12px Lucide LoaderCircle。
 * 生产只用 motion/react（Nova §7.1）；0.9s linear infinite，reduced-motion 静止。
 * 外层固定 12px 盒（不被旋转撑大），内层 Motion 旋转；data-spin-* 供离线审计读取真实配置。
 */

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { motion } from "motion/react";

function useReducedMotionQuery(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduce, setReduce] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setReduce(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);
  return reduce;
}

export function BusySpinner({ className = "" }: { className?: string }) {
  const reduceMotion = useReducedMotionQuery();
  return (
    <span
      className={"ts-ico status-spinner" + (className ? " " + className : "")}
      aria-hidden="true"
      data-spin-motion="true"
      data-spin-duration="0.9"
      data-reduced-motion={reduceMotion ? "true" : "false"}
    >
      <motion.span
        className="status-spinner-motion"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={
          reduceMotion
            ? undefined
            : { repeat: Number.POSITIVE_INFINITY, duration: 0.9, ease: "linear" }
        }
      >
        <LoaderCircle size={12} strokeWidth={1.5} />
      </motion.span>
    </span>
  );
}
