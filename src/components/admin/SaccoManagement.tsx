import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit2, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface Sacco {
  id: string;
  name: string;
  registration_number: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  status: string;
  created_at: string;
}

const SaccoManagement = () => {
  const { user } = useAuth();
  const [saccos, setSaccos] = useState<Sacco[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Sacco | null>(null);
  const [form, setForm] = useState({
    name: '', registration_number: '', contact_email: '', contact_phone: '', address: '', status: 'active'
  });

  const fetchSaccos = async () => {
    const { data, error } = await supabase.from('saccos').select('*').order('created_at', { ascending: false });
    if (error) { toast.error(error.message); return; }
    setSaccos(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchSaccos(); }, []);

  const resetForm = () => {
    setForm({ name: '', registration_number: '', contact_email: '', contact_phone: '', address: '', status: 'active' });
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        const { error } = await supabase.from('saccos').update(form).eq('id', editing.id);
        if (error) throw error;
        toast.success('SACCO updated');
      } else {
        const { error } = await supabase.from('saccos').insert({ ...form, created_by: user?.id });
        if (error) throw error;
        toast.success('SACCO created');
      }
      setDialogOpen(false);
      resetForm();
      fetchSaccos();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this SACCO?')) return;
    const { error } = await supabase.from('saccos').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('SACCO deleted');
    fetchSaccos();
  };

  const openEdit = (sacco: Sacco) => {
    setEditing(sacco);
    setForm({
      name: sacco.name,
      registration_number: sacco.registration_number,
      contact_email: sacco.contact_email || '',
      contact_phone: sacco.contact_phone || '',
      address: sacco.address || '',
      status: sacco.status,
    });
    setDialogOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">SACCO Management</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add SACCO</Button>
          </DialogTrigger>
          <DialogContent className="glass-surface border-border">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit SACCO' : 'Add New SACCO'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input placeholder="SACCO Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required className="bg-background/50" />
              <Input placeholder="Registration Number" value={form.registration_number} onChange={e => setForm({...form, registration_number: e.target.value})} required className="bg-background/50" />
              <Input type="email" placeholder="Contact Email" value={form.contact_email} onChange={e => setForm({...form, contact_email: e.target.value})} className="bg-background/50" />
              <Input placeholder="Contact Phone" value={form.contact_phone} onChange={e => setForm({...form, contact_phone: e.target.value})} className="bg-background/50" />
              <Input placeholder="Address" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="bg-background/50" />
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" className="w-full">{editing ? 'Update' : 'Create'} SACCO</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : saccos.length === 0 ? (
        <div className="text-center py-16 glass-surface rounded-2xl">
          <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No SACCOs yet. Add your first one.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {saccos.map(sacco => (
            <div key={sacco.id} className="glass-surface rounded-2xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{sacco.name}</h3>
                  <p className="text-sm text-muted-foreground">{sacco.registration_number}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  sacco.status === 'active' ? 'bg-green-500/20 text-green-400' :
                  sacco.status === 'suspended' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>{sacco.status}</span>
              </div>
              {sacco.contact_email && <p className="text-sm text-muted-foreground">{sacco.contact_email}</p>}
              {sacco.contact_phone && <p className="text-sm text-muted-foreground">{sacco.contact_phone}</p>}
              <div className="flex space-x-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => openEdit(sacco)}>
                  <Edit2 className="w-3 h-3 mr-1" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(sacco.id)} className="text-destructive">
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SaccoManagement;
