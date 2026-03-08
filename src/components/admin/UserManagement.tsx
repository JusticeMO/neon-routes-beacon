import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Plus, Users, UserCog, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface UserProfile {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  roles: string[];
}

const UserManagement = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [saccos, setSaccos] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [assignForm, setAssignForm] = useState({ role: '', sacco_id: '', vehicle_id: '' });

  const fetchUsers = async () => {
    const { data: profiles } = await supabase.from('profiles').select('user_id, full_name, phone');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');
    const { data: saccosData } = await supabase.from('saccos').select('id, name');
    const { data: vehiclesData } = await supabase.from('vehicles').select('id, plate_number, sacco_id');

    setSaccos(saccosData || []);
    setVehicles(vehiclesData || []);

    const userMap: Record<string, UserProfile> = {};
    (profiles || []).forEach(p => {
      userMap[p.user_id] = { ...p, roles: [] };
    });
    (roles || []).forEach(r => {
      if (userMap[r.user_id]) {
        userMap[r.user_id].roles.push(r.role);
      }
    });

    setUsers(Object.values(userMap));
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAssignRole = async () => {
    if (!selectedUser || !assignForm.role) return;
    try {
      // Add role
      const { error } = await supabase.from('user_roles').insert({
        user_id: selectedUser.user_id,
        role: assignForm.role as any,
      });
      if (error) throw error;

      // If driver, assign to vehicle
      if (assignForm.role === 'driver' && assignForm.vehicle_id && assignForm.sacco_id) {
        const { error: assignError } = await supabase.from('driver_assignments').insert({
          driver_id: selectedUser.user_id,
          vehicle_id: assignForm.vehicle_id,
          sacco_id: assignForm.sacco_id,
        });
        if (assignError) throw assignError;
      }

      // If sacco_manager, assign to sacco
      if (assignForm.role === 'sacco_manager' && assignForm.sacco_id) {
        const { error: mgrError } = await supabase.from('sacco_managers').insert({
          user_id: selectedUser.user_id,
          sacco_id: assignForm.sacco_id,
        });
        if (mgrError) throw mgrError;
      }

      toast.success('Role assigned');
      setAssignDialogOpen(false);
      setAssignForm({ role: '', sacco_id: '', vehicle_id: '' });
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRemoveRole = async (userId: string, role: string) => {
    if (!confirm(`Remove ${role} role?`)) return;
    const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role as any);
    if (error) { toast.error(error.message); return; }
    toast.success('Role removed');
    fetchUsers();
  };

  const roleColors: Record<string, string> = {
    admin: 'bg-red-500/20 text-red-400',
    sacco_manager: 'bg-blue-500/20 text-blue-400',
    driver: 'bg-green-500/20 text-green-400',
    passenger: 'bg-gray-500/20 text-gray-400',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">User Management</h2>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : users.length === 0 ? (
        <div className="text-center py-16 glass-surface rounded-2xl">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No users registered yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {users.map(u => (
            <div key={u.user_id} className="glass-surface rounded-2xl p-6 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{u.full_name || 'Unnamed User'}</h3>
                {u.phone && <p className="text-sm text-muted-foreground">{u.phone}</p>}
                <div className="flex flex-wrap gap-2 mt-2">
                  {u.roles.map(role => (
                    <span key={role} className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${roleColors[role] || ''}`}>
                      {role}
                      {role !== 'passenger' && (
                        <button onClick={() => handleRemoveRole(u.user_id, role)} className="hover:text-destructive">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
              <Dialog open={assignDialogOpen && selectedUser?.user_id === u.user_id} onOpenChange={(open) => {
                setAssignDialogOpen(open);
                if (open) setSelectedUser(u);
                else { setSelectedUser(null); setAssignForm({ role: '', sacco_id: '', vehicle_id: '' }); }
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <UserCog className="w-3 h-3 mr-1" /> Assign Role
                  </Button>
                </DialogTrigger>
                <DialogContent className="glass-surface border-border">
                  <DialogHeader>
                    <DialogTitle>Assign Role to {u.full_name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Select value={assignForm.role} onValueChange={v => setAssignForm({...assignForm, role: v})}>
                      <SelectTrigger className="bg-background/50"><SelectValue placeholder="Select Role" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="sacco_manager">SACCO Manager</SelectItem>
                        <SelectItem value="driver">Driver</SelectItem>
                      </SelectContent>
                    </Select>

                    {(assignForm.role === 'sacco_manager' || assignForm.role === 'driver') && (
                      <Select value={assignForm.sacco_id} onValueChange={v => setAssignForm({...assignForm, sacco_id: v})}>
                        <SelectTrigger className="bg-background/50"><SelectValue placeholder="Select SACCO" /></SelectTrigger>
                        <SelectContent>
                          {saccos.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}

                    {assignForm.role === 'driver' && assignForm.sacco_id && (
                      <Select value={assignForm.vehicle_id} onValueChange={v => setAssignForm({...assignForm, vehicle_id: v})}>
                        <SelectTrigger className="bg-background/50"><SelectValue placeholder="Assign Vehicle" /></SelectTrigger>
                        <SelectContent>
                          {vehicles.filter(v => v.sacco_id === assignForm.sacco_id).map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.plate_number}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <Button onClick={handleAssignRole} className="w-full" disabled={!assignForm.role}>
                      Assign Role
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default UserManagement;
