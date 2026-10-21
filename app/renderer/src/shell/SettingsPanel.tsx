/**
 * 三引擎设置面板（Phase 4A）：Pi / Codex / Claude。
 *
 * - 字段/必填/秘密/choices/control/help 全部来自主进程 `getRuntimeConfig` 元数据；
 *   渲染侧只做控件选择与布局（不复制第二份字段表/校验表）。
 * - 控件矩阵：长档位 range（Slider + output + hidden 规范值）、短档位 select、
 *   自由字段 text、secret password + 显示/隐藏（值恒空、不会回显已存值）。
 * - 高级区（control:"range"）折叠；当前值不在预设档位 ⇒ 文本回退 + amber 提示。
 * - 保存条固定在面板底部 64px；保存中禁用；成功重读、失败保留草稿、晚到响应丢弃。
 * - 面板只切换配置视图，不切换当前会话引擎；.env 写入全走主进程。
 */

import { useEffect, useRef, useState } from "react";
import { ChevronRight, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore, type RuntimeId } from "@/stores/ui-store";
import {
  applicationLabel,
  fieldControl,
  fieldHelp,
  fieldLabelText,
  initialFieldValues,
  missingKeysOf,
  rangeAriaValueText,
  rangeFallsBack,
  rangeIndex,
  rangeLabel,
  rangeValue,
  partitionFields,
  runtimeLabel,
  type ConfigField,
  type RuntimeConfigView,
} from "@/chat/runtime-config";

interface EngineDraft {
  values: Record<string, string>;
  dirty: boolean;
}

function readDomValues(fields: readonly ConfigField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const element = document.getElementById("pi-inp-" + field.key);
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
      values[field.key] = element.value;
    }
  }
  return values;
}

/** 保存当前面板表单（按钮与测试驱动共用；外部直接写 DOM value 也能读到）。 */
export async function saveSettingsFormFromDom(): Promise<boolean> {
  const store = useSettingsStore.getState();
  const view = store.views[store.engine];
  if (!view) return false;
  return store.saveValues(store.engine, view.fields, readDomValues(view.fields));
}

function SecretField({
  field,
  shown,
  onToggle,
}: {
  field: ConfigField;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="pi-input-wrap">
      <input
        id={"pi-inp-" + field.key}
        className="pi-input"
        type={shown ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        defaultValue=""
        placeholder={field.isSet ? "已设置，留空则不修改" : "未设置"}
        aria-label={fieldLabelText(field)}
      />
      <button
        id={"pi-toggle-secret-" + field.key}
        className="pi-secret-toggle"
        type="button"
        aria-pressed={shown}
        onClick={onToggle}
      >
        {shown ? "隐藏" : "显示"}
      </button>
    </span>
  );
}

function ChoiceField({
  field,
  initial,
}: {
  field: ConfigField;
  initial: string;
}) {
  const choices = field.choices || [];
  const labels = field.choiceLabels || [];
  const currentInChoices = choices.indexOf(initial) >= 0;
  return (
    <span className="pi-input-wrap">
      <select
        id={"pi-inp-" + field.key}
        className="pi-input pi-select"
        defaultValue={initial}
        aria-label={fieldLabelText(field)}
      >
        <option value="">留空（平台默认）</option>
        {choices.map((choice, index) => (
          <option key={choice} value={choice}>
            {typeof labels[index] === "string" && labels[index] !== ""
              ? labels[index]
              : choice}
          </option>
        ))}
        {initial !== "" && !currentInChoices ? (
          <option value={initial}>{initial}</option>
        ) : null}
      </select>
    </span>
  );
}

function RangeField({
  field,
  initial,
  epoch,
}: {
  field: ConfigField;
  initial: string;
  epoch: number;
}) {
  const choices = field.choices || [];
  const fallback = rangeFallsBack({ ...field, value: initial });
  const startIndex = Math.max(0, rangeIndex(choices, initial));
  const [index, setIndex] = useState(startIndex);
  const outRef = useRef<HTMLOutputElement>(null);

  useEffect(() => {
    setIndex(startIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch, startIndex, field.key]);

  if (fallback) {
    return (
      <span className="pi-input-wrap">
        <input
          id={"pi-inp-" + field.key}
          className="pi-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          defaultValue={initial}
          aria-describedby={"pi-range-note-" + field.key}
        />
        <span className="pi-range-note" id={"pi-range-note-" + field.key} role="note">
          当前值不在预设档位；改为预设档位后保存
        </span>
      </span>
    );
  }

  return (
    <span className="pi-range-wrap">
      <Slider
        id={"pi-range-" + field.key}
        value={index}
        min={0}
        max={Math.max(0, choices.length - 1)}
        step={1}
        label={fieldLabelText(field)}
        valueText={rangeAriaValueText(field, index)}
        onValueChange={(next) => {
          const clamped = Math.max(0, Math.min(choices.length - 1, Math.round(next)));
          setIndex(clamped);
          if (outRef.current) outRef.current.textContent = rangeAriaValueText(field, clamped);
        }}
        className="pi-slider"
      />
      <output
        id={"pi-range-out-" + field.key}
        ref={outRef}
        className="pi-range-out"
        htmlFor={"pi-range-" + field.key}
      >
        {rangeLabel(choices, field.choiceLabels, index)}
      </output>
      <input
        id={"pi-inp-" + field.key}
        type="hidden"
        value={rangeValue(choices, index)}
        onChange={() => undefined}
      />
    </span>
  );
}

function FieldRow({
  field,
  initial,
  epoch,
  secretShown,
  onToggleSecret,
}: {
  field: ConfigField;
  initial: string;
  epoch: number;
  secretShown: boolean;
  onToggleSecret: () => void;
}) {
  const control = fieldControl(field);
  const controlId =
    control === "range" && !rangeFallsBack({ ...field, value: initial })
      ? "pi-range-" + field.key
      : "pi-inp-" + field.key;
  let body: React.ReactNode;
  if (control === "password") {
    body = (
      <SecretField
        field={field}
        shown={secretShown}
        onToggle={onToggleSecret}
      />
    );
  } else if (control === "range") {
    body = <RangeField field={field} initial={initial} epoch={epoch} />;
  } else if (control === "select") {
    body = <ChoiceField field={field} initial={initial} />;
  } else {
    body = (
      <span className="pi-input-wrap">
        <input
          id={"pi-inp-" + field.key}
          className="pi-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          defaultValue={initial}
          aria-label={fieldLabelText(field)}
        />
      </span>
    );
  }
  return (
    <label className="pi-field" htmlFor={controlId} data-field-key={field.key}>
      <span className="pi-field-label">
        {fieldLabelText(field)}
        {field.secret === true ? <span className="pi-secret-tag">机密</span> : null}
      </span>
      {body}
      <span className="runtime-field-help">{fieldHelp(field)}</span>
    </label>
  );
}

function engineStatusText(view: RuntimeConfigView | null, loading: boolean): string {
  if (loading) return "检查中…";
  if (!view) return "配置未知";
  return missingKeysOf(view).length > 0 ? "缺配置" : "已配置";
}

export function SettingsPanel({ hidden }: { hidden: boolean }) {
  const engine = useSettingsStore((s) => s.engine);
  const views = useSettingsStore((s) => s.views);
  const loading = useSettingsStore((s) => s.loading);
  const saving = useSettingsStore((s) => s.saving);
  const status = useSettingsStore((s) => s.status);
  const currentRuntime = useUiStore((s) => s.runtime);
  const setEngine = useSettingsStore((s) => s.setEngine);
  const view = views[engine];
  const [drafts, setDrafts] = useState<Record<string, EngineDraft>>({});
  const [secretShown, setSecretShown] = useState<Record<string, boolean>>({});
  const [epochs, setEpochs] = useState<Record<string, number>>({
    pi: 0,
    codex: 0,
    claude: 0,
  });
  const lastReset = useRef<Record<string, RuntimeConfigView | null>>({});

  const draft = drafts[engine];

  // 首次/刷新视图：未编辑的草稿从视图重建；已编辑草稿保留（跨 tab 不丢）。
  useEffect(() => {
    if (!view) return;
    const previous = lastReset.current[engine];
    if (previous === view) return;
    lastReset.current[engine] = view;
    setDrafts((current) => {
      const existing = current[engine];
      if (existing && existing.dirty) return current;
      return {
        ...current,
        [engine]: { values: initialFieldValues(view.fields), dirty: false },
      };
    });
    setEpochs((current) => ({ ...current, [engine]: (current[engine] || 0) + 1 }));
    setSecretShown((current) => {
      const next = { ...current };
      for (const field of view.fields) {
        if (field.secret === true) delete next[engine + "\u0000" + field.key];
      }
      return next;
    });
  }, [engine, view]);

  // 保存成功：清空机密输入并从最新视图重置（失败保留草稿）。
  const savedText = status.text.startsWith("已保存到 .env");
  useEffect(() => {
    if (!savedText || !view) return;
    setDrafts((current) => ({
      ...current,
      [engine]: { values: initialFieldValues(view.fields), dirty: false },
    }));
    setEpochs((current) => ({ ...current, [engine]: (current[engine] || 0) + 1 }));
    setSecretShown((current) => {
      const next = { ...current };
      for (const field of view.fields) {
        if (field.secret === true) delete next[engine + "\u0000" + field.key];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedText, view]);

  const syncDraftFromDom = (markDirty = true) => {
    if (!view) return;
    const values = readDomValues(view.fields);
    setDrafts((current) => ({
      ...current,
      [engine]: { values, dirty: markDirty },
    }));
  };

  const label = runtimeLabel(engine);
  const missing = missingKeysOf(view);
  const { main, advanced } = partitionFields(view?.fields || []);
  const initialValues = draft?.values || (view ? initialFieldValues(view.fields) : {});
  const epoch = epochs[engine] || 0;

  const switchEngine = (next: RuntimeId) => {
    if (next === engine) return;
    // 只切换配置视图不算用户编辑：保留已捕获值，但不阻止随后到达的新配置视图刷新字段。
    syncDraftFromDom(false);
    setEngine(next);
  };

  const ENGINES: RuntimeId[] = ["pi", "codex", "claude"];

  // WAI-ARIA Tabs：←/→ 循环、Home/End 首尾；roving tabindex；移动即切换并聚焦。
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = ENGINES.indexOf(engine);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % ENGINES.length;
    else if (event.key === "ArrowLeft") next = (index + ENGINES.length - 1) % ENGINES.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ENGINES.length - 1;
    else return;
    event.preventDefault();
    const target = ENGINES[next];
    switchEngine(target);
    requestAnimationFrame(() => {
      document.getElementById("pi-engine-tab-" + target)?.focus();
    });
  };

  const save = async () => {
    if (!view) return;
    syncDraftFromDom();
    await saveSettingsFormFromDom();
  };

  return (
    <div id="pi-panel" className="pi-panel" hidden={hidden}>
      <div
        className="pi-engine-tabs"
        role="tablist"
        aria-label="引擎设置"
        onKeyDown={onTabKeyDown}
      >
        {ENGINES.map((id) => (
          <button
            key={id}
            id={"pi-engine-tab-" + id}
            type="button"
            role="tab"
            className={
              "pi-engine-tab" + (id === engine ? " active" : "") +
              (id === currentRuntime ? " is-current" : "")
            }
            aria-selected={id === engine}
            aria-controls="pi-engine-panel"
            tabIndex={id === engine ? 0 : -1}
            data-engine={id}
            title={
              id === currentRuntime
                ? runtimeLabel(id) + " 配置（当前会话引擎）"
                : runtimeLabel(id) + " 配置"
            }
            onClick={() => switchEngine(id)}
          >
            {runtimeLabel(id)}
            {id === currentRuntime ? (
              <span className="pi-engine-dot" aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </div>
      <div
        className="pi-tabpanel"
        role="tabpanel"
        id="pi-engine-panel"
        aria-labelledby={"pi-engine-tab-" + engine}
      >
      <p className="pi-panel-note">配置只影响所选引擎；不会切换当前会话。</p>
      <div className="pi-scroll">
        <div
          id="pi-panel-path"
          className="pi-panel-path"
          title={view?.path || ""}
        >
          {view?.path || "（保存位置未报告）"}
        </div>
        <p className="pi-panel-hint">
          保存到仓库根 .env，只修改本引擎字段。
          {applicationLabel(view?.application || "next-session")}
        </p>
        {!view && !loading ? (
          <div className="pi-alert is-err" role="alert">
            <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>{status.text || "读取配置失败。"}</span>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              id="pi-retry-read"
              onClick={() => void useSettingsStore.getState().load(engine)}
            >
              重试读取
            </Button>
          </div>
        ) : null}
        {view && missing.length > 0 ? (
          <div className="pi-alert is-warn" role="alert">
            <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>
              {label} 配置不完整，缺：{missing.join("、")}。请补齐后保存。
            </span>
          </div>
        ) : null}
        <div className="pi-fields">
          {main.map((field) => (
            <FieldRow
              key={field.key + ":" + epoch}
              field={field}
              initial={initialValues[field.key] ?? ""}
              epoch={epoch}
              secretShown={secretShown[engine + "\u0000" + field.key] === true}
              onToggleSecret={() =>
                setSecretShown((current) => ({
                  ...current,
                  [engine + "\u0000" + field.key]:
                    current[engine + "\u0000" + field.key] !== true,
                }))
              }
            />
          ))}
        </div>
        <details className="pi-advanced" hidden={advanced.length === 0}>
          <summary>
            <ChevronRight size={12} strokeWidth={1.5} className="pi-chev" aria-hidden="true" />
            高级
          </summary>
          <div className="pi-advanced-body">
            <p className="pi-advanced-hint">以下高级项均可留空；留空 = 使用默认值。</p>
            {advanced.map((field) => (
              <FieldRow
                key={field.key + ":" + epoch}
                field={field}
                initial={initialValues[field.key] ?? ""}
                epoch={epoch}
                secretShown={secretShown[engine + "\u0000" + field.key] === true}
                onToggleSecret={() => undefined}
              />
            ))}
          </div>
        </details>
        <div className="pi-engine-status" role="status" aria-live="polite">
          {label} · {engineStatusText(view, loading)}
        </div>
      </div>
      <div className="pi-save-bar">
        <Button
          id="pi-save"
          type="button"
          size="sm"
          disabled={!view || saving || loading}
          onClick={() => void save()}
        >
          保存到 .env
        </Button>
        <span
          id="pi-status"
          className={"pi-status" + (status.kind ? " is-" + status.kind : "")}
          role="status"
          aria-live="polite"
          title={status.title || status.text}
        >
          {status.text}
        </span>
      </div>
      </div>
    </div>
  );
}
