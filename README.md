# Calendário Conjunto

PWA para o calendário partilhado (João & Inês): aba Dia, aba Mês, Project 50 e Google Calendar.
Stack: HTML/CSS/JS puro (sem build) + Supabase (base de dados, storage e realtime) + GitHub Pages.

## 1. Criar o projeto Supabase

1. Vai a https://supabase.com → **New project** (o plano free chega perfeitamente para isto).
2. Depois de criado, vai a **SQL Editor** → **New query**, cola todo o conteúdo de
   [`supabase/schema.sql`](./supabase/schema.sql) e corre (`Run`). Isto cria as tabelas,
   ativa o Realtime e as políticas de acesso.
3. Vai a **Storage** → **New bucket** → nome exatamente `project50-photos` → marca
   **Public bucket** → cria. (O script SQL já tenta criar isto sozinho, mas se der
   erro na parte do `storage.buckets`, cria à mão como descrito aqui — o resto do
   script corre na mesma.)
4. Vai a **Project Settings → API** e copia:
   - **Project URL**
   - **anon public key**

### Atualizar uma base de dados já existente

Para ativar a recorrência numa instalação anterior, corre no SQL Editor o ficheiro
[`supabase/migrations/20260921_add_event_recurrence.sql`](./supabase/migrations/20260921_add_event_recurrence.sql).
A app continua a abrir e a guardar eventos normais enquanto esta migração não for aplicada;
nesse caso, a opção de recorrência fica indisponível de forma controlada.

## 2. Configurar a app

Abre `config.js` e substitui os dois valores:

```js
export const SUPABASE_URL = "https://xxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ...";
```

## 3. Publicar no GitHub Pages

### Configurar o Google Calendar

1. Na [Google Cloud Console](https://console.cloud.google.com/), cria ou seleciona um projeto, ativa a **Google Calendar API** e configura o ecrã de consentimento OAuth (nome e email de suporte).
2. Se a aplicação OAuth estiver em **Testing**, adiciona os emails de João e Inês aos **Test users**. O Google pode exigir verificação ou limites adicionais conforme o modo de publicação e os scopes escolhidos.
3. Em **Credentials**, cria um **OAuth client ID** do tipo **Web application**. Em **Authorized JavaScript origins**, coloca `https://joao-eleuterio.github.io` (sem `/calendario-conjunto/`). Para testes locais, acrescenta `http://localhost:8000`. Este fluxo com popup não necessita de redirect URI.
4. Copia apenas o **Client ID** para `GOOGLE_CLIENT_ID` em `config.js`. Nunca coloques o Client Secret no repositório.
5. Depois da publicação, cada um abre a aba **Calendário**, escolhe a respetiva vista e autoriza a sua conta Google. A primeira conta associada a cada vista fica identificada pelo email **neste navegador**; para mudar usa **Alterar conta associada**.

A app consulta os calendários da conta, em leitura, sem copiar eventos para o Supabase. A autorização passa a pedir também acesso de leitura à lista de calendários, pelo que o Google poderá pedir novo consentimento. O acesso Google é temporário e os tokens ficam só na memória da página: ao reabrir a app ou quando expiram, pode ser necessário clicar novamente em **Ligar Google Calendar**. A escolha João/Inês da app é local e não autentica quem usa o aparelho; num aparelho partilhado, quem troca de vista poderá ver os eventos de uma conta que esteja ligada nessa sessão. Para acesso persistente e controlo real por pessoa, será preciso acrescentar autenticação e um backend próprio.

```bash
cd calendario-conjunto
git init
git add .
git commit -m "Calendário Conjunto"
git branch -M main
git remote add origin https://github.com/Joao-Eleuterio/calendario-conjunto.git
git push -u origin main
```

No GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `root`**.
Fica disponível em `https://joao-eleuterio.github.io/calendario-conjunto/`.

## 4. Instalar no telemóvel (dos dois)

Abre o link no telemóvel (Safari no iPhone, Chrome no Android) e usa
**"Adicionar ao ecrã principal"**. Fica com ícone próprio e abre em ecrã inteiro,
como uma app normal.

Na primeira abertura, cada um escolhe o seu nome (João / Inês) — isso fica
guardado só naquele telemóvel/navegador (não é preciso fazer login com password).

## Como funciona cada aba

- **Dia** — mostra o dia atual dividido em três blocos: Conjunto, João, Inês.
  Cada bloco é uma lista de tarefas com checkbox, hora opcional e botão de
  apagar. O `+` de cada bloco já vem pré-selecionado para aquela pessoa. Um item
  pode repetir-se diariamente, em dias úteis, semanalmente, mensalmente ou
  anualmente; ao apagar uma recorrência podes escolher uma ocorrência, as
  seguintes ou a série inteira.
- **Mês** — grelha estilo Google Calendar, com pontinhos coloridos por
  quem tem coisas nesse dia. Em qualquer dia já passado (ou hoje) aparece um
  pequeno botão redondo no canto — cada um marca o seu; quando os dois
  tiverem marcado o mesmo dia, aparece o **✕** dourado por cima da célula.
  Tocar no número do dia abre esse dia na aba Dia.
- **Project 50** — lista numerada e editável das 8 regras (podes adicionar,
  editar em linha ou remover), com checkbox de "feito hoje" por pessoa.
  Por baixo, 4 pastas (Manhã / Fitness / Ler / Skill) onde cada um pode
  tirar/enviar uma foto — fica guardada com nome, dia e hora.
- **Calendário** — consulta todos os calendários Google visíveis da conta autorizada
  para a vista João ou Inês, com as cores configuradas no Google (incluindo cores
  próprias de eventos). Podes ativar ou ocultar cada calendário na própria aba,
  alternar entre vistas **Dia**, **Semana** e **Mês**, e navegar entre períodos.
  Os eventos aparecem em cards com a respetiva cor. Esta aba
  requer o OAuth Client ID acima e acesso à rede.

Tudo o que um dos dois adiciona aparece automaticamente no telemóvel do outro
(Realtime do Supabase) — não é preciso dar refresh, mas se por alguma razão a
ligação cair, volta a atualizar sempre que abres a app outra vez.

## Nota sobre segurança

Não há login com password — a app confia em quem tem o link. As políticas de
acesso no Supabase (RLS) estão abertas para simplificar (só o URL + chave
pública dão acesso de leitura/escrita). Isto é razoável para um projeto
privado de casal desde que não partilhes o link/chave publicamente. Se um dia
quiseres reforçar, dá para trocar por Supabase Auth (magic link) restrito aos
vossos dois emails — o `schema.sql` já tem tudo comentado a explicar onde
mexer.

## Estrutura de ficheiros

```
calendario-conjunto/
├── index.html          # esqueleto da app
├── styles.css          # estilos
├── app.js              # toda a lógica (Supabase, vistas, realtime)
├── recurrence.js       # cálculo das datas recorrentes
├── supabase-client.js  # cliente Supabase partilhado pelos módulos
├── config.js           # as tuas chaves do Supabase (edita isto)
├── manifest.json        # manifest da PWA
├── sw.js                # service worker (cache da app shell)
├── icons/               # ícones da PWA
└── supabase/            # schema completo e migrações incrementais
```
