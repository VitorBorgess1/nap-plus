# IA-NAP — Módulo de Inteligência Artificial do NAP+

Assistente inteligente de vendas e recomendação de produtos da NAP Tintas.
Serviço **Node.js isolado**, separado do backend Flask do site, que fala com
a **API do Google Gemini**.

Não é um chatbot genérico: ele interpreta a necessidade do cliente, consulta
o catálogo real (`data/products.json`), respeita estoque, nunca inventa
produto/preço/estoque, e redireciona assuntos fora do escopo da NAP Tintas.

## Fluxo

```text
Cliente → Frontend (app.js)
        → Flask (POST /api/ai/chat, apenas repassa a mensagem)
        → IA-NAP (Node, POST /api/chat)
             1) Gemini INTERPRETA a mensagem → JSON de necessidade
             2) Código (product-search.js) CONSULTA catálogo + estoque
             3) Gemini ESCREVE a resposta natural usando só dados reais
        → Flask → Frontend
```

A IA nunca decide sozinha se um produto existe, tem estoque ou qual o preço:
isso é sempre resolvido em `product-search.js` / `product-repository.js`
(código determinístico). O Gemini só interpreta linguagem e escreve texto.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `server.js` | Servidor Express. Expõe `POST /api/chat` e `GET /health`. |
| `nap-ai.js` | Orquestra o fluxo completo (interpretar → consultar → responder). |
| `prompts.js` | Textos de instrução (prompts) enviados ao Gemini. |
| `gemini-client.js` | Único arquivo que faz requisições HTTPS ao Gemini. |
| `product-search.js` | Cruza a necessidade do cliente com o catálogo (pontuação, estoque, orçamento). |
| `product-repository.js` | Único ponto que sabe **de onde vêm** os produtos (hoje: JSON). |
| `config.js` | Lê o `.env` e centraliza as configurações. |
| `products-test.json` | Cópia do catálogo para os testes automatizados. |
| `tests/` | Testes automatizados (10 cenários pedidos + testes do servidor HTTP). |

## Instalar e rodar

```bash
# 1. Instale o Node.js 18+ (https://nodejs.org)
# 2. No terminal, entre na pasta da IA
cd IA-NAP

# 3. Instale as dependências
npm install

# 4. Crie o arquivo de variáveis de ambiente
cp .env.example .env

# 5. Abra o .env e cole sua chave do Gemini em GEMINI_API_KEY

# 6. Rode o servidor da IA
npm start
```

Se tudo certo, aparece:
```text
IA-NAP no ar em http://127.0.0.1:3001 (modelo: gemini-3.8-flash)
```

Com o site Flask rodando normalmente (`python app.py`, porta 5000), a seção
**NAP INTELIGENTE** da página inicial já conversa com a IA através da rota
`POST /api/ai/chat` do `app.py`, que só repassa a mensagem para a IA-NAP.

> Se a IA-NAP não estiver rodando, o site mostra uma mensagem amigável de
> assistente indisponível — o restante do site continua funcionando normalmente.

## Como obter a chave do Gemini

1. Acesse https://aistudio.google.com/apikey
2. Faça login com uma conta Google.
3. Clique em **Create API key** (criar chave de API).
4. Copie a chave gerada.
5. Cole no arquivo `IA-NAP/.env`, na linha `GEMINI_API_KEY=`.

**Nunca** coloque essa chave em HTML, CSS, JavaScript do navegador ou no
GitHub. Ela deve existir apenas dentro do `.env` (que já está no `.gitignore`).

## Como testar

Testes automatizados (usam um Gemini "falso", não gastam cota nem precisam de
internet):

```bash
cd IA-NAP
npm test
```

Cobre os 10 cenários pedidos: recomendação simples, umidade, mofo, ambiente
externo, orçamento, cor, pergunta incompleta, produto sem estoque, assunto
fora de contexto e informação desconhecida.

Teste manual (com o Gemini de verdade, depois de configurar o `.env` e rodar
`npm start`):

```bash
curl -X POST http://127.0.0.1:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Minha parede do quarto está com muita umidade.","history":[]}'
```

Outras mensagens para testar:
- "Quero pintar minha sala."
- "Tem mofo na parede."
- "Quero pintar a fachada da minha casa."
- "Quero pintar meu quarto e tenho até 300 reais."
- "Preciso de uma tinta boa." (a IA deve perguntar mais detalhes)
- "Quem descobriu o Brasil?" (a IA deve redirecionar para a NAP Tintas)

Ou pela própria interface: rode os dois servidores e acesse
`http://127.0.0.1:5000` → seção **NAP INTELIGENTE**.

## Migrar de `products.json` para Supabase (futuro)

A IA nunca lê `products.json` diretamente — ela sempre passa por
`product-repository.js`. Quando o Supabase estiver pronto:

1. Crie uma classe nova em `product-repository.js`, por exemplo
   `SupabaseProductRepository`, com os mesmos métodos `listAll()` e
   `getById(id)` que `JsonProductRepository` já tem hoje.
2. Na função `createProductRepository`, adicione um `if` para
   `config.productsSource === "supabase"` retornando essa nova classe.
3. No `.env`, troque `PRODUCTS_SOURCE=json` por `PRODUCTS_SOURCE=supabase`
   e adicione as credenciais do Supabase (URL e chave) em novas variáveis.

**Nenhum outro arquivo precisa mudar** — `nap-ai.js`, `product-search.js`,
`prompts.js`, `server.js` e o `app.py` continuam exatamente iguais, porque
todos dependem apenas da interface do repositório (`listAll`/`getById`), não
de como os dados são armazenados.

## Integração com o site

O restante da equipe não precisa mexer na IA-NAP diretamente. Basta que o
Flask (`app.py`) continue chamando:

```text
POST /api/ai/chat   (no Flask, já implementado)
  → encaminha para → POST http://127.0.0.1:3001/api/chat  (IA-NAP)
```

Corpo esperado por `/api/ai/chat`:
```json
{ "message": "texto do cliente", "history": [{"role": "user", "text": "..."}, {"role": "assistant", "text": "..."}] }
```

Resposta:
```json
{
  "message": "resposta em linguagem natural",
  "products": [ /* produtos DISPONÍVEIS, dados reais do catálogo */ ],
  "unavailable": [ /* produtos compatíveis mas sem estoque */ ],
  "needs_more_information": false
}
```
