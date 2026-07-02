'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { firmwareApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Upload, RefreshCw } from 'lucide-react';
import { formatDate, formatBytes } from '@/lib/utils';
import { toast } from 'sonner';

const statusVariantMap: Record<string, 'success' | 'destructive' | 'warning' | 'info' | 'secondary' | 'outline'> = {
  DRAFT: 'secondary',
  VALIDATED: 'info',
  PUBLISHED: 'success',
  DEPLOYED: 'warning',
  ROLLED_BACK: 'destructive',
  ARCHIVED: 'outline',
};

export default function FirmwarePage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: '', version: '', targetModel: '', changelog: '', isCritical: false });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['firmware'],
    queryFn: () => firmwareApi.list().then((r) => r.data?.data || r.data),
  });

  const uploadMutation = useMutation({
    mutationFn: () => firmwareApi.create({
      name: form.name,
      version: form.version,
      filename: `${form.name}-${form.version}.bin`,
      fileSize: 0,
      checksum: 'pending',
      status: 'DRAFT',
      isCritical: form.isCritical,
      targetModel: form.targetModel || undefined,
      changelog: form.changelog || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firmware'] });
      toast.success('Firmware release created');
      setOpen(false);
      setForm({ name: '', version: '', targetModel: '', changelog: '', isCritical: false });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to create firmware release'),
  });

  const handleFileUpload = async (id: string, file: File | null) => {
    if (!file) { toast.error('Please select a file'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await firmwareApi.uploadFile(id, fd);
      toast.success('File uploaded');
      setUploadOpen(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const firmwareList = Array.isArray(data) ? data : data?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Firmware Management</h2>
          <p className="text-muted-foreground">Manage OTA firmware updates for gateways</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} aria-label="Refresh firmware list">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload Firmware
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Firmware Release</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Stable Release v2.1" />
                </div>
                <div className="space-y-2">
                  <Label>Version</Label>
                  <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="e.g. 2.1.0" />
                </div>
                <div className="space-y-2">
                  <Label>Target Model (optional)</Label>
                  <Input value={form.targetModel} onChange={(e) => setForm({ ...form, targetModel: e.target.value })} placeholder="e.g. SLG-200" />
                </div>
                <div className="space-y-2">
                  <Label>Changelog (optional)</Label>
                  <Input value={form.changelog} onChange={(e) => setForm({ ...form, changelog: e.target.value })} placeholder="Bug fixes and improvements" />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <Label>Critical Update</Label>
                    <p className="text-xs text-muted-foreground">Force immediate installation on gateways</p>
                  </div>
                  <Switch
                    checked={form.isCritical}
                    onCheckedChange={(v) => setForm({ ...form, isCritical: v })}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => uploadMutation.mutate()}
                  disabled={!form.name || !form.version || uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? 'Creating...' : 'Create Release'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Firmware Releases</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Target Model</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Critical</TableHead>
                  <TableHead className="w-[120px]">File</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {firmwareList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No firmware releases found
                    </TableCell>
                  </TableRow>
                )}
                {firmwareList.map((fw: any) => (
                  <TableRow key={fw.id}>
                    <TableCell className="font-medium">{fw.name}</TableCell>
                    <TableCell className="font-mono text-xs">{fw.version}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariantMap[fw.status] || 'secondary'}>
                        {fw.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{formatBytes(fw.fileSize)}</TableCell>
                    <TableCell className="text-xs">{fw.targetModel || 'All'}</TableCell>
                    <TableCell className="text-xs">{fw.publishedAt ? formatDate(fw.publishedAt) : '-'}</TableCell>
                    <TableCell>
                      {fw.isCritical ? (
                        <Badge variant="destructive">Critical</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {fw.checksum && fw.checksum !== 'pending' ? (
                        <Badge variant="outline" className="text-xs">Uploaded</Badge>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setUploadOpen(fw.id)}>
                          Upload
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!uploadOpen} onOpenChange={(v) => { if (!v) setUploadOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Firmware File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              type="file"
              accept=".bin,.hex,.img,.tar.gz"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file && uploadOpen) handleFileUpload(uploadOpen, file);
              }}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
            {uploading && (
              <div className="space-y-2">
                <Progress value={45} className="w-full" />
                <p className="text-sm text-muted-foreground">Uploading...</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
