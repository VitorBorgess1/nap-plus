// tests/helpers/fake-repository.js - repositório de produtos em memória (mesmo formato do produto real),
// usado nos testes para poder forçar cenários como "estoque = 0" sem tocar no arquivo de dados de verdade.

const { normalizeProduct } = require("../../product-repository");

function createFakeRepository(products) {
  return {
    async listAll() { return products.map(normalizeProduct); },
    async getById(id) { return products.find((p) => p.id === Number(id)) || null; },
  };
}

// Catálogo pequeno de teste, no MESMO formato do data/products.json real.
const SAMPLE_PRODUCTS = [
  { id: 1, name: "Suvinil Fosco Completo", brand: "Suvinil", category: "Parede", finish: "Fosco", price: 189.9, stock: 12, coverage: "Até 350 m²", description: "Tinta acrílica fosca para paredes.", image: "", icon: "house", surface: ["Parede"], environments: ["Sala", "Quarto", "Fachada"], purposes: ["Pintura interna", "Pintura externa"], tags: ["parede", "cor"] },
  { id: 4, name: "Borracha Líquida Elástica", brand: "Quartzolit", category: "Piso", finish: "Acetinado", price: 169.9, stock: 6, coverage: "Até 4 m²/L", description: "Impermeabilizante elástico com proteção contra umidade e chuva.", image: "", icon: "hammer", surface: ["Piso"], environments: ["Garagem", "Calçada"], purposes: ["Pintar piso"], tags: ["piso", "umidade"] },
  { id: 5, name: "Impermeabilizante para Parede", brand: "Quartzolit", category: "Tratamento", finish: "Fosco", price: 139.9, stock: 0, coverage: "-", description: "Auxilia no tratamento de umidade e proteção de superfícies.", image: "", icon: "shield", surface: ["Parede"], environments: ["Banheiro", "Cozinha", "Fachada"], purposes: ["Umidade", "Infiltração", "Proteção"], tags: ["umidade", "infiltração", "mofo", "impermeabilizante"] },
  { id: 6, name: "Selador Acrílico Antimofo", brand: "Quartzolit", category: "Tratamento", finish: "Fosco", price: 89.9, stock: 15, coverage: "Até 200 m²", description: "Selador com ação antimofo para paredes internas úmidas.", image: "", icon: "shield", surface: ["Parede"], environments: ["Quarto", "Banheiro"], purposes: ["Umidade", "Tratamento antimofo"], tags: ["umidade", "mofo", "antimofo"] },
];

module.exports = { createFakeRepository, SAMPLE_PRODUCTS };
