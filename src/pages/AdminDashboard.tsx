import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Bus, Users, FileText, LogOut, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SaccoManagement from '@/components/admin/SaccoManagement';
import VehicleManagement from '@/components/admin/VehicleManagement';
import UserManagement from '@/components/admin/UserManagement';
import DocumentManagement from '@/components/admin/DocumentManagement';

const AdminDashboard = () => {
  const { user, isAdmin, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState('saccos');

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="glass-surface border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center animate-glow-pulse">
            <Zap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider">BEACON Admin</h1>
            <p className="text-xs text-muted-foreground">Fleet Management System</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="w-4 h-4 mr-2" /> Sign Out
        </Button>
      </header>

      {/* Content */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="glass-surface mb-6">
            <TabsTrigger value="saccos" className="data-[state=active]:bg-primary/20">
              <Building2 className="w-4 h-4 mr-2" /> SACCOs
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="data-[state=active]:bg-primary/20">
              <Bus className="w-4 h-4 mr-2" /> Vehicles
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-primary/20">
              <Users className="w-4 h-4 mr-2" /> Users
            </TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-primary/20">
              <FileText className="w-4 h-4 mr-2" /> Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="saccos"><SaccoManagement /></TabsContent>
          <TabsContent value="vehicles"><VehicleManagement /></TabsContent>
          <TabsContent value="users"><UserManagement /></TabsContent>
          <TabsContent value="documents"><DocumentManagement /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
