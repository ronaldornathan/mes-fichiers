import { describe, it, expect } from "vitest";
import worker from "../src";

// Environnement factice : ces tests ne touchent ni Tigris ni KV.
const env = {
	TIGRIS_ACCESS_KEY_ID: "a", TIGRIS_SECRET_ACCESS_KEY: "b", BUCKET_NAME: "bk", JWT_SECRET: "jwt", APP_PASSWORD: "pw",
	RATE_LIMIT: { get: async () => null, put: async () => {}, delete: async () => {} },
};
const call = (path, init) => worker.fetch(new Request("https://w.dev" + path, init), env);

describe("API", () => {
	it("refuse les routes protégées sans session", async () => {
		expect((await call("/api/files")).status).toBe(401);
		expect((await call("/api/delete", { method: "POST", body: "{}" })).status).toBe(401);
	});
	it("renvoie 404 sur une route inconnue", async () => {
		expect((await call("/nimporte-quoi")).status).toBe(404);
	});
	it("répond au préflight CORS", async () => {
		expect((await call("/api/files", { method: "OPTIONS" })).status).toBe(204);
	});
	it("signale une configuration incomplète", async () => {
		const res = await worker.fetch(new Request("https://w.dev/api/usage"), { ...env, JWT_SECRET: "" });
		expect(res.status).toBe(500);
	});
});
