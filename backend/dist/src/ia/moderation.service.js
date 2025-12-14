"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDemoModerationEvents = getDemoModerationEvents;
function getDemoModerationEvents() {
    return [
        { id: "1", userEmail: "user1@example.com", severity: "low", reason: "Texto ambiguo", createdAt: new Date().toISOString() },
        { id: "2", userEmail: "user2@example.com", severity: "medium", reason: "Contenido sospechoso", createdAt: new Date().toISOString() }
    ];
}
