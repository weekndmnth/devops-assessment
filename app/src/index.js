'use strict';

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const { body, validationResult } = require('express-validator');

const { version } = require('../package.json');

const app = express();

// ─── Security headers ──────────────────────────────────────────────────────
app.use(helmet());

// ─── Request logging ───────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
}

// ─── Body parsing ──────────────────────────────────────────────────────────
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────

/**
 * GET /health
 * Returns service liveness status and process uptime.
 */
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
    });
});

/**
 * GET /status
 * Returns service metadata.
 */
app.get('/status', (req, res) => {
    res.status(200).json({
        service: 'credpal-api',
        version,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
    });
});

/**
 * POST /process
 * Accepts { data: string }, validates it is non-empty, echoes input.
 */
app.post(
    '/process',
    [
        body('data')
            .exists({ checkNull: true })
            .withMessage('data field is required')
            .isString()
            .withMessage('data must be a string')
            .trim()
            .notEmpty()
            .withMessage('data must not be empty'),
    ],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { data } = req.body;
        return res.status(200).json({
            message: 'processed',
            input: data,
            processedAt: new Date().toISOString(),
        });
    },
);

// ─── 404 handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
