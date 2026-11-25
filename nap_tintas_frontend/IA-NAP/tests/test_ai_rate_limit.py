"""Testa o limite de mensagens por IP da rota /api/ai/chat do Flask (sem Node e sem Gemini reais).

Rodar a partir da pasta nap_tintas_frontend:
    python -m unittest tests.test_ai_rate_limit -v
"""
import io
import json
import os
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Se o pacote "supabase" não estiver instalado, usa um falso: este teste não usa banco.
try:
    import supabase  # noqa: F401
except ImportError:
    fake = types.ModuleType("supabase")
    fake.create_client = lambda *a, **k: None
    sys.modules["supabase"] = fake

import app as site  # noqa: E402


class FakeResponse(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class AiRateLimitTest(unittest.TestCase):
    def setUp(self):
        site._ai_hits.clear()
        site.NAP_AI_RATE_LIMIT_PER_MIN = 3
        self.client = site.app.test_client()
        self.sent = []

        def fake_urlopen(req, timeout=None):
            self.sent.append(req)
            return FakeResponse(json.dumps({"message": "ok", "products": []}).encode())

        patcher = mock.patch("urllib.request.urlopen", fake_urlopen)
        patcher.start()
        self.addCleanup(patcher.stop)

    def post(self, ip):
        return self.client.post(
            "/api/ai/chat", json={"message": "oi", "history": []}, environ_overrides={"REMOTE_ADDR": ip}
        )

    def test_bloqueia_depois_do_limite_com_429_e_retry_after(self):
        for _ in range(3):
            self.assertEqual(self.post("200.1.1.1").status_code, 200)
        r = self.post("200.1.1.1")
        self.assertEqual(r.status_code, 429)
        self.assertTrue(int(r.headers["Retry-After"]) >= 1)
        self.assertEqual(len(self.sent), 3)  # o 4º pedido nem chegou ao Node

    def test_ips_diferentes_tem_limites_separados(self):
        for _ in range(3):
            self.post("200.1.1.1")
        self.assertEqual(self.post("200.1.1.1").status_code, 429)
        self.assertEqual(self.post("200.2.2.2").status_code, 200)

    def test_repassa_o_ip_do_visitante_ao_node(self):
        self.post("200.3.3.3")
        self.assertEqual(self.sent[0].get_header("X-forwarded-for"), "200.3.3.3")

    def test_cabecalho_forjado_do_cliente_e_ignorado(self):
        # Sem NAP_TRUSTED_PROXIES, o X-Forwarded-For que o cliente manda não vale: conta o IP real da conexão.
        for i in range(3):
            self.client.post(
                "/api/ai/chat", json={"message": "oi"},
                headers={"X-Forwarded-For": f"9.9.9.{i}"}, environ_overrides={"REMOTE_ADDR": "200.4.4.4"},
            )
        r = self.client.post(
            "/api/ai/chat", json={"message": "oi"},
            headers={"X-Forwarded-For": "9.9.9.99"}, environ_overrides={"REMOTE_ADDR": "200.4.4.4"},
        )
        self.assertEqual(r.status_code, 429)


if __name__ == "__main__":
    unittest.main()
