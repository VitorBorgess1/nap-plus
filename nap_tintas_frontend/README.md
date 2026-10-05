# NAP Tintas — Projeto NAP+

Frontend funcional com backend Flask mínimo para o protótipo da plataforma NAP Tintas.

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
- Endpoint demonstrativo de criação de pedido/pagamento.
- Módulo inicial de recomendação.
- API separada do frontend.
- Estrutura preparada para futura integração com banco de dados.

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
python app.py
```

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

## Banco de dados no futuro

O catálogo está temporariamente no `PRODUCTS` dentro de `app.py`.

A ideia é manter o frontend consumindo:

- `GET /api/products`
- `GET /api/products/<id>`
- `POST /api/recommend`
- `POST /api/payment`

Assim, futuramente o conteúdo dessas rotas pode vir de PostgreSQL, MySQL, SQLite ou outro banco sem precisar reescrever as páginas.

## Inteligência artificial

O `/api/recommend` atualmente utiliza regras simples para demonstrar o fluxo.

Para a versão final, a arquitetura pode ser:

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

## Pagamentos

O `/api/payment` é propositalmente demonstrativo.

Para produção, deve ser conectado a um gateway de pagamento. Dados sensíveis de cartão não devem ser armazenados no frontend ou enviados diretamente para uma API própria sem a arquitetura de segurança adequada.

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

Painel só de frontend: não depende do Flask nem de banco. Os dados de exemplo
ficam em `static/js/admin.js` (função `seed()`) e as alterações são gravadas no
`localStorage` do navegador (chave `nap_admin_v2`). O botão **Restaurar dados de
exemplo** (menu lateral) volta ao estado inicial.

Seções: Visão geral · Produtos & estoque · Pedidos · Ordens de compra ·
Expedições · Fornecedores. Para ligar a um backend/banco no futuro, troque
`load()` e `save()` em `admin.js` por chamadas de API.

Estilos do painel: `static/css/admin.css` (independente do `style.css`).

A tela `/admin/login` é só demonstrativa: o botão **Entrar no painel** leva direto a
`/admin` (sem autenticação). As alterações feitas no painel ficam só no navegador e
**não** alteram o catálogo da loja (`data/products.json`) — isso depende de um backend.

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
