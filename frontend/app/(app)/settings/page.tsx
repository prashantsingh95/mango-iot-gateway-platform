'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { authApi, settingsApi } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [mqttConfig, setMqttConfig] = useState({
    brokerUrl: '', port: '1883', username: '', password: '',
    secure: false, useWebSocket: false, clientIdPrefix: 'gateway_',
    keepAlive: '60', cleanSession: true, qos: '1',
    caCert: '', clientCert: '', clientKey: '',
  });
  const [dbConfig, setDbConfig] = useState({
    type: 'postgresql', host: '', port: '5432', name: '', username: '', password: '',
    ssl: false, caCert: '', poolMin: '2', poolMax: '10',
    timeout: '30000', schema: 'public',
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get().then((r) => r.data?.data || r.data),
  });

  useEffect(() => {
    if (settings) {
      setMqttConfig((prev) => ({
        ...prev,
        brokerUrl: settings.mqttBrokerUrl || prev.brokerUrl,
        port: settings.mqttPort || prev.port,
        username: settings.mqttUsername || prev.username,
        secure: settings.mqttSecure ?? prev.secure,
        useWebSocket: settings.mqttUseWebSocket ?? prev.useWebSocket,
        clientIdPrefix: settings.mqttClientIdPrefix || prev.clientIdPrefix,
        keepAlive: settings.mqttKeepAlive || prev.keepAlive,
        cleanSession: settings.mqttCleanSession ?? prev.cleanSession,
        qos: settings.mqttQos || prev.qos,
        caCert: settings.mqttCaCert || '',
        clientCert: settings.mqttClientCert || '',
        clientKey: settings.mqttClientKey || '',
      }));
      setDbConfig((prev) => ({
        ...prev,
        type: settings.dbType || prev.type,
        host: settings.dbHost || prev.host,
        port: settings.dbPort || prev.port,
        name: settings.dbName || prev.name,
        username: settings.dbUsername || prev.username,
        ssl: settings.dbSsl ?? prev.ssl,
        caCert: settings.dbCaCert || '',
        poolMin: settings.dbPoolMin || prev.poolMin,
        poolMax: settings.dbPoolMax || prev.poolMax,
        timeout: settings.dbTimeout || prev.timeout,
        schema: settings.dbSchema || prev.schema,
      }));
    }
  }, [settings]);

  const saveConfigMutation = useMutation({
    mutationFn: (data: Record<string, any>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Configuration saved');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to save configuration'),
  });

  const handleSaveConfig = () => {
    const data: Record<string, any> = {};
    const mapKeys = (obj: Record<string, any>, prefix: string) => {
      Object.entries(obj).forEach(([k, v]) => {
        const key = prefix + k.charAt(0).toUpperCase() + k.slice(1);
        if (k === 'password' || k === 'clientKey' || k === 'caCert' || k === 'clientCert') {
          if (v) data[key] = v;
        } else if (typeof v === 'boolean') {
          data[key] = v;
        } else if (v !== '' && v !== undefined) {
          data[key] = v;
        }
      });
    };
    mapKeys(mqttConfig, 'mqtt');
    mapKeys(dbConfig, 'db');
    saveConfigMutation.mutate(data);
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await authApi.changePassword({ oldPassword: currentPassword, newPassword });
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your account and organization settings</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={user?.name || ''} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={user?.email || ''} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={user?.role || ''} readOnly />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your account password</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Current Password</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>New Password</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button onClick={handleChangePassword} disabled={saving}>
                {saving ? 'Updating...' : 'Update Password'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Multi-Factor Authentication</CardTitle>
              <CardDescription>Add an extra layer of security</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">MFA via Authenticator App</p>
                  <p className="text-sm text-muted-foreground">
                    Use an authenticator app to generate one-time codes
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Configure how you receive alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {['Email', 'SMS', 'Slack', 'Microsoft Teams'].map((channel) => (
                <div key={channel} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{channel}</p>
                    <p className="text-sm text-muted-foreground">Receive alerts via {channel}</p>
                  </div>
                  <Switch />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
              <CardDescription>Your organization settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input value={user?.tenant?.name || ''} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Tenant ID</Label>
                <Input value={user?.tenantId || ''} readOnly className="font-mono text-xs" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuration" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>MQTT Broker</CardTitle>
              <CardDescription>Configure the MQTT broker connection for gateway communication</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="mqtt-secure"
                    checked={mqttConfig.secure}
                    onCheckedChange={(v) => setMqttConfig({ ...mqttConfig, secure: v })}
                  />
                  <Label htmlFor="mqtt-secure">SSL/TLS</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="mqtt-ws"
                    checked={mqttConfig.useWebSocket}
                    onCheckedChange={(v) => setMqttConfig({ ...mqttConfig, useWebSocket: v })}
                  />
                  <Label htmlFor="mqtt-ws">WebSocket</Label>
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2 md:col-span-2">
                  <Label>Broker URL</Label>
                  <Input
                    value={mqttConfig.brokerUrl}
                    onChange={(e) => setMqttConfig({ ...mqttConfig, brokerUrl: e.target.value })}
                    placeholder={mqttConfig.secure ? 'mqtts://broker.example.com' : 'mqtt://broker.example.com'}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    value={mqttConfig.port}
                    onChange={(e) => setMqttConfig({ ...mqttConfig, port: e.target.value })}
                    placeholder={mqttConfig.secure ? '8883' : '1883'}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={mqttConfig.username}
                    onChange={(e) => setMqttConfig({ ...mqttConfig, username: e.target.value })}
                    placeholder="mqtt-user"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={mqttConfig.password}
                    onChange={(e) => setMqttConfig({ ...mqttConfig, password: e.target.value })}
                    placeholder="Leave blank to keep current"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Client ID Prefix</Label>
                  <Input
                    value={mqttConfig.clientIdPrefix}
                    onChange={(e) => setMqttConfig({ ...mqttConfig, clientIdPrefix: e.target.value })}
                    placeholder="gateway_"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Keep Alive (s)</Label>
                  <Input
                    value={mqttConfig.keepAlive}
                    onChange={(e) => setMqttConfig({ ...mqttConfig, keepAlive: e.target.value })}
                    placeholder="60"
                  />
                </div>
                <div className="space-y-2">
                  <Label>QoS</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={mqttConfig.qos}
                    onChange={(e) => setMqttConfig({ ...mqttConfig, qos: e.target.value })}
                  >
                    <option value="0">0 — At most once</option>
                    <option value="1">1 — At least once</option>
                    <option value="2">2 — Exactly once</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <Switch
                    id="mqtt-clean"
                    checked={mqttConfig.cleanSession}
                    onCheckedChange={(v) => setMqttConfig({ ...mqttConfig, cleanSession: v })}
                  />
                  <Label htmlFor="mqtt-clean">Clean Session</Label>
                </div>
              </div>
              {mqttConfig.secure && (
                <div className="space-y-4 border-t pt-4">
                  <p className="text-sm font-medium text-muted-foreground">TLS Certificates</p>
                  <div className="space-y-2">
                    <Label>CA Certificate (PEM)</Label>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={mqttConfig.caCert}
                      onChange={(e) => setMqttConfig({ ...mqttConfig, caCert: e.target.value })}
                      placeholder="-----BEGIN CERTIFICATE-----&#10;..."
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Client Certificate (PEM)</Label>
                      <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={mqttConfig.clientCert}
                        onChange={(e) => setMqttConfig({ ...mqttConfig, clientCert: e.target.value })}
                        placeholder="-----BEGIN CERTIFICATE-----&#10;..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Client Key (PEM)</Label>
                      <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={mqttConfig.clientKey}
                        onChange={(e) => setMqttConfig({ ...mqttConfig, clientKey: e.target.value })}
                        placeholder="-----BEGIN PRIVATE KEY-----&#10;..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>External Remote Database</CardTitle>
              <CardDescription>Connect to an external database for data persistence</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="db-ssl"
                  checked={dbConfig.ssl}
                  onCheckedChange={(v) => setDbConfig({ ...dbConfig, ssl: v })}
                />
                <Label htmlFor="db-ssl">SSL/TLS</Label>
              </div>
              <div className="grid gap-4 md:grid-cols-6">
                <div className="space-y-2 md:col-span-2">
                  <Label>Database Type</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={dbConfig.type}
                    onChange={(e) => {
                      const ports: Record<string, string> = { postgresql: '5432', mysql: '3306', mariadb: '3306', sqlserver: '1433' };
                      setDbConfig({ ...dbConfig, type: e.target.value, port: ports[e.target.value] || '5432' });
                    }}
                  >
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="mariadb">MariaDB</option>
                    <option value="sqlserver">SQL Server</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Host</Label>
                  <Input
                    value={dbConfig.host}
                    onChange={(e) => setDbConfig({ ...dbConfig, host: e.target.value })}
                    placeholder="db.example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Port</Label>
                  <Input
                    value={dbConfig.port}
                    onChange={(e) => setDbConfig({ ...dbConfig, port: e.target.value })}
                    placeholder="5432"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Schema</Label>
                  <Input
                    value={dbConfig.schema}
                    onChange={(e) => setDbConfig({ ...dbConfig, schema: e.target.value })}
                    placeholder="public"
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Database Name</Label>
                  <Input
                    value={dbConfig.name}
                    onChange={(e) => setDbConfig({ ...dbConfig, name: e.target.value })}
                    placeholder="iot-platform"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input
                    value={dbConfig.username}
                    onChange={(e) => setDbConfig({ ...dbConfig, username: e.target.value })}
                    placeholder="db-user"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={dbConfig.password}
                  onChange={(e) => setDbConfig({ ...dbConfig, password: e.target.value })}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label>Min Pool</Label>
                  <Input
                    value={dbConfig.poolMin}
                    onChange={(e) => setDbConfig({ ...dbConfig, poolMin: e.target.value })}
                    placeholder="2"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max Pool</Label>
                  <Input
                    value={dbConfig.poolMax}
                    onChange={(e) => setDbConfig({ ...dbConfig, poolMax: e.target.value })}
                    placeholder="10"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Connection Timeout (ms)</Label>
                  <Input
                    value={dbConfig.timeout}
                    onChange={(e) => setDbConfig({ ...dbConfig, timeout: e.target.value })}
                    placeholder="30000"
                  />
                </div>
              </div>
              {dbConfig.ssl && (
                <div className="space-y-2 border-t pt-4">
                  <Label>CA Certificate (PEM)</Label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={dbConfig.caCert}
                    onChange={(e) => setDbConfig({ ...dbConfig, caCert: e.target.value })}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;..."
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Button onClick={handleSaveConfig} disabled={saveConfigMutation.isPending}>
            {saveConfigMutation.isPending ? 'Saving...' : 'Save Configuration'}
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
