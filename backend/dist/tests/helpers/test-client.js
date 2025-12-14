"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestClient = void 0;
class TestClient {
    constructor(app) {
        this.app = app;
        this.baseUrl = "";
    }
    async start() {
        this.server = this.app.listen(0);
        await new Promise((resolve) => this.server.once("listening", resolve));
        const address = this.server.address();
        this.baseUrl = `http://127.0.0.1:${address.port}/api`;
    }
    async stop() {
        if (!this.server)
            return;
        await new Promise((resolve, reject) => {
            this.server.close((err) => (err ? reject(err) : resolve()));
        });
        this.server = undefined;
        this.baseUrl = "";
    }
    async post(path, body, headers = {}) {
        return this.request("POST", path, headers, JSON.stringify(body));
    }
    async get(path, headers = {}) {
        return this.request("GET", path, headers);
    }
    async request(method, path, headers, body) {
        if (!this.baseUrl)
            throw new Error("Test client is not started");
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                "content-type": "application/json",
                ...headers
            },
            body
        });
        const data = (await response.json());
        return { status: response.status, body: data };
    }
}
exports.TestClient = TestClient;
