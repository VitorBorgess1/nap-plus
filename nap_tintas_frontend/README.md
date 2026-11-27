# NAP Tintas — Projeto NAP+

Site e painel administrativo da NAP Tintas, com backend Flask e catálogo no Supabase.

## Estrutura

```text
nap_tintas_frontend/
├── app.py
├── requirements.txt
├── README.md
├── .gitignore
├── templates/
│   ├── base.html              ← estrutura comum (head, menu, scripts)
│   ├── index.html
│   ├── products.html
│   ├── checkout.html
│   ├── login.html             ← login do cliente
│   └── partials/
│       ├── _header.html       ← menu único de todas as páginas
│       ├── _logo.html         ← logo NAP Tintas (menu e rodapé)
│       ├── _icons.html        ← sprite de ícones Lucide
│       └── _macros.html       ← macro {{ icon('nome') }}
└── static/
    ├── css/
    │   └── style.css
    └── js/
        ├── common.js          ← carrinho, moeda e ícones (todas as páginas)
        ├── app.js             ← página inicial (recomendador)
        ├── products.js        ← catálogo
        ├── checkout.js        ← checkout
        └── login.js           ← login do cliente
```

## O que já existe

- Página institucional da NAP Tintas.
- Catálogo de produtos.
- Busca e filtro por categoria.
- Carrinho no `localStorage`.
- Checkout.
- Checkout que cria o pedido de verdade (reserva o estoque e registra no painel).
- Módulo inicial de recomendação.
- API separada do frontend.
- Catálogo e estoque no Supabase; pedidos e demais cadastros do painel em `data/admin_data.json`.
- Painel `/admin` protegido por login.

## Executar

No terminal:

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

Linux/macOS:

```bash
source .venv/bin/activate
```

Depois:

```bash
pip install -r requirements.txt
cp IA-NAP/.env.example IA-NAP/.env   # preencha SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY, ADMIN_PASSWORD e SECRET_KEY
python app.py
```

O Flask lê o **mesmo** `IA-NAP/.env` que a IA (ou um `.env` na raiz, que tem prioridade).
O catálogo vem do Supabase (`PRODUCTS_SOURCE=supabase`, o padrão); se faltar
`SUPABASE_URL`/`SUPABASE_KEY` o app não sobe, de propósito.
Para desenvolver sem banco: `PRODUCTS_SOURCE=json` (usa `data/products.json`).

Acesse:

```text
http://127.0.0.1:5000
```

## Menu, logo e ícones

### Menu único

O menu (`templates/partials/_header.html`) é o mesmo em todas as páginas:
**Início · A empresa · Recomendador IA · Produtos · Carrinho**. A página atual
é destacada automaticamente (`aria-current="page"`). Para mudar um item do
menu, basta editar esse único arquivo.

### Logo

A logo fica em `templates/partials/_logo.html` e é usada no menu e no rodapé.
O anel colorido é um SVG vetorial (escala sem perder qualidade) e o texto
"NAP / TINTAS" é HTML/CSS. As regras visuais estão no início do `style.css`
(`.logo`, `.logo-icon`, `.logo-word`...).

Para trocar pela logo oficial em imagem ou SVG, substitua o conteúdo de
`_logo.html` mantendo o `<a class="logo" ...>` em volta.

### Ícones (Lucide)

Todos os ícones vêm da biblioteca [Lucide](https://lucide.dev) (licença ISC),
embutidos em `templates/partials/_icons.html` — não dependem de internet.

Uso em HTML (Jinja):

```jinja
{% from "partials/_macros.html" import icon %}
{{ icon('shopping-cart') }}
```

Uso em JavaScript (`common.js`):

```js
`Continuar ${icon("arrow-right")}`
```

Para adicionar um ícone novo:

1. Abra o ícone em https://lucide.dev e copie o conteúdo interno do SVG
   (os `<path>`, `<circle>`...).
2. Cole em `_icons.html` dentro de um novo
   `<symbol id="i-nome-do-icone" viewBox="0 0 24 24"> ... </symbol>`.
3. Use com `icon('nome-do-icone')`.

No `app.py`, o campo `icon` de cada produto guarda o **nome** do ícone Lucide
(ex.: `"house"`, `"spray-can"`). Ao migrar para um banco de dados, ele pode
virar uma coluna de texto.

## Catálogo e banco de dados

**Fonte única de produtos:** o catálogo vem do Supabase (tabela de produtos + tabela
`estoque`) e é lido por `catalog.py`. Site, painel admin, recomendador e **IA-NAP**
leem o mesmo banco, então a IA só recomenda o que existe na loja e com o estoque real.
Não há mais lista de produtos no `app.py` nem em `admin.js`.

- `catalog.py` aceita colunas em português ou inglês (mesmos nomes da IA-NAP) e grava
  usando os nomes reais das colunas da sua tabela.
- Estoque: lido/gravado na tabela `estoque` (`produto_id`, `quantidade`).
- Se o Supabase cair, as rotas respondem `503` — não há "plano B" em JSON, para nunca
  haver dois catálogos diferentes.
- Testes: `python -m unittest discover -s tests -v` (usa um Supabase falso, sem internet).

A interface consome:

- `GET /api/products`
- `GET /api/products/<id>`
- `POST /api/recommend`
- `POST /api/payment`

Os ids podem ser número ou texto (uuid). Trocar de banco não exige reescrever as páginas.

## Sincronização automática com o Supabase

Tudo que você mudar direto no Supabase (produto novo, preço, estoque, ativar/desativar)
chega ao site **sozinho**, sem cadastrar nada à mão e sem reiniciar:

- O servidor guarda o catálogo por no máximo `SUPABASE_CACHE_SECONDS` (padrão **3 s**) e as
  respostas da API não ficam em cache no navegador.
- A página de produtos se atualiza a cada 15 s e ao voltar para a aba, mantendo busca e filtros.
- O carrinho/checkout confere preço e estoque atuais antes de mostrar o total.

Como o estoque é lido (nesta ordem): **linha na tabela de estoque** (`SUPABASE_STOCK_TABLE`,
colunas `produto_id` + `quantidade`) → **coluna de estoque do próprio produto** → **sem registro
de estoque**. Neste último caso o produto novo aparece na loja com `SUPABASE_UNTRACKED_STOCK`
unidades (padrão 100) até você cadastrar a quantidade; use `0` para esconder produtos sem estoque
cadastrado. Se a tabela de estoque não existir, o site usa a coluna do produto.

Produto só some se estiver **inativo** (`ativo = false`) ou com **estoque 0**.
Para conferir produto por produto o que o servidor está lendo e por que um item não aparece,
abra (logado no painel) `/api/admin/catalog-check`.

Se mesmo assim algo não aparecer, as causas comuns são: falta de policy de **SELECT** (RLS)
na tabela de produtos ou de estoque, tabela não exposta na Data API, ou o site rodando com
`PRODUCTS_SOURCE=json`.

## Inteligência artificial

O `/api/recommend` usa regras simples sobre o catálogo real. A conversa com a IA (Gemini) passa por `/api/ai/chat` e pelo serviço `IA-NAP`. Fluxo:

```text
Cliente
   ↓
Frontend
   ↓
POST /api/recommend
   ↓
Serviço/modelo de IA
   ↓
Necessidade identificada
   ↓
Consulta de produtos + estoque
   ↓
Recomendações
   ↓
Frontend
```

## Pedidos e pagamento

O `/api/payment` cria o pedido de verdade: confere o estoque no banco, **reserva** as
unidades (desconta do estoque) e registra o pedido no painel como **Aguardando pagamento**.
O cliente informa nome, e-mail e CPF/CNPJ (o documento é exigido mas **não é gravado**).

**Ainda não há gateway de pagamento.** A loja combina o pagamento com o cliente pelo e-mail
do pedido e, ao confirmar, muda o status para **Pago** no painel. Para cobrar online, é
preciso integrar um gateway (Mercado Pago, Stripe, Pagar.me...) em `/api/payment`. Dados de
cartão nunca devem passar por este servidor.

Limites atuais: a reserva de estoque é segura dentro de um único processo do Flask; para
rodar vários processos/servidores ao mesmo tempo, mova a reserva para uma função no banco.
Pedidos cancelados ainda não devolvem o estoque automaticamente (ajuste no painel).

## Relação com o TAP

O projeto foi estruturado para atender ao escopo descrito no TAP NAP+:

- site institucional;
- consulta de produtos;
- compras online;
- processamento de pagamentos;
- recomendação baseada em IA;
- diferentes marcas e preços;
- consideração de estoque;
- interface responsiva;
- possibilidade de integração futura com banco de dados.

## Reformulação visual

O HTML e o CSS foram atualizados para uma identidade mais colorida, com manchas de tinta, latas ilustrativas, cards por cores, categorias destacadas e uma área de recomendação com visual próprio. A estrutura Python, as APIs e os arquivos JavaScript foram mantidos.

## Atualizações recentes

- **Logo oficial** da NAP Tintas no menu e no rodapé.
- **Menu padronizado** em todas as páginas, com destaque para a página atual.
- **Ícones Lucide** no lugar de emojis e símbolos de texto.
- **Templates com herança Jinja** (`base.html` + `partials/`): menu, logo e
  ícones são definidos uma única vez.
- **`common.js`** reúne o que era repetido entre os scripts (carrinho,
  formatação de moeda e ícones). O contador do carrinho agora funciona em
  todas as páginas.

## Painel administrativo (`/admin`)

**Produtos & estoque** (e os indicadores que dependem deles) vêm do banco pela API
`/api/admin/products`: criar, editar, ajustar estoque e excluir gravam direto no Supabase
e aparecem na loja e na IA.
Para gravar, o Flask precisa de uma chave com permissão de escrita (`SUPABASE_SERVICE_KEY`,
só no servidor) ou de policies de escrita no Supabase.

**Pedidos, Ordens de compra, Expedições e Fornecedores** também ficam no servidor
(`/api/admin/orders`, `/purchase-orders`, `/shipments`, `/suppliers`), salvos em
`data/admin_data.json` (ou no arquivo de `ADMIN_DATA_FILE`). O arquivo começa vazio e
**não entra no git** (são dados reais da loja): faça backup dele.

Estilos do painel: `static/css/admin.css` (independente do `style.css`).

**Login do admin:** `/admin` e `/api/admin/*` exigem login. Configure no `.env`
`ADMIN_EMAIL` (opcional), `ADMIN_PASSWORD` (obrigatória; sem ela o painel fica trancado) e
`SECRET_KEY` (fixa, para a sessão não cair a cada reinício). Em produção use HTTPS e
`SESSION_COOKIE_SECURE=1`. Há limite de 5 tentativas erradas por IP a cada 5 minutos.

## Login do cliente (`/login`)

Tela de login para clientes, **só frontend** (o backend ainda não existe).

- **Página:** `templates/login.html` (rota `login` em `app.py`), reaproveitando o
  layout da tela de login administrativa. Estilos no final de `style.css`.
- **Comportamento:** `static/js/login.js` valida e-mail e senha (mín. 6 caracteres),
  mostra/oculta a senha e, se tudo estiver válido, "entra": qualquer e-mail válido
  funciona. O cliente fica guardado no navegador (chave `nap_tintas_customer`):
  em `localStorage` se marcar **Lembrar acesso**, senão em `sessionStorage`.
- **Redirecionamento:** volta para a página de origem (`/login?next=/checkout`) ou
  para `/` — só aceita caminhos internos.
- **Menu:** um ícone de usuário (`_header.html`), junto do carrinho, leva ao login;
  com sessão ativa vira a inicial do nome + botão de sair. Funções da sessão em `common.js`: `getCustomer`, `saveCustomer`,
  `logoutCustomer`.
- **"Esqueci minha senha" e "Criar conta":** por enquanto só mostram um aviso.

Para ligar ao backend depois, troque o trecho `[BACKEND]` de `login.js` por
`POST /api/login` e as funções de sessão de `common.js` por chamadas de API
(`GET /api/me`, `POST /api/logout`). Não guarde a senha no navegador.
