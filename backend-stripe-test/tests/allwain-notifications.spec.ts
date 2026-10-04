import assert from "node:assert";
import { describe, it } from "node:test";
import { allwainModeForNotificationTarget } from "../src/services/allwain-notifications.service";
import {
  allwainEmailDeliveryPolicy,
  renderAllwainNotificationEmail,
} from "../src/services/allwain-mailer.service";
import { ENV } from "../src/config/env";

describe("Allwain notification destinations", () => {
  it("opens each participant notification in its own workspace", () => {
    assert.equal(allwainModeForNotificationTarget("buyer"), "buy");
    assert.equal(allwainModeForNotificationTarget("seller"), "sell");
    assert.equal(allwainModeForNotificationTarget("connector"), "connector");
  });

  it("renders a branded and escaped transactional email", () => {
    const email = renderAllwainNotificationEmail({
      id: "notification-1",
      type: "reservation.created",
      title: "Reserva realizada",
      body: "Has reservado 15 kg de naranjas <confirmadas>.",
    });

    assert.equal(email.template, "reservation_created");
    assert.equal(email.subject, "Tu reserva está registrada");
    assert.match(email.html, /#FF795A/);
    assert.match(email.html, /allwain-logo\.png/);
    assert.match(email.html, /&lt;confirmadas&gt;/);
    assert.doesNotMatch(email.html, /<confirmadas>/);
    assert.match(email.text, /https:\/\/allwain\.es\/app\/avisos/);
  });

  it("links emails to the app and its public logo for root, old and current app URLs", () => {
    const previous = ENV.ALLWAIN_APP_URL;
    try {
      for (const url of ["https://allwain.es", "https://allwain.es/web/", "https://allwain.es/app/"]) {
        ENV.ALLWAIN_APP_URL = url;
        const email = renderAllwainNotificationEmail({ id: "route-test", type: "reservation.created", title: "Test", body: "Test" });
        assert.match(email.text, /https:\/\/allwain\.es\/app\/avisos/);
        assert.match(email.html, /https:\/\/allwain\.es\/email\/allwain-logo\.png/);
        assert.doesNotMatch(email.html, /\/app\/app\/|\/web\//);
      }
    } finally { ENV.ALLWAIN_APP_URL = previous; }
  });

  it("keeps test emails inside the explicit recipient and time window", () => {
    const previous = {
      mode: ENV.ALLWAIN_EMAIL_DELIVERY_MODE,
      recipients: ENV.ALLWAIN_EMAIL_TEST_RECIPIENTS,
      startedAt: ENV.ALLWAIN_EMAIL_TEST_STARTED_AT,
    };
    try {
      Object.assign(ENV, {
        ALLWAIN_EMAIL_DELIVERY_MODE: "test",
        ALLWAIN_EMAIL_TEST_RECIPIENTS: ["qa@allwain.es"],
        ALLWAIN_EMAIL_TEST_STARTED_AT: "2026-09-06T12:00:00.000Z",
      });
      assert.equal(
        allwainEmailDeliveryPolicy(
          "qa@allwain.es",
          "2026-09-06T12:00:01.000Z",
        ).allowed,
        true,
      );
      assert.equal(
        allwainEmailDeliveryPolicy(
          "other@allwain.es",
          "2026-09-06T12:00:01.000Z",
        ).reason,
        "EMAIL_TEST_RECIPIENT_NOT_ALLOWED",
      );
      assert.equal(
        allwainEmailDeliveryPolicy(
          "qa@allwain.es",
          "2026-09-06T11:59:59.000Z",
        ).reason,
        "EMAIL_OUTSIDE_TEST_WINDOW",
      );
    } finally {
      Object.assign(ENV, {
        ALLWAIN_EMAIL_DELIVERY_MODE: previous.mode,
        ALLWAIN_EMAIL_TEST_RECIPIENTS: previous.recipients,
        ALLWAIN_EMAIL_TEST_STARTED_AT: previous.startedAt,
      });
    }
  });
});
