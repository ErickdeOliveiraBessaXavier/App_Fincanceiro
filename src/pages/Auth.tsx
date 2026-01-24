import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles } from 'lucide-react';

const Auth = () => {
  const { user, signIn, signUp, loading } = useAuth();
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [signupData, setSignupData] = useState({ email: '', password: '', nome: '' });
  const [isLoading, setIsLoading] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await signIn(loginData.email, loginData.password);
    setIsLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await signUp(signupData.email, signupData.password, signupData.nome);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary/90 to-primary/80 p-12 flex-col justify-between relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-accent/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">CobrançaPro</span>
          </div>
        </div>
        
        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Gerencie suas cobranças com eficiência
          </h1>
          <p className="text-lg text-white/80 max-w-md">
            Simplifique o processo de cobrança, acompanhe títulos, gerencie acordos e maximize sua recuperação de crédito.
          </p>
          
          <div className="grid grid-cols-3 gap-4 pt-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="text-3xl font-bold text-white">98%</div>
              <div className="text-sm text-white/70">Taxa de satisfação</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="text-3xl font-bold text-white">+50k</div>
              <div className="text-sm text-white/70">Títulos gerenciados</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="text-3xl font-bold text-white">24/7</div>
              <div className="text-sm text-white/70">Suporte ativo</div>
            </div>
          </div>
        </div>
        
        <div className="relative z-10 text-sm text-white/60">
          © 2024 CobrançaPro. Todos os direitos reservados.
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-foreground">CobrançaPro</span>
          </div>

          <Card className="border-0 shadow-none lg:shadow-card lg:border">
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-2xl font-bold">Bem-vindo de volta</CardTitle>
              <CardDescription>
                Acesse sua conta ou crie uma nova
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 bg-muted p-1 rounded-xl">
                  <TabsTrigger 
                    value="login" 
                    className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    Entrar
                  </TabsTrigger>
                  <TabsTrigger 
                    value="signup"
                    className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    Cadastrar
                  </TabsTrigger>
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
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Entrando...
                        </span>
                      ) : 'Entrar'}
                    </Button>
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
                        minLength={6}
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <Button type="submit" className="w-full h-11" disabled={isLoading}>
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Cadastrando...
                        </span>
                      ) : 'Criar conta'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Auth;