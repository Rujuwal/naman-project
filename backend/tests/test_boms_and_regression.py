"""Backend tests: BOM CRUD endpoints + regression checks for other core endpoints."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://naman-upper-system.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


# --------------------- BOM endpoints ---------------------
class TestBoms:
    def test_get_boms(self, s):
        r = s.get(f"{BASE_URL}/api/boms")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 2
        for b in data:
            assert "article_id" in b and "lines" in b and "version" in b

    def test_create_and_update_bom(self, s):
        # get an article & material
        articles = s.get(f"{BASE_URL}/api/articles").json()
        materials = s.get(f"{BASE_URL}/api/materials").json()
        assert articles and materials
        art = next((a for a in articles if a.get("code") == "X"), articles[0])
        mat = materials[0]

        payload = {
            "article_id": art["id"],
            "colour_id": None,
            "version": 99,
            "active": True,
            "lines": [
                {"material_id": mat["id"], "consumption_per_pair": 0.25, "uom": mat.get("uom", "m")}
            ],
        }
        r = s.post(f"{BASE_URL}/api/boms", json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["article_id"] == art["id"]
        assert created["version"] == 99
        assert len(created["lines"]) == 1
        bom_id = created["id"]

        # verify via GET list
        listed = s.get(f"{BASE_URL}/api/boms").json()
        assert any(b["id"] == bom_id for b in listed)

        # update
        payload["version"] = 100
        payload["lines"][0]["consumption_per_pair"] = 0.5
        r2 = s.put(f"{BASE_URL}/api/boms/{bom_id}", json=payload)
        assert r2.status_code == 200, r2.text
        upd = r2.json()
        assert upd["version"] == 100
        assert upd["lines"][0]["consumption_per_pair"] == 0.5


# --------------------- Regression ---------------------
class TestRegression:
    @pytest.mark.parametrize("path", [
        "/api/dashboard",
        "/api/customer-orders",
        "/api/plans",
        "/api/articles",
        "/api/colours",
        "/api/materials",
        "/api/customers",
        "/api/fabricators",
        "/api/workers",
        "/api/plan-configs",
        "/api/rm-stock",
        "/api/material-requirement",
        "/api/finished-stock",
        "/api/dispatches",
    ])
    def test_endpoint_200(self, s, path):
        r = s.get(f"{BASE_URL}{path}")
        assert r.status_code == 200, f"{path} -> {r.status_code}: {r.text[:200]}"

    def test_start_cutting_article_x(self, s):
        # find PLAN-2026-0003
        plans = s.get(f"{BASE_URL}/api/plans").json()
        plan = next((p for p in plans if p.get("plan_no") == "PLAN-2026-0003"), None)
        if not plan:
            pytest.skip("PLAN-2026-0003 not found")
        r = s.post(f"{BASE_URL}/api/plans/{plan['id']}/start-cutting")
        # Either success (200) or a clear shortage error (400/409/422) but not 'BOM not defined'
        body = r.text.lower()
        assert "bom not defined" not in body, f"BOM still missing: {r.text}"
        assert r.status_code in (200, 400, 409, 422), f"unexpected {r.status_code}: {r.text[:300]}"
