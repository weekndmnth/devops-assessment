'use strict';

const app = require('./index');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log(`[credpal-api] Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────
const shutdown = (signal) => {
    console.log(`\n[credpal-api] Received ${signal}. Starting graceful shutdown...`);

    server.close((err) => {
        if (err) {
            console.error('[credpal-api] Error during shutdown:', err);
            process.exit(1);
        }
        console.log('[credpal-api] All connections closed. Server shut down cleanly.');
        process.exit(0);
    });

    // Force-kill if shutdown takes too long (10 s safety net)
    setTimeout(() => {
        console.error('[credpal-api] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
    }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
