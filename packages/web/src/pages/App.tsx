import { CloudServerOutlined, DesktopOutlined, KeyOutlined, LaptopOutlined, LoginOutlined, LogoutOutlined, MenuOutlined, MessageOutlined, MoonOutlined, PlusOutlined, ReloadOutlined, SettingOutlined, SunOutlined, UserOutlined } from "@ant-design/icons";
import { Bubble, Sender, XProvider } from "@ant-design/x";
import type { AgentSessionSummary, BrowserConnectionStatus, ChatMessage, ModelCredentialProvider, ModelCredentialStatus } from "@pi-cloud/shared";
import { App as AntApp, Button, ConfigProvider, Dropdown, Empty, Flex, Form, Input, Layout, List, Modal, Segmented, Space, Splitter, Tag, Typography, message, theme } from "antd";
import type { MenuProps } from "antd";
import { useEffect, useMemo, useState } from "react";
import { ApiClient, type AuthResponse } from "../api/client";
import { detectPlaywrightExtension } from "../components/ExtensionProbe";
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
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: isDark ? "#fafafa" : "#18181b",
          colorBgBase: isDark ? "#09090b" : "#ffffff",
          colorTextBase: isDark ? "#fafafa" : "#18181b",
          borderRadius: 8,
          colorBorder: isDark ? "#27272a" : "#e4e4e7"
        },
        components: {
          Button: { defaultBg: isDark ? "#18181b" : "#ffffff", defaultBorderColor: isDark ? "#3f3f46" : "#d4d4d8", defaultColor: isDark ? "#fafafa" : "#18181b" },
          Layout: { bodyBg: isDark ? "#09090b" : "#fafafa", headerBg: isDark ? "#09090b" : "#ffffff", siderBg: isDark ? "#09090b" : "#ffffff" }
        }
      }}
    >
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
    const session = await api.createSession({ title: `Session ${sessions.length + 1}` });
    setSessions([session, ...sessions]);
    setActive(session);
    setMessages([]);
  };

  const send = async (content: string) => {
    if (!active || !content.trim()) return;
    const userMessage: ChatMessage = { id: randomId(), role: "user", content, createdAt: new Date().toISOString() };
    setMessages((items) => [...items, userMessage]);
    setLoading(true);
    try {
      const response = await api.prompt(active.id, content);
      setMessages((items) => [...items, { id: randomId(), role: "assistant", content: response.assistantText, createdAt: new Date().toISOString() }]);
      await refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Agent request failed");
    } finally {
      setLoading(false);
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
                <Button className={view === "settings" ? "sidebar-command active" : "sidebar-command"} icon={<SettingOutlined />} type="text" onClick={() => setView("settings")}>
                  设置
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
                          <List.Item.Meta title={session.title} description={`${session.status} · ${new Date(session.updatedAt).toLocaleString()}`} />
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
                        <Bubble key={item.id} placement={item.role === "user" ? "end" : "start"} content={item.content} />
                      ))}
                      {loading ? <Bubble placement="start" loading content="Pi is working..." /> : null}
                    </div>
                    <Sender placeholder="向云端 agent 发送任务" loading={loading} onSubmit={send} />
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
  const [forms] = useState(() => new Map<ModelCredentialProvider, ReturnType<typeof Form.useForm>[0]>());

  const getForm = (provider: ModelCredentialProvider) => {
    const existing = forms.get(provider);
    if (existing) return existing;
    const [form] = Form.useForm();
    forms.set(provider, form);
    return form;
  };

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

  const save = async (provider: ModelCredentialProvider, values: { apiKey: string }) => {
    setSavingProvider(provider);
    try {
      const next = await api.setModelCredential(provider, values.apiKey.trim());
      setCredentials(next);
      getForm(provider).resetFields();
      message.success("API key 已保存");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "保存失败");
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
            const form = getForm(item.provider);
            return (
              <List.Item className="credential-row">
                <div className="credential-copy">
                  <Typography.Text strong>{item.label}</Typography.Text>
                  <Tag color={item.configured ? "success" : "default"}>{item.configured ? "已保存" : "未设置"}</Tag>
                </div>
                <Form form={form} className="credential-form" layout="inline" onFinish={(values) => save(item.provider, values as { apiKey: string })}>
                  <Form.Item name="apiKey" rules={[{ required: true, min: 8, message: "请输入 API key" }]}>
                    <Input.Password placeholder={item.configured ? "输入新 key 以覆盖" : "粘贴 API key"} autoComplete="off" />
                  </Form.Item>
                  <Button htmlType="submit" type="primary" loading={savingProvider === item.provider}>
                    保存
                  </Button>
                  <Button disabled={!item.configured} loading={savingProvider === item.provider} onClick={() => remove(item.provider)}>
                    移除
                  </Button>
                </Form>
              </List.Item>
            );
          }}
        />
      </div>
    </section>
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
