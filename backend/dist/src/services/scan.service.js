"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scanProductImage = scanProductImage;
exports.evaluateObjectState = evaluateObjectState;
const env_1 = require("../config/env");
const allwain_demo_service_1 = require("./allwain-demo.service");
async function scanWithGoogleVision(_input) {
    // TODO: Integrate Google Cloud Vision SDK or HTTP API here.
    // This stub keeps the shape consistent while the implementation is in progress.
    return {
        product: undefined,
        rawData: {
            provider: "google",
            message: "Google Cloud Vision integration pending",
        },
    };
}
async function scanWithMockProvider() {
    const demo = (0, allwain_demo_service_1.buildAllwainScanDemo)();
    return {
        product: demo.product,
        rawData: {
            ...demo,
            provider: "mock",
        },
    };
}
function resolveProvider(override) {
    if (override)
        return override;
    if (env_1.ENV.SCAN_PROVIDER === "google")
        return "google";
    return "mock";
}
async function scanProductImage(input) {
    const provider = resolveProvider(input.provider);
    if (provider === "google") {
        return scanWithGoogleVision(input);
    }
    return scanWithMockProvider();
}
async function evaluateObjectState(input) {
    const provider = resolveProvider(input.provider);
    if (provider === "google") {
        // Placeholder for a future quality/condition evaluation using Google Vision or custom model.
        return {
            status: "pending-assessment",
            rawData: {
                provider: "google",
                message: "Quality assessment pending integration",
            },
        };
    }
    return {
        status: "ok",
        rawData: {
            provider: "mock",
            message: "Estado evaluado con proveedor mock",
        },
    };
}
