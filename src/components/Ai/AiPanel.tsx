import { useEffect, useMemo, useRef, useState } from "react";
import { useAiStore } from "../../stores/aiStore";
import { useEditorStore } from "../../stores/editorStore";
import { testConnection } from "../../lib/ai/client";
import { renderChatHtml } from "../../lib/ai/sanitize";
import {
  PROVIDER_PRESETS,
  type AiConfig,
  type AiProvider,
  type ChatMessage,
  type Citation,
} from "../../lib/ai/types";
import { DiffReview } from "./DiffReview";

const KIND_LABEL: Record<Citation["kind"], string> = {
  selection: "选区",
  block: "段落",
  document: "文档",
  workspace: "笔记",
  manual: "引用",
};

function ChatBubble({ message }: { message: ChatMessage }) {
  const setProposal = useAiStore((s) => s.setProposal);
  const baseDir = useEditorStore((s) => s.file?.dir ?? null);

  const html = useMemo(
    () =>
      message.role === "assistant" && message.content
        ? renderChatHtml(message.content, baseDir)
        : "",
    [message.role, message.content, baseDir],
  );

  if (message.role === "user") {
    return (
      <div className="ai-msg ai-msg-user">
        <div className="ai-bubble">
          <div className="ai-bubble-text">{message.content}</div>
          {message.citations.length > 0 && (
            <div className="ai-msg-cites">
              {message.citations.map((cite) => (
                <span key={cite.id} className="ai-cite-chip static" title={cite.path}>
                  {cite.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ai-msg ai-msg-assistant">
      {message.content ? (
        <div className="markdown-body ai-markdown" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="ai-typing" aria-label="正在生成">
          <span />
          <span />
          <span />
        </div>
      )}
      {message.error && <div className="ai-msg-error">{message.error}</div>}
      {message.proposal && (
        <button className="ai-proposal-btn" onClick={() => setProposal(message.proposal ?? null)}>
          查看修改建议
        </button>
      )}
    </div>
  );
}

function AiSettings() {
  const config = useAiStore((s) => s.config);
  const saveConfig = useAiStore((s) => s.saveConfig);
  const setSettingsOpen = useAiStore((s) => s.setSettingsOpen);
  const [draft, setDraft] = useState<AiConfig>(config);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => setDraft(config), [config]);

  const changeProvider = (provider: AiProvider) => {
    setDraft((current) => {
      const oldPreset = PROVIDER_PRESETS[current.provider];
      const nextPreset = PROVIDER_PRESETS[provider];
      return {
        ...current,
        provider,
        baseUrl: current.baseUrl === oldPreset.baseUrl ? nextPreset.baseUrl : current.baseUrl,
        model: current.model === oldPreset.model ? nextPreset.model : current.model,
      };
    });
    setTestResult(null);
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const reply = await testConnection(draft);
      setTestResult(`连接正常：${reply.slice(0, 40) || "（空响应）"}`);
    } catch (error) {
      setTestResult(`失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="ai-settings">
      <div className="ai-settings-head">
        <strong>模型配置</strong>
        <button className="ai-icon-btn" onClick={() => setSettingsOpen(false)} title="返回对话">
          ✕
        </button>
      </div>

      <label className="ai-field">
        <span>服务商</span>
        <div className="ai-segment">
          {(Object.keys(PROVIDER_PRESETS) as AiProvider[]).map((provider) => (
            <button
              key={provider}
              className={`ai-segment-btn ${draft.provider === provider ? "active" : ""}`}
              onClick={() => changeProvider(provider)}
            >
              {PROVIDER_PRESETS[provider].label}
            </button>
          ))}
        </div>
      </label>

      <label className="ai-field">
        <span>接口地址</span>
        <input
          className="ai-input"
          value={draft.baseUrl}
          onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
          placeholder="https://api.openai.com/v1"
          spellCheck={false}
        />
      </label>

      <label className="ai-field">
        <span>模型</span>
        <input
          className="ai-input"
          value={draft.model}
          onChange={(event) => setDraft({ ...draft, model: event.target.value })}
          placeholder="gpt-4o-mini"
          spellCheck={false}
        />
      </label>

      <label className="ai-field">
        <span>API Key</span>
        <div className="ai-key-row">
          <input
            className="ai-input"
            type={showKey ? "text" : "password"}
            value={draft.apiKey}
            onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
            placeholder="sk-..."
            spellCheck={false}
            autoComplete="off"
          />
          <button className="ai-text-btn" onClick={() => setShowKey(!showKey)}>
            {showKey ? "隐藏" : "显示"}
          </button>
        </div>
      </label>

      <label className="ai-field">
        <span>温度 {draft.temperature.toFixed(1)}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={draft.temperature}
          onChange={(event) => setDraft({ ...draft, temperature: Number(event.target.value) })}
        />
      </label>

      <p className="ai-note">
        Key 只保存在本机（localStorage），请求由桌面端直接发出，不经过浏览器页面。
      </p>

      {testResult && <div className="ai-test-result">{testResult}</div>}

      <div className="ai-settings-actions">
        <button className="ai-btn" onClick={() => void runTest()} disabled={testing}>
          {testing ? "测试中…" : "测试连接"}
        </button>
        <button
          className="ai-btn primary"
          onClick={() => {
            saveConfig(draft);
            setSettingsOpen(false);
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
}

export function AiPanel() {
  const open = useAiStore((s) => s.open);
  const setOpen = useAiStore((s) => s.setOpen);
  const settingsOpen = useAiStore((s) => s.settingsOpen);
  const setSettingsOpen = useAiStore((s) => s.setSettingsOpen);
  const scope = useAiStore((s) => s.scope);
  const setScope = useAiStore((s) => s.setScope);
  const messages = useAiStore((s) => s.messages);
  const citations = useAiStore((s) => s.citations);
  const draft = useAiStore((s) => s.draft);
  const setDraft = useAiStore((s) => s.setDraft);
  const streaming = useAiStore((s) => s.streaming);
  const status = useAiStore((s) => s.status);
  const error = useAiStore((s) => s.error);
  const send = useAiStore((s) => s.send);
  const stop = useAiStore((s) => s.stop);
  const clearMessages = useAiStore((s) => s.clearMessages);
  const removeCitation = useAiStore((s) => s.removeCitation);
  const addCurrentDocument = useAiStore((s) => s.addCurrentDocument);
  const fileName = useEditorStore((s) => s.file?.name ?? null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = body.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    if (open && !settingsOpen) inputRef.current?.focus();
  }, [open, settingsOpen]);

  if (!open) {
    // 开关只放在标题栏（和主题按钮同一组），收起时不再显示右下角浮动按钮
    return null;
  }

  return (
    <aside className="ai-panel" aria-label="AI 助手">
      <header className="ai-panel-head">
        <span className="ai-panel-title">AI 助手</span>
        {!settingsOpen && (
          <div className="ai-segment small">
            <button
              className={`ai-segment-btn ${scope === "doc" ? "active" : ""}`}
              onClick={() => setScope("doc")}
              title={fileName ? `只发送「${fileName}」` : "只发送当前文档"}
            >
              本文
            </button>
            <button
              className={`ai-segment-btn ${scope === "workspace" ? "active" : ""}`}
              onClick={() => setScope("workspace")}
              title="检索当前工作区的其它笔记"
            >
              工作区
            </button>
          </div>
        )}
        <div className="ai-panel-tools">
          <button
            className="ai-icon-btn"
            onClick={() => setSettingsOpen(!settingsOpen)}
            title="模型配置"
          >
            ⚙
          </button>
          <button className="ai-icon-btn" onClick={clearMessages} title="清空对话">
            ⌫
          </button>
          <button className="ai-icon-btn" onClick={() => setOpen(false)} title="收起">
            ❯
          </button>
        </div>
      </header>

      {settingsOpen ? (
        <AiSettings />
      ) : (
        <>
          <div className="ai-panel-body" ref={bodyRef}>
            {messages.length === 0 && (
              <div className="ai-empty">
                <p>可以问关于当前文档或整个工作区的问题。</p>
                <p className="ai-empty-tip">
                  选中正文后直接提问会自动带上选区；也可以在正文里右键「加入 AI 引用」。
                </p>
                <p className="ai-empty-tip">让 AI 改文档时，会先弹出 diff 给你逐处确认。</p>
              </div>
            )}
            {messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))}
            {status && <div className="ai-status">{status}</div>}
            {error && <div className="ai-error">{error}</div>}
          </div>

          <div className="ai-composer">
            {citations.length > 0 && (
              <div className="ai-cite-bar">
                {citations.map((cite) => (
                  <span key={cite.id} className="ai-cite-chip" title={cite.path}>
                    <span className="ai-cite-kind">{KIND_LABEL[cite.kind]}</span>
                    {cite.label}
                    <button className="ai-cite-x" onClick={() => removeCitation(cite.id)}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef}
              className="ai-input-area"
              value={draft}
              rows={3}
              placeholder="问点什么，或让它修改当前文档…（Enter 发送，Shift+Enter 换行）"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="ai-composer-bar">
              <button
                className="ai-text-btn"
                onClick={addCurrentDocument}
                disabled={!fileName}
                title="把整篇当前文档加入引用"
              >
                ＋ 当前文档
              </button>
              <span className="ai-composer-spacer" />
              {streaming ? (
                <button className="ai-btn" onClick={stop}>
                  停止
                </button>
              ) : (
                <button className="ai-btn primary" onClick={() => void send()} disabled={!draft.trim()}>
                  发送
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <DiffReview />
    </aside>
  );
}
