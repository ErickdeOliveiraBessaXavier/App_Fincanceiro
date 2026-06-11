import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, UserPlus, CheckCircle2, AlertTriangle } from 'lucide-react';

// Definido fora do componente: se ficasse dentro, cada re-render (ao digitar)
// criaria um novo tipo de componente, remontando os inputs e perdendo o foco.
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

type ConviteForm = { nome: string; email: string; senha: string; confirma: string };

// Valida o formulário; devolve a mensagem de erro ou null se estiver ok.
function validarConvite(form: ConviteForm): string | null {
  if (form.nome.trim().length < 2) return 'Informe seu nome.';
  if (!form.email.includes('@')) return 'Informe um e-mail válido.';
  if (form.senha.length < 6) return 'A senha deve ter ao menos 6 caracteres.';
  if (form.senha !== form.confirma) return 'As senhas não conferem.';
  return null;
}

export default function Convite() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [form, setForm] = useState<ConviteForm>({ nome: '', email: '', senha: '', confirma: '' });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const msgErro = validarConvite(form);
    if (msgErro) return setErro(msgErro);

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('registrar-convite', {
        body: { token, nome: form.nome.trim(), email: form.email.trim(), senha: form.senha },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setEnviado(true);
    } catch (e: any) {
      setErro(e?.message ?? 'Não foi possível concluir o cadastro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Frame>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <CardTitle className="text-xl font-bold">Link inválido</CardTitle>
            <CardDescription>
              Este link de convite está incompleto. Peça um novo link ao administrador da empresa.
            </CardDescription>
          </CardHeader>
        </Card>
      </Frame>
    );
  }

  if (enviado) {
    return (
      <Frame>
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl font-bold">Cadastro enviado!</CardTitle>
            <CardDescription>
              Sua conta foi criada e está <strong>aguardando a autorização do administrador</strong>.
              Você poderá entrar assim que seu acesso for liberado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full h-11">
              <Link to="/auth">Ir para o login</Link>
            </Button>
          </CardContent>
        </Card>
      </Frame>
    );
  }

  return (
    <Frame>
      <Card>
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <UserPlus className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Criar seu acesso</CardTitle>
          <CardDescription>
            Defina seu e-mail e senha. Após o cadastro, o administrador autoriza seu acesso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-nome">Nome</Label>
              <Input id="c-nome" value={form.nome} placeholder="Seu nome completo"
                onChange={(e) => setForm({ ...form, nome: e.target.value })} required className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-email">E-mail</Label>
              <Input id="c-email" type="email" value={form.email} placeholder="seu@email.com"
                onChange={(e) => setForm({ ...form, email: e.target.value })} required className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-senha">Senha</Label>
              <Input id="c-senha" type="password" value={form.senha} placeholder="••••••••" minLength={6}
                onChange={(e) => setForm({ ...form, senha: e.target.value })} required className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-confirma">Confirmar senha</Label>
              <Input id="c-confirma" type="password" value={form.confirma} placeholder="••••••••" minLength={6}
                onChange={(e) => setForm({ ...form, confirma: e.target.value })} required className="h-11 rounded-xl" />
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Cadastrando...
                </span>
              ) : 'Criar conta'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Frame>
  );
}
