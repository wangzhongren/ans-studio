/**
 * Slider（base-nova copy-in，`@base-ui/react` slider；Phase 4A 唯一新增组件）。
 *
 * 用途：仅 Pi 高级「上下文窗口」「看护检查时限」两个 7 档离散字段。
 * 不新增依赖；视觉类在 `shell/phase4a.css`（令牌单一来源），不写裸色值。
 * 键盘（←/→/Home/End）由 Base UI 提供；`aria-valuetext` 同步档位标签。
 */

import { useEffect, useRef } from "react";
import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";

export interface SliderProps {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  label: string;
  valueText?: string;
  className?: string;
  onValueChange: (value: number) => void;
}

export function Slider({
  id,
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  label,
  valueText,
  className,
  onValueChange,
}: SliderProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Base UI 把可访问语义放在内部隐藏 input 上；补齐 aria-valuemin/max（规范要求三值可读）。
  useEffect(() => {
    const input = rootRef.current?.querySelector<HTMLInputElement>(
      'input[type="range"]',
    );
    if (!input) return;
    input.setAttribute("aria-valuemin", String(min));
    input.setAttribute("aria-valuemax", String(max));
  }, [min, max, value]);

  return (
    <SliderPrimitive.Root
      id={id}
      ref={rootRef}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(next) => {
        onValueChange(typeof next === "number" ? next : Number(next));
      }}
      className={cn("slider", className)}
    >
      <SliderPrimitive.Control className="slider-control">
        <SliderPrimitive.Track className="slider-track">
          <SliderPrimitive.Indicator className="slider-indicator" />
          <SliderPrimitive.Thumb
            className="slider-thumb"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuetext={valueText}
            getAriaLabel={() => label}
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
