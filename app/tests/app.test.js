'use strict';

const request = require('supertest');
const app = require('../src/index');

describe('GET /health', () => {
    it('should return 200 with status "ok"', async () => {
        const res = await request(app).get('/health');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('status', 'ok');
        expect(res.body).toHaveProperty('uptime');
        expect(typeof res.body.uptime).toBe('number');
    });
});

describe('GET /status', () => {
    it('should return 200 with service name "credpal-api"', async () => {
        const res = await request(app).get('/status');
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('service', 'credpal-api');
        expect(res.body).toHaveProperty('version');
        expect(res.body).toHaveProperty('environment');
        expect(res.body).toHaveProperty('timestamp');
        expect(() => new Date(res.body.timestamp)).not.toThrow();
    });
});

describe('POST /process', () => {
    it('should return 200 with processed result when given a valid body', async () => {
        const res = await request(app)
            .post('/process')
            .send({ data: 'hello world' })
            .set('Content-Type', 'application/json');

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('message', 'processed');
        expect(res.body).toHaveProperty('input', 'hello world');
        expect(res.body).toHaveProperty('processedAt');
        expect(() => new Date(res.body.processedAt)).not.toThrow();
    });

    it('should return 400 when data field is missing', async () => {
        const res = await request(app)
            .post('/process')
            .send({})
            .set('Content-Type', 'application/json');

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('errors');
        expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it('should return 400 when data field is an empty string', async () => {
        const res = await request(app)
            .post('/process')
            .send({ data: '   ' })
            .set('Content-Type', 'application/json');

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('errors');
        expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it('should return 400 when data field is null', async () => {
        const res = await request(app)
            .post('/process')
            .send({ data: null })
            .set('Content-Type', 'application/json');

        expect(res.statusCode).toBe(400);
        expect(res.body).toHaveProperty('errors');
    });
});

describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
        const res = await request(app).get('/unknown-route');
        expect(res.statusCode).toBe(404);
        expect(res.body).toHaveProperty('error', 'Route not found');
    });
});
