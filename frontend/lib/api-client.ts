import api from './api';

export const authApi = {
  login: (data: { email: string; password: string; tenantId?: string }) =>
    api.post('/auth/login', data),
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/auth/register', data),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  getProfile: () => api.get('/auth/profile'),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', data),
  getUsers: () => api.get('/auth/users'),
};

export const gatewaysApi = {
  list: (params?: Record<string, any>) => api.get('/gateways', { params }),
  get: (id: string) => api.get(`/gateways/${id}`),
  create: (data: any) => api.post('/gateways', data),
  update: (id: string, data: any) => api.patch(`/gateways/${id}`, data),
  delete: (id: string) => api.delete(`/gateways/${id}`),
  bulkImport: (data: any[]) => api.post('/gateways/bulk', data),
  getLogs: (id: string, params?: Record<string, any>) =>
    api.get(`/gateways/${id}/logs`, { params }),
  executeCommand: (id: string, command: any) =>
    api.post(`/gateways/${id}/commands`, command),
  getMetrics: (id: string) => api.get(`/gateways/${id}/metrics`),
  getCommands: (id: string, params?: Record<string, any>) =>
    api.get(`/gateways/${id}/commands`, { params }),
  getFirmwareHistory: (id: string, params?: Record<string, any>) =>
    api.get(`/gateways/${id}/firmware`, { params }),
  getUptime: (id: string, params?: Record<string, any>) =>
    api.get(`/gateways/${id}/uptime`, { params }),
  getGroups: () => api.get('/gateways/groups'),
  createGroup: (data: any) => api.post('/gateways/groups', data),
  updateGroup: (id: string, data: any) => api.patch(`/gateways/groups/${id}`, data),
  deleteGroup: (id: string) => api.delete(`/gateways/groups/${id}`),
  assignGatewayGroup: (id: string, groupId: string | null) =>
    api.patch(`/gateways/${id}/group`, { groupId }),
  assignGatewayOwner: (id: string, ownerId: string | null) =>
    api.patch(`/gateways/${id}/owner`, { ownerId }),
  getGatewayAccess: (id: string) => api.get(`/gateways/${id}/access`),
  setGatewayAccess: (id: string, userId: string, level: string) =>
    api.post(`/gateways/${id}/access`, { userId, level }),
};

export const firmwareApi = {
  list: (params?: Record<string, any>) => api.get('/firmware', { params }),
  get: (id: string) => api.get(`/firmware/${id}`),
  create: (data: any) => api.post('/firmware', data),
  uploadFile: (id: string, formData: FormData) =>
    api.post(`/firmware/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  update: (id: string, data: any) => api.patch(`/firmware/${id}`, data),
  delete: (id: string) => api.delete(`/firmware/${id}`),
  deploy: (id: string, gatewayIds: string[]) =>
    api.post(`/firmware/${id}/deploy`, { gatewayIds }),
};

export const monitoringApi = {
  getDashboard: (params?: Record<string, any>) =>
    api.get('/monitoring/dashboard', { params }),
  getGatewayMetrics: (id: string) => api.get(`/monitoring/gateways/${id}`),
  getAlerts: (params?: Record<string, any>) => api.get('/alerts', { params }),
  acknowledgeAlert: (id: string) => api.patch(`/alerts/${id}/acknowledge`),
  resolveAlert: (id: string) => api.patch(`/alerts/${id}/resolve`),
};

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: Record<string, any>) => api.put('/settings', data),
};

export const provisioningApi = {
  createToken: (data: any) => api.post('/provisioning/tokens', data),
  listTokens: () => api.get('/provisioning/tokens'),
  revokeToken: (id: string) => api.delete(`/provisioning/tokens/${id}`),
};
