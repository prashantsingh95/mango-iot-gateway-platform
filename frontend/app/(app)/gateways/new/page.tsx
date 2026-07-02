'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { gatewaysApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function NewGatewayPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    deviceId: '', name: '', serialNumber: '', model: '', manufacturer: '',
    firmwareVersion: '', macAddress: '', ipAddress: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.deviceId || !form.name || !form.serialNumber) {
      toast.error('Device ID, Name, and Serial Number are required');
      return;
    }
    setSaving(true);
    try {
      await gatewaysApi.create(form);
      toast.success('Gateway created');
      router.push('/gateways');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create gateway');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/gateways">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Add Gateway</h2>
          <p className="text-muted-foreground">Register a new IoT gateway device</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Gateway Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Device ID *</Label>
                <Input value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })} placeholder="GW-001" />
              </div>
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Smart Street Light" />
              </div>
              <div className="space-y-2">
                <Label>Serial Number *</Label>
                <Input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} placeholder="SN-10001" />
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="SLG-200" />
              </div>
              <div className="space-y-2">
                <Label>Manufacturer</Label>
                <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} placeholder="IoTech" />
              </div>
              <div className="space-y-2">
                <Label>Firmware Version</Label>
                <Input value={form.firmwareVersion} onChange={(e) => setForm({ ...form, firmwareVersion: e.target.value })} placeholder="1.0.0" />
              </div>
              <div className="space-y-2">
                <Label>MAC Address</Label>
                <Input value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} placeholder="00:1A:2B:3C:4D:5E" />
              </div>
              <div className="space-y-2">
                <Label>IP Address</Label>
                <Input value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} placeholder="192.168.1.100" />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create Gateway'}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/gateways">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
