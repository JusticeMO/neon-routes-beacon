import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit2, Trash2, Bus } from 'lucide-react';
import { toast } from 'sonner';

const VehicleManagement = () => {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [saccos, setSaccos] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    plate_number: '', sacco_id: '', route_id: '', vehicle_type: 'matatu', capacity: '14', status: 'active'
  });

  const fetchAll = async () => {
    const [v, s, r] = await Promise.all([
      supabase.from('vehicles').select('*, saccos(name), routes(route_name)').order('created_at', { ascending: false }),
      supabase.from('saccos').select('id, name').eq('status', 'active'),
      supabase.from('routes').select('id, route_name, route_number').eq('status', 'active'),
    ]);
    setVehicles(v.data || []);
    setSaccos(s.data || []);
    setRoutes(r.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const resetForm = () => {
    setForm({ plate_number: '', sacco_id: '', route_id: '', vehicle_type: 'matatu', capacity: '14', status: 'active' });
    setEditing(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      plate_number: form.plate_number,
      sacco_id: form.sacco_id,
      route_id: form.route_id || null,
      vehicle_type: form.vehicle_type,
      capacity: parseInt(form.capacity),
      status: form.status,
    };
    try {
      if (editing) {
        const { error } = await supabase.from('vehicles').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Vehicle updated');
      } else {
        const { error } = await supabase.from('vehicles').insert(payload);
        if (error) throw error;
        toast.success('Vehicle added');
      }
      setDialogOpen(false);
      resetForm();
      fetchAll();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vehicle?')) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Vehicle deleted');
    fetchAll();
  };

  const openEdit = (v: any) => {
    setEditing(v);
    setForm({
      plate_number: v.plate_number,
      sacco_id: v.sacco_id,
      route_id: v.route_id || '',
      vehicle_type: v.vehicle_type,
      capacity: String(v.capacity),
      status: v.status,
    });
    setDialogOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Vehicle Management</h2>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Vehicle</Button>
          </DialogTrigger>
          <DialogContent className="glass-surface border-border">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Vehicle' : 'Add New Vehicle'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input placeholder="Plate Number (e.g. KDA 123A)" value={form.plate_number} onChange={e => setForm({...form, plate_number: e.target.value})} required className="bg-background/50" />
              <Select value={form.sacco_id} onValueChange={v => setForm({...form, sacco_id: v})}>
                <SelectTrigger className="bg-background/50"><SelectValue placeholder="Select SACCO" /></SelectTrigger>
                <SelectContent>
                  {saccos.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={form.route_id} onValueChange={v => setForm({...form, route_id: v})}>
                <SelectTrigger className="bg-background/50"><SelectValue placeholder="Assign Route (optional)" /></SelectTrigger>
                <SelectContent>
                  {routes.map(r => <SelectItem key={r.id} value={r.id}>{r.route_number} - {r.route_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={form.vehicle_type} onValueChange={v => setForm({...form, vehicle_type: v})}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bus">Bus</SelectItem>
                  <SelectItem value="matatu">Matatu</SelectItem>
                  <SelectItem value="minibus">Minibus</SelectItem>
                </SelectContent>
              </Select>
              <Input type="number" placeholder="Capacity" value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} className="bg-background/50" />
              <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                <SelectTrigger className="bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" className="w-full">{editing ? 'Update' : 'Add'} Vehicle</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-16 glass-surface rounded-2xl">
          <Bus className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No vehicles yet. Add SACCOs first, then add vehicles.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {vehicles.map(v => (
            <div key={v.id} className="glass-surface rounded-2xl p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg">{v.plate_number}</h3>
                  <p className="text-sm text-muted-foreground">{v.saccos?.name} · {v.vehicle_type}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  v.status === 'active' ? 'bg-green-500/20 text-green-400' :
                  v.status === 'maintenance' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-red-500/20 text-red-400'
                }`}>{v.status}</span>
              </div>
              <p className="text-sm text-muted-foreground">Capacity: {v.capacity} seats</p>
              {v.routes && <p className="text-sm text-muted-foreground">Route: {v.routes.route_name}</p>}
              <div className="flex space-x-2 mt-4">
                <Button variant="outline" size="sm" onClick={() => openEdit(v)}>
                  <Edit2 className="w-3 h-3 mr-1" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(v.id)} className="text-destructive">
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

export default VehicleManagement;
