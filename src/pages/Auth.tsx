import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, MailCheck, KeyRound } from 'lucide-react';
import { REGRAS_SENHA, SENHA_MIN, validarSenha } from '@/utils/senha';
import { useToast } from '@/hooks/use-toast';
import { TelaCarregamento, SpinnerInline } from '@/components/TelaCarregamento';

const ESPERA_REENVIO_S = 60;

/**
 * Tela de "confirme seu e-mail", depois do cadastro ou quando alguém tenta
 * entrar sem ter confirmado. O reenvio espera 60 s entre tentativas: o envio
 * embutido do Supabase aceita poucos e-mails por hora.
 */
function ConfirmacaoEmail({ email, aposLogin, onVoltar }: { email: string; aposLogin: boolean; onVoltar: () => void }) {
  const { reenviarConfirmacao } = useAuth();
  const [espera, setEspera] = useState(0);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const reenviar = async () => {
    setEnviando(true);
    const enviou = await reenviarConfirmacao(email);
    setEnviando(false);
    if (enviou) setEspera(ESPERA_REENVIO_S);
  };

  const rotuloReenvio = espera > 0 ? `Reenviar em ${espera}s` : 'Reenviar e-mail de confirmação';

  return (
    <Card className="border-0 shadow-none lg: lg:border">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
          <MailCheck className="h-7 w-7 text-primary" />
        </div>
        <CardTitle className="text-2xl font-semibold">Confirme seu e-mail</CardTitle>
        <CardDescription>
          {aposLogin
            ? <>Sua conta ainda não foi confirmada. O link foi enviado para <strong>{email}</strong>.</>
            : <>Enviamos um link de confirmação para <strong>{email}</strong>.</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground text-center">
          Abra o e-mail e clique no link para ativar sua conta. Depois é só voltar aqui e entrar.
          Não esqueça de verificar a caixa de spam.
        </p>
        <Button className="w-full h-11" onClick={reenviar} disabled={enviando || espera > 0}>
          {enviando ? 'Reenviando...' : rotuloReenvio}
        </Button>
        <Button variant="outline" className="w-full h-11" onClick={onVoltar}>
          Voltar para o login
        </Button>
      </CardContent>
    </Card>
  );
}

/** "Esqueci minha senha": pede o e-mail e manda o link de redefinição. */
function EsqueciSenha({ emailInicial, onVoltar }: { emailInicial: string; onVoltar: () => void }) {
  const { enviarRedefinicaoSenha } = useAuth();
  const [email, setEmail] = useState(emailInicial);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    const ok = await enviarRedefinicaoSenha(email.trim());
    setEnviando(false);
    setEnviado(ok);
  };

  return (
    <Card className="border-0 shadow-none lg: lg:border">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-lg bg-primary/10">
          <KeyRound className="h-7 w-7 text-primary" />
        </div>
        <CardTitle className="text-2xl font-semibold">Esqueci minha senha</CardTitle>
        <CardDescription>
          {enviado
            ? <>Se houver uma conta com <strong>{email}</strong>, o link para criar uma senha nova chega em instantes. Confira também o spam.</>
            : 'Informe o e-mail da sua conta e enviaremos um link para criar uma senha nova.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enviado && (
          <form onSubmit={enviar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="esqueci-email">Email</Label>
              <Input id="esqueci-email" type="email" placeholder="seu@email.com" value={email}
                onChange={(e) => setEmail(e.target.value)} required className="h-11 rounded-xl" />
            </div>
            <Button type="submit" className="w-full h-11" disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar link'}
            </Button>
          </form>
        )}
        <Button variant="outline" className="w-full h-11" onClick={onVoltar}>
          Voltar para o login
        </Button>
      </CardContent>
    </Card>
  );
}

const Auth = () => {
  const { user, signIn, signUp, loading } = useAuth();
  const { toast } = useToast();
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [signupData, setSignupData] = useState({ email: '', password: '', nome: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [confirmacaoAposLogin, setConfirmacaoAposLogin] = useState(false);
  const [esqueciSenha, setEsqueciSenha] = useState(false);

  if (loading) {
    return <TelaCarregamento />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const { naoConfirmado } = await signIn(loginData.email, loginData.password);
    setIsLoading(false);
    if (naoConfirmado) {
      setConfirmacaoAposLogin(true);
      setConfirmationEmail(loginData.email);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mesma regra do painel do Supabase, dita antes de enviar e em português.
    const problemaSenha = validarSenha(signupData.password);
    if (problemaSenha) {
      toast({ title: 'Senha fraca', description: problemaSenha, variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    const { error, needsConfirmation } = await signUp(signupData.email, signupData.password, signupData.nome);
    setIsLoading(false);
    if (!error && needsConfirmation) {
      setConfirmacaoAposLogin(false);
      setConfirmationEmail(signupData.email);
    }
    // Se não precisa confirmar, a sessão já foi criada e o redirecionamento acontece automaticamente.
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary/90 to-primary/80 p-12 flex-col justify-between relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-destaque/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-semibold text-white">CobrançaPro</span>
          </div>
        </div>
        
        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-semibold text-white leading-tight">
            Gerencie suas cobranças com eficiência
          </h1>
          <p className="text-lg text-white/80 max-w-md">
            Simplifique o processo de cobrança, acompanhe títulos, gerencie acordos e maximize sua recuperação de crédito.
          </p>
          
        </div>
        
        <div className="relative z-10 text-sm text-white/60">
          © {new Date().getFullYear()} CobrançaPro. Todos os direitos reservados.
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-semibold text-foreground">CobrançaPro</span>
          </div>

          {esqueciSenha ? (
            <EsqueciSenha emailInicial={loginData.email} onVoltar={() => setEsqueciSenha(false)} />
          ) : confirmationEmail ? (
            <ConfirmacaoEmail
              email={confirmationEmail}
              aposLogin={confirmacaoAposLogin}
              onVoltar={() => setConfirmationEmail(null)}
            />
          ) : (
          <Card className="border-0 shadow-none lg: lg:border">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl font-semibold">Bem-vindo de volta</CardTitle>
              <CardDescription>
                Acesse sua conta ou crie uma nova
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login" className="w-full">
                <TabsList variant="pill" className="mb-6 grid w-full grid-cols-2">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Cadastrar</TabsTrigger>
                </TabsList>
                
                <TabsContent value="login" className="space-y-4">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={loginData.email}
                        onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                        required
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Senha</Label>
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <Button type="submit" className="w-full h-11" disabled={isLoading}>
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <SpinnerInline />
                          Entrando...
                        </span>
                      ) : 'Entrar'}
                    </Button>
                    <button
                      type="button"
                      className="w-full text-sm text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => setEsqueciSenha(true)}
                    >
                      Esqueci minha senha
                    </button>
                  </form>
                </TabsContent>
                
                <TabsContent value="signup" className="space-y-4">
                  <form onSubmit={handleSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-nome">Nome</Label>
                      <Input
                        id="signup-nome"
                        type="text"
                        placeholder="Seu nome completo"
                        value={signupData.nome}
                        onChange={(e) => setSignupData({ ...signupData, nome: e.target.value })}
                        required
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={signupData.email}
                        onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                        required
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Senha</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        value={signupData.password}
                        onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                        required
                        minLength={SENHA_MIN}
                        className="h-11 rounded-xl"
                      />
                      <p className="text-xs text-muted-foreground">{REGRAS_SENHA}</p>
                    </div>
                    <Button type="submit" className="w-full h-11" disabled={isLoading}>
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <SpinnerInline />
                          Cadastrando...
                        </span>
                      ) : 'Criar conta'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;