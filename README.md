# Calendário Conjunto

PWA para o calendário partilhado (João & Inês): aba Dia, aba Mês e Project 50.
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

## 2. Configurar a app

Abre `config.js` e substitui os dois valores:

```js
export const SUPABASE_URL = "https://xxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJ...";
```

## 3. Publicar no GitHub Pages

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
  apagar. O `+` de cada bloco já vem pré-selecionado para aquela pessoa.
- **Mês** — grelha estilo Google Calendar, com pontinhos coloridos por
  quem tem coisas nesse dia. Em qualquer dia já passado (ou hoje) aparece um
  pequeno botão redondo no canto — cada um marca o seu; quando os dois
  tiverem marcado o mesmo dia, aparece o **✕** dourado por cima da célula.
  Tocar no número do dia abre esse dia na aba Dia.
- **Project 50** — lista numerada e editável das 8 regras (podes adicionar,
  editar em linha ou remover), com checkbox de "feito hoje" por pessoa.
  Por baixo, 4 pastas (Manhã / Fitness / Ler / Skill) onde cada um pode
  tirar/enviar uma foto — fica guardada com nome, dia e hora.

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
├── config.js           # as tuas chaves do Supabase (edita isto)
├── manifest.json        # manifest da PWA
├── sw.js                # service worker (cache da app shell)
├── icons/               # ícones da PWA
└── supabase/schema.sql  # schema completo a correr no Supabase
```
