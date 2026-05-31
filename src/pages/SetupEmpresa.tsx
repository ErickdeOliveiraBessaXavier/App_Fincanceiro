import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2 } from 'lucide-react';

export default function SetupEmpresa() {
  const { user, companyId, loading, refreshClaims } = useAuth();
  const { toast } = useToast();
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [saving, setSaving] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  // Já tem empresa: nada a configurar.
  if (companyId) return <Navigate to="/" replace />;

  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.rpc('criar_empresa_e_admin', {
        p_nome: nome.trim(),
        p_cnpj: cnpj.trim() || undefined,
        p_slug: slugify(nome),
      });
      if (error) throw error;

      // Renova o token para carregar o claim company_id (quando o hook está ativo).
      await refreshClaims();
      toast({ title: 'Empresa criada', description: 'Tudo pronto! Bem-vindo.' });
      // Reload completo garante que o tenant seja recarregado (claim ou fallback do banco).
      window.location.assign('/');
    } catch (err: any) {
      toast({
        title: 'Erro ao criar empresa',
        description: err.message ?? 'Falha desconhecida',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Configure sua empresa</CardTitle>
          <CardDescription>
            Crie a empresa para começar a usar o sistema. Você será o administrador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome da empresa</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Minha Empresa Ltda"
                required
                minLength={2}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj">CNPJ (opcional)</Label>
              <Input
                id="cnpj"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="h-11 rounded-xl"
              />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={saving || nome.trim().length < 2}>
              {saving ? 'Criando...' : 'Criar empresa'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
