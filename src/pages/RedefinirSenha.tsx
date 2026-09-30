import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, KeyRound, AlertTriangle } from 'lucide-react';
import { TelaCarregamento } from '@/components/TelaCarregamento';
import { useToast } from '@/hooks/use-toast';
import { REGRAS_SENHA, SENHA_MIN, traduzirErroSenha, validarSenha } from '@/utils/senha';
import { traduzirErroAuth } from '@/utils/erroAuth';

/**
 * Destino do link de "esqueci minha senha". O supabase-js lê o token do
 * endereço e abre uma sessão de recuperação; aqui o usuário só escolhe a senha
 * nova. Sem sessão, o link expirou ou já foi usado.
 */

// Fora do componente: definido dentro, cada tecla remontaria os inputs.
const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-background p-6">
    <div className="w-full max-w-md space-y-6">
      <div className="flex items-center justify-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <span className="text-2xl font-bold text-foreground">CobrançaPro</span>
      </div>
      {children}
    </div>
  </div>
);

function validarNovaSenha(senha: string, confirma: string): string | null {
  return validarSenha(senha) ?? (senha !== confirma ? 'As senhas não conferem.' : null);
}

function LinkExpirado() {
  return (
    <Frame>
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertTriangle className="h-7 w-7 text-destructive" />
          </div>
          <CardTitle className="text-xl font-bold">Link expirado ou já usado</CardTitle>
          <CardDescription>
            Peça um novo link em "Esqueci minha senha", na tela de entrada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full h-11">
            <Link to="/auth">Ir para a tela de entrada</Link>
          </Button>
        </CardContent>
      </Card>
    </Frame>
  );
}

export default function RedefinirSenha() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (loading) return <TelaCarregamento />;
  if (!user) return <LinkExpirado />;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = validarNovaSenha(senha, confirma);
    setErro(problema);
    if (problema) return;

    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      setErro(traduzirErroSenha(traduzirErroAuth(error)));
      return;
    }
    toast({ title: 'Senha alterada', description: 'Você já está conectado com a senha nova.' });
    navigate('/', { replace: true });
  };

  return (
    <Frame>
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <KeyRound className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold">Criar nova senha</CardTitle>
          <CardDescription>Para {user.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={salvar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input id="nova-senha" type="password" value={senha} placeholder="••••••••" minLength={SENHA_MIN}
                onChange={(e) => setSenha(e.target.value)} required className="h-11 rounded-xl" />
              <p className="text-xs text-muted-foreground">{REGRAS_SENHA}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirma-senha">Repita a nova senha</Label>
              <Input id="confirma-senha" type="password" value={confirma} placeholder="••••••••" minLength={SENHA_MIN}
                onChange={(e) => setConfirma(e.target.value)} required className="h-11 rounded-xl" />
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full h-11" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Frame>
  );
}
