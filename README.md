# NAP+

Plataforma web para a **NAP Tintas** — apresentação institucional, catálogo de produtos, compras online com processamento de pagamentos e um módulo de recomendação por inteligência artificial.

> Projeto Integrador — Uniso — 2º Semestre de 2026

## Objetivo

Desenvolver um site para a NAP Tintas que apresente a empresa, ofereça uma plataforma de compras online integrada ao estoque, e conte com um módulo de IA capaz de identificar o problema ou ocasião relatado pelo cliente e recomendar o produto mais adequado, com opções de marca e valor conforme disponibilidade em estoque.

## Escopo

- Site institucional da NAP Tintas
- Área de apresentação e consulta de produtos
- Plataforma de compras online
- Integração com processamento de pagamentos
- Módulo de IA para recomendação de produtos
- Integração das recomendações com o estoque disponível
- Interface responsiva (desktop e mobile)
- Banco de dados para produtos, clientes, pedidos e estoque

Fora de escopo nesta etapa: app mobile nativo, entrega física dos produtos, gestão de logística/transportadoras, emissão fiscal própria, atendimento humano automatizado por IA.

## Equipe

| Nome | Papel |
|---|---|
| Vitor Borges dos Santos | Scrum Master / Líder do Projeto |
| Jean Cristian Hertz | Scrum Master |
| Pedro Carvalho Reiss | Product Owner |
| Bruno Fortes | Desenvolvedor — Pagamentos e Integrações |
| José Naildo da Silva Costa | Desenvolvedor — Backend / Banco de Dados |
| Lucas Firmino Rocha | Desenvolvedor — Frontend |
| Pedro Gabriel de Carmargo Borges | Desenvolvedor — Frontend |

## Frentes de trabalho

- **Frontend** — interface do site, catálogo, carrinho/checkout, responsividade
- **Backend / Banco de Dados** — modelagem de produtos, clientes, pedidos e estoque; API de consulta
- **Pagamentos e Integrações** — integração com gateway de pagamento, fluxo de checkout seguro
- **Módulo de IA** — recomendação de produtos a partir do problema/ocasião relatado pelo cliente

## Stack

_A definir com o time._ Este README será atualizado assim que a stack for confirmada (banco de dados, framework de backend, framework de frontend, gateway de pagamento e abordagem de IA).

## Estrutura do repositório

```
nap-plus/
├── README.md
├── docs/            # TAP, atas, documentação do projeto
├── frontend/
├── backend/
├── pagamentos/
└── ia-recomendacao/
```

## Como contribuir (equipe interna)

1. Não commitar direto na `main` — abrir branch por tarefa/feature (`frontend/tela-carrinho`, `backend/modelo-produtos`, etc.)
2. Abrir Pull Request para revisão antes de merge
3. Descrever no PR o que foi feito e, se possível, vincular à fase do cronograma correspondente

## Cronograma (resumo)

| Fase | Atividade | Início | Fim |
|---|---|---|---|
| 1 | Planejamento e definição dos requisitos | 14/09/2026 | 21/09/2026 |
| 2 | Levantamento das informações da NAP Tintas | 21/09/2026 | 28/09/2026 |
| 3 | Estrutura do sistema e banco de dados | 28/09/2026 | 05/10/2026 |
| 4 | Desenvolvimento da interface do site | 05/10/2026 | 19/10/2026 |
| 5 | Funcionalidades de produtos e estoque | 19/10/2026 | 02/11/2026 |
| 6 | Sistema de compras e pagamentos | 02/11/2026 | 09/11/2026 |
| 7 | Módulo de inteligência artificial | 09/11/2026 | 16/11/2026 |
| 8 | Integração dos módulos e testes | 16/11/2026 | 23/11/2026 |
| 9 | Apresentação para a turma e feedback | 23/11/2026 | 23/11/2026 |
| 10 | Ajustes finais | 23/11/2026 | 30/11/2026 |
| 11 | Finalização e entrega | 30/11/2026 | 05/12/2026 |
| 12 | Apresentação final na banca | 05/12/2026 | 05/12/2026 |

## Objetivos de Desenvolvimento Sustentável

- **ODS 9** — Indústria, Inovação e Infraestrutura
- **ODS 8** — Trabalho Decente e Crescimento Econômico
