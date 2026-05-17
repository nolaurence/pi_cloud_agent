import { CloudServerOutlined, DesktopOutlined, KeyOutlined, LaptopOutlined, LoadingOutlined, LoginOutlined, LogoutOutlined, MenuOutlined, MessageOutlined, MoonOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, SunOutlined, UserOutlined } from "@ant-design/icons";
import { Bubble, Sender, XProvider } from "@ant-design/x";
import { XMarkdown } from "@ant-design/x-markdown";
import type { AgentSessionSummary, AgentTraceItem, BrowserConnectionStatus, ChatMessage, ModelCredentialProvider, ModelCredentialStatus, SetModelCredentialInput } from "@pi-cloud/shared";
import { App as AntApp, Button, ConfigProvider, Dropdown, Empty, Flex, Form, Input, Layout, List, Modal, Segmented, Space, Splitter, Tag, Typography, message } from "antd";
import type { MenuProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { ApiClient, type AuthResponse } from "../api/client";
import { detectPlaywrightExtension } from "../components/ExtensionProbe";
import { getShadcnThemeConfig } from "../styles/shadcnTheme";
import { randomId } from "../utils/uuid";

const TOKEN_KEY = "pi-cloud-token";
const THEME_KEY = "pi-cloud-theme";

type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";
type WorkspaceView = "chat" | "settings";

export function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
  });
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => getSystemTheme());
  const resolvedTheme = themeMode === "system" ? systemTheme : themeMode;
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(query.matches ? "dark" : "light");
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  return (
    <ConfigProvider {...getShadcnThemeConfig(isDark)}>
      <XProvider>
        <AntApp>
          <Shell themeMode={themeMode} onThemeModeChange={setThemeMode} />
        </AntApp>
      </XProvider>
    </ConfigProvider>
  );
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function Shell({ themeMode, onThemeModeChange }: { themeMode: ThemeMode; onThemeModeChange: (mode: ThemeMode) => void }) {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) ?? undefined);
  const [user, setUser] = useState<AuthResponse["user"]>();
  const api = useMemo(() => new ApiClient(token), [token]);

  useEffect(() => {
    api.setToken(token);
    if (token) {
      api.me().then(setUser).catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(undefined);
      });
    }
  }, [api, token]);

  const onAuthed = (response: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, response.accessToken);
    setToken(response.accessToken);
    setUser(response.user);
  };

  if (!token || !user) return <AuthScreen api={api} onAuthed={onAuthed} themeMode={themeMode} onThemeModeChange={onThemeModeChange} />;
  return <Workspace api={api} user={user} onLogout={() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(undefined);
    setUser(undefined);
  }} themeMode={themeMode} onThemeModeChange={onThemeModeChange} />;
}

function AuthScreen({ api, onAuthed, themeMode, onThemeModeChange }: { api: ApiClient; onAuthed: (response: AuthResponse) => void; themeMode: ThemeMode; onThemeModeChange: (mode: ThemeMode) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);

  const submit = async (values: { email: string; displayName?: string; password: string }) => {
    setLoading(true);
    try {
      const response = mode === "login" ? await api.login(values) : await api.register({ email: values.email, displayName: values.displayName ?? values.email, password: values.password });
      onAuthed(response);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <Flex justify="space-between" align="center" gap={12}>
          <Typography.Title level={1}>Pi Cloud Agent</Typography.Title>
          <ThemeModeSwitch value={themeMode} onChange={onThemeModeChange} />
        </Flex>
        <Segmented value={mode} onChange={(value) => setMode(value as "login" | "register")} options={[{ label: "登录", value: "login" }, { label: "注册", value: "register" }]} />
        <Form layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email" }]}>
            <Input autoComplete="email" />
          </Form.Item>
          {mode === "register" ? (
            <Form.Item name="displayName" label="显示名" rules={[{ required: true, min: 2 }]}>
              <Input />
            </Form.Item>
          ) : null}
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 8 }]}>
            <Input.Password autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </Form.Item>
          <Button icon={<LoginOutlined />} type="primary" htmlType="submit" loading={loading} block>
            {mode === "login" ? "进入工作台" : "创建账号"}
          </Button>
        </Form>
      </section>
    </main>
  );
}

function Workspace({ api, user, onLogout, themeMode, onThemeModeChange }: { api: ApiClient; user: AuthResponse["user"]; onLogout: () => void; themeMode: ThemeMode; onThemeModeChange: (mode: ThemeMode) => void }) {
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [active, setActive] = useState<AgentSessionSummary>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<WorkspaceView>("chat");
  const [senderValue, setSenderValue] = useState("");

  const refresh = async () => {
    const next = await api.listSessions();
    setSessions(next);
    if (!active && next[0]) setActive(next[0]);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (active) api.listMessages(active.id).then(setMessages).catch((error) => message.error(String(error)));
  }, [active]);

  const createSession = async () => {
    let modelConfig: { provider?: string; model?: string } = {};
    try {
      const siliconFlow = (await api.modelCredentials()).find((item) => item.provider === "siliconflow" && item.configured && item.model);
      if (siliconFlow?.model) modelConfig = { provider: "siliconflow", model: siliconFlow.model };
    } catch {
      modelConfig = {};
    }
    const session = await api.createSession({ title: `Session ${sessions.length + 1}`, ...modelConfig });
    setSessions([session, ...sessions]);
    setActive(session);
    setMessages([]);
  };

  const [streamingTrace, setStreamingTrace] = useState<AgentTraceItem[]>([]);

  const send = async (content: string) => {
    const messageContent = content.trim();
    if (!active || !messageContent) return;
    setSenderValue("");
    const userMessage: ChatMessage = { id: randomId(), role: "user", content: messageContent, createdAt: new Date().toISOString() };
    setMessages((items) => [...items, userMessage]);
    setLoading(true);
    setStreamingTrace([]);

    try {
      await api.promptStream(active.id, messageContent, {
        onTrace: (item) => {
          setStreamingTrace((prev) => mergeStreamingTrace(prev, item));
        },
        onComplete: (result) => {
          setMessages((items) => [
            ...items,
            {
              id: randomId(),
              role: "assistant",
              content: result.assistantText,
              createdAt: new Date().toISOString(),
              metadata: { eventCount: result.eventCount, trace: result.assistantTrace }
            }
          ]);
          setLoading(false);
          setStreamingTrace([]);
          refresh();
        },
        onError: (error) => {
          message.error(error.message || "Agent request failed");
          setLoading(false);
          setStreamingTrace([]);
        }
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Agent request failed");
      setLoading(false);
      setStreamingTrace([]);
    }
  };

  return (
    <Layout className="workspace">
      <Layout.Header className="topbar">
        <Space>
          <CloudServerOutlined />
          <Typography.Text strong>Pi Cloud Agent</Typography.Text>
        </Space>
        <Space>
          <ThemeModeSwitch value={themeMode} onChange={onThemeModeChange} />
          <BrowserConnectionPanel api={api} />
        </Space>
      </Layout.Header>
      <Layout.Content>
        <Splitter className="main-splitter">
          <Splitter.Panel defaultSize={300} min={260} max={420}>
            <aside className="session-pane">
              <div className="session-pane-main">
                <Button className={view === "chat" ? "sidebar-command active" : "sidebar-command"} icon={<MessageOutlined />} type="text" onClick={() => setView("chat")}>
                  会话
                </Button>
                {view === "chat" ? (
                  <>
                    <Flex justify="space-between" align="center" className="session-heading">
                      <Typography.Title level={4}>会话</Typography.Title>
                      <Space>
                        <Button aria-label="刷新会话" icon={<ReloadOutlined />} onClick={refresh} />
                        <Button aria-label="新建会话" icon={<PlusOutlined />} type="primary" onClick={createSession} />
                      </Space>
                    </Flex>
                    <List
                      dataSource={sessions}
                      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无会话" /> }}
                      renderItem={(session) => (
                        <List.Item
                          className={active?.id === session.id ? "session active" : "session"}
                          onClick={() => {
                            setActive(session);
                            setView("chat");
                          }}
                        >
                          <div className="session-row">
                            <span className="session-title">{session.firstUserMessage || session.title}</span>
                            <span className="session-time">{formatRelativeTime(session.updatedAt)}</span>
                          </div>
                        </List.Item>
                      )}
                    />
                  </>
                ) : null}
              </div>
              <UserMenu user={user} onOpenSettings={() => setView("settings")} onLogout={onLogout} />
            </aside>
          </Splitter.Panel>
          <Splitter.Panel>
            {view === "settings" ? (
              <SettingsView api={api} user={user} />
            ) : (
              <section className="chat-pane">
                {active ? (
                  <>
                    <div className="messages">
                      {messages.map((item) => (
                        <ChatMessageView key={item.id} message={item} />
                      ))}
                      {loading ? <PendingAssistantTurn trace={streamingTrace} /> : null}
                    </div>
                    <div className="composer-wrap">
                      <Sender placeholder="向云端 agent 发送任务" value={senderValue} loading={loading} onChange={setSenderValue} onSubmit={send} />
                    </div>
                  </>
                ) : (
                  <Empty description="创建一个会话开始" />
                )}
              </section>
            )}
          </Splitter.Panel>
        </Splitter>
      </Layout.Content>
    </Layout>
  );
}

function ChatMessageView({ message: item }: { message: ChatMessage }) {
  if (item.role === "user") {
    return (
      <div className="chat-turn chat-turn-user">
        <Bubble className="user-message-bubble" placement="end" content={item.content} />
      </div>
    );
  }

  if (item.role === "assistant") {
    const trace = item.metadata?.trace as AgentTraceItem[] | undefined;
    const eventCount = typeof item.metadata?.eventCount === "number" ? item.metadata.eventCount : undefined;
    const processTrace = getProcessTrace(trace, item.content);

    return (
      <div className="chat-turn chat-turn-assistant">
        <article className="assistant-message">
          <AgentProcess trace={processTrace} eventCount={eventCount} />
          {item.content ? <XMarkdown className="assistant-content" content={item.content} /> : null}
        </article>
      </div>
    );
  }

  return (
    <div className="chat-turn chat-turn-assistant">
      <article className="assistant-message system">
        <Typography.Text type="secondary">{item.content}</Typography.Text>
      </article>
    </div>
  );
}

function PendingAssistantTurn({ trace }: { trace: AgentTraceItem[] }) {
  return (
    <div className="chat-turn chat-turn-assistant">
      <article className="assistant-message assistant-message-pending">
        <div className="assistant-working">
          <LoadingOutlined spin />
          <Typography.Text type="secondary">Pi agent 正在处理</Typography.Text>
        </div>
        <AgentProcess trace={getProcessTrace(trace)} eventCount={trace.length} streaming />
      </article>
    </div>
  );
}

function AgentProcess({ trace, eventCount, streaming = false }: { trace?: AgentTraceItem[]; eventCount?: number; streaming?: boolean }) {
  if (!trace?.length) return null;
  const elapsedLabel = formatTraceElapsed(trace);
  return (
    <section className={streaming ? "agent-process-wrap streaming" : "agent-process-wrap"}>
      <details className="agent-process" open={streaming}>
        <summary className="agent-process-summary">
          <span className="agent-process-title">{streaming ? "处理中" : "已处理"}</span>
          {elapsedLabel ? <span className="agent-process-elapsed">{elapsedLabel}</span> : null}
        </summary>
        <div className="agent-process-list">
          {trace?.length ? (
            trace.map((item, index) => <AgentTraceStep key={traceItemKey(item, index)} item={item} />)
          ) : (
            <span className="agent-process-empty">本轮有 {eventCount} 个 Pi 事件</span>
          )}
        </div>
      </details>
    </section>
  );
}

function AgentTraceStep({ item }: { item: AgentTraceItem }) {
  const hasContent = Boolean(item.detail || item.raw !== undefined);
  const title = cleanTraceTitle(item.title);
  const head = (
    <>
      <span className={`agent-step-kind ${item.type}`}>{traceKindLabel(item.type)}</span>
      <span className="agent-step-title">{title || "Pi agent 事件"}</span>
      {item.status === "running" ? <span className="agent-step-running">处理中</span> : null}
    </>
  );

  if (!hasContent) {
    return (
      <div className={`agent-step agent-step-static ${item.type}`}>
        <div className="agent-step-head">{head}</div>
      </div>
    );
  }

  return (
    <details className={`agent-step ${item.type}`} open={item.status === "running"}>
      <summary className="agent-step-head">{head}</summary>
      <TraceItemContent item={item} />
    </details>
  );
}

function TraceItemContent({ item }: { item: AgentTraceItem }) {
  const showRaw = item.raw !== undefined && item.type !== "tool_call";
  return (
    <div className={`trace-item-content ${item.type}`}>
      {item.detail ? <pre className="trace-detail">{item.detail}</pre> : null}
      {showRaw ? <pre className="trace-raw">{formatTraceRaw(item.raw)}</pre> : null}
    </div>
  );
}

function getProcessTrace(trace: AgentTraceItem[] | undefined, finalAnswer?: string) {
  if (!trace?.length) return undefined;
  const answer = finalAnswer?.trim();
  return trace.filter((item) => {
    if (item.type !== "message") return true;
    const title = cleanTraceTitle(item.title).trim();
    return Boolean(title && title !== answer);
  });
}

function traceKindLabel(type: AgentTraceItem["type"]) {
  switch (type) {
    case "thinking":
      return "推理";
    case "tool_call":
      return "工具";
    case "tool_update":
      return "更新";
    case "tool_result":
      return "结果";
    case "message":
      return "消息";
    case "status":
    default:
      return "状态";
  }
}

function traceItemKey(item: AgentTraceItem, index: number) {
  if ((item.type === "tool_update" || item.type === "tool_result") && item.id) {
    const normalizedToolId = item.id.replace(/-(update-\d+|end|result|message-result)$/, "");
    return `tool_call:${normalizedToolId}`;
  }
  return `${item.type}-${item.id || index}`;
}

function mergeStreamingTrace(trace: AgentTraceItem[], item: AgentTraceItem) {
  const key = traceItemKey(item, trace.length);
  const index = trace.findIndex((current, currentIndex) => traceItemKey(current, currentIndex) === key);
  if (index === -1) return [...trace, item];
  const next = trace.slice();
  next[index] = { ...next[index], ...item };
  return next;
}

function formatTraceElapsed(trace: AgentTraceItem[]) {
  const times = trace
    .map((item) => (item.timestamp ? new Date(item.timestamp).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time));
  if (times.length < 2) return undefined;
  const elapsedMs = Math.max(...times) - Math.min(...times);
  if (elapsedMs < 1000) return "0s";
  const totalSeconds = Math.round(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function cleanTraceTitle(title: string) {
  return title.replace(/^[^\p{L}\p{N}]+/u, "");
}

function formatTraceRaw(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return "刚刚";
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} 周`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 月`;
  return `${Math.floor(days / 365)} 年`;
}

function UserMenu({ user, onOpenSettings, onLogout }: { user: AuthResponse["user"]; onOpenSettings: () => void; onLogout: () => void }) {
  const items: MenuProps["items"] = [
    {
      key: "identity",
      disabled: true,
      label: (
        <span className="user-menu-identity">
          <UserOutlined />
          {user.email}
        </span>
      )
    },
    { type: "divider" },
    { key: "settings", icon: <SettingOutlined />, label: "设置", onClick: onOpenSettings },
    { key: "logout", icon: <LogoutOutlined />, label: "退出登录", onClick: onLogout }
  ];

  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement="topLeft">
      <Button className="user-dock" type="text" icon={<UserOutlined />}>
        <span>{user.displayName}</span>
        <MenuOutlined className="user-dock-menu" />
      </Button>
    </Dropdown>
  );
}

function SettingsView({ api, user }: { api: ApiClient; user: AuthResponse["user"] }) {
  const [credentials, setCredentials] = useState<ModelCredentialStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<ModelCredentialProvider>();

  const reload = async () => {
    setLoading(true);
    try {
      setCredentials(await api.modelCredentials());
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载模型配置失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const save = async (provider: ModelCredentialProvider, values: SetModelCredentialInput) => {
    setSavingProvider(provider);
    try {
      const next = await api.setModelCredential(provider, {
        apiKey: values.apiKey.trim(),
        baseUrl: values.baseUrl?.trim(),
        model: values.model?.trim()
      });
      setCredentials(next);
      message.success("API key 已保存");
      return true;
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
      return false;
    } finally {
      setSavingProvider(undefined);
    }
  };

  const remove = async (provider: ModelCredentialProvider) => {
    setSavingProvider(provider);
    try {
      setCredentials(await api.removeModelCredential(provider));
      message.success("API key 已移除");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "移除失败");
    } finally {
      setSavingProvider(undefined);
    }
  };

  return (
    <section className="settings-pane">
      <div className="settings-header">
        <div>
          <Typography.Title level={3}>设置</Typography.Title>
          <Typography.Text type="secondary">{user.email}</Typography.Text>
        </div>
        <Tag icon={<KeyOutlined />} color={credentials.some((item) => item.configured) ? "success" : "warning"}>
          {credentials.some((item) => item.configured) ? "已配置模型" : "未配置模型"}
        </Tag>
      </div>
      <div className="settings-section">
        <Typography.Title level={4}>大模型 API key</Typography.Title>
        <List
          loading={loading}
          dataSource={credentials}
          renderItem={(item) => {
            return (
              <CredentialRow
                item={item}
                saving={savingProvider === item.provider}
                onSave={(values) => save(item.provider, values)}
                onRemove={() => remove(item.provider)}
              />
            );
          }}
        />
      </div>
    </section>
  );
}

function CredentialRow({ item, saving, onSave, onRemove }: { item: ModelCredentialStatus; saving: boolean; onSave: (values: SetModelCredentialInput) => Promise<boolean>; onRemove: () => Promise<void> }) {
  const [form] = Form.useForm();
  const isSiliconFlow = item.provider === "siliconflow";

  const submit = async (values: SetModelCredentialInput) => {
    if (await onSave(values)) form.resetFields();
  };

  return (
    <List.Item className="credential-row">
      <div className="credential-copy">
        <Typography.Text strong>{item.label}</Typography.Text>
        <Tag color={item.configured ? "success" : "default"}>{item.configured ? "已保存" : "未设置"}</Tag>
        {item.model ? <Typography.Text type="secondary">{item.model}</Typography.Text> : null}
      </div>
      <Form form={form} className="credential-form" layout="vertical" onFinish={submit}>
        {isSiliconFlow ? (
          <>
            <Form.Item name="baseUrl" initialValue={item.baseUrl ?? "https://api.siliconflow.cn/v1"} rules={[{ required: true, type: "url", message: "请输入 OpenAI 协议 Base URL" }]}>
              <Input placeholder="Base URL" autoComplete="off" />
            </Form.Item>
            <Form.Item name="model" initialValue={item.model} rules={[{ required: true, min: 1, message: "请输入模型名称" }]}>
              <Input placeholder="模型名称，例如 deepseek-ai/DeepSeek-V3" autoComplete="off" />
            </Form.Item>
          </>
        ) : null}
        <Form.Item name="apiKey" rules={[{ required: true, min: 8, message: "请输入 API key" }]}>
          <Input.Password placeholder={item.configured ? "输入新 key 以覆盖" : "粘贴 API key"} autoComplete="off" />
        </Form.Item>
        <div className="credential-actions">
          <Button htmlType="submit" type="primary" loading={saving}>
            保存
          </Button>
          <Button disabled={!item.configured} loading={saving} onClick={onRemove}>
            移除
          </Button>
        </div>
      </Form>
    </List.Item>
  );
}

function ThemeModeSwitch({ value, onChange }: { value: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  return (
    <Segmented
      className="theme-switch"
      size="small"
      value={value}
      onChange={(mode) => onChange(mode as ThemeMode)}
      options={[
        { label: <SunOutlined aria-label="浅色模式" />, value: "light" },
        { label: <MoonOutlined aria-label="深色模式" />, value: "dark" },
        { label: <LaptopOutlined aria-label="跟随系统" />, value: "system" }
      ]}
    />
  );
}

function BrowserConnectionPanel({ api }: { api: ApiClient }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<BrowserConnectionStatus>();
  const [hasExtension, setHasExtension] = useState(false);
  const [form] = Form.useForm();

  const reload = async () => {
    const [extension, nextStatus] = await Promise.all([detectPlaywrightExtension(), api.browserStatus()]);
    setHasExtension(extension);
    setStatus(nextStatus);
  };

  useEffect(() => {
    void reload();
  }, []);

  const connectExtension = async (values: { token: string; cdpEndpoint?: string }) => {
    const next = await api.connectExtension(values);
    setStatus(next);
    setOpen(false);
  };

  const useSandbox = async () => {
    const next = await api.useSandboxCdp();
    setStatus(next);
    setOpen(false);
  };

  return (
    <>
      <Button icon={<DesktopOutlined />} onClick={() => setOpen(true)}>
        {status?.status === "connected" ? (status.mode === "user-extension" ? "用户浏览器" : "沙箱浏览器") : "连接浏览器"}
      </Button>
      <Modal title="浏览器连接" open={open} onCancel={() => setOpen(false)} footer={null}>
        <Space direction="vertical" size="large" className="browser-modal">
          <Flex gap={8} wrap>
            <Tag color={hasExtension ? "success" : "warning"}>{hasExtension ? "检测到 Playwright Extension" : "未检测到扩展"}</Tag>
            <Tag color={status?.status === "connected" ? "success" : "default"}>{status?.status ?? "disconnected"}</Tag>
            <Tag>仅新建 tab</Tag>
          </Flex>
          <Form form={form} layout="vertical" onFinish={connectExtension} requiredMark={false}>
            <Form.Item name="token" label="Extension Token" rules={[{ required: true }]}>
              <Input.Password placeholder="粘贴 Playwright Extension token" />
            </Form.Item>
            <Form.Item name="cdpEndpoint" label="CDP Endpoint">
              <Input placeholder="可选，例如 http://localhost:9222" />
            </Form.Item>
            <Flex gap={8}>
              <Button type="primary" htmlType="submit">连接用户浏览器</Button>
              <Button onClick={useSandbox}>使用沙箱 CDP</Button>
            </Flex>
          </Form>
        </Space>
      </Modal>
    </>
  );
}
