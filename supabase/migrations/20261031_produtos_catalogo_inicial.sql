-- NAP+ | Alinha produtos ao protótipo, cria policies de leitura e importa catálogo inicial
-- 1) Colunas que o site e a IA usam
alter table public.produtos
  add column if not exists categoria  varchar,
  add column if not exists acabamento varchar,
  add column if not exists rendimento varchar,
  add column if not exists imagem_url text,
  add column if not exists icone      varchar,
  add column if not exists superficies text[] not null default '{}',
  add column if not exists ambientes   text[] not null default '{}',
  add column if not exists finalidades text[] not null default '{}',
  add column if not exists tags        text[] not null default '{}',
  add column if not exists ativo       boolean not null default true;

-- 2) Leitura pública do catálogo (chave publishable/anon); escrita só pelo backend (service role)
drop policy if exists "catalogo leitura publica" on public.produtos;
create policy "catalogo leitura publica" on public.produtos
  for select to anon, authenticated using (ativo);

drop policy if exists "estoque leitura publica" on public.estoque;
create policy "estoque leitura publica" on public.estoque
  for select to anon, authenticated using (true);

-- 3) Catálogo inicial (data/products.json do protótipo)
insert into public.produtos
  (id, nome, descricao, marca, preco, categoria, acabamento, rendimento, imagem_url, icone, superficies, ambientes, finalidades, tags)
overriding system value values
  (1, 'Suvinil Fosco Completo', 'Tinta acrílica fosca para paredes, com cobertura e acabamento uniforme.', 'Suvinil', 189.9, 'Parede', 'Fosco', 'Até 350 m² por lata', 'https://down-br.img.susercontent.com/file/sg-11134201-7rbmu-lmqfhxvhxwwg8c', 'house', array['Parede','Alvenaria']::text[], array['Sala','Quarto','Fachada']::text[], array['Pintura interna','Pintura externa','Mudar a cor']::text[], array['tinta para parede','parede','fachada','cor']::text[]),
  (2, 'Suvinil Toque Fosco Completo', 'Tinta fosca para paredes e tetos, indicada para ambientes internos e externos preparados.', 'Suvinil', 119.9, 'Parede', 'Fosco', 'Até 250 m² por lata', 'https://down-br.img.susercontent.com/file/sg-11134201-7rdwc-lxtpae1z8ebq2a', 'sofa', array['Parede','Alvenaria']::text[], array['Sala','Quarto']::text[], array['Pintura interna','Mudar a cor']::text[], array['tinta para parede','parede','econômica','cor']::text[]),
  (3, 'Suvinil Cor & Proteção Fosco', 'Esmalte fosco para madeira e metais, indicado para ambientes internos e externos.', 'Suvinil', 149.9, 'Madeira e Metal', 'Brilhante', 'Até 70 m² por lata', 'https://loja.suvinil.com.br/_next/image?q=75&url=https%3A%2F%2Fdigitalprdaddc4dsa.blob.core.windows.net%2Fdigital-products-img%2Fproducts%2F39%2Fimage%2Fdisplay%2F34%2F1.webp%3Fsv%3D2026-02-06%26spr%3Dhttps%26st%3D2026-09-20T01%253A44%253A53Z%26se%3D2026-10-20T01%253A49%253A53Z%26sr%3Db%26sp%3Dr%26sig%3DHWi4qToDn6fGV52LvJUjPF0x3bgmGifWoL9f22ebkvo%253D&w=1920', 'hammer', array['Madeira','Metal']::text[], array['Portão','Móveis']::text[], array['Pintar portão','Pintar móvel','Retoque']::text[], array['madeira','metal','portão','móvel','esmalte']::text[]),
  (4, 'Borracha Líquida Elástica Quartzolit', 'Impermeabilizante elástico para paredes e fachadas, com proteção contra umidade e chuva.', 'Quartzolit', 169.9, 'Piso', 'Acetinado', 'Até 90 m² por lata', 'https://www.quartzolit.weber/files/br/styles/768x768_resize/public/pictures/2026-01/AF_3D_Borracha_Lquida_3_6kg_PNG_C9D50AD5B9ED4EB183CDD82A02C27D47.jpg.webp?cb=21d84746&itok=EnMGA2VH', 'shield-check', array['Piso','Concreto']::text[], array['Garagem','Calçada','Quadra']::text[], array['Pintar piso','Alta resistência']::text[], array['piso','garagem','concreto','calçada']::text[]),
  (5, 'Impermeabilizante para Parede', 'Auxilia no tratamento de umidade e proteção de superfícies.', 'Quartzolit', 139.9, 'Tratamento', 'Fosco', 'Até 60 m² por lata', 'https://www.quartzolit.weber/files/br/styles/768x768_resize/public/pictures/2026-01/AF_3D_Borracha_Lquida_3_6kg_PNG_C9D50AD5B9ED4EB183CDD82A02C27D47.jpg.webp?cb=21d84746&itok=EnMGA2VH', 'shield-check', array['Parede','Alvenaria']::text[], array['Banheiro','Cozinha','Fachada']::text[], array['Umidade','Infiltração','Proteção']::text[], array['umidade','infiltração','mofo','impermeabilizante']::text[]),
  (6, 'Tinta Spray Multiuso', 'Spray para pequenos projetos e objetos diversos.', 'Colorgin', 39.9, 'Multiuso', 'Brilhante', 'Até 2 m² por lata', 'https://loja.suvinil.com.br/_next/image?q=75&url=https%3A%2F%2Fdigitalprdaddc4dsa.blob.core.windows.net%2Fdigital-products-img%2Fproducts%2F39%2Fimage%2Fdisplay%2F34%2F1.webp%3Fsv%3D2026-02-06%26spr%3Dhttps%26st%3D2026-09-20T01%253A44%253A53Z%26se%3D2026-10-20T01%253A49%253A53Z%26sr%3Db%26sp%3Dr%26sig%3DHWi4qToDn6fGV52LvJUjPF0x3bgmGifWoL9f22ebkvo%253D&w=1920', 'spray-can', array['Metal','Madeira','Plástico']::text[], array['Móveis','Objetos']::text[], array['Retoque','Pequenos projetos']::text[], array['spray','multiuso','retoque','objetos']::text[])
on conflict (id) do nothing;

insert into public.estoque (produto_id, quantidade) values
  (1, 12),
  (2, 25),
  (3, 8),
  (4, 6),
  (5, 10),
  (6, 30)
on conflict (produto_id) do nothing;

-- mantém a sequência de ids à frente dos registros importados
select setval(pg_get_serial_sequence('public.produtos','id'), (select max(id) from public.produtos));
