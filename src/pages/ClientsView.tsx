import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Mail, 
  Phone, 
  MapPin, 
  Search, 
  Trash2, 
  Edit2, 
  History,
  Users,
  TrendingUp
} from 'lucide-react';
import { useFinance, type Client } from '../context/FinanceContext';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { AlertDialog } from '../components/ui/AlertDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/Table';

export default function ClientsView() {
  const { t, i18n } = useTranslation();
  const { clients, invoices, addClient, updateClient, deleteClient } = useFinance();
  const location = useLocation();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [selectedClientForHistory, setSelectedClientForHistory] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Handle URL actions (Quick Actions from Dashboard)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    const nameParam = params.get('name');
    
    if (action === 'new') {
      setEditingClient(null);
      setFormData({ 
        name: nameParam || '', 
        email: '', 
        phone: '', 
        address: '' 
      });
      setIsModalOpen(true);
      
      // Remove the parameter after opening
      navigate(location.pathname, { replace: true });
    }
  }, [location.search]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Analytics
  const totalBilledAll = clients.reduce((sum, c) => sum + c.totalBilled, 0);
  const topClient = [...clients].sort((a, b) => b.totalBilled - a.totalBilled)[0];

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormData({
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address
      });
    } else {
      setEditingClient(null);
      setFormData({ name: '', email: '', phone: '', address: '' });
    }
    setIsModalOpen(true);
  };

  const handleOpenDeleteAlert = (id: string) => {
    setClientToDelete(id);
    setIsDeleteAlertOpen(true);
  };

  const handleOpenHistory = (client: Client) => {
    setSelectedClientForHistory(client);
    setIsHistoryModalOpen(true);
  };

  const confirmDelete = () => {
    if (clientToDelete) {
      deleteClient(clientToDelete);
      setClientToDelete(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClient) {
      updateClient(editingClient.id, formData);
    } else {
      addClient(formData);
    }
    setIsModalOpen(false);
  };

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat(i18n.language === 'he' ? 'he-IL' : 'en-US', { 
      style: 'currency', 
      currency: 'ILS' 
    }).format(value);

  const clientInvoices = selectedClientForHistory 
    ? invoices.filter(inv => inv.clientId === selectedClientForHistory.id)
    : [];

  return (
    <div className="space-y-6 px-1 md:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{t('common.clients')}</h1>
          <p className="text-sm md:text-base text-slate-500 mt-1">{t('clients.subtitle')}</p>
        </div>
        <Button onClick={() => handleOpenModal()} className="w-full sm:w-auto h-11 md:h-10 font-bold">
          <Plus className="h-5 w-5 md:h-4 md:w-4 me-2" /> {t('clients.add_client')}
        </Button>
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        <Card className="border-s-4 border-s-primary">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('clients.total_clients')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{clients.length}</p>
              </div>
              <div className="bg-blue-100 p-2 rounded-full">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-s-4 border-s-green-500">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('clients.lifetime_revenue')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1">{formatCurrency(totalBilledAll)}</p>
              </div>
              <div className="bg-green-100 p-2 rounded-full">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-s-4 border-s-indigo-500 col-span-2 md:col-span-1">
          <CardContent className="pt-4 md:pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm font-medium text-slate-500 uppercase tracking-wider">{t('clients.top_client')}</p>
                <p className="text-xl md:text-2xl font-bold text-slate-900 mt-1 truncate max-w-[150px] md:max-w-[180px]">
                  {topClient?.name || 'N/A'}
                </p>
              </div>
              <div className="bg-indigo-100 p-2 rounded-full">
                <Badge variant="outline" className="text-indigo-600 border-indigo-200">
                  {topClient ? formatCurrency(topClient.totalBilled) : '₪0'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 px-4 md:px-6">
          <div className="relative max-w-full md:max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder={t('clients.search_placeholder')} 
              className="ps-9 h-11 md:h-10" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {filteredClients.map((client) => (
              <Card key={client.id} className="hover:border-primary/50 transition-all duration-200 group">
                <CardContent className="pt-4 md:pt-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl md:rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-base md:text-lg group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      {client.name.charAt(0)}
                    </div>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-10 w-10 md:h-8 md:w-8 text-slate-400 hover:text-primary"
                        onClick={() => handleOpenModal(client)}
                        title={t('common.edit')}
                      >
                        <Edit2 className="h-5 w-5 md:h-4 md:w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-10 w-10 md:h-8 md:w-8 text-slate-400 hover:text-red-500"
                        onClick={() => handleOpenDeleteAlert(client.id)}
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-5 w-5 md:h-4 md:w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <h3 className="text-base md:text-lg font-bold text-slate-900 mb-1 truncate">{client.name}</h3>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs md:text-sm text-slate-500">
                      <Mail className="h-3.5 w-3.5" />
                      <span className="truncate">{client.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs md:text-sm text-slate-500">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{client.phone}</span>
                    </div>
                    {client.address && (
                      <div className="flex items-start gap-2 text-xs md:text-sm text-slate-500">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        <span className="line-clamp-1 md:line-clamp-2">{client.address}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t flex justify-between items-center">
                    <div>
                      <p className="text-[9px] md:text-[10px] text-slate-400 uppercase font-bold tracking-wider">{t('clients.lifetime_billing')}</p>
                      <p className="text-base md:text-lg font-bold text-slate-900">{formatCurrency(client.totalBilled)}</p>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-9 md:h-8 gap-1.5 text-xs font-medium"
                      onClick={() => handleOpenHistory(client)}
                    >
                      <History className="h-3.5 w-3.5" /> {t('clients.history')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Client Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title={editingClient ? t('clients.edit_client') : t('clients.add_client')}
      >
        <div className="max-h-[80vh] md:max-h-[85vh] overflow-y-auto px-1 scrollbar-hide">
          <form onSubmit={handleSubmit} className="space-y-4 pb-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('clients.name_label')}</label>
              <Input 
                placeholder="e.g. Acme Corp" 
                required 
                className="h-11 md:h-10"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('clients.email_label')}</label>
                <Input 
                  type="email" 
                  placeholder="billing@client.com" 
                  required 
                  className="h-11 md:h-10"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('clients.phone_label')}</label>
                <Input 
                  placeholder="(555) 000-0000" 
                  className="h-11 md:h-10"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('clients.address_label')}</label>
              <Input 
                placeholder={t('clients.address_placeholder')}
                className="h-11 md:h-10"
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
              />
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} className="h-11 md:h-10 order-2 sm:order-1">
                {t('common.cancel')}
              </Button>
              <Button type="submit" className="h-11 md:h-10 px-8 order-1 sm:order-2 font-bold">
                {editingClient ? t('common.save') : t('common.add')}
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Invoice History Modal */}
      <Modal 
        isOpen={isHistoryModalOpen} 
        onClose={() => setIsHistoryModalOpen(false)} 
        title={`${t('clients.history')}: ${selectedClientForHistory?.name}`}
      >
        <div className="space-y-6">
          <div className="max-h-[60vh] md:max-h-[70vh] overflow-y-auto px-1">
            {clientInvoices.length > 0 ? (
              <div className="w-full overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">{t('common.date')}</TableHead>
                      <TableHead className="whitespace-nowrap">{t('invoices.invoice_id')}</TableHead>
                      <TableHead className="whitespace-nowrap">{t('common.amount')}</TableHead>
                      <TableHead className="whitespace-nowrap">{t('common.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="text-xs md:text-sm whitespace-nowrap">{inv.date}</TableCell>
                        <TableCell className="font-medium text-primary text-xs md:text-sm whitespace-nowrap">{inv.id}</TableCell>
                        <TableCell className="font-bold text-xs md:text-sm whitespace-nowrap">{formatCurrency(inv.total)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={inv.status === 'Paid' ? 'success' : 'outline'} className="text-[10px]">
                            {t(`invoices.${inv.status.toLowerCase()}`)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-sm italic border-2 border-dashed rounded-lg bg-slate-50">
                {t('clients.no_invoices')}
              </div>
            )}
          </div>
          <div className="flex justify-end pt-2 border-t">
            <Button variant="outline" onClick={() => setIsHistoryModalOpen(false)} className="h-11 md:h-10 w-full sm:w-auto">
              {t('common.close') || 'Close'}
            </Button>
          </div>
        </div>
      </Modal>

      <AlertDialog 
        isOpen={isDeleteAlertOpen}
        onClose={() => setIsDeleteAlertOpen(false)}
        onConfirm={confirmDelete}
        title={t('clients.delete_title')}
        description={t('clients.delete_description')}
        confirmText={t('common.delete')}
        variant="destructive"
      />
    </div>
  );
}
