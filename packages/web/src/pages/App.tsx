import { ClockCircleOutlined, CloudServerOutlined, DesktopOutlined, KeyOutlined, LaptopOutlined, LoadingOutlined, LoginOutlined, LogoutOutlined, MenuOutlined, MessageOutlined, MoonOutlined, MoreOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, SettingOutlined, SunOutlined, ToolOutlined, UserOutlined } from "@ant-design/icons";
import { Bubble, Sender, XProvider } from "@ant-design/x";
import { XMarkdown } from "@ant-design/x-markdown";
import type { AgentSessionSummary, AgentTraceItem, BrowserConnectionStatus, ChatMessage, CreateScheduledTaskInput, InstalledSkillSummary, ModelCredentialProvider, ModelCredentialStatus, ScheduledTaskRunSummary, ScheduledTaskScheduleType, ScheduledTaskSummary, SetModelCredentialInput } from "@pi-cloud/shared";
import { App as AntApp, Button, ConfigProvider, Dropdown, Empty, Flex, Form, Input, Layout, List, Modal, Segmented, Select, Space, Splitter, Switch, Tag, Typography, message } from "antd";
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
type WorkspaceView = "chat" | "skills" | "tasks" | "settings";

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
  const [taskRefreshKey, setTaskRefreshKey] = useState(0);
  const [skillRefreshKey, setSkillRefreshKey] = useState(0);

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
                <Button className={view === "skills" ? "sidebar-command active" : "sidebar-command"} icon={<ToolOutlined />} type="text" onClick={() => setView("skills")}>
                  技能
                </Button>
                <Button className={view === "tasks" ? "sidebar-command active" : "sidebar-command"} icon={<ClockCircleOutlined />} type="text" onClick={() => setView("tasks")}>
                  定时任务
                </Button>
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
              </div>
              <UserMenu user={user} onOpenSettings={() => setView("settings")} onLogout={onLogout} />
            </aside>
          </Splitter.Panel>
          <Splitter.Panel>
            {view === "settings" ? (
              <SettingsView api={api} user={user} />
            ) : view === "skills" ? (
              <SkillsView api={api} refreshKey={skillRefreshKey} onChanged={() => setSkillRefreshKey((key) => key + 1)} />
            ) : view === "tasks" ? (
              <ScheduledTasksView api={api} refreshKey={taskRefreshKey} onChanged={() => setTaskRefreshKey((key) => key + 1)} />
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

function SkillsView({ api, refreshKey, onChanged }: { api: ApiClient; refreshKey: number; onChanged: () => void }) {
  const [skills, setSkills] = useState<InstalledSkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      setSkills(await api.listSkills());
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载技能失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [refreshKey]);

  const filteredSkills = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return skills;
    return skills.filter((skill) => `${skill.name} ${skill.description ?? ""}`.toLowerCase().includes(keyword));
  }, [skills, query]);

  const installSkill = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const contentBase64 = await fileToBase64(file);
      setSkills(await api.installSkill({ fileName: file.name, contentBase64 }));
      message.success("技能已安装");
      onChanged();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "安装技能失败");
    } finally {
      setUploading(false);
    }
  };

  const toggleSkill = async (skill: InstalledSkillSummary, enabled: boolean) => {
    try {
      setSkills(await api.setSkillEnabled(skill.id, enabled));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新技能状态失败");
    }
  };

  return (
    <section className="skills-pane">
      <header className="skills-hero">
        <div>
          <Typography.Title level={2}>技能</Typography.Title>
          <Typography.Text type="secondary">安装与管理技能，在对话中扩展 Pi Cloud Agent 的能力。</Typography.Text>
        </div>
        <Space className="skills-actions">
          <Button aria-label="刷新技能" icon={<ReloadOutlined />} onClick={reload} />
          <Input className="skills-search" prefix={<SearchOutlined />} placeholder="搜索技能" value={query} onChange={(event) => setQuery(event.target.value)} />
          <label className={uploading ? "skill-upload-button disabled" : "skill-upload-button"}>
            <PlusOutlined />
            <span>{uploading ? "安装中" : "安装技能"}</span>
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void installSkill(file);
              }}
            />
          </label>
        </Space>
      </header>
      <section className="skills-banner">
        <div>
          <Typography.Title level={4}>为你精选的职场技能</Typography.Title>
          <Typography.Text type="secondary">本地导入 zip 技能包，安装后可按用户独立启用或停用。</Typography.Text>
        </div>
      </section>
      <div className="skills-tabs">
        <span className="disabled-tab">技能市场</span>
        <span className="disabled-tab">内置</span>
        <span className="active-tab">用户安装 <Tag>{skills.length}</Tag></span>
      </div>
      <Typography.Text className="skills-section-label" strong>本地安装</Typography.Text>
      <div className="skills-list">
        {loading ? (
          <Empty description="正在加载技能" />
        ) : filteredSkills.length ? (
          filteredSkills.map((skill) => <SkillRow key={skill.id} skill={skill} onToggle={toggleSkill} />)
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={query ? "没有匹配的技能" : "暂无已安装技能"} />
        )}
      </div>
    </section>
  );
}

function SkillRow({ skill, onToggle }: { skill: InstalledSkillSummary; onToggle: (skill: InstalledSkillSummary, enabled: boolean) => void }) {
  return (
    <article className="skill-row">
      <div className="skill-icon">
        <ToolOutlined />
      </div>
      <div className="skill-copy">
        <Typography.Text strong>{skill.name}</Typography.Text>
        <Typography.Text type="secondary" ellipsis>{skill.description || "本地安装的技能包"}</Typography.Text>
      </div>
      <Switch checked={skill.enabled} onChange={(enabled) => onToggle(skill, enabled)} />
    </article>
  );
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",").pop() ?? "" : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsDataURL(file);
  });
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function ScheduledTasksView({ api, refreshKey, onChanged }: { api: ApiClient; refreshKey: number; onChanged: () => void }) {
  const [tasks, setTasks] = useState<ScheduledTaskSummary[]>([]);
  const [runs, setRuns] = useState<ScheduledTaskRunSummary[]>([]);
  const [tab, setTab] = useState<"tasks" | "runs">("tasks");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTaskSummary>();
  const [saving, setSaving] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<string>();
  const [sortMode, setSortMode] = useState<"created-desc" | "created-asc" | "next-asc">("created-desc");

  const reload = async () => {
    setLoading(true);
    try {
      const [nextTasks, nextRuns] = await Promise.all([api.listScheduledTasks(), api.listScheduledTaskRuns()]);
      setTasks(nextTasks);
      setRuns(nextRuns);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载定时任务失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [refreshKey]);

  const sortedTasks = useMemo(() => {
    const next = tasks.slice();
    if (sortMode === "created-asc") return next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (sortMode === "next-asc") {
      return next.sort((a, b) => {
        const aTime = a.nextRunAt ? new Date(a.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.nextRunAt ? new Date(b.nextRunAt).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
    }
    return next.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [tasks, sortMode]);

  const saveTask = async (values: ScheduledTaskFormValues) => {
    const payload = formValuesToTaskInput(values);
    setSaving(true);
    try {
      if (editingTask) {
        await api.updateScheduledTask(editingTask.id, payload);
        message.success("定时任务已更新");
      } else {
        await api.createScheduledTask(payload);
        message.success("定时任务已创建");
      }
      setModalOpen(false);
      setEditingTask(undefined);
      onChanged();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存定时任务失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleTask = async (task: ScheduledTaskSummary, enabled: boolean) => {
    try {
      const next = await api.updateScheduledTask(task.id, { enabled });
      setTasks((items) => items.map((item) => (item.id === next.id ? next : item)));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新任务状态失败");
    }
  };

  const runTask = async (task: ScheduledTaskSummary) => {
    setRunningTaskId(task.id);
    try {
      await api.runScheduledTask(task.id);
      message.success("任务执行完成");
      onChanged();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "任务执行失败");
    } finally {
      setRunningTaskId(undefined);
    }
  };

  const removeTask = async (task: ScheduledTaskSummary) => {
    Modal.confirm({
      title: "删除定时任务？",
      content: task.title,
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        await api.removeScheduledTask(task.id);
        message.success("定时任务已删除");
        onChanged();
      }
    });
  };

  return (
    <section className="tasks-pane">
      <header className="tasks-hero">
        <div>
          <Typography.Title level={2}>定时任务</Typography.Title>
          <Typography.Text type="secondary">按计划自动执行任务，也可以随时手动触发。在任意对话中描述你想定期做的事，即可快速创建。</Typography.Text>
        </div>
        <Space>
          <Button aria-label="刷新定时任务" icon={<ReloadOutlined />} onClick={reload} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            setEditingTask(undefined);
            setModalOpen(true);
          }}>
            新建定时任务
          </Button>
        </Space>
      </header>
      <div className="task-wake-banner">
        <ClockCircleOutlined />
        <span>定时任务仅在服务运行时执行</span>
        <span className="task-wake-spacer" />
        <span>保持系统唤醒</span>
        <Switch size="small" />
      </div>
      <div className="tasks-tabs">
        <Segmented value={tab} onChange={(value) => setTab(value as "tasks" | "runs")} options={[{ label: "我的定时任务", value: "tasks" }, { label: "执行记录", value: "runs" }]} />
        {tab === "tasks" ? (
          <Select
            className="task-sort-select"
            value={sortMode}
            onChange={setSortMode}
            options={[
              { label: "按创建时间倒序", value: "created-desc" },
              { label: "按创建时间正序", value: "created-asc" },
              { label: "按下次执行时间", value: "next-asc" }
            ]}
          />
        ) : (
          <Space>
            <Segmented size="small" defaultValue="day" options={[{ label: "按天", value: "day" }, { label: "按周", value: "week" }, { label: "按月", value: "month" }]} />
            <Select className="task-sort-select" value="all" options={[{ label: "全部任务", value: "all" }]} />
            <Select className="task-sort-select" value="all" options={[{ label: "全部状态", value: "all" }]} />
          </Space>
        )}
      </div>
      {tab === "tasks" ? (
        <div className="task-grid">
          {loading ? <Empty description="正在加载定时任务" /> : sortedTasks.length ? sortedTasks.map((task) => (
            <ScheduledTaskCard
              key={task.id}
              task={task}
              running={runningTaskId === task.id}
              onToggle={toggleTask}
              onRun={runTask}
              onEdit={(item) => {
                setEditingTask(item);
                setModalOpen(true);
              }}
              onDelete={removeTask}
            />
          )) : <Empty className="tasks-empty" image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无定时任务" />}
        </div>
      ) : (
        <ScheduledTaskRuns runs={runs} loading={loading} />
      )}
      <ScheduledTaskModal
        open={modalOpen}
        task={editingTask}
        saving={saving}
        onCancel={() => {
          setModalOpen(false);
          setEditingTask(undefined);
        }}
        onSubmit={saveTask}
      />
    </section>
  );
}

function ScheduledTaskCard({ task, running, onToggle, onRun, onEdit, onDelete }: { task: ScheduledTaskSummary; running: boolean; onToggle: (task: ScheduledTaskSummary, enabled: boolean) => void; onRun: (task: ScheduledTaskSummary) => void; onEdit: (task: ScheduledTaskSummary) => void; onDelete: (task: ScheduledTaskSummary) => void }) {
  const items: MenuProps["items"] = [
    { key: "run", label: "立即执行", icon: <PlayCircleOutlined />, onClick: () => onRun(task) },
    { key: "edit", label: "编辑", icon: <SettingOutlined />, onClick: () => onEdit(task) },
    { type: "divider" },
    { key: "delete", label: "删除", danger: true, onClick: () => onDelete(task) }
  ];

  return (
    <article className="task-card">
      <div className="task-card-top">
        <Switch checked={task.enabled} onChange={(checked) => onToggle(task, checked)} />
        <Dropdown menu={{ items }} trigger={["click"]}>
          <Button type="text" icon={<MoreOutlined />} aria-label="任务操作" />
        </Dropdown>
      </div>
      <Typography.Title level={4}>{task.title}</Typography.Title>
      <Typography.Paragraph className="task-prompt" ellipsis={{ rows: 2 }}>
        {task.prompt}
      </Typography.Paragraph>
      <div className="task-card-divider" />
      <Flex justify="space-between" align="center" gap={10}>
        <span className="task-time-pill">
          <ClockCircleOutlined />
          {formatTaskSchedule(task)}
        </span>
        <Button size="small" icon={<PlayCircleOutlined />} loading={running || task.status === "running"} onClick={() => onRun(task)}>
          执行
        </Button>
      </Flex>
    </article>
  );
}

function ScheduledTaskRuns({ runs, loading }: { runs: ScheduledTaskRunSummary[]; loading: boolean }) {
  if (loading) return <Empty className="task-run-empty" description="正在加载执行记录" />;
  if (!runs.length) {
    return (
      <div className="task-run-empty">
        <ClockCircleOutlined />
        <Typography.Title level={4}>暂无执行记录</Typography.Title>
        <Typography.Text type="secondary">当定时任务开始执行后，记录将显示在这里</Typography.Text>
      </div>
    );
  }

  return (
    <List
      className="task-run-list"
      dataSource={runs}
      renderItem={(run) => (
        <List.Item>
          <List.Item.Meta
            avatar={<Tag color={run.status === "success" ? "success" : run.status === "failed" ? "error" : "processing"}>{run.status === "success" ? "成功" : run.status === "failed" ? "失败" : "运行中"}</Tag>}
            title={<span>{run.taskTitle}</span>}
            description={`${run.trigger === "manual" ? "手动触发" : "定时触发"} · ${formatDateTime(run.startedAt)}`}
          />
          {run.output ? <Typography.Text className="task-run-output" type="secondary" ellipsis>{run.output}</Typography.Text> : run.error ? <Typography.Text type="danger" ellipsis>{run.error}</Typography.Text> : null}
        </List.Item>
      )}
    />
  );
}

interface ScheduledTaskFormValues {
  title: string;
  scheduleType: ScheduledTaskScheduleType;
  timeOfDay: string;
  weekdays?: number[];
  prompt: string;
  enabled?: boolean;
}

function ScheduledTaskModal({ open, task, saving, onCancel, onSubmit }: { open: boolean; task?: ScheduledTaskSummary; saving: boolean; onCancel: () => void; onSubmit: (values: ScheduledTaskFormValues) => void }) {
  const [form] = Form.useForm<ScheduledTaskFormValues>();
  const scheduleType = Form.useWatch("scheduleType", form) ?? task?.scheduleType ?? "weekly";

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      title: task?.title ?? "",
      scheduleType: task?.scheduleType ?? "weekly",
      timeOfDay: task?.timeOfDay ?? "10:00",
      weekdays: task?.weekdays ?? [1],
      prompt: task?.prompt ?? "",
      enabled: task?.enabled ?? true
    });
  }, [open, task, form]);

  return (
    <Modal
      className="task-modal"
      title={task ? "编辑任务" : "新建任务"}
      open={open}
      width={640}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="submit" type="primary" loading={saving} onClick={() => form.submit()}>保存</Button>
      ]}
    >
      <Typography.Paragraph type="secondary">按计划自动执行任务，也可随时手动触发。在任意对话中描述你想定期做的事，即可快速创建</Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={onSubmit}>
        <Form.Item name="title" label="任务名称" rules={[{ required: true, message: "请输入任务名称" }]}>
          <Input placeholder="每周竞品动态追踪" />
        </Form.Item>
        <Form.Item label="计划时间" className="task-time-form-row">
          <Space.Compact block>
            <Form.Item name="scheduleType" noStyle>
              <Select
                options={[
                  { label: "每天", value: "daily" },
                  { label: "工作日", value: "weekdays" },
                  { label: "每周", value: "weekly" }
                ]}
              />
            </Form.Item>
            <Form.Item name="timeOfDay" noStyle rules={[{ required: true, pattern: /^\d{2}:\d{2}$/, message: "请输入 HH:mm 时间" }]}>
              <Input type="time" />
            </Form.Item>
          </Space.Compact>
        </Form.Item>
        {scheduleType === "weekly" ? (
          <Form.Item name="weekdays" rules={[{ required: true, message: "请选择执行日期" }]}>
            <Segmented
              className="weekday-picker"
              multiple
              options={[
                { label: "一", value: 1 },
                { label: "二", value: 2 },
                { label: "三", value: 3 },
                { label: "四", value: 4 },
                { label: "五", value: 5 },
                { label: "六", value: 6 },
                { label: "日", value: 0 }
              ]}
            />
          </Form.Item>
        ) : null}
        <Form.Item name="prompt" label="让 QoderWork 帮你做什么..." rules={[{ required: true, message: "请输入任务内容" }]}>
          <Input.TextArea rows={8} placeholder={"请帮我追踪以下竞品的最新动态：\n- Cursor\n- Windsurf\n- GitHub Copilot"} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function formValuesToTaskInput(values: ScheduledTaskFormValues): CreateScheduledTaskInput {
  return {
    title: values.title,
    prompt: values.prompt,
    scheduleType: values.scheduleType,
    timeOfDay: values.timeOfDay,
    weekdays: values.scheduleType === "weekly" ? values.weekdays : undefined,
    timezone: "Asia/Shanghai",
    enabled: values.enabled ?? true
  };
}

function formatTaskSchedule(task: ScheduledTaskSummary) {
  if (task.scheduleType === "daily") return `每天 ${task.timeOfDay}`;
  if (task.scheduleType === "weekdays") return `工作日 ${task.timeOfDay}`;
  const days = (task.weekdays?.length ? task.weekdays : [1]).map((day) => WEEKDAY_LABELS[day]).join("");
  return `每周${days} ${task.timeOfDay}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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
