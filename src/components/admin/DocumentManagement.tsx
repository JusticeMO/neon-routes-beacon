import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const DocumentManagement = () => {
  const [docs, setDocs] = useState<any[]>([]);
  const [saccos, setSaccos] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    document_name: '', document_type: 'license', sacco_id: '', vehicle_id: '', expiry_date: '', status: 'valid'
  });

  const fetchAll = async () => {
    const [d, s, v] = await Promise.all([
      supabase.from('compliance_documents').select('*, saccos(name), vehicles(plate_number)').order('created_at', { ascending: false }),
      supabase.from('saccos').select('id, name'),
      supabase.from('vehicles').select('id, plate_number'),
    ]);
    setDocs(d.data || []);
    setSaccos(s.data || []);
    setVehicles(v.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('compliance_documents').insert({
        document_name: form.document_name,
        document_type: form.document_type,
        sacco_id: form.sacco_id || null,
        vehicle_id: form.vehicle_id || null,
        expiry_date: form.expiry_date || null,
        status: form.status,
      });
      if (error) throw error;
      toast.success('Document added');
      setDialogOpen(false);
      setForm({ document_name: '', document_type: 'license', sacco_id: '', vehicle_id: '', expiry_date: '', status: 'valid' });
      fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    const { error } = await supabase.from('compliance_documents').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Document deleted');
    fetchAll();
  };

  const statusColor = (s: string) => s === 'valid' ? 'bg-green-500/20 text-green-400' : s === 'expired' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Compliance Documents</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Document</Button>
          </DialogTrigger>
          <DialogContent className="glass-surface border-border">
            <DialogHeader>
              <DialogTitle>Add Compliance Document</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input placeholder="Document Name" value={form.document_name} onChange={e => setForm({...form, document_name: e.target.value})} required className="bg-background/50" />
              <Select value={form.document_type} onValueChange={v => setForm({...form, document_type: v})}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="license">License</SelectItem>
                  <SelectItem value="permit">Permit</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={form.sacco_id} onValueChange={v => setForm({...form, sacco_id: v})}>
                <SelectTrigger className="bg-background/50"><SelectValue placeholder="SACCO (optional)" /></SelectTrigger>
                <SelectContent>
                  {saccos.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={form.vehicle_id} onValueChange={v => setForm({...form, vehicle_id: v})}>
                <SelectTrigger className="bg-background/50"><SelectValue placeholder="Vehicle (optional)" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.plate_number}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} className="bg-background/50" />
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="valid">Valid</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" className="w-full">Add Document</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 glass-surface rounded-2xl">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No documents yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {docs.map(d => (
            <div key={d.id} className="glass-surface rounded-2xl p-6 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{d.document_name}</h3>
                <p className="text-sm text-muted-foreground capitalize">{d.document_type}</p>
                {d.saccos && <p className="text-xs text-muted-foreground">SACCO: {d.saccos.name}</p>}
                {d.vehicles && <p className="text-xs text-muted-foreground">Vehicle: {d.vehicles.plate_number}</p>}
                {d.expiry_date && <p className="text-xs text-muted-foreground">Expires: {d.expiry_date}</p>}
              </div>
              <div className="flex items-center space-x-3">
                <span className={`text-xs px-2 py-1 rounded-full ${statusColor(d.status)}`}>{d.status}</span>
                <Button variant="outline" size="sm" onClick={() => handleDelete(d.id)} className="text-destructive">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DocumentManagement;
