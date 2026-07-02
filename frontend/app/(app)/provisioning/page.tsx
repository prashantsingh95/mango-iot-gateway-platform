'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { provisioningApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Key, Copy, Trash2, Plus, Check } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface ProvisioningToken {
  id: string;
  token: string;
  description: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export default function ProvisioningPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['provisioning-tokens'],
    queryFn: () => provisioningApi.listTokens().then((r) => r.data?.data || r.data),
  });

  const tokens: ProvisioningToken[] = Array.isArray(data) ? data : data?.data || [];

  const createMutation = useMutation({
    mutationFn: () =>
      provisioningApi.createToken({
        description: description || undefined,
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      }),
    onSuccess: (res: any) => {
      toast.success('Provisioning token created');
      setOpen(false);
      setDescription('');
      setMaxUses('');
      setExpiresInDays('');
      queryClient.invalidateQueries({ queryKey: ['provisioning-tokens'] });
      // Show the token value in a copyable format
      const token = res.data?.token || res?.token;
      if (token) {
        navigator.clipboard?.writeText(token);
        toast.success('Token copied to clipboard');
      }
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Failed to create token'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => provisioningApi.revokeToken(id),
    onSuccess: () => {
      toast.success('Token revoked');
      queryClient.invalidateQueries({ queryKey: ['provisioning-tokens'] });
    },
    onError: () => toast.error('Failed to revoke token'),
  });

  const copyToken = (token: string, id: string) => {
    navigator.clipboard?.writeText(token);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 2000);
    toast.success('Token copied');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Provisioning</h2>
          <p className="text-muted-foreground">
            Create and manage tokens for gateway auto-registration
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Token
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Provisioning Token</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Description (optional)</Label>
                <Input
                  placeholder="e.g. Factory floor gateways"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max uses (optional)</Label>
                <Input
                  type="number"
                  placeholder="Leave empty for unlimited"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Expires in (days, optional)</Label>
                <Input
                  type="number"
                  placeholder="Leave empty for no expiry"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                <Key className="mr-2 h-4 w-4" />
                Generate Token
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provisioning Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No provisioning tokens created yet
                    </TableCell>
                  </TableRow>
                )}
                {tokens.map((t: ProvisioningToken) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.description || '-'}</TableCell>
                    <TableCell>
                      <code className="relative rounded bg-muted px-2 py-1 text-xs font-mono">
                        {t.token.slice(0, 8)}...{t.token.slice(-4)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.isActive ? 'success' : 'secondary'}>
                        {t.isActive ? 'Active' : 'Revoked'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.useCount}{t.maxUses ? ` / ${t.maxUses}` : ''}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.expiresAt ? formatRelativeTime(t.expiresAt) : 'Never'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelativeTime(t.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToken(t.token, t.id)}
                          aria-label="Copy token"
                        >
                          {copiedId === t.id ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        {t.isActive && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('Revoke this token?')) revokeMutation.mutate(t.id);
                            }}
                            aria-label="Revoke token"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How to use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            1. Create a provisioning token above
          </p>
          <p>
            2. Add the token to your gateway configuration:
          </p>
          <pre className="rounded bg-muted p-3 text-xs font-mono">
{`# /opt/gateway/config.yml
gateway:
  provision_token: "${tokens[0]?.token || 'YOUR_TOKEN_HERE'}"`}
          </pre>
          <p>
            3. Run the installer on your Raspberry Pi
          </p>
          <pre className="rounded bg-muted p-3 text-xs font-mono">
sudo bash install.sh
          </pre>
          <p>
            4. The gateway will auto-register using the token
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
