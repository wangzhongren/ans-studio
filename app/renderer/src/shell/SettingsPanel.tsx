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
import { languageOptions, useLocaleState, useT } from "@/i18n";
import { translate } from "@/i18n";
import type { Locale } from "@/i18n";
import {
  applicationLabel,
  configWarningText,
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
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  return (
    <span className="pi-input-wrap">
      <input
        id={"pi-inp-" + field.key}
        className="pi-input"
        type={shown ? "text" : "password"}
        autoComplete="off"
        spellCheck={false}
        defaultValue=""
        placeholder={
          field.isSet ? t("ui.settings.placeholderSet") : t("shared.common.notSet")
        }
        aria-label={fieldLabelText(field, locale)}
      />
      <button
        id={"pi-toggle-secret-" + field.key}
        className="pi-secret-toggle"
        type="button"
        aria-pressed={shown}
        onClick={onToggle}
      >
        {shown ? t("ui.settings.hide") : t("ui.settings.show")}
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
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const choices = field.choices || [];
  const labels = field.choiceLabels || [];
  const currentInChoices = choices.indexOf(initial) >= 0;
  return (
    <span className="pi-input-wrap">
      <select
        id={"pi-inp-" + field.key}
        className="pi-input pi-select"
        defaultValue={initial}
        aria-label={fieldLabelText(field, locale)}
      >
        <option value="">{t("ui.settings.optionDefault")}</option>
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
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
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
          {t("ui.settings.rangeOffPreset")}
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
        label={fieldLabelText(field, locale)}
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
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
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
          aria-label={fieldLabelText(field, locale)}
        />
      </span>
    );
  }
  return (
    <label className="pi-field" htmlFor={controlId} data-field-key={field.key}>
      <span className="pi-field-label">
        {fieldLabelText(field, locale)}
        {field.secret === true ? (
          <span className="pi-secret-tag">{t("ui.settings.secretTag")}</span>
        ) : null}
      </span>
      {body}
      <span className="runtime-field-help">{fieldHelp(field, locale)}</span>
    </label>
  );
}

function engineStatusText(
  view: RuntimeConfigView | null,
  loading: boolean,
  locale: Locale,
): string {
  if (loading) return translate(locale, "ui.settings.statusChecking");
  if (!view) return translate(locale, "ui.settings.statusUnknown");
  return translate(
    locale,
    missingKeysOf(view).length > 0
      ? "ui.settings.statusMissing"
      : "ui.settings.statusConfigured",
  );
}

// ---- 语言区（B0）开始 ----
/**
 * 通用/语言区（i18n B0）：设置面板顶部、引擎 tabs 之前。
 *
 * 只做语言骨架：标题/说明/选项/保存失败错误全部来自 shared 目录（`ui.settings.language.*`），
 * 本区不新增中文硬编码；切换交给 locale store（乐观更新 + 失败回滚）。
 * 引擎设置文案仍为中文，B1/B2 批次再迁移；保存条高度与引擎配置区布局不变。
 */
function LanguageSection() {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
  const error = useLocaleState((s) => s.error);
  const setLocale = useLocaleState((s) => s.setLocale);
  const options = languageOptions(locale, t);
  return (
    <section id="pi-language-section" aria-labelledby="pi-language-title">
      <div className="pi-panel-note">
        <div className="pi-fields">
          <label className="pi-field" htmlFor="pi-language-select">
            <span className="pi-field-label" id="pi-language-title">
              {t("ui.settings.language.title")}
            </span>
            <span className="pi-input-wrap">
              <select
                id="pi-language-select"
                className="pi-input pi-select"
                value={locale}
                aria-describedby="pi-language-description"
                onChange={(event) => {
                  void setLocale(event.target.value);
                }}
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </span>
            <span className="runtime-field-help" id="pi-language-description">
              {t("ui.settings.language.description")}
            </span>
          </label>
          {error ? (
            <div className="pi-alert is-err" role="alert">
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
// ---- 语言区（B0）结束 ----

export function SettingsPanel({ hidden }: { hidden: boolean }) {
  const t = useT();
  const locale = useLocaleState((s) => s.locale);
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
  // 结构化状态码（不再解析本地化文案）。
  const saved = status.code === "saved";
  useEffect(() => {
    if (!saved || !view) return;
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
  }, [saved, view]);

  const syncDraftFromDom = (markDirty = true) => {
    if (!view) return;
    const values = readDomValues(view.fields);
    setDrafts((current) => ({
      ...current,
      [engine]: { values, dirty: markDirty },
    }));
  };

  const label = runtimeLabel(engine, locale);
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
      <LanguageSection />
      <div
        className="pi-engine-tabs"
        role="tablist"
        aria-label={t("ui.settings.engineSettingsAria")}
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
                ? t("ui.settings.runtimeConfigCurrent", { runtime: runtimeLabel(id, locale) })
                : t("ui.settings.runtimeConfig", { runtime: runtimeLabel(id, locale) })
            }
            onClick={() => switchEngine(id)}
          >
            {runtimeLabel(id, locale)}
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
      <p className="pi-panel-note">{t("ui.settings.panelNote")}</p>
      <div className="pi-scroll">
        <div
          id="pi-panel-path"
          className="pi-panel-path"
          title={view?.path || ""}
        >
          {view?.path || t("ui.settings.pathNotReported")}
        </div>
        <p className="pi-panel-hint">
          {t("ui.settings.saveNote")}
          {applicationLabel(view?.application || "next-session", locale)}
        </p>
        {!view && !loading ? (
          <div className="pi-alert is-err" role="alert">
            <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>{status.text || t("ui.settings.readFailed")}</span>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              id="pi-retry-read"
              onClick={() => void useSettingsStore.getState().load(engine)}
            >
              {t("shared.common.retryRead")}
            </Button>
          </div>
        ) : null}
        {view && missing.length > 0 ? (
          <div className="pi-alert is-warn" role="alert">
            <CircleAlert size={14} strokeWidth={1.5} aria-hidden="true" />
            <span>{configWarningText(label, missing, locale)}</span>
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
            {t("ui.settings.advanced")}
          </summary>
          <div className="pi-advanced-body">
            <p className="pi-advanced-hint">{t("ui.settings.advancedHint")}</p>
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
          {label} · {engineStatusText(view, loading, locale)}
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
          {t("ui.settings.saveToEnv")}
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
