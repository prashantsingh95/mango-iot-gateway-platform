'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { gatewaysApi } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, FolderTree } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<any>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data: groupsData, isLoading } = useQuery({
    queryKey: ['gateway-groups'],
    queryFn: () => gatewaysApi.getGroups().then(r => r.data?.data || r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => gatewaysApi.createGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway-groups'] });
      toast.success('Group created');
      setOpen(false);
      resetForm();
    },
    onError: () => toast.error('Failed to create group'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => gatewaysApi.updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway-groups'] });
      toast.success('Group updated');
      setOpen(false);
      setEditGroup(null);
      resetForm();
    },
    onError: () => toast.error('Failed to update group'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => gatewaysApi.deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gateway-groups'] });
      toast.success('Group deleted');
    },
    onError: () => toast.error('Failed to delete group'),
  });

  const resetForm = () => { setName(''); setDescription(''); };

  const groups: any[] = groupsData || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Device Groups</h2>
          <p className="text-sm text-muted-foreground">Organize gateways into groups for easier management</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditGroup(null); resetForm(); } }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editGroup ? 'Edit Group' : 'Create Group'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Floor 1 Sensors" />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
              </div>
              <Button
                className="w-full"
                disabled={!name || createMutation.isPending || updateMutation.isPending}
                onClick={() => {
                  if (editGroup) {
                    updateMutation.mutate({ id: editGroup.id, data: { name, description } });
                  } else {
                    createMutation.mutate({ name, description });
                  }
                }}
              >
                {editGroup ? 'Update' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderTree className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No groups yet</p>
            <p className="text-sm text-muted-foreground">Create your first device group to organize gateways.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group: any) => (
            <Card key={group.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{group.name}</CardTitle>
                    {group.description && (
                      <p className="text-sm text-muted-foreground mt-1">{group.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                      setEditGroup(group);
                      setName(group.name);
                      setDescription(group.description || '');
                      setOpen(true);
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => {
                      if (confirm(`Delete group "${group.name}"? Gateways will be ungrouped.`)) {
                        deleteMutation.mutate(group.id);
                      }
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="secondary">{group._count?.gateways || 0} devices</Badge>
                  {group.parentId && <Badge variant="outline">Sub-group</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
